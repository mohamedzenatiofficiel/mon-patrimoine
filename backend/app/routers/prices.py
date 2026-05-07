from fastapi import APIRouter, HTTPException
import requests

router = APIRouter(prefix="/api/prices", tags=["prices"])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

def fetch_yahoo_price(symbol: str) -> float:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
    r = requests.get(url, headers=HEADERS, timeout=10)
    r.raise_for_status()
    data = r.json()
    result = data.get("chart", {}).get("result")
    if not result:
        raise ValueError(f"Aucune donnée pour {symbol}")
    price = result[0]["meta"]["regularMarketPrice"]
    return float(price)

@router.get("/{symbol:path}")
def get_price(symbol: str):
    try:
        price = fetch_yahoo_price(symbol)
        return {"symbol": symbol, "price": price}
    except Exception as e:
        raise HTTPException(404, detail=f"Prix introuvable pour {symbol}: {str(e)}")
