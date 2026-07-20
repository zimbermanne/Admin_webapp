"""
Double-entry ledger helpers.

The ChartOfAccount/JournalEntry/JournalLine tables (added in models.py)
were previously unused — Sale/Purchase/Expense rows were the only record
of a transaction, and reports summed those tables directly instead of
reading from a ledger. This module wires the two together:

- ensure_default_chart_of_accounts(): seeds a standard starter chart for a
  tenant the first time it's needed (idempotent — safe to call every time).
- post_journal_entry(): the single entry point for writing a balanced
  journal entry. Raises if debits != credits, so it's impossible to post
  an unbalanced entry through this helper.
- post_sale_entry / post_purchase_entry / post_expense_entry: build the
  correct debit/credit lines for each transaction type.

Call the relevant post_*_entry() function right after committing the
Sale/Purchase/Expense row in each router. It's intentionally decoupled
(plain functions, not signals/hooks) so it stays easy to trace.
"""
from datetime import datetime
from sqlalchemy.orm import Session

from models import ChartOfAccount, JournalEntry, JournalLine, LedgerAccountType, FiscalPeriod, FiscalPeriodStatus


class FiscalPeriodLockedError(ValueError):
    """Raised when a post/edit is attempted against a date inside a closed
    fiscal period. Callers should surface this as a 400, not swallow it —
    per the integrity guardrail, closed periods are never silently skipped."""
    pass


def get_locked_period(db: Session, account_id: int, when: datetime) -> FiscalPeriod:
    """Return the closed FiscalPeriod covering `when`, or None if the date
    falls in an open period or no period has been defined for it at all
    (undefined periods are treated as open, not locked)."""
    when = when or datetime.utcnow()
    return (
        db.query(FiscalPeriod)
        .filter(
            FiscalPeriod.account_id == account_id,
            FiscalPeriod.status == FiscalPeriodStatus.closed,
            FiscalPeriod.start_date <= when,
            FiscalPeriod.end_date >= when,
        )
        .first()
    )


# code -> (name, type). Kept small and flat; sub-accounts can be added later
# via parent_id without touching this list.
_STANDARD_CHART = [
    ("1000", "Cash", LedgerAccountType.asset),
    ("1010", "Bank", LedgerAccountType.asset),
    ("1100", "Accounts Receivable", LedgerAccountType.asset),
    ("1200", "Inventory", LedgerAccountType.asset),
    ("2000", "Accounts Payable", LedgerAccountType.liability),
    ("2100", "VAT Payable (Output)", LedgerAccountType.liability),
    ("2110", "VAT Receivable (Input)", LedgerAccountType.asset),
    ("3000", "Owner's Equity", LedgerAccountType.equity),
    ("4000", "Sales Revenue", LedgerAccountType.revenue),
    ("5000", "Cost of Goods Sold", LedgerAccountType.expense),
    ("5100", "Operating Expenses", LedgerAccountType.expense),
]


def ensure_default_chart_of_accounts(db: Session, account_id: int) -> dict:
    """Return {code: ChartOfAccount} for this tenant, creating any missing
    standard accounts first. Safe to call on every request — only inserts
    codes that don't already exist for this account_id."""
    existing = {
        c.code: c
        for c in db.query(ChartOfAccount).filter(ChartOfAccount.account_id == account_id).all()
    }
    created = False
    for code, name, acc_type in _STANDARD_CHART:
        if code not in existing:
            row = ChartOfAccount(account_id=account_id, code=code, name=name, account_type=acc_type)
            db.add(row)
            existing[code] = row
            created = True
    if created:
        db.commit()
        for row in existing.values():
            db.refresh(row)
    return existing


def post_journal_entry(db: Session, account_id: int, description: str, lines: list,
                        reference: str = None, created_by: str = None, date: datetime = None) -> JournalEntry:
    """lines: list of (chart_account_code, debit, credit) tuples.
    Raises ValueError if the entry doesn't balance — this is the one place
    that guarantees every posted entry is valid double-entry accounting."""
    total_debit = round(sum(l[1] for l in lines), 2)
    total_credit = round(sum(l[2] for l in lines), 2)
    if total_debit != total_credit:
        raise ValueError(
            f"Unbalanced journal entry '{description}': debits {total_debit} != credits {total_credit}"
        )

    entry_date = date or datetime.utcnow()
    locked = get_locked_period(db, account_id, entry_date)
    if locked is not None:
        raise FiscalPeriodLockedError(
            f"Cannot post '{description}' on {entry_date.date()} — fiscal period "
            f"'{locked.name}' is closed. Use a correction/reversing entry in an open period instead."
        )

    chart = ensure_default_chart_of_accounts(db, account_id)

    entry = JournalEntry(
        account_id=account_id,
        date=entry_date,
        description=description,
        reference=reference,
        created_by=created_by,
    )
    db.add(entry)
    db.flush()  # get entry.id without a full commit

    for code, debit, credit in lines:
        if code not in chart:
            raise ValueError(f"Unknown chart of accounts code '{code}' for account {account_id}")
        db.add(JournalLine(
            journal_entry_id=entry.id,
            chart_account_id=chart[code].id,
            debit=debit,
            credit=credit,
        ))

    db.commit()
    db.refresh(entry)
    return entry


