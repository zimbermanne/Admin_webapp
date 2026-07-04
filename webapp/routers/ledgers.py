from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Debtor, Creditor, DebtorItem, CreditorItem, InventoryItem, User, LedgerStatus, RoleEnum
from schemas import (
    DebtorCreate, CreditorCreate, LedgerOut, PaymentRequest,
    DebtorItemLine, CreditorItemLine,
)
from auth import get_current_user
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
    query = db.query(Debtor).options(joinedload(Debtor.items))
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Debtor.account_id == account_id)
    return query.order_by(Debtor.created_at.desc()).all()


@router.post("/debtors", response_model=LedgerOut)
def add_debtor(payload: DebtorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot add debtors")

    lines = payload.items or []
    data = payload.model_dump(exclude={"items"})

    if lines:
        # Debt is being documented by handing out stock on credit — pull real
        # items from inventory instead of a free-typed amount, and reduce
        # stock right away since the goods have physically left.
        computed_total = 0.0
        prepared = []
        for line in lines:
            item = None
            if line.item_id is not None:
                item = db.query(InventoryItem).filter(
                    InventoryItem.id == line.item_id, InventoryItem.account_id == account_id
                ).first()
                if not item:
                    raise HTTPException(status_code=404, detail=f"Inventory item {line.item_id} not found")
            qty = line.quantity or 0
            if qty <= 0:
                raise HTTPException(status_code=400, detail="Item quantity must be greater than zero")
            if item:
                if item.quantity < qty:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Not enough stock for {item.name} (have {item.quantity}, need {qty})",
                    )
                unit_price = line.unit_price if line.unit_price is not None else item.selling_price
                name = item.name
            else:
                unit_price = line.unit_price or 0
                name = line.item_name or "Item"
            line_total = qty * unit_price
            computed_total += line_total
            prepared.append((item, qty, unit_price, name, line_total))

        data["total_owed"] = computed_total
        debtor = Debtor(**data, account_id=account_id)
        db.add(debtor)
        db.flush()  # get debtor.id before creating line items

        for item, qty, unit_price, name, line_total in prepared:
            if item:
                item.quantity -= qty
            db.add(DebtorItem(
                account_id=account_id, debtor_id=debtor.id,
                item_id=item.id if item else None, item_name=name,
                quantity=qty, unit_price=unit_price, total=line_total,
            ))
    else:
        debtor = Debtor(**data, account_id=account_id)
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
    query = db.query(Creditor).options(joinedload(Creditor.items))
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

    lines = payload.items or []
    data = payload.model_dump(exclude={"items"})

    if lines:
        # Debt is being documented by receiving stock on credit from a
        # supplier — add straight into inventory (existing item or a brand
        # new one) instead of typing the amount owed by hand.
        computed_total = 0.0
        prepared = []
        for line in lines:
            item = None
            if line.item_id is not None:
                item = db.query(InventoryItem).filter(
                    InventoryItem.id == line.item_id, InventoryItem.account_id == account_id
                ).first()
                if not item:
                    raise HTTPException(status_code=404, detail=f"Inventory item {line.item_id} not found")
            qty = line.quantity or 0
            if qty <= 0:
                raise HTTPException(status_code=400, detail="Item quantity must be greater than zero")

            if not item:
                if not line.item_name:
                    raise HTTPException(status_code=400, detail="New inventory items need a name")
                item = InventoryItem(
                    account_id=account_id,
                    name=line.item_name,
                    category=line.category or "General",
                    unit=line.unit or "pcs",
                    quantity=0,
                    cost_price=line.unit_cost or 0,
                    selling_price=line.selling_price or 0,
                )
                db.add(item)
                db.flush()  # get item.id

            unit_cost = line.unit_cost if line.unit_cost is not None else item.cost_price
            line_total = qty * unit_cost
            computed_total += line_total
            prepared.append((item, qty, unit_cost, item.name, line_total))

        data["total_owed"] = computed_total
        creditor = Creditor(**data, account_id=account_id)
        db.add(creditor)
        db.flush()  # get creditor.id before creating line items

        for item, qty, unit_cost, name, line_total in prepared:
            item.quantity += qty
            db.add(CreditorItem(
                account_id=account_id, creditor_id=creditor.id,
                item_id=item.id, item_name=name,
                quantity=qty, unit_cost=unit_cost, total=line_total,
            ))
    else:
        creditor = Creditor(**data, account_id=account_id)
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
