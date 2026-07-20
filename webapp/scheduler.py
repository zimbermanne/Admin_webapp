"""Background CRON workflows.

Currently: a daily job that finds invoices past their due_date and still
unpaid, and sends a reminder for each one — email if SMTP is configured for
the tenant, and always an in-app Reminder + ActivityLog entry (the
WhatsApp-reminder placeholder: wiring an actual WhatsApp Business API call
is a follow-up, but every overdue invoice gets *some* surfaced reminder
either way, so nothing silently goes unnoticed).

Runs once at startup (so a redeploy doesn't wait a full day for the first
pass) and then every 24h via APScheduler's BackgroundScheduler, which runs
in-process — fine for a single-instance deploy; if this API ever scales to
multiple instances, this job needs to move to a distinct worker/leader-only
process, or every instance will send duplicate reminders.
"""
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from models import Invoice, DocumentStatus, Account, ActivityLog, Reminder
from activity import log_activity
import email_utils

_REMINDER_ACTION = "invoice_reminder_sent"


def _already_reminded_today(db, invoice_id: int) -> bool:
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(ActivityLog)
        .filter(
            ActivityLog.action == _REMINDER_ACTION,
            ActivityLog.details.like(f"%invoice_id={invoice_id}%"),
            ActivityLog.created_at >= since,
        )
        .first()
        is not None
    )


def send_overdue_invoice_reminders():
    """The actual job body — kept as a standalone function so it can also be
    called directly (e.g. from a manual /api/reminders/run-now endpoint or a
    test), not just from the scheduler."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        overdue = (
            db.query(Invoice)
            .filter(
                Invoice.due_date.isnot(None),
                Invoice.due_date < now,
                Invoice.status.in_([DocumentStatus.sent, DocumentStatus.draft]),
            )
            .all()
        )

        for invoice in overdue:
            if _already_reminded_today(db, invoice.id):
                continue

            days_overdue = (now - invoice.due_date).days
            account = db.query(Account).filter(Account.id == invoice.account_id).first()
            message = (
                f"Invoice {invoice.invoice_no} for {invoice.customer_name} "
                f"({invoice.total:.2f}) is {days_overdue} day(s) overdue."
            )

            # In-app reminder — always created, regardless of email config.
            db.add(Reminder(
                account_id=invoice.account_id,
                created_by="system",
                text=message,
                due_at=now,
            ))

            # Email the account owner if SMTP is configured. Best-effort: a
            # missing/failed SMTP config must never stop the in-app reminder
            # or the audit trail from being written.
            if email_utils.is_configured() and account and account.email:
                try:
                    email_utils.send_plain_email(
                        to_email=account.email,
                        subject=f"Overdue invoice {invoice.invoice_no}",
                        body=message + "\n\nThis is an automated reminder from Moneytracer.",
                    )
                except Exception as e:
                    log_activity(
                        db, username="system", action="CRITICAL: invoice_reminder_email_failed",
                        details=f"invoice_id={invoice.id} {e}", account_id=invoice.account_id,
                    )

            log_activity(
                db, username="system", action=_REMINDER_ACTION,
                details=f"invoice_id={invoice.id} {message}",
                account_id=invoice.account_id,
            )

        db.commit()
    finally:
        db.close()


_scheduler = None


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        send_overdue_invoice_reminders,
        "interval", hours=24,
        id="overdue_invoice_reminders",
        next_run_time=datetime.utcnow() + timedelta(seconds=30),  # first pass shortly after boot, not at import time
        coalesce=True, max_instances=1,
    )
    _scheduler.start()
    return _scheduler
