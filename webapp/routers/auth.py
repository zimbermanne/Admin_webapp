import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, RoleEnum
from schemas import UserCreate, UserOut, LoginRequest, Token, ChangePasswordRequest
from auth import (
    hash_password, authenticate_user, create_access_token,
    get_current_user, require_admin,
)
from activity import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=payload.username,
        full_name=payload.full_name or "",
        email=payload.email or "",
        hashed_password=hash_password(payload.password),
        role=payload.role or RoleEnum.employee,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, user.username, "register", "New account created")
    return user


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user.username, "role": user.role.value})
    log_activity(db, user.username, "login", "User logged in")
    return Token(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/demo-login", response_model=Token)
def demo_login(db: Session = Depends(get_db)):
    """Instant login as a read-friendly demo account — no credentials required."""
    user = db.query(User).filter(User.username == "demo").first()
    if not user:
        # Lazily create it if init_db hasn't run yet / fresh DB
        user = User(
            username="demo",
            full_name="Demo User",
            email="demo@zimbermanne.co.tz",
            hashed_password=hash_password(uuid.uuid4().hex),  # unguessable, unused
            role=RoleEnum.manager,
            is_demo=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token({"sub": user.username, "role": user.role.value})
    log_activity(db, user.username, "demo_login", "Demo account accessed")
    return Token(access_token=token, user=user)


@router.put("/change-password")
def change_password(
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
    log_activity(db, current_user.username, "change_password", "Password changed")
    return {"detail": "Password updated successfully"}


@router.post("/reset-password/{username}")
def reset_password(
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
    log_activity(db, admin.username, "reset_password", f"Reset password for {username}")
    return {"detail": f"Password reset for {username}"}
