import calendar as cal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import Investment, Expense, PatrimonySnapshot, Budget, MonthlyIncome, Income, StrategyGoal, StrategyPhase, Envelope, MonthlyCheck
from .routers import investments, expenses, prices, snapshots, budgets, income, monthly_income, import_pdf, strategy
from datetime import date

Base.metadata.create_all(bind=engine)

# SQLite migrations
_inspector = inspect(engine)
_existing_exp = {col["name"] for col in _inspector.get_columns("expenses")}
_existing_inc = {col["name"] for col in _inspector.get_columns("incomes")}
with engine.connect() as _conn:
    if "is_recurring" not in _existing_exp:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT 0"))
    if "recurring_day" not in _existing_exp:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN recurring_day INTEGER"))
    if "subcategory" not in _existing_exp:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN subcategory VARCHAR"))
    if "balance" not in _existing_inc:
        _conn.execute(text("ALTER TABLE incomes ADD COLUMN balance FLOAT DEFAULT 0"))
    if "import_batch_id" not in _existing_exp:
        _conn.execute(text("ALTER TABLE expenses ADD COLUMN import_batch_id VARCHAR"))
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
app.include_router(import_pdf.router)
app.include_router(strategy.router)

# ── Seed default strategy data ────────────────────────────────────────
import json as _json

def _seed():
    db = SessionLocal()
    try:
        if not db.query(StrategyGoal).first():
            db.add(StrategyGoal(target_monthly_passive=500.0, target_year=2029, swr=4.0))

        if not db.query(StrategyPhase).first():
            db.add(StrategyPhase(
                phase_number=1, name="Phase 1 — Accumulation intensive",
                start_date="2026-05-01", end_date="2026-12-31",
                monthly_total=6000,
                description="6 000 €/mois dans le PEA S&P 500",
                details=_json.dumps({
                    "sources": [{"label": "Salaire", "amount": 1850}, {"label": "Livret A", "amount": 4150}],
                    "envelope": "PEA", "etf_name": "S&P 500 EUR (Acc) — Amundi",
                    "etf_isin": "FR0013412285", "broker": "Trade Republic", "execution_day": 2,
                }),
            ))
            db.add(StrategyPhase(
                phase_number=2, name="Phase 2 — Diversification",
                start_date="2027-01-01", end_date=None,
                monthly_total=1700,
                description="1 400 €/mois PEA + 300 €/mois CTO Nasdaq 100",
                details=_json.dumps({
                    "sources": [
                        {"label": "PEA S&P 500", "amount": 1400, "envelope": "PEA"},
                        {"label": "CTO Nasdaq 100", "amount": 300, "envelope": "CTO"},
                    ],
                    "execution_day": 2,
                }),
            ))

        if not db.query(Envelope).first():
            db.add(Envelope(type="PEA", label="PEA — Trade Republic", broker="Trade Republic",
                            status="active", open_date="2024-01-01",
                            etf_isin="FR0013412285", etf_name="Amundi S&P 500 EUR (Acc)",
                            monthly_amount=6000, sort_order=0))
            db.add(Envelope(type="CTO", label="CTO", broker="Trade Republic",
                            status="planned", planned_open_date="2027-01-01",
                            etf_isin="FR0011871110", etf_name="Amundi Nasdaq 100 ETF",
                            monthly_amount=300, sort_order=1))
            db.add(Envelope(type="AV", label="Assurance-vie",
                            status="planned", planned_open_date="2027-01-01",
                            sort_order=2))
            db.add(Envelope(type="SCPI", label="SCPI",
                            status="planned", planned_open_date="2027-01-01",
                            sort_order=3))
        db.commit()
    finally:
        db.close()

_seed()

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

        # Savings account balances (Livret A, LDD, Compte courant)
        savings_incomes = db.query(Income).filter(Income.source_type.in_(["livret_a", "ldd", "compte_courant"])).all()
        savings_accounts = [
            {"label": s.label, "source_type": s.source_type, "balance": round(s.balance or 0, 2)}
            for s in savings_incomes
        ]
        savings_total = sum(s.balance or 0 for s in savings_incomes)

        total = pea_value + crypto_value + savings_total

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
            "savings_total":     round(savings_total, 2),
            "savings_accounts":  savings_accounts,
            "monthly_expenses":  round(monthly_expenses, 2),
            "monthly_passive":   monthly_passive,
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
            # "Autre" always last, rest sorted by value desc
            sorted_cats    = sorted(
                [(k, v) for k, v in cat_totals.items() if k != "Autre"],
                key=lambda x: -x[1]
            ) + ([("Autre", cat_totals["Autre"])] if "Autre" in cat_totals else [])
            sorted_subcats = sorted(subcat_totals.items(), key=lambda x: -x[1])

            nodes = [{"name": "Salaire"}, {"name": "Budget"}]
            salary_idx = 0
            budget_idx = 1

            cat_idx: dict[str, int] = {}
            for cat, _ in sorted_cats:
                cat_idx[cat] = len(nodes)
                nodes.append({"name": cat})

            subcat_idx: dict[tuple, int] = {}
            for (cat, sub), _ in sorted_subcats:
                key = (cat, sub)
                if key not in subcat_idx:
                    subcat_idx[key] = len(nodes)
                    nodes.append({"name": sub})

            links = []
            links.append({"source": salary_idx, "target": budget_idx, "value": round(expense_total, 2)})
            for cat, amount in sorted_cats:
                links.append({"source": budget_idx, "target": cat_idx[cat], "value": round(amount, 2)})
            for (cat, sub), amount in sorted_subcats:
                links.append({"source": cat_idx[cat], "target": subcat_idx[(cat, sub)], "value": round(amount, 2)})

            return {"nodes": nodes, "links": links, "total": round(expense_total, 2), "salary": round(salary_entry.amount, 2)}

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
