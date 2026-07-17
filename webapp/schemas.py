from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from models import (
    RoleEnum, PaymentMode, LedgerStatus, DocumentStatus, BusinessStructure,
    AccountType, ContributionStyle, CycleFrequency, GroupLoanStatus,
)


# ---------- Auth / Users ----------
class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = ""
    email: Optional[str] = ""
    role: Optional[RoleEnum] = RoleEnum.employee
    # Only meaningful on /api/auth/register (self-serve signup): which kind of
    # account this creates. Ignored elsewhere (e.g. admin creating staff).
    account_type: Optional[AccountType] = AccountType.business


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: str
    role: RoleEnum
    account_id: Optional[int] = None
    is_active: bool
    is_demo: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ---------- Accounts ----------
class AccountCreate(BaseModel):
    business_structure: BusinessStructure = BusinessStructure.solo
    name: str
    tin: Optional[str] = None
    owner_full_name: str
    business_type: Optional[str] = "retail"
    region: Optional[str] = ""
    district: Optional[str] = ""
    street_address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    logo_url: Optional[str] = ""
    tax_rate: float = 0
    invoice_prefix: Optional[str] = "INV"
    payment_terms_days: int = 7


class AccountUpdate(BaseModel):
    business_structure: Optional[BusinessStructure] = None
    name: Optional[str] = None
    tin: Optional[str] = None
    vrn: Optional[str] = None
    owner_full_name: Optional[str] = None
    business_type: Optional[str] = None
    country: Optional[str] = None  # country name, as sent by the onboarding form; resolved to country_id server-side
    region: Optional[str] = None
    district: Optional[str] = None
    street_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    tax_rate: Optional[float] = None
    invoice_prefix: Optional[str] = None
    payment_terms_days: Optional[int] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch: Optional[str] = None
    is_active: Optional[bool] = None
    is_suspended: Optional[bool] = None
    onboarding_completed: Optional[bool] = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_type: AccountType
    business_structure: BusinessStructure
    name: str
    tin: Optional[str]
    vrn: Optional[str] = None
    owner_full_name: str
    business_type: str
    country_id: Optional[int] = None
    revenue_authority_id: Optional[int] = None
    region: str
    district: str
    street_address: str
    phone: str
    email: str
    logo_url: str
    tax_rate: float
    invoice_prefix: str
    payment_terms_days: int
    bank_name: Optional[str] = ""
    bank_account_name: Optional[str] = ""
    bank_account_number: Optional[str] = ""
    bank_branch: Optional[str] = ""
    is_active: bool
    is_suspended: bool
    onboarding_completed: bool
    created_at: datetime


class AccountWithUsersOut(AccountOut):
    users: List[UserOut] = []


# ---------- Inventory ----------
class InventoryCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    category: Optional[str] = "General"
    quantity: float = 0
    unit: Optional[str] = "pcs"
    cost_price: float = 0
    selling_price: float = 0
    reorder_point: float = 5


class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    reorder_point: Optional[float] = None


class InventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    sku: Optional[str]
    category: str
    quantity: float
    unit: str
    cost_price: float
    selling_price: float
    reorder_point: float
    created_at: datetime
    updated_at: datetime


# ---------- Sales ----------
class SaleCreate(BaseModel):
    item_id: Optional[int] = None
    item_name: Optional[str] = None
    quantity: float = 1
    unit_price: Optional[float] = None
    payment_mode: PaymentMode = PaymentMode.cash
    customer_name: Optional[str] = "Walk-in"


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: Optional[int]
    item_name: str
    quantity: float
    unit_price: float
    cost_price_at_sale: Optional[float] = None
    total: float
    payment_mode: PaymentMode
    customer_name: str
    sold_by: str
    receipt_no: str
    created_at: datetime


class CheckoutLine(BaseModel):
    item_id: int
    quantity: float
    unit_price: Optional[float] = None


class CheckoutRequest(BaseModel):
    lines: List[CheckoutLine]
    payment_mode: PaymentMode = PaymentMode.cash
    customer_name: Optional[str] = "Walk-in"
    customer_phone: Optional[str] = ""
    sale_mode: Optional[str] = "pos"  # "pos" = locked prices, "salesman" = prices editable


class CheckoutResponse(BaseModel):
    receipt_no: str
    sales: List[SaleOut]
    total: float


# ---------- Purchases ----------
class PurchaseCreate(BaseModel):
    item_name: str
    supplier: Optional[str] = ""
    quantity: float = 1
    unit_cost: float = 0


