from sqlalchemy import Boolean, Column, Integer, String, Float, Date, DateTime
from sqlalchemy.sql import func
from .database import Base

class Investment(Base):
    __tablename__ = "investments"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    symbol     = Column(String, nullable=False)
    type       = Column(String, nullable=False)   # ETF | CRYPTO
    quantity   = Column(Float,  nullable=False)
    buy_price  = Column(Float,  nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Expense(Base):
    __tablename__ = "expenses"

    id            = Column(Integer, primary_key=True, index=True)
    category      = Column(String, nullable=False)
    amount        = Column(Float,  nullable=False)
    date          = Column(Date,   nullable=False)
    description   = Column(String, default="")
    is_recurring  = Column(Boolean, default=False, nullable=False)
    recurring_day = Column(Integer, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
