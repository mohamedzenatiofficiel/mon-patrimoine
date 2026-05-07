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
    amount:       float
    date:         date
    description:  Optional[str] = ""
    is_recurring: bool = False

class ExpenseOut(BaseModel):
    id:            Optional[int] = None
    category:      str
    amount:        float
    date:          date
    description:   Optional[str] = ""
    is_recurring:  bool = False
    recurring_day: Optional[int] = None
    created_at:    Optional[datetime] = None
    is_virtual:    bool = False
    source_id:     Optional[int] = None
    class Config: from_attributes = True
