from decimal import Decimal
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import initialize_database
from services.ai import ask_ai
from services.ledger_service import (
    compute_holdings,
    execute_trade,
    get_user_balance,
)
from services.price_service import get_market_data, get_price
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


@app.on_event("startup")
def startup_event():
    initialize_database()


class TradeRequest(BaseModel):
    username: str
    coingecko_id: str
    symbol: str
    quantity: Any
    action: Literal["buy", "sell"]


class ChatRequest(BaseModel):
    question: str


def _decimal_response(value: Decimal) -> str:
    return str(value)


@app.get("/api/market")
async def get_market():
    return await get_market_data()


@app.get("/api/coin/{symbol}")
async def get_coin_detail(symbol: str, days: str = "7"):
    _ = days
    display_symbol = symbol.strip().upper()
    mapped_id = CMC_TO_CG.get(display_symbol)
    if not mapped_id:
        raise HTTPException(
            status_code=400,
            detail="Unknown asset. Missing coingecko_id mapping.",
        )

    try:
        price = await get_price(mapped_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "coingecko_id": mapped_id,
        "symbol": display_symbol,
        "price": _decimal_response(price),
        "history": [],
        "change_24h": "0",
    }


@app.get("/api/user/{username}")
async def get_user(username: str):
    balance = get_user_balance(username)
    holdings = compute_holdings(username)
    total_value = Decimal("0")
    holding_rows = []

    for coingecko_id, quantity in holdings.items():
        price = await get_price(coingecko_id)
        value = quantity * price
        total_value += value
        holding_rows.append(
            {
                "coingecko_id": coingecko_id,
                "symbol": coingecko_id.upper(),
                "amount": _decimal_response(quantity),
                "value": _decimal_response(value),
                "price": _decimal_response(price),
                "history": [],
            }
        )

    return {
        "balance_usd": _decimal_response(balance),
        "net_worth": _decimal_response(total_value + balance),
        "holdings": holding_rows,
        "watchlist": [],
    }


@app.get("/api/portfolio/history/{username}")
def get_portfolio_history(username: str, days: str = "7"):
    _ = username
    _ = days
    return []


@app.post("/api/trade/buy")
async def buy_coin(req: TradeRequest):
    if req.action != "buy":
        raise HTTPException(status_code=400, detail="Trade action must be buy")
    try:
        return await execute_trade(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/trade/sell")
async def sell_coin(req: TradeRequest):
    if req.action != "sell":
        raise HTTPException(status_code=400, detail="Trade action must be sell")
    try:
        return await execute_trade(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/ai/insight")
def get_insight(req: ChatRequest):
    prompt = (
        "Provide a short, 3-bullet point investment analysis for "
        f"{req.question}. Focus on recent price action and utility."
    )
    return {"answer": ask_ai(prompt)}
