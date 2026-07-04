import os
import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect

from database import get_db
from models import (
    Account, User, RoleEnum, InventoryItem, Sale, Purchase, Expense, Debtor,
    Creditor, Invoice, InvoiceItem, Quotation, QuotationItem, Reminder,
    SavingsGroup, GroupMember, Contribution, Payout, GroupLoan, GroupLoanRepayment,
)
from schemas import AccountOut, AccountUpdate, AccountWithUsersOut
from auth import require_superadmin, require_admin, get_current_user
from activity import log_activity_for_user, log_activity

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

EXPORT_DIR = os.path.join(os.path.dirname(__file__), "..", "backups", "account_exports")
os.makedirs(EXPORT_DIR, exist_ok=True)


def _row_to_dict(row) -> dict:
    out = {}
    for col in sa_inspect(row).mapper.column_attrs:
        val = getattr(row, col.key)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif hasattr(val, "value"):  # enum
            val = val.value
        out[col.key] = val
    return out


def _export_account_snapshot(db: Session, account: Account) -> str:
    """Dump every record belonging to an account to a timestamped JSON file
    on disk, so account data survives even a purge. This is a stopgap for
    full point-in-time DB backups (routers/backup.py only supports SQLite;
    production runs Postgres, so that backup tool doesn't help here)."""
    aid = account.id
    data = {
        "exported_at": datetime.utcnow().isoformat(),
        "account": _row_to_dict(account),
        "users": [_row_to_dict(r) for r in db.query(User).filter(User.account_id == aid).all()],
        "inventory_items": [_row_to_dict(r) for r in db.query(InventoryItem).filter(InventoryItem.account_id == aid).all()],
        "sales": [_row_to_dict(r) for r in db.query(Sale).filter(Sale.account_id == aid).all()],
        "purchases": [_row_to_dict(r) for r in db.query(Purchase).filter(Purchase.account_id == aid).all()],
        "expenses": [_row_to_dict(r) for r in db.query(Expense).filter(Expense.account_id == aid).all()],
        "debtors": [_row_to_dict(r) for r in db.query(Debtor).filter(Debtor.account_id == aid).all()],
        "creditors": [_row_to_dict(r) for r in db.query(Creditor).filter(Creditor.account_id == aid).all()],
        "invoices": [_row_to_dict(r) for r in db.query(Invoice).filter(Invoice.account_id == aid).all()],
        "invoice_items": [_row_to_dict(r) for r in db.query(InvoiceItem).filter(InvoiceItem.account_id == aid).all()],
        "quotations": [_row_to_dict(r) for r in db.query(Quotation).filter(Quotation.account_id == aid).all()],
        "quotation_items": [_row_to_dict(r) for r in db.query(QuotationItem).filter(QuotationItem.account_id == aid).all()],
        "reminders": [_row_to_dict(r) for r in db.query(Reminder).filter(Reminder.account_id == aid).all()],
    }

    # Community savings-group data hangs off SavingsGroup.account_id, with
    # members/contributions/payouts/loans nested under group_id.
    group = db.query(SavingsGroup).filter(SavingsGroup.account_id == aid).first()
    if group:
        member_ids = [m.id for m in db.query(GroupMember).filter(GroupMember.group_id == group.id).all()]
        data["savings_group"] = _row_to_dict(group)
        data["group_members"] = [_row_to_dict(r) for r in db.query(GroupMember).filter(GroupMember.group_id == group.id).all()]
        data["contributions"] = [_row_to_dict(r) for r in db.query(Contribution).filter(Contribution.group_id == group.id).all()]
        data["payouts"] = [_row_to_dict(r) for r in db.query(Payout).filter(Payout.group_id == group.id).all()]
        loans = db.query(GroupLoan).filter(GroupLoan.group_id == group.id).all()
        data["group_loans"] = [_row_to_dict(r) for r in loans]
        loan_ids = [l.id for l in loans]
        data["group_loan_repayments"] = [
            _row_to_dict(r) for r in db.query(GroupLoanRepayment).filter(GroupLoanRepayment.loan_id.in_(loan_ids)).all()
        ] if loan_ids else []

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"account_{aid}_{account.name.replace(' ', '_')}_{timestamp}.json"
    filepath = os.path.join(EXPORT_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)
    return filepath



