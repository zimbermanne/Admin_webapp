from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Debtor, Creditor, User, LedgerStatus, RoleEnum, FiscalPeriod, FiscalPeriodStatus
from schemas import DebtorCreate, CreditorCreate, LedgerOut, PaymentRequest, FiscalPeriodCreate, FiscalPeriodOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user

router = APIRouter(prefix="/api/ledgers", tags=["ledgers"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


def _update_status(entry):
    if entry.amount_paid <= 0:
        entry.status = LedgerStatus.unpaid
    elif entry.amount_paid >= entry.total_owed:
        entry.status = LedgerStatus.paid
    else:
        entry.status = LedgerStatus.partial


@router.get("/debtors", response_model=List[LedgerOut])
def list_debtors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Debtor)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Debtor.account_id == account_id)
    return query.order_by(Debtor.created_at.desc()).all()


@router.post("/debtors", response_model=LedgerOut)
def add_debtor(payload: DebtorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot add debtors")
    
    debtor = Debtor(**payload.model_dump(), account_id=account_id)
    db.add(debtor)
    db.commit()
    db.refresh(debtor)
    log_activity_for_user(db, current_user, "debtor_add", f"Added debtor {debtor.name}")
    return debtor


@router.post("/debtors/pay/{debtor_id}", response_model=LedgerOut)
def pay_debtor(debtor_id: int, payload: PaymentRequest, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    query = db.query(Debtor).filter(Debtor.id == debtor_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Debtor.account_id == account_id)
    debtor = query.first()
    if not debtor:
        raise HTTPException(status_code=404, detail="Debtor not found")
    debtor.amount_paid += payload.amount
    _update_status(debtor)
    db.commit()
    db.refresh(debtor)
    log_activity_for_user(db, current_user, "debtor_payment", f"{debtor.name} paid {payload.amount}")
    return debtor


@router.get("/creditors", response_model=List[LedgerOut])
def list_creditors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Creditor)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Creditor.account_id == account_id)
    return query.order_by(Creditor.created_at.desc()).all()


@router.post("/creditors", response_model=LedgerOut)
def add_creditor(payload: CreditorCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot add creditors")
    
    creditor = Creditor(**payload.model_dump(), account_id=account_id)
    db.add(creditor)
    db.commit()
    db.refresh(creditor)
    log_activity_for_user(db, current_user, "creditor_add", f"Added creditor {creditor.name}")
    return creditor


@router.post("/creditors/pay/{creditor_id}", response_model=LedgerOut)
def pay_creditor(creditor_id: int, payload: PaymentRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    query = db.query(Creditor).filter(Creditor.id == creditor_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Creditor.account_id == account_id)
    creditor = query.first()
    if not creditor:
        raise HTTPException(status_code=404, detail="Creditor not found")
    creditor.amount_paid += payload.amount
    _update_status(creditor)
    db.commit()
    db.refresh(creditor)
    log_activity_for_user(db, current_user, "creditor_payment", f"Paid {creditor.name} {payload.amount}")
    return creditor


# ---------- Fiscal Periods ----------

@router.get("/fiscal-periods", response_model=List[FiscalPeriodOut])
def list_fiscal_periods(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    q = db.query(FiscalPeriod)
    if account_id is not None:
        q = q.filter(FiscalPeriod.account_id == account_id)
    return q.order_by(FiscalPeriod.start_date.desc()).all()


@router.post("/fiscal-periods", response_model=FiscalPeriodOut)
def create_fiscal_period(payload: FiscalPeriodCreate, db: Session = Depends(get_db),
                          current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create fiscal periods")
    if payload.end_date <= payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")

    overlap = (
        db.query(FiscalPeriod)
        .filter(
            FiscalPeriod.account_id == account_id,
            FiscalPeriod.start_date <= payload.end_date,
            FiscalPeriod.end_date >= payload.start_date,
        )
        .first()
    )
    if overlap:
        raise HTTPException(status_code=400, detail=f"Overlaps existing period '{overlap.name}'")

    period = FiscalPeriod(account_id=account_id, name=payload.name,
                           start_date=payload.start_date, end_date=payload.end_date)
    db.add(period)
    db.commit()
    db.refresh(period)
    log_activity_for_user(db, current_user, "fiscal_period_create", f"Created period {period.name}")
    return period


@router.post("/fiscal-periods/{period_id}/close", response_model=FiscalPeriodOut)
def close_fiscal_period(period_id: int, db: Session = Depends(get_db),
                         current_user: User = Depends(require_manager_up)):
    """Locks the period: post_journal_entry will reject any entry dated
    inside it from this point on. Existing entries are untouched — the
    lock only blocks new posts and edits, never mutates history."""
    account_id = get_account_filter(current_user)
    q = db.query(FiscalPeriod).filter(FiscalPeriod.id == period_id)
    if account_id is not None:
        q = q.filter(FiscalPeriod.account_id == account_id)
    period = q.first()
    if not period:
        raise HTTPException(status_code=404, detail="Fiscal period not found")
    if period.status == FiscalPeriodStatus.closed:
        raise HTTPException(status_code=400, detail="Fiscal period is already closed")

    period.status = FiscalPeriodStatus.closed
    period.closed_by = current_user.username
    period.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(period)
    log_activity_for_user(db, current_user, "fiscal_period_close", f"Closed period {period.name}")
    return period


@router.post("/fiscal-periods/{period_id}/reopen", response_model=FiscalPeriodOut)
def reopen_fiscal_period(period_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(require_manager_up)):
    """Reopening is intentionally left available to managers+ (not locked to
    superadmin) since small businesses need to fix a mistaken close without
    filing a support ticket — but every reopen is logged so it's auditable."""
    account_id = get_account_filter(current_user)
    q = db.query(FiscalPeriod).filter(FiscalPeriod.id == period_id)
    if account_id is not None:
        q = q.filter(FiscalPeriod.account_id == account_id)
    period = q.first()
    if not period:
        raise HTTPException(status_code=404, detail="Fiscal period not found")
    if period.status == FiscalPeriodStatus.open:
        raise HTTPException(status_code=400, detail="Fiscal period is already open")

    period.status = FiscalPeriodStatus.open
    period.closed_by = None
    period.closed_at = None
    db.commit()
    db.refresh(period)
    log_activity_for_user(db, current_user, "CRITICAL: fiscal_period_reopen", f"Reopened period {period.name}")
    return period
