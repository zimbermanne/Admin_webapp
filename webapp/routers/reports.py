from datetime import datetime, date
from typing import Optional
import io
from collections import defaultdict
from dateutil.relativedelta import relativedelta
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Sale, Purchase, Expense, Debtor, Creditor, InventoryItem, User, LedgerStatus, RoleEnum
from schemas import DebtorCreate, CreditorCreate, LedgerOut
from auth import get_current_user
from activity import log_activity, log_activity_for_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _dict_to_excel(data: dict, title: str) -> io.BytesIO:
    """Generic exporter: any report's dict response becomes a workbook —
    scalar fields go on a Summary sheet, nested dicts/lists each get their
    own sheet. Works across every report shape without bespoke code per type."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        summary_rows = []
        for key, value in data.items():
            if isinstance(value, dict):
                if value:
                    pd.DataFrame(list(value.items()), columns=["Item", "Value"]).to_excel(
                        writer, index=False, sheet_name=key[:31])
            elif isinstance(value, list):
                if value:
                    pd.DataFrame(value).to_excel(writer, index=False, sheet_name=key[:31])
            else:
                summary_rows.append({"Field": key.replace("_", " ").title(), "Value": value})
        pd.DataFrame(summary_rows).to_excel(writer, index=False, sheet_name="Summary")
    buf.seek(0)
    return buf


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    return current_user.account_id


def _scoped(query, model, account_id):
    return query.filter(model.account_id == account_id) if account_id is not None else query


def _compute_core_financials(db: Session, account_id, start: datetime = None, end: datetime = None):
    """Single source of truth for revenue/COGS/expenses/net profit, so every
    report endpoint agrees on what 'net profit' means. Uses the cost snapshotted
    at time of sale (cost_price_at_sale) when available, falling back to the
    item's current cost_price for sales recorded before that column existed.
    Pass start/end to scope to a date range; omit for all-time."""
    sales_q = _scoped(db.query(Sale), Sale, account_id)
    expenses_q = _scoped(db.query(Expense), Expense, account_id)
    if start is not None:
        sales_q = sales_q.filter(Sale.created_at >= start)
        expenses_q = expenses_q.filter(Expense.created_at >= start)
    if end is not None:
        sales_q = sales_q.filter(Sale.created_at <= end)
        expenses_q = expenses_q.filter(Expense.created_at <= end)
    sales = sales_q.all()
    expenses = expenses_q.all()

    revenue_by_item = defaultdict(float)
    qty_by_item = defaultdict(float)
    cogs_by_item = defaultdict(float)
    cogs = 0.0
    for s in sales:
        revenue_by_item[s.item_name] += s.total
        qty_by_item[s.item_name] += s.quantity
        unit_cost = s.cost_price_at_sale
        if unit_cost is None and s.item:
            unit_cost = s.item.cost_price
        if unit_cost:
            item_cogs = unit_cost * s.quantity
            cogs += item_cogs
            cogs_by_item[s.item_name] += item_cogs

    expense_by_category = defaultdict(float)
    for e in expenses:
        expense_by_category[e.category] += e.amount

    revenue = sum(revenue_by_item.values())
    total_expenses = sum(expense_by_category.values())
    gross_profit = revenue - cogs
    net_profit = gross_profit - total_expenses

    item_profitability = []
    for name, rev in revenue_by_item.items():
        item_cogs = cogs_by_item.get(name, 0.0)
        margin = rev - item_cogs
        item_profitability.append({
            "item_name": name,
            "quantity_sold": qty_by_item.get(name, 0.0),
            "revenue": round(rev, 2),
            "cogs": round(item_cogs, 2),
            "gross_profit": round(margin, 2),
            "gross_margin_pct": round((margin / rev * 100), 1) if rev else 0,
        })
    item_profitability.sort(key=lambda r: r["gross_profit"], reverse=True)

    return {
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "revenue_by_item": revenue_by_item,
        "expense_by_category": expense_by_category,
        "item_profitability": item_profitability,
    }


@router.get("/financial-summary")
def financial_summary(start: Optional[date] = None, end: Optional[date] = None,
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    start_dt = datetime.combine(start, datetime.min.time()) if start else None
    end_dt = datetime.combine(end, datetime.max.time()) if end else None
    core = _compute_core_financials(db, account_id, start_dt, end_dt)

    purchases_q = _scoped(db.query(Purchase), Purchase, account_id)
    if start_dt is not None:
        purchases_q = purchases_q.filter(Purchase.created_at >= start_dt)
    if end_dt is not None:
        purchases_q = purchases_q.filter(Purchase.created_at <= end_dt)
    total_purchases = sum(p.total for p in purchases_q.all())

    # Receivables/payables are point-in-time balances, not period activity —
    # they aren't filtered by the date range.
    debtors = _scoped(db.query(Debtor), Debtor, account_id).all()
    creditors = _scoped(db.query(Creditor), Creditor, account_id).all()
    receivables = sum(d.total_owed - d.amount_paid for d in debtors)
    payables = sum(c.total_owed - c.amount_paid for c in creditors)

    revenue = core["revenue"]
    net_profit = core["net_profit"]
    return {
        "start": str(start) if start else None,
        "end": str(end) if end else None,
        "revenue": round(revenue, 2),
        "cogs": round(core["cogs"], 2),
        "gross_profit": round(core["gross_profit"], 2),
        "gross_margin_pct": round((core["gross_profit"] / revenue * 100), 1) if revenue else 0,
        "expenses": round(core["total_expenses"], 2),
        "purchases": round(total_purchases, 2),
        "net_profit": round(net_profit, 2),
        "net_margin_pct": round((net_profit / revenue * 100), 1) if revenue else 0,
        "receivables": round(receivables, 2),
        "payables": round(payables, 2),
    }


@router.get("/cashflow")
def cashflow(months: int = 12, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Monthly incoming (sales) vs outgoing (expenses + purchases) for a
    trailing window, plus a running cash balance — used to draw the
    cashflow chart on the Financial Summary page."""
    account_id = get_account_filter(current_user)

    today = date.today()
    start_month = (today.replace(day=1)) - relativedelta(months=months - 1)
    start = datetime.combine(start_month, datetime.min.time())

    sales = _scoped(db.query(Sale), Sale, account_id).filter(Sale.created_at >= start).all()
    expenses = _scoped(db.query(Expense), Expense, account_id).filter(Expense.created_at >= start).all()
    purchases = _scoped(db.query(Purchase), Purchase, account_id).filter(Purchase.created_at >= start).all()

    incoming_by_month = defaultdict(float)
    outgoing_by_month = defaultdict(float)
    for s in sales:
        incoming_by_month[s.created_at.strftime("%Y-%m")] += s.total
    for e in expenses:
        outgoing_by_month[e.created_at.strftime("%Y-%m")] += e.amount
    for p in purchases:
        outgoing_by_month[p.created_at.strftime("%Y-%m")] += p.total

    series = []
    running_balance = 0.0
    cursor = start_month
    for _ in range(months):
        key = cursor.strftime("%Y-%m")
        incoming = round(incoming_by_month.get(key, 0.0), 2)
        outgoing = round(outgoing_by_month.get(key, 0.0), 2)
        running_balance += incoming - outgoing
        series.append({
            "month": cursor.strftime("%b %Y"),
            "incoming": incoming,
            "outgoing": outgoing,
            "net": round(incoming - outgoing, 2),
            "balance": round(running_balance, 2),
        })
        cursor = cursor + relativedelta(months=1)

    total_incoming = round(sum(p["incoming"] for p in series), 2)
    total_outgoing = round(sum(p["outgoing"] for p in series), 2)

    return {
        "series": series,
        "total_incoming": total_incoming,
        "total_outgoing": total_outgoing,
        "net": round(total_incoming - total_outgoing, 2),
        "ending_balance": series[-1]["balance"] if series else 0,
    }


