import uuid
from datetime import datetime, date
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Sale, InventoryItem, Debtor, User, PaymentMode, LedgerStatus, RoleEnum
from schemas import SaleCreate, SaleOut, CheckoutRequest, CheckoutResponse
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user
from ledger import post_sale_entry

router = APIRouter(prefix="/api/sales", tags=["sales"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


def _decrement_stock(db: Session, item: InventoryItem, qty: float):
    if item.quantity < qty:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.name}")
    item.quantity -= qty


@router.post("/", response_model=SaleOut)
def record_sale(payload: SaleCreate, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot record sales")
    
    item = None
    unit_price = payload.unit_price or 0
    item_name = payload.item_name or ""
    if payload.item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Inventory item not found")
        if item.account_id != account_id:
            raise HTTPException(status_code=403, detail="Item does not belong to your account")
        _decrement_stock(db, item, payload.quantity)
        unit_price = payload.unit_price if payload.unit_price is not None else item.selling_price
        item_name = item.name

    total = unit_price * payload.quantity
    sale = Sale(
        account_id=account_id,
        item_id=item.id if item else None,
        item_name=item_name,
        quantity=payload.quantity,
        unit_price=unit_price,
        cost_price_at_sale=item.cost_price if item else None,
        total=total,
        payment_mode=payload.payment_mode,
        customer_name=payload.customer_name or "Walk-in",
        sold_by=current_user.username,
        receipt_no=f"RCT-{uuid.uuid4().hex[:8].upper()}",
    )
    db.add(sale)

    if payload.payment_mode == PaymentMode.credit:
        debtor = Debtor(
            account_id=account_id,
            name=payload.customer_name or "Walk-in",
            total_owed=total,
            status=LedgerStatus.unpaid,
            note=f"Credit sale: {item_name}",
        )
        db.add(debtor)

    db.commit()
    db.refresh(sale)
    try:
        post_sale_entry(db, account_id, sale, created_by=current_user.username)
    except ValueError as e:
        log_activity_for_user(db, current_user, "ledger_post_failed", str(e))
    log_activity_for_user(db, current_user, "sale_record", f"Sold {payload.quantity} x {item_name}")
    return sale


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(payload: CheckoutRequest, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot perform checkout")
    
    # Validate stock for all lines first (no overselling)
    items_map = {}
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        if item.account_id != account_id:
            raise HTTPException(status_code=403, detail=f"Item {line.item_id} does not belong to your account")
        if item.quantity < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.name}")
        items_map[line.item_id] = item

    receipt_no = f"RCT-{uuid.uuid4().hex[:8].upper()}"
    sales = []
    grand_total = 0.0
    is_salesman_mode = payload.sale_mode == "salesman"

    for line in payload.lines:
        item = items_map[line.item_id]
        item.quantity -= line.quantity
        if is_salesman_mode and line.unit_price is not None:
            price = line.unit_price
        else:
            price = item.selling_price
        if price < 0:
            raise HTTPException(status_code=400, detail=f"Price for {item.name} cannot be negative")
        total = price * line.quantity
        grand_total += total
        sale = Sale(
            account_id=account_id,
            item_id=item.id,
            item_name=item.name,
            quantity=line.quantity,
            unit_price=price,
            cost_price_at_sale=item.cost_price,
            total=total,
            payment_mode=payload.payment_mode,
            customer_name=payload.customer_name or "Walk-in",
            sold_by=current_user.username,
            receipt_no=receipt_no,
        )
        db.add(sale)
        sales.append(sale)

    if payload.payment_mode == PaymentMode.credit:
        debtor = Debtor(
            account_id=account_id,
            name=payload.customer_name or "Walk-in",
            phone=payload.customer_phone or "",
            total_owed=grand_total,
            status=LedgerStatus.unpaid,
            note=f"Credit sale receipt {receipt_no}",
        )
        db.add(debtor)

    db.commit()
    for s in sales:
        db.refresh(s)
    overridden = sum(1 for line, s in zip(payload.lines, sales) if is_salesman_mode and line.unit_price is not None)
    mode_label = f"salesman mode, {overridden} price override(s)" if is_salesman_mode else "pos mode"
    log_activity_for_user(db, current_user, "pos_checkout",
                           f"Checkout {receipt_no} total {grand_total} ({mode_label})")
    return CheckoutResponse(receipt_no=receipt_no, sales=sales, total=grand_total)


@router.get("/", response_model=List[SaleOut])
def list_sales(start: Optional[date] = None, end: Optional[date] = None,
                db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Sale)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    if start:
        query = query.filter(Sale.created_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.filter(Sale.created_at <= datetime.combine(end, datetime.max.time()))
    return query.order_by(Sale.created_at.desc()).all()


@router.get("/stats/summary")
def sales_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Sale)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    sales = query.all()
    total_revenue = sum(s.total for s in sales)
    total_qty = sum(s.quantity for s in sales)

    qty_by_item = defaultdict(float)
    revenue_by_item = defaultdict(float)
    for s in sales:
        qty_by_item[s.item_name] += s.quantity
        revenue_by_item[s.item_name] += s.total

    most_sold_item = None
    if qty_by_item:
        name = max(qty_by_item, key=qty_by_item.get)
        most_sold_item = {"item_name": name, "quantity": qty_by_item[name]}

    top_revenue_item = None
    if revenue_by_item:
        name = max(revenue_by_item, key=revenue_by_item.get)
        top_revenue_item = {"item_name": name, "revenue": round(revenue_by_item[name], 2)}

    return {
        "total_sales": len(sales),
        "total_revenue": round(total_revenue, 2),
        "total_quantity": total_qty,
        "average_sale": round(total_revenue / len(sales), 2) if sales else 0,
        "most_sold_item": most_sold_item,
        "top_revenue_item": top_revenue_item,
    }


@router.get("/customers/history")
def customer_purchase_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns each customer with the items they bought and when, for the Purchases Ledger view."""
    query = db.query(Sale)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    sales = query.order_by(Sale.created_at.desc()).all()
    grouped = {}
    for s in sales:
        key = s.customer_name or "Walk-in"
        grouped.setdefault(key, []).append({
            "item_name": s.item_name,
            "quantity": s.quantity,
            "unit_price": s.unit_price,
            "total": s.total,
            "payment_mode": s.payment_mode.value,
            "receipt_no": s.receipt_no,
            "date": s.created_at.isoformat(),
        })
    return [
        {
            "customer_name": name,
            "purchase_count": len(purchases),
            "total_spent": round(sum(p["total"] for p in purchases), 2),
            "last_purchase": purchases[0]["date"] if purchases else None,
            "purchases": purchases,
        }
        for name, purchases in grouped.items()
    ]


@router.get("/by-item/{item_id}", response_model=List[SaleOut])
def sales_by_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Sale).filter(Sale.item_id == item_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    return query.order_by(Sale.created_at.desc()).all()


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Sale).filter(Sale.id == sale_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    sale = query.first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


@router.delete("/{sale_id}")
def delete_sale(sale_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    query = db.query(Sale).filter(Sale.id == sale_id)
    if account_id is not None:
        query = query.filter(Sale.account_id == account_id)
    sale = query.first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == sale.item_id).first()
        if item:
            item.quantity += sale.quantity
    db.delete(sale)
    db.commit()
    log_activity_for_user(db, current_user, "sale_delete", f"Deleted sale {sale_id}, stock restored")
    return {"detail": "Sale deleted and stock restored"}