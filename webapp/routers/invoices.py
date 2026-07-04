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
from models import Invoice, InvoiceItem, User, DocumentStatus, RoleEnum, Account
from schemas import InvoiceCreate, InvoiceOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user
from email_utils import send_email_with_attachment

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

COMPANY_NAME    = os.getenv("COMPANY_NAME", "Moneytracer")
COMPANY_ADDRESS = os.getenv("COMPANY_ADDRESS", "Arusha, Tanzania")
COMPANY_PHONE   = os.getenv("COMPANY_PHONE", "")
COMPANY_EMAIL   = os.getenv("COMPANY_EMAIL", "")
CURRENCY        = os.getenv("CURRENCY", "TZS")


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
            "tax_rate": account.tax_rate,
            "invoice_prefix": account.invoice_prefix,
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
    
    subtotal, tax_amount, total = _calc_totals(payload.items, payload.tax_rate, payload.discount)
    invoice = Invoice(
        account_id=account_id,
        invoice_no=f"{prefix}-{uuid.uuid4().hex[:8].upper()}",
        customer_name=payload.customer_name or "Walk-in",
        customer_phone=payload.customer_phone or "",
        customer_address=payload.customer_address or "",
        subtotal=subtotal, tax_rate=payload.tax_rate, tax_amount=tax_amount,
        discount=payload.discount, total=total, notes=payload.notes or "",
        status=DocumentStatus.sent, created_by=current_user.username,
    )
    db.add(invoice); db.flush()
    for line in payload.items:
        db.add(InvoiceItem(
            account_id=account_id,
            invoice_id=invoice.id, 
            description=line.description,
            quantity=line.quantity, 
            unit_price=line.unit_price,
            total=round(line.quantity * line.unit_price, 2)
        ))
    db.commit(); db.refresh(invoice)
    log_activity_for_user(db, current_user, "invoice_create", f"Created {invoice.invoice_no}")
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


@router.patch("/{invoice_id}/status", response_model=InvoiceOut)
def update_status(invoice_id: int, status: DocumentStatus,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Invoice).filter(Invoice.id == invoice_id)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        q = q.filter(Invoice.account_id == account_id)
    inv = q.first()
    if not inv: raise HTTPException(404, "Invoice not found")
    inv.status = status; db.commit(); db.refresh(inv)
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
    buf = _render_pdf(inv, "INVOICE", account)
    log_activity_for_user(db, current_user, "invoice_pdf", f"Exported {inv.invoice_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{inv.invoice_no}.pdf"'})


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
    buf = _render_pdf(inv, "INVOICE", account)
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


def _render_pdf(doc: Invoice, label: str, account: dict = None) -> io.BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    ACCENT = colors.HexColor("#C15F3C")   # matches app --accent (terracotta)
    INK    = colors.HexColor("#2B2622")   # matches app --text-dark

    biz_name    = (account or {}).get("name") or COMPANY_NAME
    biz_owner   = (account or {}).get("owner_name") or ""
    biz_address = (account or {}).get("address") or COMPANY_ADDRESS
    biz_phone   = (account or {}).get("phone") or COMPANY_PHONE
    biz_email   = (account or {}).get("email") or COMPANY_EMAIL

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4,
          topMargin=18*mm, bottomMargin=24*mm, leftMargin=18*mm, rightMargin=18*mm)
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("N", parent=styles["Normal"], fontSize=10, leading=14)
    right  = ParagraphStyle("R", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_RIGHT)
    section = ParagraphStyle("S", parent=styles["Heading4"], fontSize=11, textColor=ACCENT)

    elems = []

    # Header — the business/person issuing the document
    co_lines = [f"<b>{biz_name}</b>"]
    if biz_owner: co_lines.append(biz_owner)
    if biz_address: co_lines.append(biz_address)
    if biz_phone:
        co_lines.append(f"Tel: {biz_phone}")
        co_lines.append(f"WhatsApp: {biz_phone}")
    if biz_email: co_lines.append(biz_email)
    doc_lines = [f"<b>{label}</b>", f"No: {doc.invoice_no}",
                 f"Date: {doc.created_at.strftime('%d %b %Y')}"]
    hdr = Table([[Paragraph("<br/>".join(co_lines), normal),
                  Paragraph("<br/>".join(doc_lines), right)]],
                colWidths=[100*mm, 72*mm])
    hdr.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    elems += [hdr, Spacer(1,12*mm)]

    # Bill To
    elems.append(Paragraph("Bill To", section))
    bt = [f"<b>{doc.customer_name}</b>"]
    if doc.customer_phone: bt.append(doc.customer_phone)
    if doc.customer_address: bt.append(doc.customer_address)
    elems += [Paragraph("<br/>".join(bt), normal), Spacer(1,8*mm)]

    # Line items
    rows = [["#", "Description", "Qty", f"Unit Price ({CURRENCY})", f"Total ({CURRENCY})"]]
    for i, ln in enumerate(doc.items, 1):
        rows.append([str(i), ln.description, f"{ln.quantity:g}",
                     f"{ln.unit_price:,.2f}", f"{ln.total:,.2f}"])
    t = Table(rows, colWidths=[14*mm,72*mm,18*mm,32*mm,36*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),ACCENT),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),9.5),
        ("ALIGN",(0,0),(1,-1),"LEFT"), ("ALIGN",(2,0),(2,-1),"CENTER"),
        ("ALIGN",(3,0),(4,-1),"RIGHT"),
        ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#e0ddd4")),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf8f3")]),
        ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
    ]))
    elems += [t, Spacer(1,6*mm)]

    # Totals
    tot_rows = [["Subtotal", f"{CURRENCY} {doc.subtotal:,.2f}"]]
    if doc.tax_rate: tot_rows.append([f"VAT ({doc.tax_rate:g}%)", f"{CURRENCY} {doc.tax_amount:,.2f}"])
    if doc.discount: tot_rows.append(["Discount", f"- {CURRENCY} {doc.discount:,.2f}"])
    tot_rows.append(["Grand Total", f"{CURRENCY} {doc.total:,.2f}"])
    tt = Table(tot_rows, colWidths=[40*mm,36*mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([
        ("ALIGN",(0,0),(-1,-1),"RIGHT"), ("FONTSIZE",(0,0),(-1,-1),10),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LINEABOVE",(0,-1),(-1,-1),0.75,ACCENT),
        ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"), ("FONTSIZE",(0,-1),(-1,-1),11.5),
    ]))
    elems.append(tt)

    if doc.notes:
        elems += [Spacer(1,10*mm), Paragraph("Notes", section),
                  Paragraph(doc.notes.replace("\n","<br/>"), normal)]

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
