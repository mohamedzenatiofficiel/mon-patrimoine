from sqlalchemy import Boolean, Column, Integer, String, Float, Date, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from .database import Base

class Income(Base):
    __tablename__ = "incomes"

    id          = Column(Integer, primary_key=True, index=True)
    label       = Column(String, nullable=False)
    source_type = Column(String, nullable=False)  # salary | livret_a | ldd
    amount      = Column(Float, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

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
    subcategory   = Column(String, nullable=True)
    amount        = Column(Float,  nullable=False)
    date          = Column(Date,   nullable=False)
    description   = Column(String, default="")
    is_recurring  = Column(Boolean, default=False, nullable=False)
    recurring_day = Column(Integer, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


class PatrimonySnapshot(Base):
    __tablename__ = "patrimony_snapshots"

    id           = Column(Integer, primary_key=True, index=True)
    date         = Column(Date, nullable=False, unique=True)
    total_value  = Column(Float, nullable=False)
    pea_value    = Column(Float, nullable=False, default=0.0)
    crypto_value = Column(Float, nullable=False, default=0.0)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"

    id            = Column(Integer, primary_key=True, index=True)
    category      = Column(String, nullable=False, unique=True)
    monthly_limit = Column(Float, nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MonthlyIncome(Base):
    __tablename__ = "monthly_income"

    id             = Column(Integer, primary_key=True, index=True)
    year           = Column(Integer, nullable=False)
    month          = Column(Integer, nullable=False)
    amount         = Column(Float, nullable=False)
    savings_target = Column(Float, default=30.0)  # percentage target
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("year", "month", name="uq_income_year_month"),)
