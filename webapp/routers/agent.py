import os
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Sale, Expense, Purchase, InventoryItem, User, RoleEnum
from auth import get_current_user

router = APIRouter(prefix="/api/agent", tags=["agent"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI assistant not configured. Set ANTHROPIC_API_KEY.")
    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed on server")

    account_id = get_account_filter(current_user)
    q = db.query(Sale)
    if account_id is not None:
        q = q.filter(Sale.account_id == account_id)
    sales = q.order_by(Sale.created_at.desc()).limit(50).all()
    context = "\n".join(f"{s.created_at}: {s.item_name} x{s.quantity} = {s.total}" for s in sales)

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=800,
        messages=[{
            "role": "user",
            "content": f"You are a business assistant for a Tanzanian SME. Recent sales:\n{context}\n\nQuestion: {payload.message}"
        }],
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    return {"reply": text}


@router.get("/analytics")
def analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)

    def _scoped(model_query, model):
        return model_query.filter(model.account_id == account_id) if account_id is not None else model_query

    sales = _scoped(db.query(Sale), Sale).all()
    expenses = _scoped(db.query(Expense), Expense).all()
    purchases = _scoped(db.query(Purchase), Purchase).all()
    items = _scoped(db.query(InventoryItem), InventoryItem).all()
    return {
        "total_sales": len(sales),
        "total_revenue": round(sum(s.total for s in sales), 2),
        "total_expenses": round(sum(e.amount for e in expenses), 2),
        "total_purchases": round(sum(p.total for p in purchases), 2),
        "inventory_items": len(items),
        "inventory_value": round(sum(i.quantity * i.cost_price for i in items), 2),
    }


@router.get("/compare")
def compare(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from datetime import timedelta
    now = datetime.utcnow()
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = this_month_start - timedelta(seconds=1)
    last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    this_month_sales = db.query(Sale).filter(Sale.created_at >= this_month_start).all()
    last_month_sales = db.query(Sale).filter(
        Sale.created_at >= last_month_start, Sale.created_at <= last_month_end
    ).all()

    this_total = sum(s.total for s in this_month_sales)
    last_total = sum(s.total for s in last_month_sales)
    change_pct = ((this_total - last_total) / last_total * 100) if last_total else None

    return {
        "this_month_revenue": round(this_total, 2),
        "last_month_revenue": round(last_total, 2),
        "change_percent": round(change_pct, 2) if change_pct is not None else None,
    }


@router.get("/import/template")
def import_template():
    csv_content = "name,sku,category,quantity,unit,cost_price,selling_price,reorder_point\n" \
                  "Sample Item,SKU001,General,10,pcs,1000,1500,5\n"
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_import_template.csv"},
    )


@router.post("/export/invoice")
def export_invoice(sale_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        raise HTTPException(status_code=503, detail="reportlab not installed on server")

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    from models import Account
    account = db.query(Account).filter(Account.id == sale.account_id).first() if getattr(sale, "account_id", None) else None
    currency = (account.currency if account and account.currency else None) or "TZS"

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, height - 50, "Moneytracer — Invoice")
    c.setFont("Helvetica", 11)
    c.drawString(40, height - 90, f"Receipt: {sale.receipt_no}")
    c.drawString(40, height - 110, f"Date: {sale.created_at}")
    c.drawString(40, height - 130, f"Customer: {sale.customer_name}")
    c.drawString(40, height - 160, f"Item: {sale.item_name}")
    c.drawString(40, height - 180, f"Quantity: {sale.quantity}")
    c.drawString(40, height - 200, f"Unit Price: {sale.unit_price}")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, height - 230, f"Total: {currency} {sale.total:,.2f}")
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{sale.receipt_no}.pdf"},
    )
