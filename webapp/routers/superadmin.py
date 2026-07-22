"""Platform-level diagnostics and administration for superadmins.

This is deliberately separate from routers/accounts.py (which does the
per-account CRUD: list/get/update/suspend/delete). This module answers a
different question — not "manage one tenant" but "what's the health and
shape of the whole platform right now" — which is what the superadmin
console's dashboard and activity feed are built on top of.

Every endpoint here is require_superadmin-gated and gives a cross-account
view; nothing here is scoped by account_id the way the rest of the API is.
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Account, User, RoleEnum, AccountType, ActivityLog,
    Sale, Purchase, Expense, Invoice, Quotation, PurchaseOrder,
    JournalEntry, FiscalPeriod, FiscalPeriodStatus, Reminder,
)
from schemas import ActivityOut
from auth import require_superadmin
from pydantic import BaseModel

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


# ---------- Platform stats ----------

@router.get("/stats")
def platform_stats(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    now = datetime.utcnow()
    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_accounts = db.query(Account).count()
    active_accounts = db.query(Account).filter(Account.is_suspended.is_(False)).count()
    suspended_accounts = total_accounts - active_accounts
    business_accounts = db.query(Account).filter(Account.account_type == AccountType.business).count()
    community_accounts = total_accounts - business_accounts

    signups_7d = db.query(Account).filter(Account.created_at >= since_7d).count()
    signups_30d = db.query(Account).filter(Account.created_at >= since_30d).count()

    total_users = db.query(User).filter(User.role != RoleEnum.superadmin).count()
    active_users = db.query(User).filter(User.role != RoleEnum.superadmin, User.is_active.is_(True)).count()

    # Transaction volume — a rough proxy for how much real usage is
    # happening platform-wide, not just how many accounts exist.
    def _count_today(model, date_col):
        return db.query(model).filter(date_col >= today_start).count()

    transactions_today = (
        _count_today(Sale, Sale.created_at)
        + _count_today(Purchase, Purchase.created_at)
        + _count_today(Expense, Expense.created_at)
        + _count_today(Invoice, Invoice.created_at)
    )

    open_periods = db.query(FiscalPeriod).filter(FiscalPeriod.status == FiscalPeriodStatus.open).count()
    closed_periods = db.query(FiscalPeriod).filter(FiscalPeriod.status == FiscalPeriodStatus.closed).count()

    return {
        "accounts": {
            "total": total_accounts,
            "active": active_accounts,
            "suspended": suspended_accounts,
            "business": business_accounts,
            "community": community_accounts,
            "signups_last_7_days": signups_7d,
            "signups_last_30_days": signups_30d,
        },
        "users": {
            "total": total_users,
            "active": active_users,
        },
        "activity": {
            "transactions_today": transactions_today,
        },
        "ledger": {
            "fiscal_periods_open": open_periods,
            "fiscal_periods_closed": closed_periods,
        },
    }


# ---------- Cross-account activity feed ----------

@router.get("/activity", response_model=List[ActivityOut])
def platform_activity(
    critical_only: bool = Query(False, description="Only show CRITICAL: entries"),
    account_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None, description="Substring match on the action field"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    superadmin: User = Depends(require_superadmin),
):
    """The single most useful screen for 'is anything on fire right now':
    every CRITICAL:-tagged entry (ledger imbalances, locked-period
    violations, failed reversals, superadmin impersonation) across every
    tenant, in one feed — instead of having to open each account separately."""
    q = db.query(ActivityLog)
    if critical_only:
        q = q.filter(ActivityLog.action.like("CRITICAL:%"))
    if account_id is not None:
        q = q.filter(ActivityLog.account_id == account_id)
    if action:
        q = q.filter(ActivityLog.action.ilike(f"%{action}%"))
    return q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()


# ---------- System health / diagnostics ----------

class HealthOut(BaseModel):
    db_ok: bool
    db_error: Optional[str] = None
    scheduler_last_heartbeat: Optional[datetime] = None
    scheduler_minutes_since_heartbeat: Optional[float] = None
    scheduler_healthy: Optional[bool] = None
    table_counts: dict
    open_reminders: int


@router.get("/health", response_model=HealthOut)
def health(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    db_ok = True
    db_error = None
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        db_error = str(e)

    heartbeat = (
        db.query(ActivityLog)
        .filter(ActivityLog.action == "scheduler_heartbeat")
        .order_by(ActivityLog.created_at.desc())
        .first()
    )
    minutes_since = None
    scheduler_healthy = None
    if heartbeat:
        minutes_since = (datetime.utcnow() - heartbeat.created_at).total_seconds() / 60
        # The job runs every 24h — flag it unhealthy if it's gone quiet for
        # much longer than that (missed run / crashed process), not on every
        # minor scheduling jitter.
        scheduler_healthy = minutes_since < 26 * 60

    table_counts = {
        "accounts": db.query(Account).count(),
        "users": db.query(User).count(),
        "sales": db.query(Sale).count(),
        "purchases": db.query(Purchase).count(),
        "purchase_orders": db.query(PurchaseOrder).count(),
        "expenses": db.query(Expense).count(),
        "invoices": db.query(Invoice).count(),
        "quotations": db.query(Quotation).count(),
        "journal_entries": db.query(JournalEntry).count(),
        "activity_log_entries": db.query(ActivityLog).count(),
    }

    open_reminders = db.query(Reminder).filter(Reminder.is_done.is_(False)).count()

    return HealthOut(
        db_ok=db_ok, db_error=db_error,
        scheduler_last_heartbeat=heartbeat.created_at if heartbeat else None,
        scheduler_minutes_since_heartbeat=minutes_since,
        scheduler_healthy=scheduler_healthy,
        table_counts=table_counts,
        open_reminders=open_reminders,
    )
