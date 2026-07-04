import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship
from database import Base


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
    country = Column(String(80), default="")
    currency = Column(String(10), default="")
    country_confirmed = Column(Boolean, default=False)
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

    # Soft-delete: accounts are never destroyed immediately. "Deleting" marks
    # them for deletion and locks logins; a superadmin (or an automated job)
    # permanently purges them only after the grace period, via /purge below.
    pending_deletion_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

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

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    item_name = Column(String(150))
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total = Column(Float, default=0)
    payment_mode = Column(Enum(PaymentMode), default=PaymentMode.cash)
    customer_name = Column(String(150), default="Walk-in")
    sold_by = Column(String(80), default="")
    receipt_no = Column(String(40), default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    item = relationship("InventoryItem", back_populates="sales")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    item_name = Column(String(150))
    supplier = Column(String(150), default="")
    quantity = Column(Float, default=1)
    unit_cost = Column(Float, default=0)
    total = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    category = Column(String(80), default="General")
    description = Column(String(255), default="")
    amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Debtor(Base):
    __tablename__ = "debtors"

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

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    description = Column(String(255), default="")
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total = Column(Float, default=0)

    invoice = relationship("Invoice", back_populates="items")


class Quotation(Base):
    __tablename__ = "quotations"

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

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    description = Column(String(255), default="")
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    total = Column(Float, default=0)

    quotation = relationship("Quotation", back_populates="items")


class Reminder(Base):
    __tablename__ = "reminders"

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

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, unique=True, index=True)
    name = Column(String(150), nullable=False)
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

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("savings_groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # set only if member has a login
    name = Column(String(150), nullable=False)
    phone = Column(String(40), default="")
    is_recorder = Column(Boolean, default=False)  # treasurer/secretary who logs in and records entries
    joined_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("SavingsGroup", back_populates="members")
    user = relationship("User")


class Contribution(Base):
    __tablename__ = "contributions"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("savings_groups.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("group_members.id"), nullable=False, index=True)
    cycle_label = Column(String(40), default="")  # e.g. "2026-07" or "Cycle 3"
    amount = Column(Float, default=0)
    recorded_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")


class Payout(Base):
    """Rotating pot payout — only meaningful when SavingsGroup.rotation_enabled."""
    __tablename__ = "payouts"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("savings_groups.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("group_members.id"), nullable=False, index=True)
    cycle_label = Column(String(40), default="")
    amount = Column(Float, default=0)
    recorded_by = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")


class GroupLoan(Base):
    """Internal member borrowing from the group's pooled fund — only meaningful
    when SavingsGroup.lending_enabled. Distinct from the business-side bank Loan."""
    __tablename__ = "group_loans"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("savings_groups.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("group_members.id"), nullable=False, index=True)
    principal = Column(Float, default=0)
    interest_rate = Column(Float, default=0)  # flat % applied once at issuance (simplest model for v1)
    balance = Column(Float, default=0)  # outstanding = principal*(1+interest_rate/100) - repayments
    status = Column(Enum(GroupLoanStatus), default=GroupLoanStatus.active)
    issued_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("GroupMember")
    repayments = relationship("GroupLoanRepayment", back_populates="loan", cascade="all, delete-orphan")


class GroupLoanRepayment(Base):
    __tablename__ = "group_loan_repayments"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("group_loans.id"), nullable=False, index=True)
    amount = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    loan = relationship("GroupLoan", back_populates="repayments")
