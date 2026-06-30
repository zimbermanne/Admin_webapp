from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from models import RoleEnum, PaymentMode, LedgerStatus


# ---------- Auth / Users ----------
class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = ""
    email: Optional[str] = ""
    role: Optional[RoleEnum] = RoleEnum.employee


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: str
    role: RoleEnum
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
    total: float
    payment_mode: PaymentMode
    customer_name: str
    sold_by: str
    receipt_no: str
    created_at: datetime


class CheckoutLine(BaseModel):
    item_id: int
    quantity: float


class CheckoutRequest(BaseModel):
    lines: List[CheckoutLine]
    payment_mode: PaymentMode = PaymentMode.cash
    customer_name: Optional[str] = "Walk-in"
    customer_phone: Optional[str] = ""


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


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
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