@router.get("/company-info")
def company_info(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lightweight account name/address/contact for any logged-in user —
    used to render the company header on invoice/quotation previews.
    (my-account below is admin-only and returns far more than this needs.)"""
    if not current_user.account_id:
        return {"name": "", "address": "", "email": "", "phone": ""}
    account = db.query(Account).filter(Account.id == current_user.account_id).first()
    if not account:
        return {"name": "", "address": "", "email": "", "phone": ""}
    return {
        "name": account.name,
        "address": ", ".join(filter(None, [account.region, account.district, account.street_address])),
        "email": account.email,
        "phone": account.phone,
        "currency": account.currency or "TZS",
    }


@router.get("/my-account", response_model=AccountOut)
def get_my_account(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Get current user's account details (account admin only)."""
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="You must belong to an account")
    
    account = db.query(Account).filter(Account.id == current_user.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return account


@router.put("/my-account", response_model=AccountOut)
def update_my_account(payload: AccountUpdate, db: Session = Depends(get_db),
                     current_user: User = Depends(require_admin)):
    """Update current user's account details (account admin only)."""
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="You must belong to an account")
    
    account = db.query(Account).filter(Account.id == current_user.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Prevent account admins from changing suspension status
    if payload.is_suspended is not None:
        raise HTTPException(status_code=403, detail="Cannot change suspension status")
    
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(account, field, value)
    if "country" in updates:
        account.country_confirmed = True
    
    db.commit()
    db.refresh(account)
    log_activity_for_user(db, current_user, "account_update", f"Updated account {account.name}")
    return account
def list_accounts(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """List all accounts (superadmin only)."""
    return db.query(Account).order_by(Account.created_at.desc()).all()


@router.get("/{account_id}", response_model=AccountWithUsersOut)
def get_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Get account details with users (superadmin only)."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    users = db.query(User).filter(User.account_id == account_id).all()
    return AccountWithUsersOut(
        **account.__dict__,
        users=users
    )


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db),
                  superadmin: User = Depends(require_superadmin)):
    """Update account details (superadmin only)."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    
    db.commit()
    db.refresh(account)
    log_activity_for_user(db, superadmin, "account_update", f"Updated account {account.name}")
    return account


@router.post("/{account_id}/suspend")
def suspend_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Suspend an account (superadmin only)."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.is_suspended = True
    db.commit()
    log_activity_for_user(db, superadmin, "account_suspend", f"Suspended account {account.name}")
    return {"detail": f"Account {account.name} has been suspended"}


@router.post("/{account_id}/activate")
def activate_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Activate a suspended account (superadmin only)."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.is_suspended = False
    db.commit()
    log_activity_for_user(db, superadmin, "account_activate", f"Activated account {account.name}")
    return {"detail": f"Account {account.name} has been activated"}


@router.get("/diagnostics/orphaned-users")
def find_orphaned_users(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: list users whose account_id points at an Account row
    that no longer exists (e.g. left over from a bad migration or a manual
    DB edit). These users will fail to log in with a 'no longer linked to a
    valid account' error until reattached via /reconnect below."""
    valid_account_ids = {row[0] for row in db.query(Account.id).all()}
    users = db.query(User).filter(User.role != RoleEnum.superadmin).all()
    orphaned = [
        u for u in users
        if u.account_id is not None and u.account_id not in valid_account_ids
    ]
    also_unlinked = [
        u for u in users
        if u.account_id is None
    ]
    return {
        "orphaned_account_id": [
            {"username": u.username, "stale_account_id": u.account_id} for u in orphaned
        ],
        "no_account_id": [
            {"username": u.username} for u in also_unlinked
        ],
    }


@router.post("/diagnostics/reconnect-user/{username}")
def reconnect_user(username: str, account_id: int, db: Session = Depends(get_db),
                    superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: reattach a user (whose account_id is missing or
    points at a deleted account) to a valid existing account."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == RoleEnum.superadmin:
        raise HTTPException(status_code=400, detail="Superadmins don't belong to an account")

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Target account not found")

    old_account_id = user.account_id
    user.account_id = account.id
    db.commit()
    log_activity_for_user(
        db, superadmin, "user_reconnect",
        f"Reconnected user {username} from account {old_account_id} to account {account.id} ({account.name})",
    )
    return {"detail": f"User {username} reconnected to account {account.name}"}


@router.post("/{account_id}/delete")
def soft_delete_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: mark an account for deletion. This does NOT destroy
    any data — it locks the account (blocks login) and starts a 30-day grace
    period. A snapshot of the account's data is exported to disk at the same
    time, so even if the grace period lapses and it's purged, an admin can
    still recover the underlying records from the export file.
    Use /restore to cancel, or /purge to permanently delete immediately.
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.deleted_at:
        raise HTTPException(status_code=400, detail="Account is already marked for deletion")

    account.is_suspended = True
    account.pending_deletion_at = datetime.utcnow()
    db.commit()

    export_path = _export_account_snapshot(db, account)

    log_activity_for_user(
        db, superadmin, "account_soft_delete",
        f"Marked account {account.name} (id={account.id}) for deletion. "
        f"Snapshot saved to {export_path}. 30-day grace period before purge.",
    )
    return {
        "detail": f"Account {account.name} marked for deletion. It can be restored "
                  f"within 30 days via POST /api/accounts/{account_id}/restore.",
        "snapshot_file": export_path,
    }


@router.post("/{account_id}/restore")
def restore_deleted_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: undo a pending deletion within the grace period."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.pending_deletion_at:
        raise HTTPException(status_code=400, detail="Account is not pending deletion")

    account.is_suspended = False
    account.pending_deletion_at = None
    db.commit()
    log_activity_for_user(db, superadmin, "account_restore", f"Restored account {account.name} (id={account.id})")
    return {"detail": f"Account {account.name} restored"}


@router.delete("/{account_id}/purge")
def purge_account(account_id: int, confirm_name: str, db: Session = Depends(get_db),
                   superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: PERMANENTLY delete an account and cascade all its
    data. Requires the account already be marked for deletion (via
    /delete) AND the caller to type the exact account name as confirmation,
    to prevent one-click / accidental irreversible deletes."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.pending_deletion_at:
        raise HTTPException(
            status_code=400,
            detail="Account must be marked for deletion first via POST /{id}/delete "
                   "before it can be purged.",
        )
    if confirm_name != account.name:
        raise HTTPException(status_code=400, detail="confirm_name does not match the account name")

    export_path = _export_account_snapshot(db, account)  # final safety snapshot
    name = account.name
    db.delete(account)
    db.commit()
    log_activity(db, superadmin.username, "account_purge",
                 f"Permanently purged account {name} (id={account_id}). Final snapshot: {export_path}")
    return {"detail": f"Account {name} permanently deleted", "final_snapshot_file": export_path}