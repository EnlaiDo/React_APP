from __future__ import annotations

from decimal import Decimal
from typing import Any

from services.ledger_service import compute_holdings, get_user_balance
from services.price_service import get_historical_prices, get_prices
from services.symbol_to_cg_id import CMC_TO_CG


PORTFOLIO_HISTORY_TTL_SECONDS = 60
_portfolio_history_cache: dict[
    tuple[str, str, tuple[tuple[str, str], ...]], tuple[int, dict[str, Any]]
] = {}


def _now_ns() -> int:
    import time

    return time.monotonic_ns()


def _cache_valid(cached_at: int, ttl_seconds: int) -> bool:
    return _now_ns() - cached_at < ttl_seconds * 1_000_000_000


def _decimal_response(value: Decimal) -> str:
    return str(value)


def _symbol_for_coingecko_id(coingecko_id: str) -> str:
    for symbol, mapped_id in CMC_TO_CG.items():
        if mapped_id == coingecko_id:
            return symbol
    return coingecko_id.upper()


def _holdings_signature(holdings: dict[str, Decimal]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((coingecko_id, str(quantity)) for coingecko_id, quantity in holdings.items()))


async def get_portfolio_snapshot(username: str) -> dict:
    cash_balance = get_user_balance(username)
    holdings = {
        coingecko_id: quantity
        for coingecko_id, quantity in compute_holdings(username).items()
        if quantity > Decimal("0")
    }
    prices = await get_prices(list(holdings.keys())) if holdings else {}

    portfolio_value = Decimal("0")
    holding_rows = []
    for coingecko_id, quantity in holdings.items():
        current_price = prices[coingecko_id]
        market_value = quantity * current_price
        portfolio_value += market_value
        symbol = _symbol_for_coingecko_id(coingecko_id)
        holding_rows.append(
            {
                "coingecko_id": coingecko_id,
                "symbol": symbol,
                "quantity": str(quantity),
                "current_price": _decimal_response(current_price),
                "market_value": _decimal_response(market_value),
                "amount": str(quantity),
                "price": _decimal_response(current_price),
                "value": _decimal_response(market_value),
                "history": [],
            }
        )

    return {
        "cash_balance": _decimal_response(cash_balance),
        "balance_usd": _decimal_response(cash_balance),
        "holdings": holding_rows,
        "portfolio_value": _decimal_response(portfolio_value),
        "net_worth": _decimal_response(cash_balance + portfolio_value),
    }


async def get_portfolio_history(username: str, days: str = "30") -> dict:
    cash_balance = get_user_balance(username)
    holdings = {
        coingecko_id: quantity
        for coingecko_id, quantity in compute_holdings(username).items()
        if quantity > Decimal("0")
    }
    cache_key = (
        username.lower(),
        days,
        (("cash_balance", str(cash_balance)),) + _holdings_signature(holdings),
    )
    cached = _portfolio_history_cache.get(cache_key)
    if cached and _cache_valid(cached[0], PORTFOLIO_HISTORY_TTL_SECONDS):
        return cached[1]

    if not holdings:
        result = {
            "approximation": True,
            "method": "current_holdings_times_historical_prices",
            "history": [],
        }
        _portfolio_history_cache[cache_key] = (_now_ns(), result)
        return result

    historical_by_asset = {}
    for coingecko_id in holdings:
        historical_by_asset[coingecko_id] = await get_historical_prices(coingecko_id, days)

    spine_asset = next(iter(historical_by_asset))
    timestamp_spine = [point["timestamp"] for point in historical_by_asset[spine_asset]]
    price_by_asset_timestamp = {
        coingecko_id: {
            point["timestamp"]: point["price"]
            for point in points
        }
        for coingecko_id, points in historical_by_asset.items()
    }

    history = []
    for timestamp in timestamp_spine:
        value = cash_balance
        for coingecko_id, quantity in holdings.items():
            price = price_by_asset_timestamp[coingecko_id].get(timestamp)
            if price is not None:
                value += quantity * price
        history.append(
            {
                "timestamp": timestamp,
                "value": _decimal_response(value),
            }
        )

    result = {
        "approximation": True,
        "method": "current_holdings_times_historical_prices",
        "history": history,
    }
    _portfolio_history_cache[cache_key] = (_now_ns(), result)
    return result
