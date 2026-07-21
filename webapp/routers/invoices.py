import io
import os
import uuid
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import Invoice, InvoiceItem, User, DocumentStatus, RoleEnum, Account, InventoryItem, Sale, PaymentMode
from schemas import InvoiceCreate, InvoiceUpdate, InvoiceOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user
from email_utils import send_email_with_attachment
from ledger import get_locked_period, post_sale_entry

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

COMPANY_NAME    = os.getenv("COMPANY_NAME", "Moneytracer")
COMPANY_ADDRESS = os.getenv("COMPANY_ADDRESS", "Arusha, Tanzania")
COMPANY_PHONE   = os.getenv("COMPANY_PHONE", "")
COMPANY_EMAIL   = os.getenv("COMPANY_EMAIL", "")
CURRENCY        = os.getenv("CURRENCY", "TZS")
FRONTEND_URL    = os.getenv("FRONTEND_URL", "https://moneytracer.up.railway.app")


def _ensure_verify_token(db: Session, inv: Invoice) -> str:
    """Invoices created before the QR-verification feature existed have no
    verify_token yet — backfill one lazily the first time it's needed."""
    if not inv.verify_token:
        inv.verify_token = uuid.uuid4().hex
        db.commit()
        db.refresh(inv)
    return inv.verify_token


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


