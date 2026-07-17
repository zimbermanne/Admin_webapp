from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, RoleEnum, Account, AccountType, SavingsGroup, GroupMember,
    Contribution, Payout, GroupLoan, GroupLoanRepayment, GroupLoanStatus,
)
from schemas import (
    CommunityGroupSetup, CommunityGroupUpdate, SavingsGroupOut,
    GroupMemberCreate, GroupMemberOut, MemberLoginCreate,
    ContributionCreate, ContributionOut, PayoutCreate, PayoutOut,
    GroupLoanCreate, GroupLoanOut, GroupLoanRepaymentCreate, GroupLoanRepaymentOut,
    CommunitySummary,
)
from auth import get_current_user, require_admin, require_manager_up, hash_password
from activity import log_activity_for_user

router = APIRouter(prefix="/api/community", tags=["community"])

# Admin or a co-recorder (manager role) can record entries; plain "member" logins are read-only.
require_recorder = require_manager_up


def _member_out(m: GroupMember) -> GroupMemberOut:
    return GroupMemberOut(
        id=m.id, name=m.name, age=m.age, phone=m.phone, group_role=m.group_role,
        is_recorder=m.is_recorder, has_login=m.user_id is not None, joined_at=m.joined_at,
    )


def _get_group(db: Session, account_id: Optional[int]) -> SavingsGroup:
    if not account_id:
        raise HTTPException(status_code=400, detail="User is not associated with an account")
    group = db.query(SavingsGroup).filter(SavingsGroup.account_id == account_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="No savings group set up yet — call POST /api/community/setup first")
    return group


def _get_own_member(db: Session, group: SavingsGroup, current_user: User) -> Optional[GroupMember]:
    return db.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_id == current_user.id
    ).first()


def _assert_can_see_all(current_user: User):
    if current_user.role == RoleEnum.member:
        raise HTTPException(status_code=403, detail="Members can only view their own records")


