import io
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import InventoryItem, User, RoleEnum
from schemas import InventoryCreate, InventoryUpdate, InventoryOut
from auth import get_current_user, require_manager_up, require_account_user
from activity import log_activity_for_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


@router.get("/", response_model=List[InventoryOut])
def list_items(category: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    if category:
        query = query.filter(InventoryItem.category == category)
    if q:
        query = query.filter(InventoryItem.name.ilike(f"%{q}%"))
    return query.order_by(InventoryItem.name).all()


@router.post("/", response_model=InventoryOut)
def create_item(payload: InventoryCreate, db: Session = Depends(get_db),
                 current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create inventory items")
    
    item = InventoryItem(**payload.model_dump(), account_id=account_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity_for_user(db, current_user, "inventory_create", f"Added item {item.name}")
    return item


@router.get("/metrics")
def metrics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    
    items = query.all()
    total_items = len(items)
    total_units = sum(i.quantity for i in items)
    total_value = sum(i.quantity * i.cost_price for i in items)
    low_stock = [i for i in items if i.quantity <= i.reorder_point]
    return {
        "total_items": total_items,
        "total_units": total_units,
        "total_value": round(total_value, 2),
        "low_stock_count": len(low_stock),
    }


@router.get("/low-stock/alerts", response_model=List[InventoryOut])
def low_stock_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem).filter(InventoryItem.quantity <= InventoryItem.reorder_point)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    return query.all()


@router.get("/categories/list")
def categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem.category).distinct()
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    rows = query.all()
    return sorted({r[0] for r in rows if r[0]})


@router.get("/export/spreadsheet")
def export_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    items = query.order_by(InventoryItem.name).all()
    df = pd.DataFrame([{
        "name": i.name,
        "sku": i.sku or "",
        "category": i.category,
        "quantity": i.quantity,
        "unit": i.unit,
        "cost_price": i.cost_price,
        "selling_price": i.selling_price,
        "reorder_point": i.reorder_point,
    } for i in items])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Inventory")
    buf.seek(0)
    log_activity_for_user(db, current_user, "inventory_export", f"Exported {len(items)} items")
    headers = {"Content-Disposition": 'attachment; filename="inventory_export.xlsx"'}
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                              headers=headers)


@router.post("/batch")
async def batch_import(file: UploadFile = File(...), db: Session = Depends(get_db),
                        current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot import inventory items")
    
    content = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    else:
        df = pd.read_excel(io.BytesIO(content))

    created = 0
    for _, row in df.iterrows():
        item = InventoryItem(
            account_id=account_id,
            name=str(row.get("name", "")).strip(),
            sku=str(row.get("sku", "")).strip() or None,
            category=str(row.get("category", "General")).strip() or "General",
            quantity=float(row.get("quantity", 0) or 0),
            unit=str(row.get("unit", "pcs")).strip() or "pcs",
            cost_price=float(row.get("cost_price", 0) or 0),
            selling_price=float(row.get("selling_price", 0) or 0),
            reorder_point=float(row.get("reorder_point", 5) or 5),
        )
        if item.name:
            db.add(item)
            created += 1
    db.commit()
    log_activity_for_user(db, current_user, "inventory_batch_import", f"Imported {created} items")
    return {"created": created}


@router.get("/{item_id}", response_model=InventoryOut)
def get_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(InventoryItem).filter(InventoryItem.id == item_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/{item_id}", response_model=InventoryOut)
def update_item(item_id: int, payload: InventoryUpdate, db: Session = Depends(get_db),
                 current_user: User = Depends(require_manager_up)):
    query = db.query(InventoryItem).filter(InventoryItem.id == item_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    log_activity_for_user(db, current_user, "inventory_update", f"Updated item {item.name}")
    return item


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_up)):
    query = db.query(InventoryItem).filter(InventoryItem.id == item_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    log_activity_for_user(db, current_user, "inventory_delete", f"Deleted item {item.name}")
    return {"detail": "Item deleted"}