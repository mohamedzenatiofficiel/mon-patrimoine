from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class InvestmentCreate(BaseModel):
    name:      str
    symbol:    str
    type:      str
    quantity:  float
    buy_price: float

class InvestmentOut(InvestmentCreate):
    id:         int
    created_at: datetime
    class Config: from_attributes = True

class ExpenseCreate(BaseModel):
    category:      str
    subcategory:   Optional[str] = None
    amount:        float
    date:          date
    description:   Optional[str] = ""
    is_recurring:  bool = False
    recurring_day: Optional[int] = None

class ExpenseOut(BaseModel):
    id:            Optional[int] = None
    category:      str
    subcategory:   Optional[str] = None
    amount:        float
    date:          date
    description:   Optional[str] = ""
    is_recurring:  bool = False
    recurring_day: Optional[int] = None
    created_at:    Optional[datetime] = None
    is_virtual:    bool = False
    source_id:     Optional[int] = None
    class Config: from_attributes = True


class IncomeCreate(BaseModel):
    label:       str
    source_type: str  # salary | livret_a | ldd
    amount:      float
    balance:     Optional[float] = 0.0

class IncomeUpdate(BaseModel):
    label:       Optional[str]   = None
    source_type: Optional[str]   = None
    amount:      Optional[float] = None
    balance:     Optional[float] = None

class IncomeOut(BaseModel):
    id:          int
    label:       str
    source_type: str
    amount:      float
    balance:     Optional[float] = 0.0
    created_at:  Optional[datetime] = None
    class Config: from_attributes = True


class SnapshotOut(BaseModel):
    id:           int
    date:         date
    total_value:  float
    pea_value:    float
    crypto_value: float
    created_at:   Optional[datetime] = None
    class Config: from_attributes = True


class BudgetCreate(BaseModel):
    category:      str
    monthly_limit: float

class BudgetOut(BaseModel):
    id:            int
    category:      str
    monthly_limit: float
    created_at:    Optional[datetime] = None
    updated_at:    Optional[datetime] = None
    class Config: from_attributes = True

class BudgetStatus(BaseModel):
    category:      str
    monthly_limit: float
    spent:         float
    percent:       float   # 0-100+
    budget_id:     int

class StrategyGoalOut(BaseModel):
    id: int
    target_monthly_passive: float
    target_year: int
    swr: float
    class Config: from_attributes = True

class StrategyGoalUpdate(BaseModel):
    target_monthly_passive: float
    target_year: int
    swr: float

class StrategyPhaseCreate(BaseModel):
    phase_number:  int
    name:          str
    start_date:    str
    end_date:      Optional[str]   = None
    monthly_total: float
    description:   Optional[str]   = None
    details:       str             = "{}"

class StrategyPhaseOut(StrategyPhaseCreate):
    id: int
    class Config: from_attributes = True

class EnvelopeCreate(BaseModel):
    type:               str
    label:              str
    broker:             Optional[str]   = None
    status:             str             = "active"
    open_date:          Optional[str]   = None
    planned_open_date:  Optional[str]   = None
    etf_isin:           Optional[str]   = None
    etf_name:           Optional[str]   = None
    monthly_amount:     float           = 0.0
    sort_order:         int             = 0

class EnvelopeOut(EnvelopeCreate):
    id: int
    class Config: from_attributes = True

class MonthlyCheckOut(BaseModel):
    id:       int
    year:     int
    month:    int
    phase_id: int
    amount:   float
    done:     bool
    done_at:  Optional[datetime] = None
    class Config: from_attributes = True


class MonthlyIncomeCreate(BaseModel):
    year:           int
    month:          int
    amount:         float
    savings_target: Optional[float] = 30.0

class MonthlyIncomeOut(BaseModel):
    id:             int
    year:           int
    month:          int
    amount:         float
    savings_target: float
    created_at:     Optional[datetime] = None
    updated_at:     Optional[datetime] = None
    class Config: from_attributes = True
