from datetime import datetime, date
from collections import defaultdict
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Sale, Purchase, Expense, Debtor, Creditor, InventoryItem, User, LedgerStatus, RoleEnum
from schemas import DebtorCreate, CreditorCreate, LedgerOut
from auth import get_current_user
from activity import log_activity

router = APIRouter(prefix="/api/reports", tags=["reports"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    return current_user.account_id


def _scoped(query, model, account_id):
    return query.filter(model.account_id == account_id) if account_id is not None else query


def _compute_core_financials(db: Session, account_id):
    """Single source of truth for revenue/COGS/expenses/net profit, so every
    report endpoint agrees on what 'net profit' means. Uses the cost snapshotted
    at time of sale (cost_price_at_sale) when available, falling back to the
    item's current cost_price for sales recorded before that column existed."""
    sales = _scoped(db.query(Sale), Sale, account_id).all()
    expenses = _scoped(db.query(Expense), Expense, account_id).all()

    revenue_by_item = defaultdict(float)
    cogs = 0.0
    for s in sales:
        revenue_by_item[s.item_name] += s.total
        unit_cost = s.cost_price_at_sale
        if unit_cost is None and s.item:
            unit_cost = s.item.cost_price
        if unit_cost:
            cogs += unit_cost * s.quantity

    expense_by_category = defaultdict(float)
    for e in expenses:
        expense_by_category[e.category] += e.amount

    revenue = sum(revenue_by_item.values())
    total_expenses = sum(expense_by_category.values())
    gross_profit = revenue - cogs
    net_profit = gross_profit - total_expenses

    return {
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "revenue_by_item": revenue_by_item,
        "expense_by_category": expense_by_category,
    }


@router.get("/financial-summary")
def financial_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    core = _compute_core_financials(db, account_id)
    purchases = _scoped(db.query(Purchase), Purchase, account_id).all()
    total_purchases = sum(p.total for p in purchases)

    debtors = _scoped(db.query(Debtor), Debtor, account_id).all()
    creditors = _scoped(db.query(Creditor), Creditor, account_id).all()
    receivables = sum(d.total_owed - d.amount_paid for d in debtors)
    payables = sum(c.total_owed - c.amount_paid for c in creditors)

    revenue = core["revenue"]
    net_profit = core["net_profit"]
    return {
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
def profit_loss(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    core = _compute_core_financials(db, account_id)

    return {
        "revenue_by_item": {k: round(v, 2) for k, v in core["revenue_by_item"].items()},
        "total_revenue": round(core["revenue"], 2),
        "cogs": round(core["cogs"], 2),
        "expense_by_category": {k: round(v, 2) for k, v in core["expense_by_category"].items()},
        "total_expenses": round(core["total_expenses"], 2),
        "gross_profit": round(core["gross_profit"], 2),
        "net_profit": round(core["net_profit"], 2),
    }


@router.get("/debtors")
def debtors_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    debtors = _scoped(db.query(Debtor), Debtor, account_id).all()
    total_owed = sum(d.total_owed - d.amount_paid for d in debtors)
    by_status = defaultdict(int)
    for d in debtors:
        by_status[d.status.value] += 1
    return {
        "total_outstanding": round(total_owed, 2),
        "count": len(debtors),
        "by_status": dict(by_status),
    }


@router.get("/creditors")
def creditors_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    creditors = _scoped(db.query(Creditor), Creditor, account_id).all()
    total_owed = sum(c.total_owed - c.amount_paid for c in creditors)
    by_status = defaultdict(int)
    for c in creditors:
        by_status[c.status.value] += 1
    return {
        "total_outstanding": round(total_owed, 2),
        "count": len(creditors),
        "by_status": dict(by_status),
    }


@router.get("/inventory-valuation")
def inventory_valuation(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    items = _scoped(db.query(InventoryItem), InventoryItem, account_id).all()
    by_category = defaultdict(float)
    for i in items:
        by_category[i.category] += i.quantity * i.cost_price
    total_value = sum(by_category.values())
    return {
        "total_value": round(total_value, 2),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
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
