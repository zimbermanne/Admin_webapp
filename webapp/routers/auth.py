import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import User, RoleEnum, Account, AccountType
from schemas import UserCreate, UserOut, LoginRequest, Token, ChangePasswordRequest, AccountCreate
from auth import (
    hash_password, authenticate_user, create_access_token,
    get_current_user, require_admin,
)
from activity import log_activity_for_user
from rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
@limiter.limit("10/hour")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    account_type = payload.account_type or AccountType.business

    if account_type == AccountType.community:
        # Community groups skip the business fields entirely — the community
        # onboarding wizard (POST /api/community/setup) fills in the group's
        # own details afterwards.
        account = Account(
            account_type=AccountType.community,
            name=f"{payload.full_name or payload.username}'s Group",
            owner_full_name=payload.full_name or payload.username,
            email=payload.email or "",
            onboarding_completed=False,
        )
    elif account_type == AccountType.personal:
        # Personal spending accounts have no business/community setup wizard —
        # categories and budgets are created on the fly from the dashboard, so
        # these go straight through onboarding.
        account = Account(
            account_type=AccountType.personal,
            name=f"{payload.full_name or payload.username}'s Personal Account",
            owner_full_name=payload.full_name or payload.username,
            email=payload.email or "",
            onboarding_completed=True,
        )
    else:
        # Create a new account for self-service registration. It starts
        # un-onboarded so the new admin is walked through the setup wizard
        # (business basics, branding, tax/invoicing defaults) before landing
        # on the dashboard.
        account = Account(
            account_type=AccountType.business,
            name=f"{payload.full_name}'s Business",
            owner_full_name=payload.full_name or payload.username,
            business_type="retail",
            email=payload.email or "",
            onboarding_completed=False,
        )
    db.add(account)
    db.commit()
    db.refresh(account)

    user = User(
        username=payload.username,
        full_name=payload.full_name or "",
        email=payload.email or "",
        hashed_password=hash_password(payload.password),
        role=RoleEnum.admin,  # The person who creates an account is its admin/treasurer
        account_id=account.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity_for_user(db, user, "register", f"New {account_type.value} account created: {account.name}")
    return user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Include account_id in JWT token
    token_data = {"sub": user.username, "role": user.role.value}
    if user.account_id:
        token_data["account_id"] = user.account_id
    
    token = create_access_token(token_data)
    log_activity_for_user(db, user, "login", "User logged in")
    return Token(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/demo-login", response_model=Token)
@limiter.limit("20/hour")
def demo_login(request: Request, db: Session = Depends(get_db)):
    """Instant login as a read-friendly demo account — no credentials required."""
    user = db.query(User).filter(User.username == "demo").first()
    if not user:
        # Lazily create it if init_db hasn't run yet / fresh DB
        # Create a demo account first
        demo_account = Account(
            name="Demo Business",
            owner_full_name="Demo Owner",
            business_type="retail",
            email="demo@moneytracer.africa",
            phone="+255123456789",
            onboarding_completed=True,  # demo skips the wizard
        )
        db.add(demo_account)
        db.commit()
        db.refresh(demo_account)
        
        user = User(
            username="demo",
            full_name="Demo User",
            email="demo@moneytracer.africa",
            hashed_password=hash_password(uuid.uuid4().hex),  # unguessable, unused
            role=RoleEnum.manager,
            is_demo=True,
            account_id=demo_account.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    token_data = {"sub": user.username, "role": user.role.value}
    if user.account_id:
        token_data["account_id"] = user.account_id
    
    token = create_access_token(token_data)
    log_activity_for_user(db, user, "demo_login", "Demo account accessed")
    return Token(access_token=token, user=user)


@router.put("/change-password")
@limiter.limit("10/minute")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from auth import verify_password
    if current_user.is_demo:
        raise HTTPException(status_code=403, detail="The demo account's password cannot be changed")
    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    log_activity_for_user(db, current_user, "change_password", "Password changed")
    return {"detail": "Password updated successfully"}


@router.post("/reset-password/{username}")
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    username: str,
    new_password: str = "changeme123",
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(new_password)
    db.commit()
    log_activity_for_user(db, admin, "reset_password", f"Reset password for {username}")
    return {"detail": f"Password reset for {username}"}
