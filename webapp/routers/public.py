"""Public, unauthenticated endpoints for QR-code verification of receipts and
invoices. Deliberately expose the bare minimum — just enough to confirm a
document is genuine, no financial detail — since anyone with the link (or a
photo of the QR code) can hit these.
"""
import io
import os

import qrcode
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Sale, Invoice, Account

router = APIRouter(prefix="/api/public", tags=["public"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://moneytracer.up.railway.app")


def _business_name(db: Session, account_id: int) -> str:
    account = db.query(Account).filter(Account.id == account_id).first()
    return account.name if account else "Unknown business"


@router.get("/verify/receipt/{receipt_no}")
def verify_receipt(receipt_no: str, db: Session = Depends(get_db)):
    sale = db.query(Sale).filter(Sale.receipt_no == receipt_no).first()
    if not sale:
        return {"valid": False}
    return {
        "valid": True,
        "document_type": "Receipt",
        "number": sale.receipt_no,
        "date": sale.created_at.isoformat(),
        "business_name": _business_name(db, sale.account_id),
    }


@router.get("/verify/invoice/{token}")
def verify_invoice(token: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.verify_token == token).first()
    if not inv:
        return {"valid": False}
    return {
        "valid": True,
        "document_type": "Invoice",
        "number": inv.invoice_no,
        "date": inv.created_at.isoformat(),
        "business_name": _business_name(db, inv.account_id),
    }


def _qr_png_response(data: str) -> StreamingResponse:
    buf = io.BytesIO()
    qrcode.make(data, box_size=6, border=2).save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@router.get("/qr/receipt/{receipt_no}.png")
def receipt_qr(receipt_no: str):
    """QR image only — existence of a receipt_no matching a real sale is
    checked at scan-time by /verify/receipt, not here, so this endpoint stays
    cheap and doesn't leak whether a given receipt number is real."""
    return _qr_png_response(f"{FRONTEND_URL}/verify/receipt/{receipt_no}")
