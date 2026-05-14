from decimal import Decimal
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import initialize_database
from services.ai import ask_ai
from services.ledger_service import (
    execute_trade,
)
from services.portfolio_service import get_portfolio_history, get_portfolio_snapshot
from services.price_service import get_historical_prices, get_market_data, get_price
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


def _serialize_decimals(value):
    if isinstance(value, Decimal):
        return _decimal_response(value)
    if isinstance(value, list):
        return [_serialize_decimals(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_decimals(item) for key, item in value.items()}
    return value


@app.get("/api/market")
async def get_market():
    return _serialize_decimals(await get_market_data())


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
        prices = await get_historical_prices(mapped_id, days)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    chart_prices = _serialize_decimals(prices)
    return {
        "coingecko_id": mapped_id,
        "symbol": display_symbol,
        "price": _decimal_response(price),
        "prices": chart_prices,
        "history": chart_prices,
        "change_24h": "0",
    }


@app.get("/api/user/{username}")
async def get_user(username: str):
    try:
        return await get_portfolio_snapshot(username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/portfolio/{username}/history")
async def get_portfolio_history_endpoint(username: str, days: str = "30"):
    try:
        return await get_portfolio_history(username, days)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/portfolio/history/{username}")
async def get_legacy_portfolio_history_endpoint(username: str, days: str = "30"):
    try:
        return await get_portfolio_history(username, days)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
