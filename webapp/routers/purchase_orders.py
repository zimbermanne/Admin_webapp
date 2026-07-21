import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import (
    PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, User, RoleEnum,
    Account, InventoryItem, Purchase,
)
from schemas import PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderOut
from auth import get_current_user
from activity import log_activity_for_user
from ledger import post_purchase_entry

# Reuse the invoice module's PDF renderer, account-details lookup, and totals
# calculator rather than duplicating ~150 lines of ReportLab layout code —
# a Purchase Order is laid out identically to an Invoice, just addressed to
# a supplier instead of a customer.
from routers.invoices import _render_pdf, get_account_details, _calc_totals
from routers.purchases import _apply_inventory_for_purchase

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


def get_account_filter(current_user: User):
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


class _PdfDocAdapter:
    """Maps a PurchaseOrder's supplier-* fields onto the customer_*/invoice_no
    attribute names _render_pdf expects, so the shared renderer can draw a PO
    without needing to know PurchaseOrder's actual column names. Everything
    not overridden here (items, subtotal, tax_rate, total, notes, created_at,
    status) is read straight off the real PurchaseOrder via __getattr__."""

    def __init__(self, po: PurchaseOrder):
        self._po = po
        self.invoice_no = po.po_no
        self.customer_name = po.supplier_name or "Supplier"
        self.customer_phone = po.supplier_phone or ""
        self.customer_address = po.supplier_address or ""
        self.customer_tin = po.supplier_tin or ""
        self.customer_vrn = po.supplier_vrn or ""
        self.due_date = po.expected_date
        self.po_number = ""  # PO's own field, not applicable to itself

    def __getattr__(self, name):
        return getattr(self._po, name)


