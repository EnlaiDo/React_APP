from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Literal, Protocol

from database import execute_query, execute_transaction
from services.price_service import get_price


DEFAULT_CASH_BALANCE = Decimal("50000.00")


class TradeInput(Protocol):
    username: str
    coingecko_id: str
    symbol: str
    quantity: object
    action: Literal["buy", "sell"]


def _to_decimal(value: object) -> Decimal:
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Invalid quantity") from exc
    if decimal_value <= Decimal("0"):
        raise ValueError("Quantity must be greater than zero")
    return decimal_value


def _get_user_row(username: str) -> dict | None:
    return execute_query(
        "SELECT id, cash_balance FROM users WHERE username = ?",
        (username,),
        fetch="one",
    )


def ensure_user(username: str) -> None:
    execute_query(
        """
        INSERT OR IGNORE INTO users (username, cash_balance)
        VALUES (?, ?)
        """,
        (username, str(DEFAULT_CASH_BALANCE)),
        fetch="none",
    )


def get_user_balance(username: str) -> Decimal:
    ensure_user(username)
    row = _get_user_row(username)
    if not row:
        raise ValueError("User unavailable")
    return Decimal(row["cash_balance"])


def compute_holdings(username: str) -> dict[str, Decimal]:
    rows = execute_query(
        """
        SELECT t.action, t.coingecko_id, t.quantity
        FROM trades t
        JOIN users u ON u.id = t.user_id
        WHERE u.username = ?
        ORDER BY t.id ASC
        """,
        (username,),
    )
    holdings: dict[str, Decimal] = {}
    for row in rows or []:
        coingecko_id = row["coingecko_id"]
        quantity = Decimal(row["quantity"])
        if row["action"] == "buy":
            holdings[coingecko_id] = holdings.get(coingecko_id, Decimal("0")) + quantity
        else:
            holdings[coingecko_id] = holdings.get(coingecko_id, Decimal("0")) - quantity
        if holdings[coingecko_id] == Decimal("0"):
            del holdings[coingecko_id]
    return holdings


def _compute_holdings_in_transaction(tx, user_id: int) -> dict[str, Decimal]:
    rows = tx.execute(
        """
        SELECT action, coingecko_id, quantity
        FROM trades
        WHERE user_id = ?
        ORDER BY id ASC
        """,
        (user_id,),
        fetch="all",
    )
    holdings: dict[str, Decimal] = {}
    for row in rows or []:
        coingecko_id = row["coingecko_id"]
        quantity = Decimal(row["quantity"])
        if row["action"] == "buy":
            holdings[coingecko_id] = holdings.get(coingecko_id, Decimal("0")) + quantity
        else:
            holdings[coingecko_id] = holdings.get(coingecko_id, Decimal("0")) - quantity
        if holdings[coingecko_id] == Decimal("0"):
            del holdings[coingecko_id]
    return holdings


async def execute_trade(req: TradeInput) -> dict:
    ensure_user(req.username)
    coingecko_id = req.coingecko_id.strip().lower()
    symbol = req.symbol.strip().upper()
    action = req.action
    if action not in {"buy", "sell"}:
        raise ValueError("Invalid trade action")
    if not coingecko_id:
        raise ValueError("Missing asset id")

    with execute_transaction() as tx:
        user = tx.execute(
            "SELECT id, cash_balance FROM users WHERE username = ?",
            (req.username,),
            fetch="one",
        )
        if not user:
            raise ValueError("User unavailable")

        price = await get_price(coingecko_id)
        quantity = _to_decimal(req.quantity)
        total = quantity * price
        cash_balance = Decimal(user["cash_balance"])

        if action == "buy":
            if cash_balance < total:
                raise ValueError("Insufficient funds")
            cash_delta = -total
        else:
            holdings = _compute_holdings_in_transaction(tx, int(user["id"]))
            if holdings.get(coingecko_id, Decimal("0")) < quantity:
                raise ValueError("Insufficient holdings")
            cash_delta = total

        new_balance = cash_balance + cash_delta
        tx.execute(
            """
            INSERT INTO trades (
                user_id,
                action,
                coingecko_id,
                symbol,
                quantity,
                execution_price,
                cash_delta
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                action,
                coingecko_id,
                symbol,
                str(quantity),
                str(price),
                str(cash_delta),
            ),
        )
        tx.execute(
            """
            UPDATE users
            SET cash_balance = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (str(new_balance), user["id"]),
        )

    return {
        "status": "success",
        "action": action,
        "coingecko_id": coingecko_id,
        "symbol": symbol,
        "quantity": str(quantity),
        "execution_price": str(price),
        "cash_delta": str(cash_delta),
        "cash_balance": str(new_balance),
    }
