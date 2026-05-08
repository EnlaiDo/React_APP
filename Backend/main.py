#backend main.py
#cd backend
#uvicorn main:app --reload


import json
import requests
import time
import random
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from services.cmc import get_price, get_trending
from services.ai import ask_ai
from services.symbol_to_cg_id import CMC_TO_CG

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- MODELS ---
class TradeRequest(BaseModel):
    username: str
    symbol: str
    amount: float
    price: float


class ChatRequest(BaseModel):
    question: str


# --- HELPERS ---
def load_user(username: str):
    path = Path(f"profiles/{username.lower()}.json")
    if not path.exists():
        default = {"username": username, "balance_usd": 50000, "portfolio": {}, "watchlist": []}
        with open(path, "w") as f: json.dump(default, f)
        return default
    with open(path, "r") as f: return json.load(f)


def save_user(username: str, data: dict):
    with open(f"profiles/{username.lower()}.json", "w") as f:
        json.dump(data, f, indent=4)


def fetch_cg_history(symbol: str, days: str):
    cg_id = CMC_TO_CG.get(symbol.upper()) or symbol.lower()
    try:
        url = f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?vs_currency=usd&days={days}"
        data = requests.get(url, timeout=5).json()
        points = []
        for t, p in data.get("prices", []):
            # Format timestamp for chart
            t_struct = time.localtime(t / 1000)
            if days == "1":
                lbl = time.strftime("%H:%M", t_struct)
            elif days in ["7", "30"]:
                lbl = time.strftime("%m/%d", t_struct)
            else:
                lbl = time.strftime("%m/%y", t_struct)
            points.append({"time": lbl, "price": p, "timestamp": t})
        return points
    except:
        return []


# --- ENDPOINTS ---

@app.get("/api/market")
def get_market():
    data, err = get_trending(limit=20)
    if err: return []
    # Add sparkline mock data for the dashboard
    for coin in data:
        base = coin['quote']['USD']['price']
        coin['sparkline'] = [{"price": base * (1 + random.uniform(-0.05, 0.05))} for _ in range(10)]
    return data


@app.get("/api/coin/{symbol}")
def get_coin_detail(symbol: str, days: str = "7"):
    symbol = symbol.upper()
    price, _ = get_price(symbol)
    history = fetch_cg_history(symbol, days)
    return {
        "symbol": symbol,
        "price": price,
        "history": history,
        "change_24h": random.uniform(-5, 10)  # Mock if CMC doesn't provide
    }


@app.get("/api/user/{username}")
def get_user(username: str):
    user = load_user(username)
    total_val = 0
    holdings = []

    for sym, info in user["portfolio"].items():
        price, _ = get_price(sym)
        if price:
            val = info['amount'] * price
            total_val += val
            holdings.append({
                "symbol": sym,
                "amount": info['amount'],
                "value": val,
                "price": price,
                # Fetch mini history for portfolio sparklines
                "history": fetch_cg_history(sym, "7")
            })

    return {
        "balance_usd": user["balance_usd"],
        "net_worth": total_val + user["balance_usd"],
        "holdings": holdings,
        "watchlist": user["watchlist"]
    }


@app.get("/api/portfolio/history/{username}")
def get_portfolio_history(username: str, days: str = "7"):
    """Generates a realistic equity curve based on current net worth"""
    user_data = get_user(username)
    current_nw = user_data['net_worth']

    # Mock history going backwards from today
    points = []
    num_points = 20
    volatility = 0.02

    price = current_nw
    now = time.time()

    for i in range(num_points):
        # Go back in time
        t = now - (i * 86400 * (int(days) / num_points))
        points.insert(0, {
            "time": time.strftime("%m/%d", time.localtime(t)),
            "value": price
        })
        # Random walk
        price = price * (1 + random.uniform(-volatility, volatility))

    return points


@app.post("/api/trade/buy")
def buy_coin(req: TradeRequest):
    user = load_user(req.username)
    cost = req.amount * req.price
    if user["balance_usd"] < cost:
        raise HTTPException(status_code=400, detail="Insufficient Funds")

    user["balance_usd"] -= cost
    sym = req.symbol.upper()
    if sym not in user["portfolio"]:
        user["portfolio"][sym] = {"amount": 0}
    user["portfolio"][sym]["amount"] += req.amount

    save_user(req.username, user)
    return {"status": "success"}


@app.post("/api/trade/sell")
def sell_coin(req: TradeRequest):
    user = load_user(req.username)
    sym = req.symbol.upper()

    if sym not in user["portfolio"] or user["portfolio"][sym]["amount"] < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient Coins")

    earn = req.amount * req.price
    user["balance_usd"] += earn
    user["portfolio"][sym]["amount"] -= req.amount

    if user["portfolio"][sym]["amount"] <= 0.000001:
        del user["portfolio"][sym]

    save_user(req.username, user)
    return {"status": "success"}


@app.post("/api/ai/insight")
def get_insight(req: ChatRequest):
    prompt = f"Provide a short, 3-bullet point investment analysis for {req.question}. Focus on recent price action and utility."
    return {"answer": ask_ai(prompt)}