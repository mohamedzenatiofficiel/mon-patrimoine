from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Optional
import requests

from ..database import get_db
from ..models import Investment, PatrimonySnapshot
from ..schemas import SnapshotOut

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}


def _fetch_price(symbol: str) -> Optional[float]:
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
        r = requests.get(url, headers=YAHOO_HEADERS, timeout=8)
        r.raise_for_status()
        data = r.json()
        result = data.get("chart", {}).get("result")
        if result:
            return float(result[0]["meta"]["regularMarketPrice"])
    except Exception:
        pass
    return None


@router.post("", response_model=SnapshotOut)
def create_snapshot(db: Session = Depends(get_db)):
    """Create or update today's patrimony snapshot with live prices."""
    today = date.today()
    investments = db.query(Investment).all()

    pea_value = 0.0
    crypto_value = 0.0
    for inv in investments:
        price = _fetch_price(inv.symbol)
        value = (price if price is not None else inv.buy_price) * inv.quantity
        if inv.type == "ETF":
            pea_value += value
        elif inv.type == "CRYPTO":
            crypto_value += value

    total_value = pea_value + crypto_value

    existing = db.query(PatrimonySnapshot).filter(PatrimonySnapshot.date == today).first()
    if existing:
        existing.total_value = round(total_value, 2)
        existing.pea_value = round(pea_value, 2)
        existing.crypto_value = round(crypto_value, 2)
        db.commit()
        db.refresh(existing)
        return existing

    snapshot = PatrimonySnapshot(
        date=today,
        total_value=round(total_value, 2),
        pea_value=round(pea_value, 2),
        crypto_value=round(crypto_value, 2),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.get("", response_model=List[SnapshotOut])
def list_snapshots(period: str = "3m", db: Session = Depends(get_db)):
    """List historical snapshots. period: 1m, 3m, 1y, all"""
    today = date.today()
    if period == "1m":
        since = today - timedelta(days=30)
    elif period == "1y":
        since = today - timedelta(days=365)
    elif period == "all":
        since = None
    else:  # default 3m
        since = today - timedelta(days=90)

    q = db.query(PatrimonySnapshot)
    if since:
        q = q.filter(PatrimonySnapshot.date >= since)
    return q.order_by(PatrimonySnapshot.date.asc()).all()
