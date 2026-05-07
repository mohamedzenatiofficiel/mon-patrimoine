from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import MonthlyIncome
from ..schemas import MonthlyIncomeCreate, MonthlyIncomeOut

router = APIRouter(prefix="/api/income", tags=["income"])


@router.get("", response_model=MonthlyIncomeOut | None)
def get_income(year: int, month: int, db: Session = Depends(get_db)):
    record = db.query(MonthlyIncome).filter(
        MonthlyIncome.year == year,
        MonthlyIncome.month == month,
    ).first()
    return record


@router.post("", response_model=MonthlyIncomeOut)
def upsert_income(data: MonthlyIncomeCreate, db: Session = Depends(get_db)):
    existing = db.query(MonthlyIncome).filter(
        MonthlyIncome.year == data.year,
        MonthlyIncome.month == data.month,
    ).first()
    if existing:
        existing.amount = data.amount
        existing.savings_target = data.savings_target if data.savings_target is not None else existing.savings_target
        db.commit()
        db.refresh(existing)
        return existing
    record = MonthlyIncome(
        year=data.year,
        month=data.month,
        amount=data.amount,
        savings_target=data.savings_target or 30.0,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{income_id}")
def delete_income(income_id: int, db: Session = Depends(get_db)):
    record = db.query(MonthlyIncome).filter(MonthlyIncome.id == income_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Income record not found")
    db.delete(record)
    db.commit()
    return {"ok": True}
