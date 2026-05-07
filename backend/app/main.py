from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import Investment, Expense
from .routers import investments, expenses, prices
from datetime import date

Base.metadata.create_all(bind=engine)

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
        exps = db.query(Expense).filter(
            Expense.date >= date(now.year, now.month, 1)
        ).all()

        pea_value    = sum(i.buy_price * i.quantity for i in invs if i.type == "ETF")
        crypto_value = sum(i.buy_price * i.quantity for i in invs if i.type == "CRYPTO")
        total        = pea_value + crypto_value

        monthly_expenses = sum(e.amount for e in exps)

        # Revenus passifs estimés (hypothèse : 4% annuel du patrimoine / 12)
        monthly_passive = round(total * 0.04 / 12, 2)

        # Dépenses par catégorie ce mois
        cat_totals: dict[str, float] = {}
        for e in exps:
            cat_totals[e.category] = cat_totals.get(e.category, 0) + e.amount

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
