import calendar as cal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract, or_
from ..database import get_db
from ..models import Budget, Expense
from ..schemas import BudgetCreate, BudgetOut, BudgetStatus

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    return db.query(Budget).order_by(Budget.category).all()


@router.post("", response_model=BudgetOut)
def upsert_budget(data: BudgetCreate, db: Session = Depends(get_db)):
    existing = db.query(Budget).filter(Budget.category == data.category).first()
    if existing:
        existing.monthly_limit = data.monthly_limit
        db.commit()
        db.refresh(existing)
        return existing
    budget = Budget(category=data.category, monthly_limit=data.monthly_limit)
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.put("/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: int, data: BudgetCreate, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    budget.category = data.category
    budget.monthly_limit = data.monthly_limit
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
    return {"ok": True}


@router.get("/status", response_model=list[BudgetStatus])
def budget_status(year: int, month: int, db: Session = Depends(get_db)):
    from datetime import date
    budgets = db.query(Budget).all()
    if not budgets:
        return []

    month_start = date(year, month, 1)
    month_end = date(year, month, cal.monthrange(year, month)[1])

    real_exps = db.query(Expense).filter(
        Expense.date >= month_start,
        Expense.date <= month_end,
    ).all()

    # Add virtual recurring occurrences from previous months
    recurring_prev = db.query(Expense).filter(
        Expense.is_recurring == True,
        or_(
            extract("year", Expense.date) < year,
            and_(
                extract("year", Expense.date) == year,
                extract("month", Expense.date) < month,
            )
        )
    ).all()

    cat_spent: dict[str, float] = {}
    for exp in real_exps:
        cat_spent[exp.category] = cat_spent.get(exp.category, 0) + exp.amount
    for exp in recurring_prev:
        cat_spent[exp.category] = cat_spent.get(exp.category, 0) + exp.amount

    result = []
    for b in budgets:
        spent = round(cat_spent.get(b.category, 0.0), 2)
        percent = round((spent / b.monthly_limit) * 100, 1) if b.monthly_limit > 0 else 0.0
        result.append(BudgetStatus(
            category=b.category,
            monthly_limit=b.monthly_limit,
            spent=spent,
            percent=percent,
            budget_id=b.id,
        ))

    return result
