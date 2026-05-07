from fastapi import APIRouter, HTTPException
import yfinance as yf
import requests

router = APIRouter(prefix="/api/prices", tags=["prices"])

@router.get("/{symbol}")
def get_price(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        hist   = ticker.history(period="1d")
        if hist.empty:
            raise ValueError("No data")
        price = float(hist["Close"].iloc[-1])
        return {"symbol": symbol, "price": price}
    except Exception:
        raise HTTPException(404, detail=f"Prix introuvable pour {symbol}")

@router.get("/crypto/{symbol}")
def get_crypto_price(symbol: str):
    # Binance public API — pas d'authentification requise pour les prix
    try:
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol.upper()}USDT"
        r   = requests.get(url, timeout=5)
        r.raise_for_status()
        data = r.json()
        return {"symbol": symbol, "price": float(data["price"]), "currency": "USDT"}
    except Exception:
        raise HTTPException(404, detail=f"Crypto introuvable : {symbol}")