def get_account_details(db: Session, account_id: int):
    """Get account details for PDF generation."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if account:
        return {
            "name": account.name,
            "owner_name": account.owner_full_name,
            "address": f"{account.region}, {account.district}, {account.street_address}",
            "phone": account.phone,
            "email": account.email,
            "tin": account.tin,
            "vrn": account.vrn,
            "tax_rate": account.tax_rate,
            "invoice_prefix": account.invoice_prefix,
            "payment_terms_days": account.payment_terms_days,
            "bank_name": account.bank_name,
            "bank_account_name": account.bank_account_name,
            "bank_account_number": account.bank_account_number,
            "bank_branch": account.bank_branch,
        }
    return None


def _calc_totals(items, tax_rate, discount):
    subtotal   = sum(line.quantity * line.unit_price for line in items)
    tax_amount = subtotal * (tax_rate / 100.0)
    total      = subtotal + tax_amount - discount
    return round(subtotal, 2), round(tax_amount, 2), round(total, 2)


@router.post("/", response_model=InvoiceOut)
def create_invoice(payload: InvoiceCreate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create invoices")
    
    if not payload.items:
        raise HTTPException(status_code=400, detail="Invoice must have at least one line item")
    
    # Get account settings for invoice prefix
    account = db.query(Account).filter(Account.id == account_id).first()
    prefix = account.invoice_prefix if account else "INV"

    # Sequential, zero-padded numbering (e.g. INV-0001) instead of a random
    # suffix, so the number on the document reads cleanly and in order like
    # a real paper invoice book. Retries on the rare chance of a collision
    # (e.g. a deleted invoice freeing up a number that's raced by another request).
    existing_count = db.query(Invoice).filter(Invoice.account_id == account_id).count()
    invoice_no = f"{prefix}-{existing_count + 1:04d}"
    attempt = existing_count + 1
    while db.query(Invoice).filter(Invoice.invoice_no == invoice_no).first() is not None:
        attempt += 1
        invoice_no = f"{prefix}-{attempt:04d}"

    subtotal, tax_amount, total = _calc_totals(payload.items, payload.tax_rate, payload.discount)
    invoice = Invoice(
        account_id=account_id,
        invoice_no=invoice_no,
        customer_name=payload.customer_name or "Walk-in",
        customer_phone=payload.customer_phone or "",
        customer_address=payload.customer_address or "",
        customer_tin=payload.customer_tin or "",
        customer_vrn=payload.customer_vrn or "",
        due_date=payload.due_date,
        po_number=payload.po_number or "",
        verify_token=uuid.uuid4().hex,
        subtotal=subtotal, tax_rate=payload.tax_rate, tax_amount=tax_amount,
        discount=payload.discount, total=total, notes=payload.notes or "",
        status=DocumentStatus.sent, created_by=current_user.username,
    )
    db.add(invoice); db.flush()
    for line in payload.items:
        db.add(InvoiceItem(
            account_id=account_id,
            invoice_id=invoice.id, 
            item_id=line.item_id,
            description=line.description,
            quantity=line.quantity, 
            unit_price=line.unit_price,
            total=round(line.quantity * line.unit_price, 2)
        ))
    db.commit(); db.refresh(invoice)
    log_activity_for_user(db, current_user, "invoice_create", f"Created {invoice.invoice_no}")
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: int, payload: InvoiceUpdate, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    invoice = q.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # A paid invoice is a closed accounting record — editing it after the
    # fact would silently change numbers that have already been reconciled.
    if invoice.status == DocumentStatus.paid:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be edited")

    locked = get_locked_period(db, invoice.account_id, invoice.created_at)
    if locked is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice falls in closed fiscal period '{locked.name}' and cannot be edited. "
                   f"Issue a correction/credit note instead.",
        )

    if payload.customer_name is not None: invoice.customer_name = payload.customer_name
    if payload.customer_phone is not None: invoice.customer_phone = payload.customer_phone
    if payload.customer_address is not None: invoice.customer_address = payload.customer_address
    if payload.customer_tin is not None: invoice.customer_tin = payload.customer_tin
    if payload.customer_vrn is not None: invoice.customer_vrn = payload.customer_vrn
    if payload.due_date is not None: invoice.due_date = payload.due_date
    if payload.po_number is not None: invoice.po_number = payload.po_number
    if payload.notes is not None: invoice.notes = payload.notes

    tax_rate = payload.tax_rate if payload.tax_rate is not None else invoice.tax_rate
    discount = payload.discount if payload.discount is not None else invoice.discount

    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=400, detail="Invoice must have at least one line item")
        db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice.id).delete()
        for line in payload.items:
            db.add(InvoiceItem(
                account_id=invoice.account_id, invoice_id=invoice.id,
                item_id=line.item_id,
                description=line.description, quantity=line.quantity, unit_price=line.unit_price,
                total=round(line.quantity * line.unit_price, 2),
            ))
        db.flush()
        subtotal, tax_amount, total = _calc_totals(payload.items, tax_rate, discount)
    else:
        # Items unchanged, but tax_rate/discount may have — recompute from
        # the existing lines rather than trusting the stored subtotal.
        existing_items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice.id).all()
        subtotal, tax_amount, total = _calc_totals(existing_items, tax_rate, discount)

    invoice.tax_rate = tax_rate
    invoice.discount = discount
    invoice.subtotal = subtotal
    invoice.tax_amount = tax_amount
    invoice.total = total

    db.commit()
    db.refresh(invoice)
    log_activity_for_user(db, current_user, "invoice_update", f"Edited {invoice.invoice_no}")
    return invoice


@router.get("/", response_model=List[InvoiceOut])
def list_invoices(start: Optional[date] = None, end: Optional[date] = None,
                  status: Optional[DocumentStatus] = None,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Invoice)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    if start: q = q.filter(Invoice.created_at >= datetime.combine(start, datetime.min.time()))
    if end:   q = q.filter(Invoice.created_at <= datetime.combine(end, datetime.max.time()))
    if status: q = q.filter(Invoice.status == status)
    return q.order_by(Invoice.created_at.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")
    return inv


def _convert_invoice_to_sales(db: Session, invoice: Invoice, current_user: User) -> list:
    """Turn every line on a paid invoice into a real Sale record — this is
    the moment the invoice actually affects stock, revenue, and the ledger.
    Before this point (draft/sent), an invoice is just a document; nothing
    about it has been recorded as a transaction yet.

    Lines linked to a tracked inventory item (item_id set) decrement stock
    like any other sale. Lines typed in freehand (item_id is None — a
    service fee, a one-off item not carried in inventory) still become a
    Sale for revenue/reporting purposes, just without touching stock.

    Runs inside the caller's existing db session/transaction — if anything
    here raises, the whole status update (including the paid status itself)
    rolls back, so an invoice can never end up "paid" with only some of its
    lines converted.
    """
    created_sales = []
    receipt_no = f"RCT-{uuid.uuid4().hex[:8].upper()}"

    for line in invoice.items:
        item = None
        if line.item_id:
            item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
            if item and item.account_id == invoice.account_id:
                if item.quantity < line.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot mark as paid: insufficient stock for '{item.name}' "
                               f"(have {item.quantity}, invoice needs {line.quantity})",
                    )
                item.quantity -= line.quantity
            else:
                item = None  # stale/foreign item_id — fall back to a freehand line

        sale = Sale(
            account_id=invoice.account_id,
            item_id=item.id if item else None,
            item_name=item.name if item else line.description,
            quantity=line.quantity,
            unit_price=line.unit_price,
            cost_price_at_sale=item.cost_price if item else None,
            total=round(line.quantity * line.unit_price, 2),
            payment_mode=PaymentMode.cash,  # invoice is being marked paid, i.e. payment already received
            customer_name=invoice.customer_name or "Walk-in",
            sold_by=current_user.username,
            receipt_no=receipt_no,
        )
        db.add(sale)
        db.flush()
        post_sale_entry(db, invoice.account_id, sale, created_by=current_user.username)
        created_sales.append(sale)

    invoice.converted_to_sale = True
    return created_sales


@router.patch("/{invoice_id}/status", response_model=InvoiceOut)
def update_status(invoice_id: int, status: DocumentStatus,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")

    inv.status = status
    if status == DocumentStatus.paid and not inv.converted_to_sale:
        sales = _convert_invoice_to_sales(db, inv, current_user)
        log_activity_for_user(
            db, current_user, "invoice_paid",
            f"{inv.invoice_no} marked paid — recorded {len(sales)} sale line(s)",
        )

    db.commit(); db.refresh(inv)
    log_activity_for_user(db, current_user, "invoice_status", f"{inv.invoice_no} → {status.value}")
    return inv


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")

    locked = get_locked_period(db, inv.account_id, inv.created_at)
    if locked is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice falls in closed fiscal period '{locked.name}' and cannot be deleted. "
                   f"Issue a correction/credit note instead.",
        )

    db.delete(inv); db.commit()
    log_activity_for_user(db, current_user, "invoice_delete", f"Deleted {inv.invoice_no}")
    return {"detail": "Invoice deleted"}


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")
    account = get_account_details(db, inv.account_id)
    token = _ensure_verify_token(db, inv)
    verify_url = f"{FRONTEND_URL}/verify/invoice/{token}"
    buf = _render_pdf(inv, "INVOICE", account, verify_url=verify_url)
    log_activity_for_user(db, current_user, "invoice_pdf", f"Exported {inv.invoice_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{inv.invoice_no}.pdf"'})


@router.get("/{invoice_id}/packing-list/pdf")
def invoice_packing_list_pdf(invoice_id: int, db: Session = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    """Same line items as the invoice, but quantities only — no prices — for
    whoever is physically packing or checking the goods."""
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")
    account = get_account_details(db, inv.account_id)
    buf = _render_pdf(inv, "PACKING LIST", account, show_prices=False)
    log_activity_for_user(db, current_user, "invoice_packing_list_pdf", f"Exported packing list for {inv.invoice_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="PackingList-{inv.invoice_no}.pdf"'})


@router.get("/{invoice_id}/delivery-note/pdf")
def invoice_delivery_note_pdf(invoice_id: int, db: Session = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    """Same line items as the invoice, no prices, plus a signature block for
    the customer to confirm receipt on delivery."""
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")
    account = get_account_details(db, inv.account_id)
    buf = _render_pdf(inv, "DELIVERY NOTE", account, show_prices=False, signature_block=True)
    log_activity_for_user(db, current_user, "invoice_delivery_note_pdf", f"Exported delivery note for {inv.invoice_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="DeliveryNote-{inv.invoice_no}.pdf"'})


class EmailDocRequest(BaseModel):
    to_email: EmailStr
    message: Optional[str] = ""


@router.post("/{invoice_id}/email")
def email_invoice(invoice_id: int, payload: EmailDocRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")

    account = get_account_details(db, inv.account_id)
    token = _ensure_verify_token(db, inv)
    verify_url = f"{FRONTEND_URL}/verify/invoice/{token}"
    buf = _render_pdf(inv, "INVOICE", account, verify_url=verify_url)
    company = (account or {}).get("name") or COMPANY_NAME
    body = payload.message or f"Dear {inv.customer_name},\n\nPlease find attached Invoice {inv.invoice_no} for {CURRENCY} {inv.total:,.2f}.\n\nRegards,\n{company}"

    try:
        send_email_with_attachment(
            to_email=payload.to_email,
            subject=f"Invoice {inv.invoice_no} from {company}",
            body=body,
            attachment_bytes=buf.getvalue(),
            attachment_filename=f"Invoice-{inv.invoice_no}.pdf",
        )
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Failed to send email: {exc}")

    log_activity_for_user(db, current_user, "invoice_email", f"Emailed {inv.invoice_no} to {payload.to_email}")
    return {"detail": f"Invoice emailed to {payload.to_email}"}


def _render_pdf(doc: Invoice, label: str, account: dict = None, show_prices: bool = True,
                 signature_block: bool = False, verify_url: str = None, party_label: str = "Bill To",
                 is_payable: bool = True) -> io.BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    ACCENT = colors.HexColor("#C15F3C")   # matches app --accent (terracotta)
    INK    = colors.HexColor("#2B2622")   # matches app --text-dark

    biz_name    = (account or {}).get("name") or COMPANY_NAME
    biz_address = (account or {}).get("address") or COMPANY_ADDRESS
    biz_phone   = (account or {}).get("phone") or COMPANY_PHONE
    biz_email   = (account or {}).get("email") or COMPANY_EMAIL
    biz_tin     = (account or {}).get("tin") or ""
    biz_vrn     = (account or {}).get("vrn") or ""

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4,
          topMargin=18*mm, bottomMargin=24*mm, leftMargin=18*mm, rightMargin=18*mm)
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("N", parent=styles["Normal"], fontSize=10, leading=14)
    right  = ParagraphStyle("R", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_RIGHT)
    section = ParagraphStyle("S", parent=styles["Heading4"], fontSize=11, textColor=ACCENT)
    biz_name_style = ParagraphStyle("BN", parent=styles["Normal"], fontSize=15, leading=18, textColor=INK)

    elems = []

    # Header — business name prominent, then address/TIN/VRN/phone/email, full width
    elems.append(Paragraph(f"<b>{biz_name}</b>", biz_name_style))
    header_lines = []
    if biz_address: header_lines.append(biz_address)
    id_bits = []
    if biz_tin: id_bits.append(f"TIN: {biz_tin}")
    if biz_vrn: id_bits.append(f"VRN: {biz_vrn}")
    if id_bits: header_lines.append("  ".join(id_bits))
    if biz_phone: header_lines.append(f"Phone: {biz_phone}")
    if biz_email: header_lines.append(f"Email: {biz_email}")
    if header_lines:
        elems.append(Paragraph("<br/>".join(header_lines), normal))
    elems += [Spacer(1, 4*mm)]

    hr = Table([[""]], colWidths=[164*mm])
    hr.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1, INK)]))
    elems += [hr, Spacer(1, 8*mm)]

    # Bill To (left) vs document metadata (right) — matches invoice/PO layout convention
    bt_lines = [f"<b>{doc.customer_name}</b>"]
    if doc.customer_address: bt_lines.append(doc.customer_address)
    client_id_bits = []
    if getattr(doc, "customer_tin", ""): client_id_bits.append(f"TIN: {doc.customer_tin}")
    if getattr(doc, "customer_vrn", ""): client_id_bits.append(f"VRN: {doc.customer_vrn}")
    if client_id_bits: bt_lines.append("  ".join(client_id_bits))
    if doc.customer_phone: bt_lines.append(f"Contact: {doc.customer_phone}")
    bt_block = [Paragraph(party_label, section), Paragraph("<br/>".join(bt_lines), normal)]

    meta_rows = [[f"{label.title()} No.", doc.invoice_no],
                 [f"{label.title()} Date", doc.created_at.strftime("%d/%m/%Y")]]
    due_date = getattr(doc, "due_date", None)
    if due_date:
        meta_rows.append(["Due Date", due_date.strftime("%d/%m/%Y")])
    po_number = getattr(doc, "po_number", "")
    if po_number:
        meta_rows.append(["PO / DO Number", po_number])
    meta_rows.append(["Currency", CURRENCY])
    meta_table = Table(meta_rows, colWidths=[32*mm, 40*mm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    layout = Table([[bt_block, meta_table]], colWidths=[100*mm, 72*mm])
    layout.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elems += [layout, Spacer(1, 8*mm)]

    if verify_url:
        import qrcode
        from reportlab.platypus import Image
        qr_buf = io.BytesIO()
        qrcode.make(verify_url, box_size=4, border=1).save(qr_buf, format="PNG")
        qr_buf.seek(0)
        qr_caption = ParagraphStyle("QRC", parent=styles["Normal"], fontSize=7.5,
                                     alignment=TA_CENTER, textColor=colors.HexColor("#6b7280"))
        qr_block = Table([[Image(qr_buf, width=22*mm, height=22*mm)],
                           [Paragraph("Scan to verify", qr_caption)]],
                          colWidths=[22*mm], hAlign="RIGHT")
        qr_block.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        elems += [qr_block, Spacer(1, 4*mm)]

    # Line items
    if show_prices:
        rate = doc.tax_rate or 0
        rows = [["#", "Description", "Qty", f"Unit Price ({CURRENCY})", f"VAT {rate:g}%", f"Amount ({CURRENCY})"]]
        for i, ln in enumerate(doc.items, 1):
            line_vat = ln.total * (rate / 100.0)
            rows.append([str(i), ln.description, f"{ln.quantity:g}",
                         f"{ln.unit_price:,.2f}", f"{line_vat:,.2f}", f"{ln.total + line_vat:,.2f}"])
        col_widths = [10*mm, 58*mm, 14*mm, 28*mm, 26*mm, 36*mm]
        align_style = [("ALIGN",(0,0),(1,-1),"LEFT"), ("ALIGN",(2,0),(2,-1),"CENTER"), ("ALIGN",(3,0),(5,-1),"RIGHT")]
    else:
        # Packing list / delivery note: quantities and descriptions only, no pricing.
        rows = [["#", "Description", "Qty"]]
        for i, ln in enumerate(doc.items, 1):
            rows.append([str(i), ln.description, f"{ln.quantity:g}"])
        col_widths = [14*mm, 118*mm, 24*mm]
        align_style = [("ALIGN",(0,0),(1,-1),"LEFT"), ("ALIGN",(2,0),(2,-1),"CENTER")]

    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),ACCENT),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),9.5),
        *align_style,
        ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#e0ddd4")),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf8f3")]),
        ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
    ]))
    elems += [t, Spacer(1,6*mm)]

    # Totals — omitted entirely for packing lists / delivery notes, since the
    # whole point is that the receiving party sees quantities, not values.
    if show_prices:
        tot_rows = [["Subtotal (excl. VAT)", f"{CURRENCY} {doc.subtotal:,.2f}"]]
        if doc.tax_rate: tot_rows.append([f"VAT ({doc.tax_rate:g}%)", f"{CURRENCY} {doc.tax_amount:,.2f}"])
        if doc.discount: tot_rows.append(["Discount", f"- {CURRENCY} {doc.discount:,.2f}"])
        tot_rows.append(["Total Amount Due", f"{CURRENCY} {doc.total:,.2f}"])
        tt = Table(tot_rows, colWidths=[44*mm,36*mm], hAlign="RIGHT")
        tt.setStyle(TableStyle([
            ("ALIGN",(0,0),(-1,-1),"RIGHT"), ("FONTSIZE",(0,0),(-1,-1),10),
            ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
            ("LINEABOVE",(0,-1),(-1,-1),0.75,ACCENT),
            ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"), ("FONTSIZE",(0,-1),(-1,-1),11.5),
        ]))
        elems.append(tt)

    # Bank details (left) + Notes (right) — only shown on price-bearing documents
    # you're asking someone else to pay (invoices), never on a packing list/delivery
    # note (nothing owed), and never on a Purchase Order — a PO is money going OUT
    # to a supplier, so there's no bank-to-pay-us info and no "due within N days"
    # framed as if the recipient owes you.
    if show_prices and is_payable:
        bank_name = (account or {}).get("bank_name") or ""
        bank_acct_name = (account or {}).get("bank_account_name") or ""
        bank_acct_no = (account or {}).get("bank_account_number") or ""
        bank_branch = (account or {}).get("bank_branch") or ""
        has_bank_details = any([bank_name, bank_acct_name, bank_acct_no, bank_branch])

        bank_lines = []
        if bank_name: bank_lines.append(f"<b>Bank Name:</b> {bank_name}")
        if bank_acct_name: bank_lines.append(f"<b>Account Name:</b> {bank_acct_name}")
        if bank_acct_no: bank_lines.append(f"<b>Account Number:</b> {bank_acct_no}")
        if bank_branch: bank_lines.append(f"<b>Branch:</b> {bank_branch}")
        bank_lines.append(f"<b>Payment Reference:</b> {label.title()} No. {doc.invoice_no}")

        payment_terms_days = (account or {}).get("payment_terms_days")
        notes_lines = []
        if doc.notes:
            notes_lines.append(doc.notes.replace("\n", "<br/>"))
        elif payment_terms_days:
            notes_lines.append(f"Payment is due within {payment_terms_days} days.")
        if biz_vrn:
            notes_lines.append("This is a Tax Invoice issued in accordance with the VAT Act, 2014 and Tanzania Revenue Authority (TRA) requirements.")

        footer_block = [
            [Paragraph("<br/>".join(bank_lines), normal) if has_bank_details else Paragraph("", normal),
             Paragraph("<b>Notes:</b><br/>" + "<br/><br/>".join(notes_lines), normal) if notes_lines else Paragraph("", normal)]
        ]
        elems += [Spacer(1, 12*mm), Table(footer_block, colWidths=[86*mm, 86*mm],
                                           style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))]
    elif doc.notes:
        elems += [Spacer(1,10*mm), Paragraph("Notes", section),
                  Paragraph(doc.notes.replace("\n","<br/>"), normal)]

    if signature_block:
        elems += [Spacer(1,16*mm), Paragraph("Received By", section), Spacer(1,4*mm)]
        sig_rows = [["Name:", "_" * 32, "Signature:", "_" * 24],
                    ["Date:", "_" * 32, "", ""]]
        sig = Table(sig_rows, colWidths=[20*mm, 62*mm, 25*mm, 45*mm])
        sig.setStyle(TableStyle([
            ("FONTSIZE",(0,0),(-1,-1),10),
            ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ]))
        elems.append(sig)

    elems += [Spacer(1,14*mm),
              Paragraph("Thank you for your business.",
                        ParagraphStyle("F",parent=styles["Normal"],fontSize=9,
                                       textColor=colors.HexColor("#6b7280")))]

    footer_style = ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8,
                                   alignment=TA_CENTER, textColor=colors.HexColor("#A79D8E"))

    def draw_footer(canvas, pdf_doc):
        canvas.saveState()
        p = Paragraph("Moneytracer", footer_style)
        w, h = p.wrap(pdf_doc.width, pdf_doc.bottomMargin)
        p.drawOn(canvas, pdf_doc.leftMargin, 10*mm)
        canvas.restoreState()

    pdf.build(elems, onFirstPage=draw_footer, onLaterPages=draw_footer)
    buf.seek(0)
    return buf


# Export reference so quotations.py can reuse
invoice_pdf_render = _render_pdf
