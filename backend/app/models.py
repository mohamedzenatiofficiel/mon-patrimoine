from sqlalchemy import Boolean, Column, Integer, String, Float, Date, DateTime, UniqueConstraint, Text
from sqlalchemy.sql import func
from .database import Base

class Income(Base):
    __tablename__ = "incomes"

    id          = Column(Integer, primary_key=True, index=True)
    label       = Column(String, nullable=False)
    source_type = Column(String, nullable=False)  # salary | livret_a | ldd
    amount      = Column(Float, nullable=False)
    balance     = Column(Float, default=0.0, nullable=True)  # solde actuel (livret_a / ldd)
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
    description     = Column(String, default="")
    is_recurring    = Column(Boolean, default=False, nullable=False)
    recurring_day   = Column(Integer, nullable=True)
    import_batch_id = Column(String, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


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


class StrategyGoal(Base):
    __tablename__ = "strategy_goal"
    id                     = Column(Integer, primary_key=True, index=True)
    target_monthly_passive = Column(Float, default=500.0)
    target_year            = Column(Integer, default=2029)
    swr                    = Column(Float, default=4.0)   # Safe Withdrawal Rate %

class StrategyPhase(Base):
    __tablename__ = "strategy_phases"
    id            = Column(Integer, primary_key=True, index=True)
    phase_number  = Column(Integer, nullable=False)
    name          = Column(String, nullable=False)
    start_date    = Column(String, nullable=False)   # "2026-05-01"
    end_date      = Column(String, nullable=True)
    monthly_total = Column(Float, nullable=False)
    description   = Column(String, nullable=True)
    details       = Column(Text, default="{}")       # JSON: sources, etf, broker, execution_day

class Envelope(Base):
    __tablename__       = "envelopes"
    id                  = Column(Integer, primary_key=True, index=True)
    type                = Column(String, nullable=False)    # PEA | CTO | AV | SCPI
    label               = Column(String, nullable=False)
    broker              = Column(String, nullable=True)
    status              = Column(String, default="active")  # active | planned
    open_date           = Column(String, nullable=True)
    planned_open_date   = Column(String, nullable=True)
    etf_isin            = Column(String, nullable=True)
    etf_name            = Column(String, nullable=True)
    monthly_amount      = Column(Float, default=0.0)
    sort_order          = Column(Integer, default=0)

class MonthlyCheck(Base):
    __tablename__ = "monthly_checks"
    id            = Column(Integer, primary_key=True, index=True)
    year          = Column(Integer, nullable=False)
    month         = Column(Integer, nullable=False)
    phase_id      = Column(Integer, nullable=False)
    amount        = Column(Float, nullable=False)
    done          = Column(Boolean, default=False)
    done_at       = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("year", "month", "phase_id", name="uq_check_year_month_phase"),)


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