class PurchaseUpdate(BaseModel):
    item_name: Optional[str] = None
    supplier: Optional[str] = None
    quantity: Optional[float] = None
    unit_cost: Optional[float] = None


class PurchaseMultiCreate(BaseModel):
    items: List[PurchaseCreate]


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: Optional[int] = None
    item_name: str
    supplier: str
    quantity: float
    unit_cost: float
    total: float
    created_at: datetime


# ---------- Expenses ----------
class ExpenseCreate(BaseModel):
    category: Optional[str] = "General"
    description: Optional[str] = ""
    amount: float


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: str
    description: str
    amount: float
    created_at: datetime


# ---------- Ledgers ----------
class DebtorCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    total_owed: float = 0
    note: Optional[str] = ""


class CreditorCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    total_owed: float = 0
    note: Optional[str] = ""


class LedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    phone: str
    total_owed: float
    amount_paid: float
    status: LedgerStatus
    note: str
    created_at: datetime


class PaymentRequest(BaseModel):
    amount: float


# ---------- Activity ----------
class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    action: str
    details: str
    created_at: datetime

# ---------- Admin: user profile ----------
class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: str
    role: RoleEnum
    is_active: bool
    is_demo: bool
    created_at: datetime


class AdminPasswordReset(BaseModel):
    new_password: str


