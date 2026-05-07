import calendar as cal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import Investment, Expense
from .routers import investments, expenses, prices
from datetime import date

Base.metadata.create_all(bind=engine)

# Add recurring columns to expenses if they don't exist yet (SQLite migration)
_inspector = inspect(engine)
_existing = {col["name"] for col in _inspector.get_columns("expenses")}
with engine.connect() as _conn:
    if "is_recurring" not in _existing:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT 0"))
    if "recurring_day" not in _existing:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN recurring_day INTEGER"))
    _conn.commit()

app = FastAPI(title="Mon Patrimoine API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(investments.router)
app.include_router(expenses.router)
app.include_router(prices.router)

@app.get("/api/dashboard")
def dashboard():
    db: Session = SessionLocal()
    try:
        invs = db.query(Investment).all()
        now  = date.today()
        month_start = date(now.year, now.month, 1)

        # Real expenses this month
        exps = db.query(Expense).filter(Expense.date >= month_start).all()

        # Add virtual recurring occurrences from previous months
        from sqlalchemy import and_, extract, or_
        recurring_prev = db.query(Expense).filter(
            Expense.is_recurring == True,
            or_(
                extract("year", Expense.date) < now.year,
                and_(
                    extract("year", Expense.date) == now.year,
                    extract("month", Expense.date) < now.month,
                )
            )
        ).all()
        virtual_amounts = []
        for exp in recurring_prev:
            day = exp.recurring_day if exp.recurring_day else exp.date.day
            max_day = cal.monthrange(now.year, now.month)[1]
            virtual_amounts.append(exp.amount)

        pea_value    = sum(i.buy_price * i.quantity for i in invs if i.type == "ETF")
        crypto_value = sum(i.buy_price * i.quantity for i in invs if i.type == "CRYPTO")
        total        = pea_value + crypto_value

        monthly_expenses = sum(e.amount for e in exps) + sum(virtual_amounts)

        monthly_passive = round(total * 0.04 / 12, 2)

        cat_totals: dict[str, float] = {}
        for e in exps:
            cat_totals[e.category] = cat_totals.get(e.category, 0) + e.amount
        for exp in recurring_prev:
            cat_totals[exp.category] = cat_totals.get(exp.category, 0) + exp.amount

        return {
            "total_patrimony":   round(total, 2),
            "pea_value":         round(pea_value, 2),
            "crypto_value":      round(crypto_value, 2),
            "monthly_expenses":  round(monthly_expenses, 2),
            "monthly_passive":   monthly_passive,
            "objective":         500,
            "expense_breakdown": [{"category": k, "amount": round(v, 2)} for k, v in cat_totals.items()],
        }
    finally:
        db.close()

@app.get("/api/health")
def health():
    return {"status": "ok"}