def post_sale_entry(db: Session, account_id: int, sale, created_by: str = None) -> JournalEntry:
    """Dr Cash/Accounts Receivable, Cr Sales Revenue — plus Dr COGS / Cr
    Inventory for the cost side, when a cost is known."""
    lines = []
    cash_or_ar_code = "1100" if getattr(sale, "payment_mode", None) and sale.payment_mode.value == "credit" else "1000"
    lines.append((cash_or_ar_code, sale.total, 0))
    lines.append(("4000", 0, sale.total))

    cost = (sale.cost_price_at_sale or 0) * (sale.quantity or 0)
    if cost:
        lines.append(("5000", cost, 0))
        lines.append(("1200", 0, cost))

    # Cost lines unbalance the revenue lines above unless summed together —
    # post as one entry so debits/credits both include the cost pair.
    return post_journal_entry(
        db, account_id,
        description=f"Sale: {sale.item_name or 'item'} x{sale.quantity}",
        lines=lines,
        reference=sale.receipt_no or f"sale-{sale.id}",
        created_by=created_by,
        date=sale.created_at,
    )


def post_purchase_entry(db: Session, account_id: int, purchase, created_by: str = None) -> JournalEntry:
    """Dr Inventory, Cr Cash/Accounts Payable."""
    lines = [
        ("1200", purchase.total, 0),
        ("1000", 0, purchase.total),
    ]
    return post_journal_entry(
        db, account_id,
        description=f"Purchase: {purchase.item_name or 'item'} x{purchase.quantity} from {purchase.supplier or 'supplier'}",
        lines=lines,
        reference=f"purchase-{purchase.id}",
        created_by=created_by,
        date=purchase.created_at,
    )


def post_expense_entry(db: Session, account_id: int, expense, created_by: str = None) -> JournalEntry:
    """Dr Operating Expenses, Cr Cash."""
    lines = [
        ("5100", expense.amount, 0),
        ("1000", 0, expense.amount),
    ]
    return post_journal_entry(
        db, account_id,
        description=f"Expense: {expense.category} — {expense.description or ''}".strip(" —"),
        lines=lines,
        reference=f"expense-{expense.id}",
        created_by=created_by,
        date=expense.created_at,
    )


def find_journal_entry_by_reference(db: Session, account_id: int, reference: str) -> JournalEntry:
    """Look up the (non-reversal) journal entry originally posted for a
    given transaction reference, e.g. 'sale-42' or 'expense-7'."""
    return (
        db.query(JournalEntry)
        .filter(
            JournalEntry.account_id == account_id,
            JournalEntry.reference == reference,
            JournalEntry.is_reversal.is_(False),
        )
        .first()
    )


def reverse_journal_entry(db: Session, account_id: int, original: JournalEntry,
                           created_by: str = None, reason: str = "Void/correction") -> JournalEntry:
    """Post an equal-and-opposite entry against `original` instead of ever
    deleting or mutating a posted entry. The original is marked voided (kept
    for audit trail) and the reversal links back to it via reversed_entry_id.
    Posts today, in whatever period is currently open — reversals of a
    closed-period entry still land in an open period, never back-dated into
    the closed one."""
    if original is None:
        raise ValueError("Cannot reverse a journal entry that does not exist")
    if original.is_voided:
        raise ValueError(f"Journal entry {original.id} has already been reversed")

    # Flip every debit/credit pair.
    lines = [(line.account.code, line.credit, line.debit) for line in original.lines]

    reversal = post_journal_entry(
        db, account_id,
        description=f"Reversal: {original.description} ({reason})",
        lines=lines,
        reference=f"reversal-of-{original.reference or original.id}",
        created_by=created_by,
        date=datetime.utcnow(),
    )
    reversal.is_reversal = True
    reversal.reversed_entry_id = original.id
    original.is_voided = True
    original.is_locked = True
    db.commit()
    db.refresh(reversal)
    return reversal
