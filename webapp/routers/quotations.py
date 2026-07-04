import io
import uuid
from datetime import datetime, date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import Quotation, QuotationItem, Invoice, InvoiceItem, User, DocumentStatus, RoleEnum, Account
from schemas import QuotationCreate, QuotationOut, InvoiceOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user
from email_utils import send_email_with_attachment

router = APIRouter(prefix="/api/quotations", tags=["quotations"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


def _calc(items, tax_rate, discount):
    sub = sum(l.quantity * l.unit_price for l in items)
    tax = sub * (tax_rate / 100)
    return round(sub,2), round(tax,2), round(sub+tax-discount,2)


@router.post("/", response_model=QuotationOut)
def create_quotation(payload: QuotationCreate, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create quotations")
    
    if not payload.items:
        raise HTTPException(400, "Quotation must have at least one line item")
    sub, tax, total = _calc(payload.items, payload.tax_rate, payload.discount)
    valid_until = datetime.utcnow() + timedelta(days=payload.valid_days or 14)
    q = Quotation(
        account_id=account_id,
        quote_no=f"QUO-{uuid.uuid4().hex[:8].upper()}",
        customer_name=payload.customer_name or "Walk-in",
        customer_phone=payload.customer_phone or "",
        customer_address=payload.customer_address or "",
        subtotal=sub, tax_rate=payload.tax_rate, tax_amount=tax,
        discount=payload.discount, total=total, notes=payload.notes or "",
        valid_until=valid_until, status=DocumentStatus.draft,
        created_by=current_user.username,
    )
    db.add(q); db.flush()
    for ln in payload.items:
        db.add(QuotationItem(
            account_id=account_id,
            quotation_id=q.id, 
            description=ln.description,
            quantity=ln.quantity, 
            unit_price=ln.unit_price,
            total=round(ln.quantity*ln.unit_price,2)
        ))
    db.commit(); db.refresh(q)
    log_activity_for_user(db, current_user, "quotation_create", f"Created {q.quote_no}")
    return q


@router.get("/", response_model=List[QuotationOut])
def list_quotations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Quotation)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    return query.order_by(Quotation.created_at.desc()).all()


@router.get("/{qid}", response_model=QuotationOut)
def get_quotation(qid: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Quotation).filter(Quotation.id == qid)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")
    return q


@router.patch("/{qid}/status", response_model=QuotationOut)
def update_status(qid: int, status: DocumentStatus,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Quotation).filter(Quotation.id == qid)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")
    q.status = status; db.commit(); db.refresh(q)
    return q


@router.post("/{qid}/convert", response_model=InvoiceOut)
def convert_to_invoice(qid: int, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot convert quotations")
    
    query = db.query(Quotation).filter(Quotation.id == qid)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")
    
    # Get account settings for invoice prefix
    account = db.query(Account).filter(Account.id == account_id).first()
    prefix = account.invoice_prefix if account else "INV"
    
    inv = Invoice(
        account_id=account_id,
        invoice_no=f"{prefix}-{uuid.uuid4().hex[:8].upper()}",
        customer_name=q.customer_name, customer_phone=q.customer_phone,
        customer_address=q.customer_address, subtotal=q.subtotal,
        tax_rate=q.tax_rate, tax_amount=q.tax_amount, discount=q.discount,
        total=q.total, notes=q.notes, status=DocumentStatus.sent,
        created_by=current_user.username,
    )
    db.add(inv); db.flush()
    for ln in q.items:
        db.add(InvoiceItem(
            account_id=account_id,
            invoice_id=inv.id, 
            description=ln.description,
            quantity=ln.quantity, 
            unit_price=ln.unit_price, 
            total=ln.total
        ))
    q.status = DocumentStatus.accepted
    db.commit(); db.refresh(inv)
    log_activity_for_user(db, current_user, "quotation_convert", f"{q.quote_no} → {inv.invoice_no}")
    return inv


@router.delete("/{qid}")
def delete_quotation(qid: int, db: Session = Depends(get_db),
                     current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    query = db.query(Quotation).filter(Quotation.id == qid)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")
    db.delete(q); db.commit()
    log_activity_for_user(db, current_user, "quotation_delete", f"Deleted {q.quote_no}")
    return {"detail": "Quotation deleted"}


@router.get("/{qid}/pdf")
def quotation_pdf(qid: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    query = db.query(Quotation).filter(Quotation.id == qid)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")
    account = db.query(Account).filter(Account.id == q.account_id).first()
    buf = _render_quotation_pdf(q, account)
    log_activity_for_user(db, current_user, "quotation_pdf", f"Exported {q.quote_no}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Quotation-{q.quote_no}.pdf"'})


class EmailDocRequest(BaseModel):
    to_email: EmailStr
    message: Optional[str] = ""


@router.post("/{qid}/email")
def email_quotation(qid: int, payload: EmailDocRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    query = db.query(Quotation).filter(Quotation.id == qid)
    if account_id is not None:
        query = query.filter(Quotation.account_id == account_id)
    q = query.first()
    if not q: raise HTTPException(404, "Quotation not found")

    account = db.query(Account).filter(Account.id == q.account_id).first()
    buf = _render_quotation_pdf(q, account)
    company = (account.name if account else None) or "Moneytracer"
    body = payload.message or f"Dear {q.customer_name},\n\nPlease find attached Quotation {q.quote_no} for TZS {q.total:,.2f}.\n\nRegards,\n{company}"

    try:
        send_email_with_attachment(
            to_email=payload.to_email,
            subject=f"Quotation {q.quote_no} from {company}",
            body=body,
            attachment_bytes=buf.getvalue(),
            attachment_filename=f"Quotation-{q.quote_no}.pdf",
        )
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Failed to send email: {exc}")

    log_activity_for_user(db, current_user, "quotation_email", f"Emailed {q.quote_no} to {payload.to_email}")
    return {"detail": f"Quotation emailed to {payload.to_email}"}


def _render_quotation_pdf(q: Quotation, account: Account = None) -> io.BytesIO:
    import os
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    ACCENT = colors.HexColor("#C15F3C")   # matches app --accent (terracotta)

    if account:
        biz_name    = account.name
        biz_owner   = account.owner_full_name or ""
        biz_address = ", ".join(p for p in [account.region, account.district, account.street_address] if p)
        biz_phone   = account.phone or ""
        biz_email   = account.email or ""
    else:
        biz_name    = os.getenv("COMPANY_NAME", "Moneytracer")
        biz_owner   = ""
        biz_address = os.getenv("COMPANY_ADDRESS", "Arusha, Tanzania")
        biz_phone   = os.getenv("COMPANY_PHONE", "")
        biz_email   = os.getenv("COMPANY_EMAIL", "")
    CURRENCY = (account.currency if account and account.currency else os.getenv("CURRENCY", "TZS"))

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4,
          topMargin=18*mm, bottomMargin=24*mm, leftMargin=18*mm, rightMargin=18*mm)
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("N", parent=styles["Normal"], fontSize=10, leading=14)
    right  = ParagraphStyle("R", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_RIGHT)
    section = ParagraphStyle("S", parent=styles["Heading4"], fontSize=11, textColor=ACCENT)

    elems = []
    co_lines = [f"<b>{biz_name}</b>"]
    if biz_owner: co_lines.append(biz_owner)
    if biz_address: co_lines.append(biz_address)
    if biz_phone:
        co_lines.append(f"Tel: {biz_phone}")
        co_lines.append(f"WhatsApp: {biz_phone}")
    if biz_email: co_lines.append(biz_email)
    doc_lines = ["<b>QUOTATION</b>", f"No: {q.quote_no}",
                 f"Date: {q.created_at.strftime('%d %b %Y')}"]
    if q.valid_until: doc_lines.append(f"Valid until: {q.valid_until.strftime('%d %b %Y')}")
    hdr = Table([[Paragraph("<br/>".join(co_lines), normal),
                  Paragraph("<br/>".join(doc_lines), right)]],
                colWidths=[100*mm, 72*mm])
    hdr.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    elems += [hdr, Spacer(1,12*mm)]

    elems.append(Paragraph("Quote For", section))
    bt = [f"<b>{q.customer_name}</b>"]
    if q.customer_phone: bt.append(q.customer_phone)
    if q.customer_address: bt.append(q.customer_address)
    elems += [Paragraph("<br/>".join(bt), normal), Spacer(1,8*mm)]

    rows = [["#","Description","Qty",f"Unit Price ({CURRENCY})",f"Total ({CURRENCY})"]]
    for i, ln in enumerate(q.items, 1):
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
        ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
    ]))
    elems += [t, Spacer(1,6*mm)]

    tot_rows = [["Subtotal", f"{CURRENCY} {q.subtotal:,.2f}"]]
    if q.tax_rate: tot_rows.append([f"VAT ({q.tax_rate:g}%)", f"{CURRENCY} {q.tax_amount:,.2f}"])
    if q.discount: tot_rows.append(["Discount", f"- {CURRENCY} {q.discount:,.2f}"])
    tot_rows.append(["Grand Total", f"{CURRENCY} {q.total:,.2f}"])
    tt = Table(tot_rows, colWidths=[40*mm,36*mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([
        ("ALIGN",(0,0),(-1,-1),"RIGHT"), ("FONTSIZE",(0,0),(-1,-1),10),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LINEABOVE",(0,-1),(-1,-1),0.75,ACCENT),
        ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("FONTSIZE",(0,-1),(-1,-1),11.5),
    ]))
    elems.append(tt)

    if q.notes:
        elems += [Spacer(1,10*mm), Paragraph("Notes", section),
                  Paragraph(q.notes.replace("\n","<br/>"), normal)]

    elems += [Spacer(1,14*mm),
              Paragraph("This quotation is subject to confirmation of stock availability.",
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