@router.get("/", response_model=list[PurchaseOrderOut])
def list_purchase_orders(status: Optional[PurchaseOrderStatus] = None,
                         db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    return q.order_by(PurchaseOrder.created_at.desc()).all()


@router.get("/{po_id}", response_model=PurchaseOrderOut)
def get_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    po = q.first()
    if not po: raise HTTPException(404, "Purchase order not found")
    return po


@router.post("/", response_model=PurchaseOrderOut)
def create_purchase_order(payload: PurchaseOrderCreate, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create purchase orders")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Purchase order must have at least one line item")

    account = db.query(Account).filter(Account.id == account_id).first()
    prefix = f"PO-{account.invoice_prefix}" if account and account.invoice_prefix else "PO"

    existing_count = db.query(PurchaseOrder).filter(PurchaseOrder.account_id == account_id).count()
    po_no = f"{prefix}-{existing_count + 1:04d}"
    attempt = existing_count + 1
    while db.query(PurchaseOrder).filter(PurchaseOrder.po_no == po_no).first() is not None:
        attempt += 1
        po_no = f"{prefix}-{attempt:04d}"

    subtotal, tax_amount, total = _calc_totals(payload.items, payload.tax_rate, payload.discount)
    po = PurchaseOrder(
        account_id=account_id,
        po_no=po_no,
        supplier_name=payload.supplier_name or "",
        supplier_phone=payload.supplier_phone or "",
        supplier_address=payload.supplier_address or "",
        supplier_tin=payload.supplier_tin or "",
        supplier_vrn=payload.supplier_vrn or "",
        expected_date=payload.expected_date,
        subtotal=subtotal, tax_rate=payload.tax_rate, tax_amount=tax_amount,
        discount=payload.discount, total=total, notes=payload.notes or "",
        status=PurchaseOrderStatus.sent, created_by=current_user.username,
    )
    db.add(po); db.flush()
    for line in payload.items:
        db.add(PurchaseOrderItem(
            account_id=account_id, po_id=po.id, item_id=line.item_id,
            description=line.description, quantity=line.quantity, unit_price=line.unit_price,
            total=round(line.quantity * line.unit_price, 2),
        ))
    db.commit(); db.refresh(po)
    log_activity_for_user(db, current_user, "po_create", f"Created {po.po_no}")
    return po


@router.put("/{po_id}", response_model=PurchaseOrderOut)
def update_purchase_order(po_id: int, payload: PurchaseOrderUpdate, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    po = q.first()
    if not po: raise HTTPException(404, "Purchase order not found")
    if po.status == PurchaseOrderStatus.received:
        raise HTTPException(400, "Cannot edit a purchase order that's already been received")

    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    for k, v in data.items():
        setattr(po, k, v)

    if payload.items is not None:
        db.query(PurchaseOrderItem).filter(PurchaseOrderItem.po_id == po.id).delete()
        for line in payload.items:
            db.add(PurchaseOrderItem(
                account_id=po.account_id, po_id=po.id, item_id=line.item_id,
                description=line.description, quantity=line.quantity, unit_price=line.unit_price,
                total=round(line.quantity * line.unit_price, 2),
            ))
        db.flush()
        subtotal, tax_amount, total = _calc_totals(payload.items, po.tax_rate, po.discount)
        po.subtotal, po.tax_amount, po.total = subtotal, tax_amount, total

    db.commit(); db.refresh(po)
    log_activity_for_user(db, current_user, "po_update", f"Updated {po.po_no}")
    return po


@router.delete("/{po_id}")
def delete_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    po = q.first()
    if not po: raise HTTPException(404, "Purchase order not found")
    if po.status == PurchaseOrderStatus.received:
        raise HTTPException(400, "Cannot delete a purchase order that's already been received — it has real stock movements tied to it")
    db.delete(po); db.commit()
    log_activity_for_user(db, current_user, "po_delete", f"Deleted {po.po_no}")
    return {"ok": True}


def _convert_po_to_purchases(db: Session, po: PurchaseOrder, current_user: User) -> list:
    """Turn every line on a received PO into a real Purchase record — the
    moment stock actually increases and the ledger is posted. Before this
    (draft/sent), a PO is just a request to a supplier; nothing about it has
    affected inventory or the books yet. Mirrors _convert_invoice_to_sales
    in routers/invoices.py.
    """
    created = []
    for line in po.items:
        item = None
        if line.item_id:
            item = db.query(InventoryItem).filter(
                InventoryItem.id == line.item_id, InventoryItem.account_id == po.account_id,
            ).first()
        if item:
            item.quantity += line.quantity
            item.cost_price = line.unit_price
        else:
            # No linked item (freehand line) or a stale/foreign item_id —
            # fall back to matching/creating by name, same as the quick
            # "record a purchase" flow already does.
            item = _apply_inventory_for_purchase(db, po.account_id, line.description, line.quantity, line.unit_price)

        purchase = Purchase(
            account_id=po.account_id,
            item_id=item.id if item else None,
            item_name=item.name if item else line.description,
            supplier=po.supplier_name or "",
            quantity=line.quantity,
            unit_cost=line.unit_price,
            total=round(line.quantity * line.unit_price, 2),
        )
        db.add(purchase)
        db.flush()
        post_purchase_entry(db, po.account_id, purchase, created_by=current_user.username)
        created.append(purchase)

    po.converted_to_purchase = True
    return created


@router.patch("/{po_id}/status", response_model=PurchaseOrderOut)
def update_po_status(po_id: int, status: PurchaseOrderStatus,
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    po = q.first()
    if not po: raise HTTPException(404, "Purchase order not found")

    po.status = status
    if status == PurchaseOrderStatus.received and not po.converted_to_purchase:
        purchases = _convert_po_to_purchases(db, po, current_user)
        log_activity_for_user(
            db, current_user, "po_received",
            f"{po.po_no} marked received — recorded {len(purchases)} purchase line(s)",
        )

    db.commit(); db.refresh(po)
    log_activity_for_user(db, current_user, "po_status", f"{po.po_no} → {status.value}")
    return po


@router.get("/{po_id}/pdf")
def purchase_order_pdf(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(PurchaseOrder.account_id == account_id)
    po = q.first()
    if not po: raise HTTPException(404, "Purchase order not found")

    account = get_account_details(db, po.account_id)
    buf = _render_pdf(_PdfDocAdapter(po), "PURCHASE ORDER", account, party_label="Supplier", is_payable=False)
    log_activity_for_user(db, current_user, "po_pdf", f"Exported {po.po_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="PurchaseOrder-{po.po_no}.pdf"'})
