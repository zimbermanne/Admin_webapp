import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship
from database import Base, schema_args, fk_ref, SCHEMA_BUSINESS, SCHEMA_COMMUNITY, SCHEMA_PERSONAL


class RoleEnum(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    manager = "manager"
    employee = "employee"
    member = "member"  # read-only community-group member login (own records only)


class BusinessStructure(str, enum.Enum):
    solo = "solo"
    company = "company"


class AccountType(str, enum.Enum):
    business = "business"
    community = "community"
    personal = "personal"


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_type = Column(Enum(AccountType), default=AccountType.business)
    business_structure = Column(Enum(BusinessStructure), default=BusinessStructure.solo)
    name = Column(String(150), nullable=False, index=True)
    tin = Column(String(50), nullable=True)  # Tax Identification Number, required for company
    owner_full_name = Column(String(150), nullable=False)
    business_type = Column(String(80), default="retail")
    region = Column(String(80), default="")
    district = Column(String(80), default="")
    street_address = Column(String(255), default="")
    phone = Column(String(40), default="")
    email = Column(String(120), default="")
    logo_url = Column(String(255), default="")
    tax_rate = Column(Float, default=0)
    invoice_prefix = Column(String(20), default="INV")
    payment_terms_days = Column(Integer, default=7)
    is_active = Column(Boolean, default=True)
    is_suspended = Column(Boolean, default=False)
    onboarding_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="account")


class PaymentMode(str, enum.Enum):
    cash = "cash"
    credit = "credit"
    mobile_money = "mobile_money"


class LedgerStatus(str, enum.Enum):
    unpaid = "unpaid"
    partial = "partial"
    paid = "paid"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, index=True, nullable=False)
    full_name = Column(String(120), default="")
    email = Column(String(120), default="")
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.employee)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # nullable for superadmin
    is_active = Column(Boolean, default=True)
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="users")


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False, index=True)
    sku = Column(String(80), unique=True, nullable=True, index=True)
    category = Column(String(80), default="General", index=True)
    quantity = Column(Float, default=0)
    unit = Column(String(30), default="pcs")
    cost_price = Column(Float, default=0)
    selling_price = Column(Float, default=0)
    reorder_point = Column(Float, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sales = relationship("Sale", back_populates="item")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey(fk_ref("inventory_items.id", SCHEMA_BUSINESS)), nullable=True)
    item_name = Column(String(150))
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    # Snapshot of the item's cost_price at the moment of this sale, so COGS/margin
    # for a past sale stays accurate even if the item's cost later changes via
    # new purchases. Nullable to stay backward-compatible with sales recorded
    # before this column existed (those fall back to the item's current cost).
    cost_price_at_sale = Column(Float, nullable=True)
    total = Column(Float, default=0)
    payment_mode = Column(Enum(PaymentMode), default=PaymentMode.cash)
    customer_name = Column(String(150), default="Walk-in")
    sold_by = Column(String(80), default="")
    receipt_no = Column(String(40), default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    item = relationship("InventoryItem", back_populates="sales")


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey(fk_ref("inventory_items.id", SCHEMA_BUSINESS)), nullable=True)
    item_name = Column(String(150))
    supplier = Column(String(150), default="")
    quantity = Column(Float, default=1)
    unit_cost = Column(Float, default=0)
    total = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    item = relationship("InventoryItem")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    category = Column(String(80), default="General")
    description = Column(String(255), default="")
    amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Debtor(Base):
    __tablename__ = "debtors"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(40), default="")
    total_owed = Column(Float, default=0)
    amount_paid = Column(Float, default=0)
    status = Column(Enum(LedgerStatus), default=LedgerStatus.unpaid)
    note = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Creditor(Base):
    __tablename__ = "creditors"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(40), default="")
    total_owed = Column(Float, default=0)
    amount_paid = Column(Float, default=0)
    status = Column(Enum(LedgerStatus), default=LedgerStatus.unpaid)
    note = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    paid = "paid"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    invoice_no = Column(String(40), unique=True, index=True)
    customer_name = Column(String(150), nullable=False, default="Walk-in")
    customer_phone = Column(String(40), default="")
    customer_address = Column(String(255), default="")
    subtotal = Column(Float, default=0)
    tax_rate = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    discount = Column(Float, default=0)
    total = Column(Float, default=0)
    notes = Column(String(500), default="")
    status = Column(Enum(DocumentStatus), default=DocumentStatus.sent)
    created_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey(fk_ref("invoices.id", SCHEMA_BUSINESS)), nullable=False)
    description = Column(String(255), default="")
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total = Column(Float, default=0)

    invoice = relationship("Invoice", back_populates="items")


