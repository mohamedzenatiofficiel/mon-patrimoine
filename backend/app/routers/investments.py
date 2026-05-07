from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Investment
from ..schemas import InvestmentCreate, InvestmentOut
from typing import List

router = APIRouter(prefix="/api/investments", tags=["investments"])

@router.get("", response_model=List[InvestmentOut])
def list_investments(db: Session = Depends(get_db)):
    return db.query(Investment).all()

@router.post("", response_model=InvestmentOut)
def create_investment(data: InvestmentCreate, db: Session = Depends(get_db)):
    inv = Investment(**data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv

@router.put("/{inv_id}", response_model=InvestmentOut)
def update_investment(inv_id: int, data: InvestmentCreate, db: Session = Depends(get_db)):
    inv = db.query(Investment).filter(Investment.id == inv_id).first()
    if not inv:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return inv

@router.delete("/{inv_id}")
def delete_investment(inv_id: int, db: Session = Depends(get_db)):
    inv = db.query(Investment).filter(Investment.id == inv_id).first()
    if not inv:
        raise HTTPException(404)
    db.delete(inv)
    db.commit()
    return {"ok": True}
