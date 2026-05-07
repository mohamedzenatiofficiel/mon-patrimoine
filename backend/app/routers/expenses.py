import calendar as cal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract, or_
from ..database import get_db
from ..models import Expense
from ..schemas import ExpenseCreate, ExpenseOut
from typing import List, Optional

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

def _make_virtual(exp: Expense, year: int, month: int) -> dict:
    day = exp.recurring_day if exp.recurring_day else exp.date.day
    max_day = cal.monthrange(year, month)[1]
    occ_date = date(year, month, min(day, max_day))
    return {
        "id": None,
        "category": exp.category,
        "amount": exp.amount,
        "date": occ_date,
        "description": exp.description,
        "is_recurring": True,
        "recurring_day": exp.recurring_day,
        "created_at": None,
        "is_virtual": True,
        "source_id": exp.id,
    }

@router.get("", response_model=List[ExpenseOut])
def list_expenses(
    year:  Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(Expense)
    if year:  q = q.filter(extract("year",  Expense.date) == year)
    if month: q = q.filter(extract("month", Expense.date) == month)
    results: list = list(q.order_by(Expense.date.desc()).all())

    if year and month:
        recurring_q = db.query(Expense).filter(
            Expense.is_recurring == True,
            or_(
                extract("year", Expense.date) < year,
                and_(
                    extract("year", Expense.date) == year,
                    extract("month", Expense.date) < month,
                )
            )
        )
        for exp in recurring_q.all():
            results.append(_make_virtual(exp, year, month))

    results.sort(
        key=lambda e: e["date"] if isinstance(e, dict) else e.date,
        reverse=True,
    )
    return results

@router.post("", response_model=ExpenseOut)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    data_dict = data.model_dump()
    if data_dict["is_recurring"]:
        data_dict["recurring_day"] = data.date.day
    exp = Expense(**data_dict)
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp

@router.put("/{exp_id}", response_model=ExpenseOut)
def update_expense(exp_id: int, data: ExpenseCreate, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == exp_id).first()
    if not exp:
        raise HTTPException(404)
    data_dict = data.model_dump()
    if data_dict["is_recurring"]:
        data_dict["recurring_day"] = data.date.day
    else:
        data_dict["recurring_day"] = None
    for k, v in data_dict.items():
        setattr(exp, k, v)
    db.commit()
    db.refresh(exp)
    return exp

@router.delete("/{exp_id}")
def delete_expense(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == exp_id).first()
    if not exp:
        raise HTTPException(404)
    db.delete(exp)
    db.commit()
    return {"ok": True}
