"""Platform-level diagnostics and administration for superadmins.

This is deliberately separate from routers/accounts.py (which does the
per-account CRUD: list/get/update/suspend/delete). This module answers a
different question — not "manage one tenant" but "what's the health and
shape of the whole platform right now" — which is what the superadmin
console's dashboard and activity feed are built on top of.

Every endpoint here is require_superadmin-gated and gives a cross-account
view; nothing here is scoped by account_id the way the rest of the API is.
"""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Account, User, RoleEnum, AccountType, ActivityLog,
    Sale, Purchase, Expense, Invoice, Quotation, PurchaseOrder,
    JournalEntry, FiscalPeriod, FiscalPeriodStatus, Reminder,
    Announcement, AnnouncementLevel,
)
from schemas import (
    ActivityOut, AccountAdminOut, PlanUpdate, NotesUpdate, BulkAccountIds,
    RoleUpdate, AnnouncementCreate, AnnouncementOut,
)
from auth import require_superadmin
from activity import log_activity_for_user
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


# ---------- Plan / internal notes ----------
# Deliberately separate from routers/accounts.py's update_account (which
# handles the tenant-editable fields) — plan and admin_notes are the two
# fields a tenant admin must never be able to set themselves (see
# AccountUpdate's comment and update_my_account's is_suspended-style block).

