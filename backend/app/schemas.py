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
    category:     str
    subcategory:  Optional[str] = None
    amount:       float
    date:         date
    description:  Optional[str] = ""
    is_recurring: bool = False

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

class IncomeUpdate(BaseModel):
    label:       Optional[str] = None
    source_type: Optional[str] = None
    amount:      Optional[float] = None

class IncomeOut(BaseModel):
    id:          int
    label:       str
    source_type: str
    amount:      float
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
