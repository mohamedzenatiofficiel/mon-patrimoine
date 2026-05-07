import calendar as cal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import Investment, Expense, PatrimonySnapshot, Budget, MonthlyIncome, Income
from .routers import investments, expenses, prices, snapshots, budgets, income, monthly_income
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
    if "subcategory" not in _existing:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN subcategory VARCHAR"))
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
app.include_router(snapshots.router)
app.include_router(budgets.router)
app.include_router(income.router)
app.include_router(monthly_income.router)

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

@app.get("/api/cashflow")
def cashflow():
    from sqlalchemy import and_, extract, or_
    db: Session = SessionLocal()
    try:
        now = date.today()
        month_start = date(now.year, now.month, 1)

        exps = db.query(Expense).filter(Expense.date >= month_start).all()
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
        all_exps = list(exps) + list(recurring_prev)

        incomes = db.query(Income).all()
        salary_entry = next((i for i in incomes if i.source_type == "salary"), None)
        savings_entries = [i for i in incomes if i.source_type in ("livret_a", "ldd")]

        cat_totals: dict[str, float] = {}
        subcat_totals: dict[tuple, float] = {}
        for e in all_exps:
            cat = e.category
            sub = e.subcategory
            cat_totals[cat] = cat_totals.get(cat, 0) + e.amount
            if sub and sub.strip() != cat.strip():
                key = (cat, sub)
                subcat_totals[key] = subcat_totals.get(key, 0) + e.amount

        expense_total = sum(cat_totals.values())

        if salary_entry:
            # 4-level Sankey: Salaire → Budget + Savings → Categories → Subcategories
            nodes = [{"name": "Salaire"}, {"name": "Budget"}]
            salary_idx = 0
            budget_idx = 1

            savings_node_idx: dict[int, int] = {}
            for s in savings_entries:
                savings_node_idx[s.id] = len(nodes)
                nodes.append({"name": s.label})

            cat_idx: dict[str, int] = {}
            subcat_idx: dict[tuple, int] = {}
            for cat in sorted(cat_totals.keys()):
                cat_idx[cat] = len(nodes)
                nodes.append({"name": cat})
            for (cat, sub) in sorted(subcat_totals.keys()):
                key = (cat, sub)
                if key not in subcat_idx:
                    subcat_idx[key] = len(nodes)
                    nodes.append({"name": sub})

            links = []
            links.append({"source": salary_idx, "target": budget_idx, "value": round(expense_total, 2)})
            for s in savings_entries:
                links.append({"source": salary_idx, "target": savings_node_idx[s.id], "value": round(s.amount, 2)})
            for cat, amount in cat_totals.items():
                links.append({"source": budget_idx, "target": cat_idx[cat], "value": round(amount, 2)})
            for (cat, sub), amount in subcat_totals.items():
                links.append({"source": cat_idx[cat], "target": subcat_idx[(cat, sub)], "value": round(amount, 2)})

            total = salary_entry.amount
            return {"nodes": nodes, "links": links, "total": round(total, 2), "salary": round(salary_entry.amount, 2)}

        # Fallback: no salary — Budget → Categories → Subcategories
        if not all_exps:
            return {"nodes": [], "links": [], "total": 0}

        nodes = [{"name": "Budget"}]
        cat_idx = {}
        subcat_idx = {}
        for cat in sorted(cat_totals.keys()):
            cat_idx[cat] = len(nodes)
            nodes.append({"name": cat})
        for (cat, sub) in sorted(subcat_totals.keys()):
            key = (cat, sub)
            if key not in subcat_idx:
                subcat_idx[key] = len(nodes)
                nodes.append({"name": sub})

        links = []
        for cat, amount in cat_totals.items():
            links.append({"source": 0, "target": cat_idx[cat], "value": round(amount, 2)})
        for (cat, sub), amount in subcat_totals.items():
            links.append({"source": cat_idx[cat], "target": subcat_idx[(cat, sub)], "value": round(amount, 2)})

        return {"nodes": nodes, "links": links, "total": round(expense_total, 2)}
    finally:
        db.close()

@app.get("/api/health")
def health():
    return {"status": "ok"}
