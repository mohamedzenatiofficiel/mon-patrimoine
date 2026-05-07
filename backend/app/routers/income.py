from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Income
from ..schemas import IncomeCreate, IncomeUpdate, IncomeOut
from typing import List

router = APIRouter(prefix="/api/income", tags=["income"])


@router.get("/", response_model=List[IncomeOut])
def list_income(db: Session = Depends(get_db)):
    return db.query(Income).all()

@router.post("/", response_model=IncomeOut, status_code=201)
def create_income(body: IncomeCreate, db: Session = Depends(get_db)):
    entry = Income(**body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

@router.put("/{income_id}", response_model=IncomeOut)
def update_income(income_id: int, body: IncomeUpdate, db: Session = Depends(get_db)):
    entry = db.query(Income).filter(Income.id == income_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Income not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, val)
    db.commit()
    db.refresh(entry)
    return entry

@router.delete("/{income_id}", status_code=204)
def delete_income(income_id: int, db: Session = Depends(get_db)):
    entry = db.query(Income).filter(Income.id == income_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Income not found")
    db.delete(entry)
    db.commit()
