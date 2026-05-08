from __future__ import annotations

import asyncio
import time
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import httpx

from services import cmc
from services.symbol_to_cg_id import CMC_TO_CG


COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
PRICE_TTL_SECONDS = 60
MARKET_TTL_SECONDS = 120
_semaphore = asyncio.Semaphore(5)
_price_cache: dict[str, tuple[int, Decimal]] = {}
_market_cache: Optional[tuple[int, list[dict[str, Any]]]] = None


def _now_ns() -> int:
    return time.monotonic_ns()


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Invalid market value") from exc


def _cache_valid(cached_at: int, ttl_seconds: int) -> bool:
    return _now_ns() - cached_at < ttl_seconds * 1_000_000_000


def _symbol_for_coingecko_id(coingecko_id: str) -> Optional[str]:
    normalized = coingecko_id.lower()
    for symbol, mapped_id in CMC_TO_CG.items():
        if mapped_id == normalized:
            return symbol
    return None


async def _coingecko_get(path: str, params: dict[str, Any]) -> Any:
    async with _semaphore:
        async with httpx.AsyncClient(base_url=COINGECKO_BASE_URL, timeout=10) as client:
            response = await client.get(path, params=params)
            response.raise_for_status()
            return response.json()


async def get_price(coingecko_id: str) -> Decimal:
    normalized_id = coingecko_id.strip().lower()
    if not normalized_id:
        raise ValueError("Invalid coingecko_id")
    if normalized_id.upper() in CMC_TO_CG:
        raise ValueError("Invalid coingecko_id")

    cached = _price_cache.get(normalized_id)
    if cached and _cache_valid(cached[0], PRICE_TTL_SECONDS):
        return cached[1]

    try:
        data = await _coingecko_get(
            "/simple/price",
            {"ids": normalized_id, "vs_currencies": "usd"},
        )
        if normalized_id not in data:
            raise KeyError(normalized_id)
        if "usd" not in data[normalized_id]:
            raise ValueError("Price unavailable: missing USD quote")
        price = _to_decimal(data[normalized_id]["usd"])
    except KeyError as exc:
        raise ValueError("Invalid coingecko_id") from exc
    except httpx.HTTPStatusError as exc:
        symbol = _symbol_for_coingecko_id(normalized_id)
        if not symbol:
            raise ValueError(f"Price unavailable: HTTP {exc.response.status_code}") from exc
        fallback_price, err = cmc.get_price(symbol)
        if err or fallback_price is None:
            raise ValueError(f"Price unavailable: {err or 'fallback returned no price'}") from exc
        price = _to_decimal(fallback_price)
    except httpx.TimeoutException as exc:
        symbol = _symbol_for_coingecko_id(normalized_id)
        if not symbol:
            raise ValueError("Price unavailable: CoinGecko timeout") from exc
        fallback_price, err = cmc.get_price(symbol)
        if err or fallback_price is None:
            raise ValueError(f"Price unavailable: {err or 'fallback returned no price'}") from exc
        price = _to_decimal(fallback_price)
    except httpx.RequestError as exc:
        symbol = _symbol_for_coingecko_id(normalized_id)
        if not symbol:
            raise ValueError(f"Price unavailable: {exc}") from exc
        fallback_price, err = cmc.get_price(symbol)
        if err or fallback_price is None:
            raise ValueError(f"Price unavailable: {err or 'fallback returned no price'}") from exc
        price = _to_decimal(fallback_price)
    except ValueError:
        raise

    _price_cache[normalized_id] = (_now_ns(), price)
    return price


def _normalize_cmc_market(data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    market = []
    for coin in data:
        quote = coin.get("quote", {}).get("USD", {})
        market.append(
            {
                **coin,
                "coingecko_id": CMC_TO_CG.get(str(coin.get("symbol", "")).upper()),
                "quote": {
                    "USD": {
                        "price": _to_decimal(quote.get("price", "0")),
                        "market_cap": _to_decimal(quote.get("market_cap", "0")),
                        "percent_change_24h": _to_decimal(
                            quote.get("percent_change_24h", "0")
                        ),
                    }
                },
                "sparkline": [],
            }
        )
    return market


async def get_market_data() -> list[dict[str, Any]]:
    global _market_cache
    if _market_cache and _cache_valid(_market_cache[0], MARKET_TTL_SECONDS):
        return _market_cache[1]

    try:
        data = await _coingecko_get(
            "/coins/markets",
            {
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": "20",
                "page": "1",
                "sparkline": "false",
                "price_change_percentage": "24h",
            },
        )
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError):
        fallback, err = cmc.get_trending(limit=20)
        if err or fallback is None:
            market = []
        else:
            market = _normalize_cmc_market(fallback)
    else:
        market = []
        for coin in data:
            price = _to_decimal(coin.get("current_price", "0"))
            market.append(
                {
                    "id": coin.get("id"),
                    "name": coin.get("name"),
                    "symbol": str(coin.get("symbol", "")).upper(),
                    "coingecko_id": coin.get("id"),
                    "quote": {
                        "USD": {
                            "price": price,
                            "market_cap": _to_decimal(coin.get("market_cap", "0")),
                            "percent_change_24h": _to_decimal(
                                coin.get("price_change_percentage_24h", "0")
                            ),
                        }
                    },
                    "sparkline": [],
                }
            )

    _market_cache = (_now_ns(), market)
    return market
