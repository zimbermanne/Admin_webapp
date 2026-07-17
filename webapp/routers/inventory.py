import io
import re
from collections import defaultdict
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

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

    data = payload.model_dump()
    # An empty/blank SKU is "no SKU", not a real value — treat it as NULL so
    # multiple items without one don't collide on the unique constraint
    # (a blank string '' colliding with another blank string '' was the
    # actual bug: saving a second item with no SKU always failed).
    if data.get("sku") is not None and not data["sku"].strip():
        data["sku"] = None

    item = InventoryItem(**data, account_id=account_id)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"An item with SKU '{data.get('sku')}' already exists.")
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


def _normalize_name(name: str) -> str:
    """Collapse whitespace/case/punctuation differences so 'Rice  5kg',
    'rice 5kg', and 'RICE 5KG.' are recognized as the same underlying item
    instead of three separate-looking rows."""
    normalized = (name or "").strip().lower()
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def find_redundant_inventory(items: List[InventoryItem]) -> dict:
    """Internal function: inspects a list of InventoryItem rows for likely
    redundant/duplicate data and groups them for review.

    Two kinds of redundancy are detected:
      - exact_sku: rows sharing the same non-null SKU (shouldn't normally
        happen since SKU is unique per account, but catches stale data from
        before that constraint, or cross-account leakage bugs).
      - same_name: rows whose normalized name+category match, which usually
        means the same product got entered more than once (e.g. via manual
        entry plus a spreadsheet import) under slightly different casing,
        spacing, or punctuation.

    Returns a dict with both groups and a total count of items involved,
    so a caller can decide what to merge/delete without this function
    touching the database itself.
    """
    by_sku = defaultdict(list)
    by_name = defaultdict(list)

    for item in items:
        if item.sku:
            by_sku[item.sku].append(item)
        key = (_normalize_name(item.name), (item.category or "").strip().lower())
        by_name[key].append(item)

    def _summarize(group: List[InventoryItem]) -> dict:
        return {
            "items": [
                {
                    "id": i.id,
                    "name": i.name,
                    "sku": i.sku,
                    "category": i.category,
                    "quantity": i.quantity,
                    "cost_price": i.cost_price,
                    "selling_price": i.selling_price,
                }
                for i in group
            ],
            "total_quantity": sum(i.quantity for i in group),
        }

    exact_sku_groups = [_summarize(g) for g in by_sku.values() if len(g) > 1]
    same_name_groups = [_summarize(g) for g in by_name.values() if len(g) > 1]

    flagged_ids = set()
    for group_list in (exact_sku_groups, same_name_groups):
        for group in group_list:
            flagged_ids.update(entry["id"] for entry in group["items"])

    return {
        "exact_sku_duplicates": exact_sku_groups,
        "same_name_duplicates": same_name_groups,
        "flagged_item_count": len(flagged_ids),
    }