def _csv_response(rows: List[dict], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/accounts/export")
def export_accounts(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Registered before /accounts/{account_id} — FastAPI/Starlette matches
    routes in registration order, and a GET on a static path like "export"
    would otherwise be swallowed by the {account_id} path param (and 422
    on int-parsing "export" as an id)."""
    accounts = db.query(Account).order_by(Account.created_at.desc()).all()
    rows = [
        {
            "id": a.id,
            "name": a.name,
            "account_type": a.account_type.value if a.account_type else "",
            "owner_full_name": a.owner_full_name,
            "email": a.email,
            "phone": a.phone,
            "plan": a.plan,
            "is_suspended": a.is_suspended,
            "onboarding_completed": a.onboarding_completed,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in accounts
    ]
    log_activity_for_user(db, superadmin, "export_accounts", f"Exported {len(rows)} account(s) to CSV")
    return _csv_response(rows, "accounts_export.csv")


@router.get("/accounts/{account_id}", response_model=AccountAdminOut)
def get_account_admin_view(account_id: int, db: Session = Depends(get_db),
                            superadmin: User = Depends(require_superadmin)):
    """Same as GET /api/accounts/{id} but also includes admin_notes — kept as
    a separate endpoint/schema so admin_notes can never leak onto a
    tenant-facing response by accident."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    users = db.query(User).filter(User.account_id == account_id).all()
    return AccountAdminOut(**account.__dict__, users=users)


@router.put("/accounts/{account_id}/plan")
def update_plan(account_id: int, payload: PlanUpdate, db: Session = Depends(get_db),
                 superadmin: User = Depends(require_superadmin)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    old_plan = account.plan
    account.plan = payload.plan
    db.commit()
    log_activity_for_user(
        db, superadmin, "account_plan_change",
        f"Changed plan for {account.name} from '{old_plan}' to '{payload.plan}'",
    )
    return {"detail": f"Plan updated to {payload.plan}", "plan": account.plan}


@router.put("/accounts/{account_id}/notes")
def update_notes(account_id: int, payload: NotesUpdate, db: Session = Depends(get_db),
                  superadmin: User = Depends(require_superadmin)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.admin_notes = payload.admin_notes
    db.commit()
    # Not logged with the note contents — internal notes may contain
    # sensitive support context that doesn't belong duplicated into the
    # activity feed shown elsewhere in the console.
    log_activity_for_user(db, superadmin, "account_notes_update", f"Updated internal notes for {account.name}")
    return {"detail": "Notes updated"}


# ---------- Bulk account actions ----------

@router.post("/accounts/bulk-suspend")
def bulk_suspend(payload: BulkAccountIds, db: Session = Depends(get_db),
                  superadmin: User = Depends(require_superadmin)):
    accounts = db.query(Account).filter(Account.id.in_(payload.account_ids)).all()
    found_ids = {a.id for a in accounts}
    for account in accounts:
        account.is_suspended = True
    if found_ids:
        db.query(User).filter(User.account_id.in_(found_ids)).update(
            {User.token_version: User.token_version + 1}, synchronize_session=False
        )
    db.commit()
    log_activity_for_user(db, superadmin, "bulk_account_suspend", f"Bulk-suspended {len(found_ids)} account(s)")
    missing = set(payload.account_ids) - found_ids
    return {"suspended": sorted(found_ids), "not_found": sorted(missing)}


@router.post("/accounts/bulk-activate")
def bulk_activate(payload: BulkAccountIds, db: Session = Depends(get_db),
                   superadmin: User = Depends(require_superadmin)):
    accounts = db.query(Account).filter(Account.id.in_(payload.account_ids)).all()
    found_ids = {a.id for a in accounts}
    for account in accounts:
        account.is_suspended = False
    db.commit()
    log_activity_for_user(db, superadmin, "bulk_account_activate", f"Bulk-activated {len(found_ids)} account(s)")
    missing = set(payload.account_ids) - found_ids
    return {"activated": sorted(found_ids), "not_found": sorted(missing)}


# ---------- Force logout ----------

@router.post("/accounts/{account_id}/force-logout")
def force_logout_account(account_id: int, db: Session = Depends(get_db),
                          superadmin: User = Depends(require_superadmin)):
    """Invalidate every outstanding session for every user under this
    account, without suspending it — e.g. after a suspected compromised
    password, or before a bulk password reset."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    updated = db.query(User).filter(User.account_id == account_id).update(
        {User.token_version: User.token_version + 1}
    )
    db.commit()
    log_activity_for_user(db, superadmin, "force_logout_account", f"Force-logged-out all users of {account.name}")
    return {"detail": f"Logged out {updated} user(s) of {account.name}"}


@router.post("/users/{user_id}/force-logout")
def force_logout_user(user_id: int, db: Session = Depends(get_db),
                       superadmin: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    log_activity_for_user(db, superadmin, "force_logout_user", f"Force-logged-out {user.username}")
    return {"detail": f"Logged out {user.username}"}


# ---------- Superadmin user management (cross-account) ----------
# routers/users.py's endpoints are gated on require_admin, which is scoped to
# managing users within one's own account — a superadmin (who typically has
# no account_id) can't use them. These give the superadmin console the same
# capabilities across any account.

@router.put("/users/{user_id}/role", response_model=None)
def change_user_role(user_id: int, payload: RoleUpdate, db: Session = Depends(get_db),
                      superadmin: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = user.role.value
    user.role = payload.role
    db.commit()
    log_activity_for_user(
        db, superadmin, "user_role_change",
        f"Changed {user.username}'s role from {old_role} to {payload.role.value}",
    )
    return {"detail": f"{user.username} is now {payload.role.value}"}


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, db: Session = Depends(get_db),
                     superadmin: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    log_activity_for_user(db, superadmin, "user_deactivate", f"Deactivated {user.username}")
    return {"detail": f"{user.username} deactivated"}


@router.post("/users/{user_id}/activate")
def activate_user(user_id: int, db: Session = Depends(get_db),
                   superadmin: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    log_activity_for_user(db, superadmin, "user_activate", f"Activated {user.username}")
    return {"detail": f"{user.username} activated"}


class SuperadminPasswordReset(BaseModel):
    new_password: str


@router.post("/users/{user_id}/reset-password")
def superadmin_reset_password(user_id: int, payload: SuperadminPasswordReset,
                               db: Session = Depends(get_db),
                               superadmin: User = Depends(require_superadmin)):
    from auth import hash_password
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_demo:
        raise HTTPException(status_code=403, detail="Cannot reset the demo account's password")
    user.hashed_password = hash_password(payload.new_password)
    user.token_version = (user.token_version or 0) + 1  # old password's sessions shouldn't outlive the reset
    db.commit()
    log_activity_for_user(db, superadmin, "superadmin_reset_password", f"Reset password for {user.username}")
    return {"detail": f"Password reset for {user.username}"}


# ---------- CSV export (activity) ----------

@router.get("/activity/export")
def export_activity(
    since: Optional[datetime] = Query(None, description="Only entries at/after this timestamp"),
    until: Optional[datetime] = Query(None, description="Only entries at/before this timestamp"),
    critical_only: bool = Query(False),
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    superadmin: User = Depends(require_superadmin),
):
    q = db.query(ActivityLog)
    if since:
        q = q.filter(ActivityLog.created_at >= since)
    if until:
        q = q.filter(ActivityLog.created_at <= until)
    if critical_only:
        q = q.filter(ActivityLog.action.like("CRITICAL:%"))
    if account_id is not None:
        q = q.filter(ActivityLog.account_id == account_id)
    entries = q.order_by(ActivityLog.created_at.desc()).limit(10000).all()
    rows = [
        {
            "id": e.id,
            "account_id": e.account_id,
            "username": e.username,
            "action": e.action,
            "details": e.details,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in entries
    ]
    log_activity_for_user(db, superadmin, "export_activity", f"Exported {len(rows)} activity log entries to CSV")
    return _csv_response(rows, "activity_export.csv")


# ---------- Platform announcements ----------
# Broadcast banners shown to every tenant user (maintenance windows, new
# features). GET /api/public/announcement/active (routers/public.py) is the
# unauthenticated read side every logged-in tenant app polls.

@router.get("/announcements", response_model=List[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    return db.query(Announcement).order_by(Announcement.created_at.desc()).all()


@router.post("/announcements", response_model=AnnouncementOut)
def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db),
                         superadmin: User = Depends(require_superadmin)):
    try:
        level = AnnouncementLevel(payload.level)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid level: {payload.level}")
    announcement = Announcement(message=payload.message, level=level, created_by=superadmin.username)
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    log_activity_for_user(db, superadmin, "announcement_create", f"Posted announcement: {payload.message[:80]}")
    return announcement


@router.post("/announcements/{announcement_id}/deactivate")
def deactivate_announcement(announcement_id: int, db: Session = Depends(get_db),
                             superadmin: User = Depends(require_superadmin)):
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    announcement.is_active = False
    db.commit()
    log_activity_for_user(db, superadmin, "announcement_deactivate", f"Deactivated announcement #{announcement_id}")
    return {"detail": "Announcement deactivated"}
