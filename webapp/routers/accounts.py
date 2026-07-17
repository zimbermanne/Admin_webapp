from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Account, User, RoleEnum, Country, RevenueAuthority
from schemas import AccountOut, AccountUpdate, AccountWithUsersOut
from auth import require_superadmin, require_admin, get_current_user
from activity import log_activity_for_user

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


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
    
    # Prevent account admins from changing suspension status — but only block
    # an actual attempted change. Since the frontend round-trips the account
    # object it loaded (which includes the current is_suspended value), this
    # field is almost always present in the payload; comparing against the
    # current value (rather than just checking it's not None) avoids blocking
    # every save when the value hasn't actually changed.
    provided = payload.model_dump(exclude_unset=True)
    if "is_suspended" in provided and provided["is_suspended"] != account.is_suspended:
        raise HTTPException(status_code=403, detail="Cannot change suspension status")

    # "country" isn't a real column — Account.country is a relationship to
    # the Country table, so a plain setattr(account, "country", "Kenya")
    # would try to assign a string where a Country object is expected and
    # fail. Resolve it here instead: look up the Country by name, set the
    # FK, and — the first time a country is set — default tax_rate from
    # that country's revenue authority so users aren't left at 0%.
    country_name = provided.pop("country", None)
    if country_name:
        country = db.query(Country).filter(Country.name == country_name).first()
        if not country:
            raise HTTPException(status_code=400, detail=f"Unknown country: {country_name}")
        account.country_id = country.id

        authority = db.query(RevenueAuthority).filter(RevenueAuthority.country_id == country.id).first()
        if authority:
            account.revenue_authority_id = authority.id
            # Only auto-fill tax_rate if the user hasn't explicitly set one
            # in this same request and the account doesn't already have a
            # non-zero rate — don't clobber a manually-configured rate.
            if "tax_rate" not in provided and not account.tax_rate:
                account.tax_rate = authority.default_vat_rate or 0

    for field, value in provided.items():
        setattr(account, field, value)
    
    db.commit()
    db.refresh(account)
    log_activity_for_user(db, current_user, "account_update", f"Updated account {account.name}")
    return account


@router.get("/", response_model=List[AccountOut])
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


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Delete an account (superadmin only) - USE WITH CAUTION."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # This will cascade delete all related data due to foreign keys
    db.delete(account)
    db.commit()
    log_activity_for_user(db, superadmin, "account_delete", f"Deleted account {account.name}")
    return {"detail": f"Account {account.name} has been deleted"}