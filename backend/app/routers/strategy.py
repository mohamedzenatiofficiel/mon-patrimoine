from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
from ..database import SessionLocal
from ..models import StrategyGoal, StrategyPhase, Envelope, MonthlyCheck
from ..schemas import (
    StrategyGoalOut, StrategyGoalUpdate,
    StrategyPhaseCreate, StrategyPhaseOut,
    EnvelopeCreate, EnvelopeOut,
    MonthlyCheckOut,
)

router = APIRouter(prefix="/api/strategy", tags=["strategy"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _get_or_create_goal(db: Session) -> StrategyGoal:
    goal = db.query(StrategyGoal).first()
    if not goal:
        goal = StrategyGoal(target_monthly_passive=500.0, target_year=2029, swr=4.0)
        db.add(goal)
        db.commit()
        db.refresh(goal)
    return goal

# ── Goal ────────────────────────────────────────────────────────────
@router.get("/goal", response_model=StrategyGoalOut)
def get_goal(db: Session = Depends(get_db)):
    return _get_or_create_goal(db)

@router.put("/goal", response_model=StrategyGoalOut)
def update_goal(data: StrategyGoalUpdate, db: Session = Depends(get_db)):
    goal = _get_or_create_goal(db)
    goal.target_monthly_passive = data.target_monthly_passive
    goal.target_year = data.target_year
    goal.swr = data.swr
    db.commit()
    db.refresh(goal)
    return goal

# ── Phases ──────────────────────────────────────────────────────────
@router.get("/phases", response_model=List[StrategyPhaseOut])
def get_phases(db: Session = Depends(get_db)):
    return db.query(StrategyPhase).order_by(StrategyPhase.phase_number).all()

@router.post("/phases", response_model=StrategyPhaseOut)
def create_phase(data: StrategyPhaseCreate, db: Session = Depends(get_db)):
    phase = StrategyPhase(**data.dict())
    db.add(phase)
    db.commit()
    db.refresh(phase)
    return phase

@router.put("/phases/{phase_id}", response_model=StrategyPhaseOut)
def update_phase(phase_id: int, data: StrategyPhaseCreate, db: Session = Depends(get_db)):
    phase = db.query(StrategyPhase).filter(StrategyPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(404, "Phase not found")
    for k, v in data.dict().items():
        setattr(phase, k, v)
    db.commit()
    db.refresh(phase)
    return phase

@router.delete("/phases/{phase_id}")
def delete_phase(phase_id: int, db: Session = Depends(get_db)):
    phase = db.query(StrategyPhase).filter(StrategyPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(404)
    db.delete(phase)
    db.commit()
    return {"ok": True}

# ── Envelopes ────────────────────────────────────────────────────────
@router.get("/envelopes", response_model=List[EnvelopeOut])
def get_envelopes(db: Session = Depends(get_db)):
    return db.query(Envelope).order_by(Envelope.sort_order).all()

@router.post("/envelopes", response_model=EnvelopeOut)
def create_envelope(data: EnvelopeCreate, db: Session = Depends(get_db)):
    env = Envelope(**data.dict())
    db.add(env)
    db.commit()
    db.refresh(env)
    return env

@router.put("/envelopes/{env_id}", response_model=EnvelopeOut)
def update_envelope(env_id: int, data: EnvelopeCreate, db: Session = Depends(get_db)):
    env = db.query(Envelope).filter(Envelope.id == env_id).first()
    if not env:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(env, k, v)
    db.commit()
    db.refresh(env)
    return env

@router.delete("/envelopes/{env_id}")
def delete_envelope(env_id: int, db: Session = Depends(get_db)):
    env = db.query(Envelope).filter(Envelope.id == env_id).first()
    if not env:
        raise HTTPException(404)
    db.delete(env)
    db.commit()
    return {"ok": True}

# ── Monthly checks ───────────────────────────────────────────────────
@router.get("/checks", response_model=List[MonthlyCheckOut])
def get_checks(year: int, month: int, db: Session = Depends(get_db)):
    return db.query(MonthlyCheck).filter(
        MonthlyCheck.year == year,
        MonthlyCheck.month == month,
    ).all()

@router.post("/checks/ensure")
def ensure_checks(year: int, month: int, db: Session = Depends(get_db)):
    """Auto-create monthly checks for phases active in year/month."""
    from datetime import date
    ref = f"{year:04d}-{month:02d}-01"
    phases = db.query(StrategyPhase).all()
    created = []
    for phase in phases:
        if phase.start_date > ref:
            continue
        if phase.end_date and phase.end_date < ref:
            continue
        exists = db.query(MonthlyCheck).filter(
            MonthlyCheck.year == year,
            MonthlyCheck.month == month,
            MonthlyCheck.phase_id == phase.id,
        ).first()
        if not exists:
            db.add(MonthlyCheck(year=year, month=month, phase_id=phase.id,
                                amount=phase.monthly_total, done=False))
            created.append(phase.id)
    db.commit()
    return {"created": created}

@router.post("/checks/{check_id}/done")
def mark_done(check_id: int, db: Session = Depends(get_db)):
    check = db.query(MonthlyCheck).filter(MonthlyCheck.id == check_id).first()
    if not check:
        raise HTTPException(404)
    check.done = True
    check.done_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@router.post("/checks/{check_id}/undone")
def mark_undone(check_id: int, db: Session = Depends(get_db)):
    check = db.query(MonthlyCheck).filter(MonthlyCheck.id == check_id).first()
    if not check:
        raise HTTPException(404)
    check.done = False
    check.done_at = None
    db.commit()
    return {"ok": True}