class Quotation(Base):
    __tablename__ = "quotations"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    quote_no = Column(String(40), unique=True, index=True)
    customer_name = Column(String(150), nullable=False, default="Walk-in")
    customer_phone = Column(String(40), default="")
    customer_address = Column(String(255), default="")
    subtotal = Column(Float, default=0)
    tax_rate = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    discount = Column(Float, default=0)
    total = Column(Float, default=0)
    notes = Column(String(500), default="")
    valid_until = Column(DateTime, nullable=True)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.draft)
    created_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    quotation_id = Column(Integer, ForeignKey(fk_ref("quotations.id", SCHEMA_BUSINESS)), nullable=False)
    description = Column(String(255), default="")
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total = Column(Float, default=0)

    quotation = relationship("Quotation", back_populates="items")


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = schema_args(SCHEMA_BUSINESS)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    created_by = Column(String(80), default="")
    text = Column(String(255), nullable=False)
    due_at = Column(DateTime, nullable=True)  # optional; null = show until dismissed
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)  # nullable for superadmin actions
    username = Column(String(80))
    action = Column(String(255))
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

# ---------- Community-based informal finance (VICOBA / Vibati / Chama / etc.) ----------
# One Account (account_type == community) has exactly one SavingsGroup. Ordinary
# members are just name+phone records (GroupMember) with no login by default;
# a member only gets a login (a User with role=member) if the recorder
# explicitly creates one for them, so they can view their own contributions
# and loan balance in-app. No OTP/WhatsApp self-service for now.

class ContributionStyle(str, enum.Enum):
    fixed = "fixed"       # everyone pays the same amount each cycle (classic "Vibati")
    flexible = "flexible"  # members vary how much they contribute (classic "VICOBA")


