from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract
from ..database import get_db
from ..models import Expense
from ..schemas import ExpenseCreate, ExpenseOut
from typing import List, Optional

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

@router.get("", response_model=List[ExpenseOut])
def list_expenses(
    year:  Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(Expense)
    if year:  q = q.filter(extract("year",  Expense.date) == year)
    if month: q = q.filter(extract("month", Expense.date) == month)
    return q.order_by(Expense.date.desc()).all()

@router.post("", response_model=ExpenseOut)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    exp = Expense(**data.model_dump())
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp

@router.put("/{exp_id}", response_model=ExpenseOut)
def update_expense(exp_id: int, data: ExpenseCreate, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == exp_id).first()
    if not exp:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
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