@router.get("/profit-loss")
def profit_loss(start: Optional[date] = None, end: Optional[date] = None,
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    start_dt = datetime.combine(start, datetime.min.time()) if start else None
    end_dt = datetime.combine(end, datetime.max.time()) if end else None
    core = _compute_core_financials(db, account_id, start_dt, end_dt)

    return {
        "start": str(start) if start else None,
        "end": str(end) if end else None,
        "revenue_by_item": {k: round(v, 2) for k, v in core["revenue_by_item"].items()},
        "total_revenue": round(core["revenue"], 2),
        "cogs": round(core["cogs"], 2),
        "expense_by_category": {k: round(v, 2) for k, v in core["expense_by_category"].items()},
        "total_expenses": round(core["total_expenses"], 2),
        "gross_profit": round(core["gross_profit"], 2),
        "net_profit": round(core["net_profit"], 2),
        "item_profitability": core["item_profitability"],
    }


@router.get("/debtors")
def debtors_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    debtors = _scoped(db.query(Debtor), Debtor, account_id).all()
    total_owed = sum(d.total_owed - d.amount_paid for d in debtors)
    by_status = defaultdict(int)
    for d in debtors:
        by_status[d.status.value] += 1
    top = sorted(
        ({"name": d.name, "outstanding": round(d.total_owed - d.amount_paid, 2), "status": d.status.value} for d in debtors),
        key=lambda r: r["outstanding"], reverse=True
    )[:10]
    return {
        "total_outstanding": round(total_owed, 2),
        "count": len(debtors),
        "by_status": dict(by_status),
        "top_debtors": top,
    }


@router.get("/creditors")
def creditors_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    creditors = _scoped(db.query(Creditor), Creditor, account_id).all()
    total_owed = sum(c.total_owed - c.amount_paid for c in creditors)
    by_status = defaultdict(int)
    for c in creditors:
        by_status[c.status.value] += 1
    top = sorted(
        ({"name": c.name, "outstanding": round(c.total_owed - c.amount_paid, 2), "status": c.status.value} for c in creditors),
        key=lambda r: r["outstanding"], reverse=True
    )[:10]
    return {
        "total_outstanding": round(total_owed, 2),
        "count": len(creditors),
        "by_status": dict(by_status),
        "top_creditors": top,
    }


@router.get("/inventory-valuation")
def inventory_valuation(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    items = _scoped(db.query(InventoryItem), InventoryItem, account_id).all()
    by_category = defaultdict(float)
    for i in items:
        by_category[i.category] += i.quantity * i.cost_price
    total_value = sum(by_category.values())
    top_items = sorted(
        ({
            "item_name": i.name,
            "quantity": i.quantity,
            "cost_price": i.cost_price,
            "value": round(i.quantity * i.cost_price, 2),
            "low_stock": i.quantity <= i.reorder_point,
        } for i in items),
        key=lambda r: r["value"], reverse=True
    )[:10]
    return {
        "total_value": round(total_value, 2),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "top_items": top_items,
    }


@router.get("/daily-summary")
def daily_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())
    sales_today = _scoped(db.query(Sale), Sale, account_id).filter(
        Sale.created_at >= start, Sale.created_at <= end
    ).all()

    items_sold = sum(s.quantity for s in sales_today)
    earnings = sum(s.total for s in sales_today)

    top_product = None
    if sales_today:
        totals = defaultdict(float)
        for s in sales_today:
            totals[s.item_name] += s.total
        top_product = max(totals, key=totals.get)

    low_stock_query = _scoped(db.query(InventoryItem), InventoryItem, account_id)
    low_stock_count = low_stock_query.filter(
        InventoryItem.quantity <= InventoryItem.reorder_point
    ).count()

    return {
        "date": str(today),
        "items_sold": items_sold,
        "earnings": round(earnings, 2),
        "top_product": top_product,
        "low_stock_count": low_stock_count,
        "transactions": len(sales_today),
    }


@router.post("/add-debtor", response_model=LedgerOut)
def add_debtor(payload: DebtorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    debtor = Debtor(**payload.model_dump())
    db.add(debtor)
    db.commit()
    db.refresh(debtor)
    log_activity(db, current_user.username, "debtor_add", f"Added debtor {debtor.name}")
    return debtor


@router.post("/add-creditor", response_model=LedgerOut)
def add_creditor(payload: CreditorCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    creditor = Creditor(**payload.model_dump())
    db.add(creditor)
    db.commit()
    db.refresh(creditor)
    log_activity(db, current_user.username, "creditor_add", f"Added creditor {creditor.name}")
    return creditor


_EXPORTABLE_REPORTS = {
    "financial-summary": "Financial Summary",
    "profit-loss": "Profit and Loss",
    "cashflow": "Cash Flow",
    "debtors": "Debtors Report",
    "creditors": "Creditors Report",
    "inventory-valuation": "Inventory Valuation",
}


@router.get("/export/{report_type}")
def export_report(report_type: str, start: Optional[date] = None, end: Optional[date] = None,
                   months: int = 12, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Export any of the report views as an Excel workbook. Reuses each
    report's own endpoint function directly (not over HTTP) so the exported
    numbers can never drift from what's shown on screen."""
    if report_type not in _EXPORTABLE_REPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown report type '{report_type}'")

    if report_type == "financial-summary":
        data = financial_summary(start, end, db, current_user)
    elif report_type == "profit-loss":
        data = profit_loss(start, end, db, current_user)
    elif report_type == "cashflow":
        data = cashflow(months, db, current_user)
    elif report_type == "debtors":
        data = debtors_report(db, current_user)
    elif report_type == "creditors":
        data = creditors_report(db, current_user)
    else:
        data = inventory_valuation(db, current_user)

    title = _EXPORTABLE_REPORTS[report_type]
    buf = _dict_to_excel(data, title)
    log_activity_for_user(db, current_user, "report_export", f"Exported {title} report")
    filename = title.replace(" ", "_") + ".xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                              headers=headers)
