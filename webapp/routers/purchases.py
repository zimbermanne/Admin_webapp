import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import pandas as pd
from sqlalchemy.orm import Session

from database import get_db
from models import Purchase, InventoryItem, User, RoleEnum
from schemas import PurchaseCreate, PurchaseOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user

router = APIRouter(prefix="/api/purchases", tags=["purchases"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


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

    # Increase stock if a matching inventory item exists in the same account,
    # otherwise create a new inventory item so purchases always keep stock in sync.
    item = db.query(InventoryItem).filter(
        InventoryItem.name == payload.item_name,
        InventoryItem.account_id == account_id
    ).first()
    if item:
        item.quantity += payload.quantity
        item.cost_price = payload.unit_cost
    else:
        item = InventoryItem(
            account_id=account_id,
            name=payload.item_name,
            quantity=payload.quantity,
            cost_price=payload.unit_cost,
            selling_price=payload.unit_cost,
        )
        db.add(item)

    db.commit()
    db.refresh(purchase)
    log_activity_for_user(db, current_user, "purchase_record", f"Purchased {payload.quantity} x {payload.item_name}")
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
        item = db.query(InventoryItem).filter(
            InventoryItem.name == item_name,
            InventoryItem.account_id == account_id
        ).first()
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


@router.delete("/{purchase_id}")
def delete_purchase(purchase_id: int, db: Session = Depends(get_db),
                     current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    query = db.query(Purchase).filter(Purchase.id == purchase_id)
    if account_id is not None:
        query = query.filter(Purchase.account_id == account_id)
    purchase = query.first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    db.delete(purchase)
    db.commit()
    log_activity_for_user(db, current_user, "purchase_delete", f"Deleted purchase {purchase_id}")
    return {"detail": "Purchase deleted"}