@router.get("/redundant/check")
def check_redundant_inventory(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Surface likely-duplicate inventory rows for manual review/cleanup.
    Read-only: it never merges or deletes anything itself."""
    query = db.query(InventoryItem)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(InventoryItem.account_id == account_id)
    items = query.all()
    return find_redundant_inventory(items)


class MergeInventoryRequest(BaseModel):
    keep_id: int
    merge_ids: List[int]


@router.post("/redundant/merge")
def merge_redundant_inventory(payload: MergeInventoryRequest, db: Session = Depends(get_db),
                               current_user: User = Depends(require_manager_up)):
    """Fold one or more duplicate rows into the row the user chose to keep:
    quantities are summed onto `keep_id`, and the `merge_ids` rows are
    deleted. Only ever acts on rows the caller can already see (same
    account), and only on an explicit, user-confirmed pairing — this
    endpoint never guesses which row is the "real" one."""
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot merge inventory items")
    if payload.keep_id in payload.merge_ids:
        raise HTTPException(status_code=400, detail="keep_id cannot also be in merge_ids")

    query = db.query(InventoryItem).filter(InventoryItem.account_id == account_id)
    keep_item = query.filter(InventoryItem.id == payload.keep_id).first()
    if not keep_item:
        raise HTTPException(status_code=404, detail="Item to keep was not found")

    merge_items = query.filter(InventoryItem.id.in_(payload.merge_ids)).all()
    if len(merge_items) != len(set(payload.merge_ids)):
        raise HTTPException(status_code=404, detail="One or more items to merge were not found")

    added_quantity = sum(i.quantity for i in merge_items)
    keep_item.quantity += added_quantity
    for i in merge_items:
        db.delete(i)
    db.commit()
    db.refresh(keep_item)
    log_activity_for_user(
        db, current_user, "inventory_merge",
        f"Merged {len(merge_items)} duplicate item(s) into {keep_item.name} (+{added_quantity} qty)",
    )
    return keep_item


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


def _safe_str(value, default=""):
    """pandas gives back float('nan') for blank cells — str(nan) would
    otherwise become the literal text 'nan' in a name/sku/category field."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    return str(value).strip()


def _safe_num(value, default=0.0):
    """Same NaN problem for numeric cells: `NaN or 0` evaluates to NaN
    (NaN is truthy in Python), so a blank quantity/price cell was silently
    becoming NaN and breaking JSON serialization on the next list fetch —
    which is what made the import look like it 'wasn't working'."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@router.post("/batch")
async def batch_import(file: UploadFile = File(...), db: Session = Depends(get_db),
                        current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot import inventory items")

    filename = (file.filename or "").lower()
    content = await file.read()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type — upload a .csv, .xlsx, or .xls file")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}")

    # SKU is unique in the DB. Track SKUs we've already committed (existing
    # rows) or already queued in this same file, so a duplicate SKU is
    # skipped instead of raising an unhandled IntegrityError that crashes
    # the whole request with a 500 (which the browser then misreports as a
    # CORS failure, since the error response never reaches CORSMiddleware).
    existing_skus = {
        s for (s,) in db.query(InventoryItem.sku)
        .filter(InventoryItem.account_id == account_id, InventoryItem.sku.isnot(None))
        .all()
    }
    seen_skus = set()

    created = 0
    skipped = 0
    duplicate_skus = []
    for _, row in df.iterrows():
        name = _safe_str(row.get("name"))
        if not name:
            skipped += 1
            continue

        sku = _safe_str(row.get("sku")) or None
        if sku and (sku in existing_skus or sku in seen_skus):
            skipped += 1
            duplicate_skus.append(sku)
            continue
        if sku:
            seen_skus.add(sku)

        item = InventoryItem(
            account_id=account_id,
            name=name,
            sku=sku,
            category=_safe_str(row.get("category"), "General") or "General",
            quantity=_safe_num(row.get("quantity"), 0),
            unit=_safe_str(row.get("unit"), "pcs") or "pcs",
            cost_price=_safe_num(row.get("cost_price"), 0),
            selling_price=_safe_num(row.get("selling_price"), 0),
            reorder_point=_safe_num(row.get("reorder_point"), 5),
        )
        db.add(item)
        created += 1

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Import failed due to a data conflict: {exc.orig}")

    log_activity_for_user(db, current_user, "inventory_batch_import", f"Imported {created} items")
    response = {"created": created, "skipped": skipped}
    if duplicate_skus:
        preview = ", ".join(duplicate_skus[:5])
        more = f" and {len(duplicate_skus) - 5} more" if len(duplicate_skus) > 5 else ""
        response["duplicate_skus"] = f"Skipped duplicate SKU(s): {preview}{more}"
    return response


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
    data = payload.model_dump(exclude_unset=True)
    if "sku" in data and data["sku"] is not None and not data["sku"].strip():
        data["sku"] = None
    for field, value in data.items():
        setattr(item, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"An item with SKU '{data.get('sku')}' already exists.")
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