# ---------- Invoices & Quotations (shared line-item shape) ----------
class DocumentLineIn(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float = 0


class DocumentLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str
    quantity: float
    unit_price: float
    total: float


class InvoiceCreate(BaseModel):
    customer_name: str = "Walk-in"
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    customer_tin: Optional[str] = ""
    customer_vrn: Optional[str] = ""
    due_date: Optional[datetime] = None
    po_number: Optional[str] = ""
    tax_rate: float = 0
    discount: float = 0
    notes: Optional[str] = ""
    items: List[DocumentLineIn]


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_no: str
    customer_name: str
    customer_phone: str
    customer_address: str
    customer_tin: Optional[str] = ""
    customer_vrn: Optional[str] = ""
    due_date: Optional[datetime] = None
    po_number: Optional[str] = ""
    verify_token: Optional[str] = None
    subtotal: float
    tax_rate: float
    tax_amount: float
    discount: float
    total: float
    notes: str
    status: DocumentStatus
    created_by: str
    created_at: datetime
    items: List[DocumentLineOut] = []


class InvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_tin: Optional[str] = None
    customer_vrn: Optional[str] = None
    due_date: Optional[datetime] = None
    po_number: Optional[str] = None
    tax_rate: Optional[float] = None
    discount: Optional[float] = None
    notes: Optional[str] = None
    items: Optional[List[DocumentLineIn]] = None


class QuotationCreate(BaseModel):
    customer_name: str = "Walk-in"
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    tax_rate: float = 0
    discount: float = 0
    notes: Optional[str] = ""
    valid_days: Optional[int] = 14
    items: List[DocumentLineIn]


class QuotationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    quote_no: str
    customer_name: str
    customer_phone: str
    customer_address: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    discount: float
    total: float
    notes: str
    valid_until: Optional[datetime]
    status: DocumentStatus
    created_by: str
    created_at: datetime
    items: List[DocumentLineOut] = []


class QuotationUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    valid_days: Optional[int] = None
    tax_rate: Optional[float] = None
    discount: Optional[float] = None
    notes: Optional[str] = None
    items: Optional[List[DocumentLineIn]] = None


class ReminderCreate(BaseModel):
    text: str
    due_at: Optional[datetime] = None


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    due_at: Optional[datetime]
    is_done: bool
    created_by: str
    created_at: datetime


# ---------- Community-based informal finance ----------
class CommunityGroupSetup(BaseModel):
    """Steps 1-3 of the community onboarding wizard, submitted together as one
    call once the account exists (mirrors the business onboarding pattern)."""
    name: str
    registration_number: Optional[str] = ""
    group_type: Optional[str] = ""  # cultural label only: VICOBA, Vibati, Chama, etc.
    region: Optional[str] = ""
    district: Optional[str] = ""
    contribution_style: ContributionStyle = ContributionStyle.fixed
    contribution_amount: Optional[float] = None
    currency: Optional[str] = "TZS"
    cycle_frequency: CycleFrequency = CycleFrequency.monthly
    meeting_day: Optional[str] = ""
    rotation_enabled: bool = False
    lending_enabled: bool = False


class CommunityGroupUpdate(BaseModel):
    name: Optional[str] = None
    registration_number: Optional[str] = None
    group_type: Optional[str] = None
    region: Optional[str] = None
    district: Optional[str] = None
    contribution_style: Optional[ContributionStyle] = None
    contribution_amount: Optional[float] = None
    currency: Optional[str] = None
    cycle_frequency: Optional[CycleFrequency] = None
    meeting_day: Optional[str] = None
    rotation_enabled: Optional[bool] = None
    lending_enabled: Optional[bool] = None


class SavingsGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    registration_number: str
    group_type: str
    region: str
    district: str
    contribution_style: ContributionStyle
    contribution_amount: Optional[float]
    currency: str
    cycle_frequency: CycleFrequency
    meeting_day: str
    rotation_enabled: bool
    lending_enabled: bool
    created_at: datetime


class GroupMemberCreate(BaseModel):
    name: str
    age: Optional[int] = None
    phone: Optional[str] = ""
    group_role: str = "member"  # 'chairman' | 'treasurer' | 'secretary' | 'member'
    is_recorder: bool = False


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    age: Optional[int] = None
    phone: str
    group_role: str
    is_recorder: bool
    has_login: bool = False
    joined_at: datetime


class MemberLoginCreate(BaseModel):
    """Recorder creates these directly for a member — no OTP/WhatsApp self-service."""
    username: str
    password: str


class ContributionCreate(BaseModel):
    member_id: int
    cycle_label: str
    amount: float


class ContributionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    member_id: int
    cycle_label: str
    amount: float
    recorded_by: str
    created_at: datetime


class PayoutCreate(BaseModel):
    member_id: int
    cycle_label: str
    amount: float


class PayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    member_id: int
    cycle_label: str
    amount: float
    recorded_by: str
    created_at: datetime


class GroupLoanCreate(BaseModel):
    member_id: int
    principal: float
    interest_rate: float = 0


class GroupLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    member_id: int
    principal: float
    interest_rate: float
    balance: float
    status: GroupLoanStatus
    issued_at: datetime


class GroupLoanRepaymentCreate(BaseModel):
    amount: float


class GroupLoanRepaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    loan_id: int
    amount: float
    created_at: datetime


class CommunitySummary(BaseModel):
    member_count: int
    total_contributions: float
    total_payouts: float
    total_loans_outstanding: float
    rotation_enabled: bool
    lending_enabled: bool


# ---------------------------------------------------------------------------
# Personal spending track
# ---------------------------------------------------------------------------

class SpendingCategoryCreate(BaseModel):
    name: str
    icon: str = ""
    monthly_budget: float = 0


class SpendingCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    icon: str
    monthly_budget: float
    is_default: bool


class SpendingTransactionCreate(BaseModel):
    category_id: int
    amount: float
    note: str = ""
    tag: Optional[str] = None  # "necessary" | "impulse", habit mode only


class SpendingTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    amount: float
    note: str
    tag: Optional[str]
    spent_at: datetime


class EnvelopeCategorySummary(BaseModel):
    category_id: int
    category_name: str
    budget: float
    spent: float
    remaining: float


class EnvelopeSummary(BaseModel):
    categories: List[EnvelopeCategorySummary]
    safe_to_spend_today: float


class HabitSummary(BaseModel):
    this_week_impulse_pct: float
    last_week_impulse_pct: float
    change_vs_last_week: float


class SpendingGroupCreate(BaseModel):
    name: str
    goal_amount: float
    target_date: Optional[datetime] = None


class SpendingGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    goal_amount: float
    target_date: Optional[datetime]
    invite_code: str
    created_at: datetime


class SpendingGroupContributionCreate(BaseModel):
    amount: float


class SpendingGroupProgress(BaseModel):
    total_saved: float
    goal_amount: float
    percent: float
    member_count: int
    members_on_track: int


# ---------------------------------------------------------------------------
# Smart tracking (rule-based, no external AI)
# ---------------------------------------------------------------------------

class CategorySuggestion(BaseModel):
    category_id: Optional[int]
    category_name: Optional[str]
    confidence: str  # "high" | "low" | "none"


class RecurringExpense(BaseModel):
    category_id: int
    category_name: str
    typical_amount: float
    typical_day_of_month: int
    last_seen: datetime
    occurrences: int


class SpendingAlert(BaseModel):
    type: str  # "spike" | "projected_overspend" | "small_leaks"
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    message: str
    severity: str  # "info" | "warning"


class SmartInsights(BaseModel):
    alerts: List[SpendingAlert]
    recurring: List[RecurringExpense]
