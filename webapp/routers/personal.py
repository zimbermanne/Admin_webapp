import calendar
import secrets
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional

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
    CategorySuggestion, RecurringExpense, SpendingAlert, SmartInsights,
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


# ---------- Auto-categorization ----------

@router.get("/categories/suggest", response_model=CategorySuggestion)
def suggest_category(note: str = "", amount: float = 0,
                      db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    """Suggest a category for a new expense based on the user's own past entries —
    no external AI, just matching against their own history (the best predictor
    of their own habits)."""
    past = db.query(SpendingTransaction).filter(
        SpendingTransaction.account_id == user.account_id,
    ).order_by(SpendingTransaction.spent_at.desc()).limit(500).all()

    if not past:
        return CategorySuggestion(category_id=None, category_name=None, confidence="none")

    note_clean = note.strip().lower()

    # 1. High confidence: an earlier expense had the same (non-empty) note text.
    if note_clean:
        matches = [t for t in past if t.note and t.note.strip().lower() == note_clean]
        if matches:
            best = _most_common_category(matches)
            if best:
                return CategorySuggestion(category_id=best.id, category_name=best.name, confidence="high")

    # 2. Low confidence: past expenses within ±20% of this amount.
    if amount > 0:
        band_matches = [t for t in past if t.amount and abs(t.amount - amount) / t.amount <= 0.2]
        if band_matches:
            best = _most_common_category(band_matches)
            if best:
                return CategorySuggestion(category_id=best.id, category_name=best.name, confidence="low")

    return CategorySuggestion(category_id=None, category_name=None, confidence="none")


def _most_common_category(txns: List[SpendingTransaction]) -> Optional[SpendingCategory]:
    counts: dict = defaultdict(int)
    for t in txns:
        counts[t.category_id] += 1
    if not counts:
        return None
    best_id = max(counts, key=counts.get)
    return next((t.category for t in txns if t.category_id == best_id), None)


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


# ---------------------------------------------------------------------------
# Smart tracking — all rule-based (rolling averages, date-gap grouping,
# simple thresholds). No external AI calls, no ongoing API cost.
# ---------------------------------------------------------------------------

SMALL_SPEND_THRESHOLD = 5000  # TZS — "leak" spending: small, frequent purchases
SPIKE_MULTIPLIER = 1.5        # this week vs trailing 4-week average
RECURRING_MIN_OCCURRENCES = 3
RECURRING_DAY_TOLERANCE = 4   # days either side of the typical day-of-month
RECURRING_AMOUNT_TOLERANCE = 0.15  # ±15%


def _detect_recurring(db: Session, account_id: int) -> List[RecurringExpense]:
    """Same category + similar amount + similar day-of-month, repeating across
    at least 3 separate months → flagged as a likely recurring expense
    (rent, subscriptions, school fees, etc.)."""
    cutoff = datetime.utcnow() - timedelta(days=180)
    txns = db.query(SpendingTransaction).filter(
        SpendingTransaction.account_id == account_id,
        SpendingTransaction.spent_at >= cutoff,
    ).order_by(SpendingTransaction.spent_at.asc()).all()

    by_category: dict = defaultdict(list)
    for t in txns:
        by_category[t.category_id].append(t)

    results = []
    for category_id, cat_txns in by_category.items():
        if len(cat_txns) < RECURRING_MIN_OCCURRENCES:
            continue

        # Cluster by similar amount within this category.
        clusters: List[List[SpendingTransaction]] = []
        for t in cat_txns:
            placed = False
            for cluster in clusters:
                avg = sum(c.amount for c in cluster) / len(cluster)
                if avg and abs(t.amount - avg) / avg <= RECURRING_AMOUNT_TOLERANCE:
                    cluster.append(t)
                    placed = True
                    break
            if not placed:
                clusters.append([t])

        for cluster in clusters:
            if len(cluster) < RECURRING_MIN_OCCURRENCES:
                continue
            months = {(t.spent_at.year, t.spent_at.month) for t in cluster}
            if len(months) < RECURRING_MIN_OCCURRENCES:
                continue  # must span separate months, not just one busy month
            days = [t.spent_at.day for t in cluster]
            typical_day = round(sum(days) / len(days))
            if max(days) - min(days) > RECURRING_DAY_TOLERANCE * 2:
                continue  # too spread out across the month to be "recurring on a date"

            last = max(cluster, key=lambda t: t.spent_at)
            results.append(RecurringExpense(
                category_id=category_id,
                category_name=last.category.name if last.category else "",
                typical_amount=sum(c.amount for c in cluster) / len(cluster),
                typical_day_of_month=typical_day,
                last_seen=last.spent_at,
                occurrences=len(cluster),
            ))

    return results


def _detect_spikes(db: Session, account_id: int) -> List[SpendingAlert]:
    """This week's spend per category vs. the trailing 4-week average for that category."""
    today = datetime.utcnow()
    start_of_week = (today - timedelta(days=today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    trailing_start = start_of_week - timedelta(weeks=4)

    categories = db.query(SpendingCategory).filter(SpendingCategory.account_id == account_id).all()
    alerts = []
    for cat in categories:
        this_week_total = sum(
            t.amount for t in db.query(SpendingTransaction).filter(
                SpendingTransaction.category_id == cat.id,
                SpendingTransaction.spent_at >= start_of_week,
            ).all()
        )
        trailing_txns = db.query(SpendingTransaction).filter(
            SpendingTransaction.category_id == cat.id,
            SpendingTransaction.spent_at >= trailing_start,
            SpendingTransaction.spent_at < start_of_week,
        ).all()
        trailing_total = sum(t.amount for t in trailing_txns)
        weekly_avg = trailing_total / 4 if trailing_txns else 0

        if weekly_avg > 0 and this_week_total > weekly_avg * SPIKE_MULTIPLIER:
            pct_over = round((this_week_total / weekly_avg - 1) * 100)
            alerts.append(SpendingAlert(
                type="spike", category_id=cat.id, category_name=cat.name,
                message=f"Your {cat.name} spending this week is {pct_over}% higher than your usual weekly average.",
                severity="warning",
            ))
    return alerts


def _detect_small_leaks(db: Session, account_id: int) -> List[SpendingAlert]:
    """Small, frequent purchases (airtime, snacks, boda-boda) that are easy to
    miss individually but add up meaningfully over a month."""
    month_start, _ = _month_bounds(datetime.utcnow())
    small_txns = db.query(SpendingTransaction).filter(
        SpendingTransaction.account_id == account_id,
        SpendingTransaction.spent_at >= month_start,
        SpendingTransaction.amount < SMALL_SPEND_THRESHOLD,
    ).all()

    if len(small_txns) < 5:
        return []

    total = sum(t.amount for t in small_txns)
    return [SpendingAlert(
        type="small_leaks",
        message=(
            f"You've made {len(small_txns)} small purchases (under TZS {SMALL_SPEND_THRESHOLD:,.0f} each) "
            f"this month, totaling TZS {total:,.0f}."
        ),
        severity="info",
    )]


def _detect_projected_overspend(db: Session, account_id: int) -> List[SpendingAlert]:
    """If spending continues at this month's daily pace, will any category budget be blown before month-end?"""
    today = datetime.utcnow()
    month_start, last_day = _month_bounds(today)
    days_elapsed = max(today.day, 1)

    categories = db.query(SpendingCategory).filter(
        SpendingCategory.account_id == account_id,
        SpendingCategory.monthly_budget > 0,
    ).all()

    alerts = []
    for cat in categories:
        spent = sum(
            t.amount for t in db.query(SpendingTransaction).filter(
                SpendingTransaction.category_id == cat.id,
                SpendingTransaction.spent_at >= month_start,
            ).all()
        )
        projected = spent / days_elapsed * last_day
        if projected > cat.monthly_budget:
            overshoot = projected - cat.monthly_budget
            alerts.append(SpendingAlert(
                type="projected_overspend", category_id=cat.id, category_name=cat.name,
                message=(
                    f"At this rate, you're on track to go over your {cat.name} budget by about "
                    f"TZS {overshoot:,.0f} before month end."
                ),
                severity="warning",
            ))
    return alerts


@router.get("/dashboard/insights", response_model=SmartInsights)
def smart_insights(db: Session = Depends(get_db), user: User = Depends(require_account_user)):
    alerts = (
        _detect_spikes(db, user.account_id)
        + _detect_projected_overspend(db, user.account_id)
        + _detect_small_leaks(db, user.account_id)
    )
    recurring = _detect_recurring(db, user.account_id)
    return SmartInsights(alerts=alerts, recurring=recurring)
