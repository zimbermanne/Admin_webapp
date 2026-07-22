import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User, RoleEnum, Account, AccountType
from schemas import UserCreate, UserOut, LoginRequest, Token, ChangePasswordRequest, AccountCreate
from auth import (
    hash_password, authenticate_user, create_access_token,
    get_current_user, require_admin, require_superadmin, set_auth_cookie, clear_auth_cookie,
)
from activity import log_activity_for_user, log_activity
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
def login(request: Request, response: Response, payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Include account_id in JWT token
    token_data = {"sub": user.username, "role": user.role.value}
    if user.account_id:
        token_data["account_id"] = user.account_id
    
    token = create_access_token(token_data)
    set_auth_cookie(response, token)
    log_activity_for_user(db, user, "login", "User logged in")
    return Token(access_token=token, user=user)


@router.post("/logout")
def logout(response: Response):
    """Clear the httpOnly auth cookie. The frontend also drops any local
    auth state it's holding; this just ensures the browser stops sending
    the cookie on subsequent requests."""
    clear_auth_cookie(response)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/demo-login", response_model=Token)
@limiter.limit("20/hour")
def demo_login(request: Request, response: Response, db: Session = Depends(get_db)):
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
    set_auth_cookie(response, token)
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


IMPERSONATION_MINUTES = 30


@router.post("/impersonate/{user_id}", response_model=Token)
def impersonate(user_id: int, db: Session = Depends(get_db),
                 superadmin: User = Depends(require_superadmin)):
    """Issue a short-lived token that logs in AS the target user — the
    'Login as' support tool. Deliberately narrow:
    - 30 minutes only, regardless of the platform's normal token lifetime.
    - Can't target another superadmin (no lateral platform-access escalation
      via a support tool — a superadmin who needs another superadmin's
      access has a different problem to solve, not this one).
    - Can't target an inactive user (nothing to support there).
    - Always logged to the TARGET account's activity log, not just a
      superadmin-side log — the account owner should be able to see that
      support accessed their account, when, and as whom.
    The token is otherwise indistinguishable from the user's own login token
    (same 'sub'/'role'/'account_id' shape) so it works everywhere in the app
    without special-casing — the short expiry and the audit trail are what
    make this safe, not a different code path at request time.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == RoleEnum.superadmin:
        raise HTTPException(status_code=403, detail="Cannot impersonate a superadmin")
    if not target.is_active:
        raise HTTPException(status_code=400, detail="User is inactive")

    token_data = {"sub": target.username, "role": target.role.value, "impersonated_by": superadmin.username}
    if target.account_id:
        token_data["account_id"] = target.account_id

    token = create_access_token(token_data, expires_minutes=IMPERSONATION_MINUTES)

    log_activity(
        db, username=target.username,
        action="CRITICAL: superadmin_impersonation",
        details=f"{superadmin.username} started a support session as {target.username} "
                f"(expires in {IMPERSONATION_MINUTES} min)",
        account_id=target.account_id,
    )
    return Token(access_token=token, user=target)