# ---------- Setup (onboarding wizard, steps 1-3) ----------
@router.post("/setup", response_model=SavingsGroupOut)
def setup_group(payload: CommunityGroupSetup, db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)):
    account = db.query(Account).filter(Account.id == admin.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.account_type != AccountType.community:
        raise HTTPException(status_code=400, detail="This account is not a community account")
    if db.query(SavingsGroup).filter(SavingsGroup.account_id == account.id).first():
        raise HTTPException(status_code=400, detail="This account already has a savings group set up")

    group = SavingsGroup(account_id=account.id, **payload.model_dump())
    db.add(group)
    db.flush()

    # The registering admin is automatically the group's first recorder/member.
    recorder = GroupMember(group_id=group.id, user_id=admin.id, name=admin.full_name or admin.username,
                            phone="", group_role="chairman", is_recorder=True)
    db.add(recorder)

    account.name = group.name
    db.commit()
    db.refresh(group)
    log_activity_for_user(db, admin, "community_setup", f"Set up savings group {group.name}")
    return group


@router.get("/group", response_model=SavingsGroupOut)
def get_group(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_group(db, current_user.account_id)


@router.put("/group", response_model=SavingsGroupOut)
def update_group(payload: CommunityGroupUpdate, db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)):
    group = _get_group(db, admin.account_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    log_activity_for_user(db, admin, "community_group_update", f"Updated group settings for {group.name}")
    return group


# ---------- Members (step 4, skippable at onboarding, ongoing after) ----------
@router.get("/members", response_model=List[GroupMemberOut])
def list_members(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = _get_group(db, current_user.account_id)
    members = db.query(GroupMember).filter(GroupMember.group_id == group.id).order_by(GroupMember.joined_at).all()
    return [_member_out(m) for m in members]


@router.post("/members", response_model=GroupMemberOut)
def add_member(payload: GroupMemberCreate, db: Session = Depends(get_db),
                current_user: User = Depends(require_recorder)):
    group = _get_group(db, current_user.account_id)
    member = GroupMember(group_id=group.id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    log_activity_for_user(db, current_user, "community_member_add", f"Added member {member.name}")
    return _member_out(member)


@router.post("/members/{member_id}/login")
def create_member_login(member_id: int, payload: MemberLoginCreate, db: Session = Depends(get_db),
                         admin: User = Depends(require_admin)):
    """Gives a member read-only in-app access to their own records. Created directly
    by the recorder/admin — no OTP or WhatsApp verification for now."""
    group = _get_group(db, admin.account_id)
    member = db.query(GroupMember).filter(GroupMember.id == member_id, GroupMember.group_id == group.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.user_id:
        raise HTTPException(status_code=400, detail="This member already has a login")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=payload.username,
        full_name=member.name,
        hashed_password=hash_password(payload.password),
        role=RoleEnum.member,
        account_id=admin.account_id,
    )
    db.add(user)
    db.flush()
    member.user_id = user.id
    db.commit()
    log_activity_for_user(db, admin, "community_member_login_create", f"Created login for {member.name}")
    return {"detail": f"Login created for {member.name}"}


@router.delete("/members/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    group = _get_group(db, admin.account_id)
    member = db.query(GroupMember).filter(GroupMember.id == member_id, GroupMember.group_id == group.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
    log_activity_for_user(db, admin, "community_member_delete", f"Removed member {member.name}")
    return {"detail": "Member removed"}


# ---------- Contributions ----------
@router.get("/contributions", response_model=List[ContributionOut])
def list_contributions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = _get_group(db, current_user.account_id)
    query = db.query(Contribution).filter(Contribution.group_id == group.id)
    if current_user.role == RoleEnum.member:
        own = _get_own_member(db, group, current_user)
        if not own:
            raise HTTPException(status_code=403, detail="No member record linked to this login")
        query = query.filter(Contribution.member_id == own.id)
    return query.order_by(Contribution.created_at.desc()).all()


@router.post("/contributions", response_model=ContributionOut)
def add_contribution(payload: ContributionCreate, db: Session = Depends(get_db),
                      current_user: User = Depends(require_recorder)):
    group = _get_group(db, current_user.account_id)
    member = db.query(GroupMember).filter(GroupMember.id == payload.member_id, GroupMember.group_id == group.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    contribution = Contribution(group_id=group.id, recorded_by=current_user.username, **payload.model_dump())
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    log_activity_for_user(db, current_user, "community_contribution", f"{member.name} contributed {payload.amount}")
    return contribution


# ---------- Payouts (rotating pot — only when rotation_enabled) ----------
@router.get("/payouts", response_model=List[PayoutOut])
def list_payouts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = _get_group(db, current_user.account_id)
    query = db.query(Payout).filter(Payout.group_id == group.id)
    if current_user.role == RoleEnum.member:
        own = _get_own_member(db, group, current_user)
        if not own:
            raise HTTPException(status_code=403, detail="No member record linked to this login")
        query = query.filter(Payout.member_id == own.id)
    return query.order_by(Payout.created_at.desc()).all()


@router.post("/payouts", response_model=PayoutOut)
def add_payout(payload: PayoutCreate, db: Session = Depends(get_db),
               current_user: User = Depends(require_recorder)):
    group = _get_group(db, current_user.account_id)
    if not group.rotation_enabled:
        raise HTTPException(status_code=400, detail="This group does not have pot rotation enabled")
    member = db.query(GroupMember).filter(GroupMember.id == payload.member_id, GroupMember.group_id == group.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    payout = Payout(group_id=group.id, recorded_by=current_user.username, **payload.model_dump())
    db.add(payout)
    db.commit()
    db.refresh(payout)
    log_activity_for_user(db, current_user, "community_payout", f"{member.name} received payout {payload.amount}")
    return payout


# ---------- Group loans (internal lending — only when lending_enabled) ----------
@router.get("/loans", response_model=List[GroupLoanOut])
def list_loans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = _get_group(db, current_user.account_id)
    query = db.query(GroupLoan).filter(GroupLoan.group_id == group.id)
    if current_user.role == RoleEnum.member:
        own = _get_own_member(db, group, current_user)
        if not own:
            raise HTTPException(status_code=403, detail="No member record linked to this login")
        query = query.filter(GroupLoan.member_id == own.id)
    return query.order_by(GroupLoan.issued_at.desc()).all()


@router.post("/loans", response_model=GroupLoanOut)
def issue_loan(payload: GroupLoanCreate, db: Session = Depends(get_db),
               current_user: User = Depends(require_recorder)):
    group = _get_group(db, current_user.account_id)
    if not group.lending_enabled:
        raise HTTPException(status_code=400, detail="This group does not have internal lending enabled")
    member = db.query(GroupMember).filter(GroupMember.id == payload.member_id, GroupMember.group_id == group.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    # Flat-rate interest applied once at issuance — the simplest model for v1.
    balance = payload.principal * (1 + payload.interest_rate / 100)
    loan = GroupLoan(group_id=group.id, member_id=payload.member_id, principal=payload.principal,
                      interest_rate=payload.interest_rate, balance=balance)
    db.add(loan)
    db.commit()
    db.refresh(loan)
    log_activity_for_user(db, current_user, "community_loan_issue", f"Loan of {payload.principal} issued to {member.name}")
    return loan


@router.post("/loans/{loan_id}/repay", response_model=GroupLoanOut)
def repay_loan(loan_id: int, payload: GroupLoanRepaymentCreate, db: Session = Depends(get_db),
               current_user: User = Depends(require_recorder)):
    group = _get_group(db, current_user.account_id)
    loan = db.query(GroupLoan).filter(GroupLoan.id == loan_id, GroupLoan.group_id == group.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    repayment = GroupLoanRepayment(loan_id=loan.id, amount=payload.amount)
    db.add(repayment)
    loan.balance = max(0.0, loan.balance - payload.amount)
    if loan.balance <= 0:
        loan.status = GroupLoanStatus.paid
    db.commit()
    db.refresh(loan)
    log_activity_for_user(db, current_user, "community_loan_repay", f"Repayment of {payload.amount} on loan #{loan.id}")
    return loan


@router.get("/loans/{loan_id}/repayments", response_model=List[GroupLoanRepaymentOut])
def list_repayments(loan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = _get_group(db, current_user.account_id)
    loan = db.query(GroupLoan).filter(GroupLoan.id == loan_id, GroupLoan.group_id == group.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if current_user.role == RoleEnum.member:
        own = _get_own_member(db, group, current_user)
        if not own or own.id != loan.member_id:
            raise HTTPException(status_code=403, detail="You can only view your own loan repayments")
    return db.query(GroupLoanRepayment).filter(GroupLoanRepayment.loan_id == loan_id).order_by(
        GroupLoanRepayment.created_at.desc()
    ).all()


# ---------- Summary ----------
@router.get("/summary", response_model=CommunitySummary)
def community_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_can_see_all(current_user)
    group = _get_group(db, current_user.account_id)
    member_count = db.query(GroupMember).filter(GroupMember.group_id == group.id).count()
    total_contributions = sum(c.amount for c in db.query(Contribution).filter(Contribution.group_id == group.id).all())
    total_payouts = sum(p.amount for p in db.query(Payout).filter(Payout.group_id == group.id).all())
    total_outstanding = sum(
        l.balance for l in db.query(GroupLoan).filter(
            GroupLoan.group_id == group.id, GroupLoan.status == GroupLoanStatus.active
        ).all()
    )
    return CommunitySummary(
        member_count=member_count,
        total_contributions=round(total_contributions, 2),
        total_payouts=round(total_payouts, 2),
        total_loans_outstanding=round(total_outstanding, 2),
        rotation_enabled=group.rotation_enabled,
        lending_enabled=group.lending_enabled,
    )