class CycleFrequency(str, enum.Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"


class GroupLoanStatus(str, enum.Enum):
    active = "active"
    paid = "paid"
    defaulted = "defaulted"


class SavingsGroup(Base):
    __tablename__ = "savings_groups"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, unique=True, index=True)
    name = Column(String(150), nullable=False)
    registration_number = Column(String(80), default="")  # optional govt/community registration number
    # Cultural label only (VICOBA, Vibati, Chama, Stokvel, Susu, Tontine, Other...) —
    # does NOT drive behavior. Behavior is driven by rotation_enabled/lending_enabled.
    group_type = Column(String(50), default="")
    region = Column(String(80), default="")
    district = Column(String(80), default="")
    contribution_style = Column(Enum(ContributionStyle), default=ContributionStyle.fixed)
    contribution_amount = Column(Float, nullable=True)  # used when contribution_style == fixed
    currency = Column(String(10), default="TZS")
    cycle_frequency = Column(Enum(CycleFrequency), default=CycleFrequency.monthly)
    meeting_day = Column(String(20), default="")
    rotation_enabled = Column(Boolean, default=False)  # ROSCA-style pot rotation
    lending_enabled = Column(Boolean, default=False)   # ASCA-style internal lending
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account")
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("savings_groups.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # set only if member has a login
    name = Column(String(150), nullable=False)
    age = Column(Integer, nullable=True)
    phone = Column(String(40), default="")
    group_role = Column(String(30), default="member")  # 'chairman' | 'treasurer' | 'secretary' | 'member'
    is_recorder = Column(Boolean, default=False)  # treasurer/secretary who logs in and records entries
    joined_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("SavingsGroup", back_populates="members")
    user = relationship("User")


class Contribution(Base):
    __tablename__ = "contributions"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("savings_groups.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey(fk_ref("group_members.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    cycle_label = Column(String(40), default="")  # e.g. "2026-07" or "Cycle 3"
    amount = Column(Float, default=0)
    recorded_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")


class Payout(Base):
    """Rotating pot payout — only meaningful when SavingsGroup.rotation_enabled."""
    __tablename__ = "payouts"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("savings_groups.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey(fk_ref("group_members.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    cycle_label = Column(String(40), default="")
    amount = Column(Float, default=0)
    recorded_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")


class GroupLoan(Base):
    """Internal member borrowing from the group's pooled fund — only meaningful
    when SavingsGroup.lending_enabled. Distinct from the business-side bank Loan."""
    __tablename__ = "group_loans"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("savings_groups.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey(fk_ref("group_members.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    principal = Column(Float, default=0)
    interest_rate = Column(Float, default=0)  # flat % applied once at issuance (simplest model for v1)
    balance = Column(Float, default=0)  # outstanding = principal*(1+interest_rate/100) - repayments
    status = Column(Enum(GroupLoanStatus), default=GroupLoanStatus.active)
    issued_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")
    repayments = relationship("GroupLoanRepayment", back_populates="loan", cascade="all, delete-orphan")


class GroupLoanRepayment(Base):
    __tablename__ = "group_loan_repayments"
    __table_args__ = schema_args(SCHEMA_COMMUNITY)

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey(fk_ref("group_loans.id", SCHEMA_COMMUNITY)), nullable=False, index=True)
    amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    loan = relationship("GroupLoan", back_populates="repayments")


# ---------------------------------------------------------------------------
# Personal spending track (envelope budgets, habit tags, savings challenges).
# Deliberately separate from business (Account/InventoryItem/Sale/...) and
# community (SavingsGroup/GroupMember/...) models above, even though a
# "spending challenge" is conceptually similar to a chama — they are kept as
# distinct concepts/tables so personal and community data never mix.
# ---------------------------------------------------------------------------

class SpendingTag(str, enum.Enum):
    necessary = "necessary"
    impulse = "impulse"


class SpendingCategory(Base):
    __tablename__ = "spending_categories"
    __table_args__ = schema_args(SCHEMA_PERSONAL)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    icon = Column(String(20), default="")
    monthly_budget = Column(Float, default=0)  # used in envelope mode, ignored in habit mode
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("SpendingTransaction", back_populates="category")


class SpendingTransaction(Base):
    __tablename__ = "spending_transactions"
    __table_args__ = schema_args(SCHEMA_PERSONAL)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey(fk_ref("spending_categories.id", SCHEMA_PERSONAL)), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    note = Column(String(255), default="")
    tag = Column(Enum(SpendingTag), nullable=True)  # only set in habit mode
    spent_at = Column(DateTime, default=datetime.utcnow, index=True)

    category = relationship("SpendingCategory", back_populates="transactions")


class SpendingGroup(Base):
    """A personal savings challenge shared between friends/family.
    Distinct from the community-track SavingsGroup (chama/table-banking)."""
    __tablename__ = "spending_groups"
    __table_args__ = schema_args(SCHEMA_PERSONAL)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    goal_amount = Column(Float, default=0)
    target_date = Column(DateTime, nullable=True)
    invite_code = Column(String(20), unique=True, index=True)
    created_by_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("SpendingGroupMember", back_populates="group", cascade="all, delete-orphan")
    contributions = relationship("SpendingGroupContribution", back_populates="group", cascade="all, delete-orphan")


class SpendingGroupMember(Base):
    __tablename__ = "spending_group_members"
    __table_args__ = schema_args(SCHEMA_PERSONAL)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("spending_groups.id", SCHEMA_PERSONAL)), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("SpendingGroup", back_populates="members")


class SpendingGroupContribution(Base):
    __tablename__ = "spending_group_contributions"
    __table_args__ = schema_args(SCHEMA_PERSONAL)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey(fk_ref("spending_groups.id", SCHEMA_PERSONAL)), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    amount = Column(Float, default=0)
    contributed_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("SpendingGroup", back_populates="contributions")

