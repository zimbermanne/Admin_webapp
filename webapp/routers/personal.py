import calendar
import secrets
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, SpendingCategory, SpendingTransaction, SpendingGroup,
    SpendingGroupMember, SpendingGroupContribution,
)
from schemas import (
    SpendingCategoryCreate, SpendingCategoryOut,
    SpendingTransactionCreate, SpendingTransactionOut,
    EnvelopeSummary, EnvelopeCategorySummary, HabitSummary,
    SpendingGroupCreate, SpendingGroupOut, SpendingGroupContributionCreate,
    SpendingGroupProgress,
)
from auth import require_account_user
from activity import log_activity_for_user

router = APIRouter(prefix="/api/personal", tags=["personal"])


# ---------- Categories ----------

@router.get("/categories", response_model=List[SpendingCategoryOut])
def list_categories(db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    return db.query(SpendingCategory).filter(
        SpendingCategory.account_id == user.account_id
    ).all()


@router.post("/categories", response_model=SpendingCategoryOut)
def create_category(payload: SpendingCategoryCreate, db: Session = Depends(get_db),
                     user: User = Depends(require_account_user)):
    category = SpendingCategory(account_id=user.account_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


# ---------- Transactions ----------

@router.post("/transactions", response_model=SpendingTransactionOut)
def log_transaction(payload: SpendingTransactionCreate, db: Session = Depends(get_db),
                     user: User = Depends(require_account_user)):
    category = db.query(SpendingCategory).filter(
        SpendingCategory.id == payload.category_id,
        SpendingCategory.account_id == user.account_id,
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    txn = SpendingTransaction(account_id=user.account_id, **payload.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    log_activity_for_user(db, user, "Logged expense", f"TZS {payload.amount:,.0f} — {category.name}")
    return txn


@router.get("/transactions", response_model=List[SpendingTransactionOut])
def list_transactions(db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    return db.query(SpendingTransaction).filter(
        SpendingTransaction.account_id == user.account_id
    ).order_by(SpendingTransaction.spent_at.desc()).all()


# ---------- Envelope dashboard ----------

def _month_bounds(today: datetime):
    start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_day = calendar.monthrange(today.year, today.month)[1]
    return start, last_day


@router.get("/dashboard/envelope", response_model=EnvelopeSummary)
def envelope_dashboard(db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    today = datetime.utcnow()
    month_start, last_day = _month_bounds(today)
    days_left = last_day - today.day + 1

    categories = db.query(SpendingCategory).filter(
        SpendingCategory.account_id == user.account_id
    ).all()

    summaries = []
    total_remaining = 0.0
    for cat in categories:
        spent = sum(
            t.amount for t in db.query(SpendingTransaction).filter(
                SpendingTransaction.category_id == cat.id,
                SpendingTransaction.spent_at >= month_start,
            ).all()
        )
        remaining = cat.monthly_budget - spent
        total_remaining += max(remaining, 0)
        summaries.append(EnvelopeCategorySummary(
            category_id=cat.id, category_name=cat.name,
            budget=cat.monthly_budget, spent=spent, remaining=remaining,
        ))

    safe_to_spend_today = total_remaining / days_left if days_left > 0 else total_remaining
    return EnvelopeSummary(categories=summaries, safe_to_spend_today=safe_to_spend_today)


# ---------- Habit dashboard ----------

@router.get("/dashboard/habit", response_model=HabitSummary)
def habit_dashboard(db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    today = datetime.utcnow()
    start_of_week = today - timedelta(days=today.weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_last_week = start_of_week - timedelta(days=7)

    def impulse_pct(since, until=None):
        q = db.query(SpendingTransaction).filter(
            SpendingTransaction.account_id == user.account_id,
            SpendingTransaction.spent_at >= since,
        )
        if until:
            q = q.filter(SpendingTransaction.spent_at < until)
        txns = q.all()
        total = sum(t.amount for t in txns)
        impulse = sum(t.amount for t in txns if t.tag == "impulse")
        return (impulse / total * 100) if total else 0.0

    this_week = impulse_pct(start_of_week)
    last_week = impulse_pct(start_of_last_week, start_of_week)

    return HabitSummary(
        this_week_impulse_pct=this_week,
        last_week_impulse_pct=last_week,
        change_vs_last_week=this_week - last_week,
    )


# ---------- Group savings challenge ----------

@router.post("/groups", response_model=SpendingGroupOut)
def create_group(payload: SpendingGroupCreate, db: Session = Depends(get_db),
                  user: User = Depends(require_account_user)):
    group = SpendingGroup(
        **payload.model_dump(),
        invite_code=secrets.token_hex(4).upper(),
        created_by_account_id=user.account_id,
    )
    db.add(group)
    db.flush()
    db.add(SpendingGroupMember(group_id=group.id, account_id=user.account_id))
    db.commit()
    db.refresh(group)
    return group


@router.post("/groups/{invite_code}/join", response_model=SpendingGroupOut)
def join_group(invite_code: str, db: Session = Depends(get_db),
                user: User = Depends(require_account_user)):
    group = db.query(SpendingGroup).filter(SpendingGroup.invite_code == invite_code).first()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = db.query(SpendingGroupMember).filter(
        SpendingGroupMember.group_id == group.id,
        SpendingGroupMember.account_id == user.account_id,
    ).first()
    if not existing:
        db.add(SpendingGroupMember(group_id=group.id, account_id=user.account_id))
        db.commit()
    return group


@router.post("/groups/{group_id}/contribute")
def contribute_to_group(group_id: int, payload: SpendingGroupContributionCreate,
                         db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    is_member = db.query(SpendingGroupMember).filter(
        SpendingGroupMember.group_id == group_id,
        SpendingGroupMember.account_id == user.account_id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    contribution = SpendingGroupContribution(
        group_id=group_id, account_id=user.account_id, amount=payload.amount,
    )
    db.add(contribution)
    db.commit()
    log_activity_for_user(db, user, "Group contribution", f"TZS {payload.amount:,.0f}")
    return {"status": "ok"}


@router.get("/groups/{group_id}/progress", response_model=SpendingGroupProgress)
def group_progress(group_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_account_user)):
    group = db.query(SpendingGroup).filter(SpendingGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members = db.query(SpendingGroupMember).filter(SpendingGroupMember.group_id == group_id).all()
    contributions = db.query(SpendingGroupContribution).filter(
        SpendingGroupContribution.group_id == group_id
    ).all()
    total_saved = sum(c.amount for c in contributions)

    per_member_fair_share = (group.goal_amount / len(members)) if members else 0
    on_track = 0
    for m in members:
        member_total = sum(c.amount for c in contributions if c.account_id == m.account_id)
        if member_total >= per_member_fair_share * 0.8:  # within 80% of an even split, counts as on-track
            on_track += 1

    percent = (total_saved / group.goal_amount * 100) if group.goal_amount else 0
    return SpendingGroupProgress(
        total_saved=total_saved, goal_amount=group.goal_amount, percent=percent,
        member_count=len(members), members_on_track=on_track,
    )
