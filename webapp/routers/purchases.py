import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Purchase, InventoryItem, User, RoleEnum
from schemas import PurchaseCreate, PurchaseUpdate, PurchaseMultiCreate, PurchaseOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user
from ledger import post_purchase_entry, find_journal_entry_by_reference, reverse_journal_entry, FiscalPeriodLockedError

router = APIRouter(prefix="/api/purchases", tags=["purchases"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


def _find_item_by_name(db: Session, account_id: int, item_name: str):
    """Case-insensitive lookup, matching how the frontend's item-name dropdown matches."""
    return db.query(InventoryItem).filter(
        func.lower(InventoryItem.name) == item_name.strip().lower(),
        InventoryItem.account_id == account_id
    ).first()


def _apply_inventory_for_purchase(db: Session, account_id: int, item_name: str, quantity: float, unit_cost: float):
    """Add stock for a purchased item, creating the inventory item if it doesn't exist yet.
    Returns the resolved InventoryItem so the caller can link the purchase to it via item_id."""
    item = _find_item_by_name(db, account_id, item_name)
    if item:
        item.quantity += quantity
        item.cost_price = unit_cost
    else:
        item = InventoryItem(
            account_id=account_id,
            name=item_name,
            quantity=quantity,
            cost_price=unit_cost,
            selling_price=unit_cost,
        )
        db.add(item)
        db.flush()  # assign item.id so it can be linked immediately
    return item


def _reverse_inventory_for_purchase(db: Session, account_id: int, item_id, item_name: str, quantity: float):
    """Undo the stock effect of a purchase, e.g. before editing it. Prefers the
    stored item_id (stable even if the item was renamed since), falling back to
    a name lookup for purchases recorded before item_id existed."""
    item = None
    if item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        item = _find_item_by_name(db, account_id, item_name)
    if item:
        item.quantity = max(0, item.quantity - quantity)


@router.post("/", response_model=PurchaseOut)
def record_purchase(payload: PurchaseCreate, db: Session = Depends(get_db),
                     current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot record purchases")

    total = payload.unit_cost * payload.quantity
    purchase = Purchase(
        account_id=account_id,
        item_name=payload.item_name,
        supplier=payload.supplier or "",
        quantity=payload.quantity,
        unit_cost=payload.unit_cost,
        total=total,
    )
    db.add(purchase)
    item = _apply_inventory_for_purchase(db, account_id, payload.item_name, payload.quantity, payload.unit_cost)
    purchase.item_id = item.id

    db.commit()
    db.refresh(purchase)
    try:
        post_purchase_entry(db, account_id, purchase, created_by=current_user.username)
    except ValueError as e:
        log_activity_for_user(db, current_user, "CRITICAL: ledger_post_failed", str(e))
    log_activity_for_user(db, current_user, "purchase_record", f"Purchased {payload.quantity} x {payload.item_name}")
    return purchase


@router.post("/multi", response_model=List[PurchaseOut])
def record_purchases_multi(payload: PurchaseMultiCreate, db: Session = Depends(get_db),
                            current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot record purchases")
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    created = []
    for entry in payload.items:
        if not entry.item_name or not entry.item_name.strip():
            continue
        total = entry.unit_cost * entry.quantity
        purchase = Purchase(
            account_id=account_id,
            item_name=entry.item_name,
            supplier=entry.supplier or "",
            quantity=entry.quantity,
            unit_cost=entry.unit_cost,
            total=total,
        )
        db.add(purchase)
        item = _apply_inventory_for_purchase(db, account_id, entry.item_name, entry.quantity, entry.unit_cost)
        purchase.item_id = item.id
        created.append(purchase)

    if not created:
        raise HTTPException(status_code=400, detail="At least one valid item is required")

    db.commit()
    for purchase in created:
        db.refresh(purchase)
        try:
            post_purchase_entry(db, account_id, purchase, created_by=current_user.username)
        except ValueError as e:
            log_activity_for_user(db, current_user, "CRITICAL: ledger_post_failed", str(e))
    log_activity_for_user(db, current_user, "purchase_record_multi", f"Recorded {len(created)} purchase items")
    return created


@router.put("/{purchase_id}", response_model=PurchaseOut)
def update_purchase(purchase_id: int, payload: PurchaseUpdate, db: Session = Depends(get_db),
                     current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    query = db.query(Purchase).filter(Purchase.id == purchase_id)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    purchase = query.first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # Undo the stock effect of the original purchase before applying the edited one.
    _reverse_inventory_for_purchase(db, purchase.account_id, purchase.item_id, purchase.item_name, purchase.quantity)

    if payload.item_name is not None and payload.item_name.strip():
        purchase.item_name = payload.item_name
    if payload.supplier is not None:
        purchase.supplier = payload.supplier
    if payload.quantity is not None:
        purchase.quantity = payload.quantity
    if payload.unit_cost is not None:
        purchase.unit_cost = payload.unit_cost
    purchase.total = purchase.quantity * purchase.unit_cost

    item = _apply_inventory_for_purchase(db, purchase.account_id, purchase.item_name, purchase.quantity, purchase.unit_cost)
    purchase.item_id = item.id

    db.commit()
    db.refresh(purchase)

    # The original journal entry no longer matches the edited amounts —
    # reverse it and post a fresh one, rather than mutating a posted entry.
    original_entry = find_journal_entry_by_reference(db, purchase.account_id, f"purchase-{purchase.id}")
    if original_entry is not None:
        try:
            reverse_journal_entry(db, purchase.account_id, original_entry, created_by=current_user.username,
                                   reason=f"Purchase {purchase_id} edited")
            post_purchase_entry(db, purchase.account_id, purchase, created_by=current_user.username)
        except FiscalPeriodLockedError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except ValueError as e:
            log_activity_for_user(db, current_user, "CRITICAL: ledger_reversal_failed", str(e))

    log_activity_for_user(db, current_user, "purchase_update", f"Edited purchase {purchase_id}, ledger corrected")
    return purchase


@router.get("/", response_model=List[PurchaseOut])
def list_purchases(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Purchase)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    return query.order_by(Purchase.created_at.desc()).all()


@router.get("/stats/summary")
def purchase_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Purchase)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    purchases = query.all()
    return {
        "total_purchases": len(purchases),
        "total_spent": round(sum(p.total for p in purchases), 2),
    }


@router.post("/batch")
async def batch_import(file: UploadFile = File(...), db: Session = Depends(get_db),
                        current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot import purchases")
    
    content = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    else:
        df = pd.read_excel(io.BytesIO(content))

    created = 0
    for _, row in df.iterrows():
        item_name = str(row.get("item_name", "")).strip()
        if not item_name:
            continue
        quantity = float(row.get("quantity", 0) or 0)
        unit_cost = float(row.get("unit_cost", 0) or 0)
        purchase = Purchase(
            account_id=account_id,
            item_name=item_name,
            supplier=str(row.get("supplier", "")).strip(),
            quantity=quantity,
            unit_cost=unit_cost,
            total=quantity * unit_cost,
        )
        db.add(purchase)
        item = _apply_inventory_for_purchase(db, account_id, item_name, quantity, unit_cost)
        purchase.item_id = item.id
        created += 1
    db.commit()
    log_activity_for_user(db, current_user, "purchase_batch_import", f"Imported {created} purchases")
    return {"created": created}


@router.get("/export/spreadsheet")
def export_purchases(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Purchase)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    purchases = query.order_by(Purchase.created_at.desc()).all()
    df = pd.DataFrame([{
        "date": p.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "item_name": p.item_name,
        "supplier": p.supplier,
        "quantity": p.quantity,
        "unit_cost": p.unit_cost,
        "total": p.total,
    } for p in purchases])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Purchases")
    buf.seek(0)
    log_activity_for_user(db, current_user, "purchase_export", f"Exported {len(purchases)} purchases")
    headers = {"Content-Disposition": 'attachment; filename="purchases_export.xlsx"'}
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                              headers=headers)


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Purchase).filter(Purchase.id == purchase_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    purchase = query.first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase