import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("CMC_API_KEY")

BASE_URL = "https://pro-api.coinmarketcap.com/v1"

HEADERS = {
    "Accepts": "application/json",
    "X-CMC_PRO_API_KEY": API_KEY
}

def _request(endpoint, params=None):
    if not API_KEY:
        return None, "API key missing"
    try:
        response = requests.get(f"{BASE_URL}{endpoint}", headers=HEADERS, params=params)
        data = response.json()
        if "status" in data and data["status"].get("error_message"):
            return None, data["status"]["error_message"]
        return data, None
    except Exception as e:
        return None, str(e)

def get_price(symbol):
    data, err = _request("/cryptocurrency/quotes/latest", {"symbol": symbol, "convert": "USD"})
    if err:
        return None, err
    try:
        return data["data"][symbol]["quote"]["USD"]["price"], None
    except Exception as e:
        return None, str(e)

def get_multiple(symbols):
    data, err = _request("/cryptocurrency/quotes/latest", {"symbol": ",".join(symbols), "convert": "USD"})
    if err:
        return None, err
    try:
        return {sym: data["data"][sym]["quote"]["USD"]["price"] for sym in symbols}, None
    except Exception as e:
        return None, str(e)

def get_trending(limit=10):
    data, err = _request("/cryptocurrency/listings/latest", {"sort": "percent_change_24h", "limit": limit, "convert": "USD"})
    if err:
        return None, err
    try:
        return data["data"], None
    except Exception as e:
        return None, str(e)
def get_all_symbols(limit=500):
    """
    Fetches a list of all coin symbols and their names.
    """
    data, err = _request("/cryptocurrency/listings/latest", {"limit": limit, "convert": "USD"})
    if err:
        return None, err
    try:
        symbols = {coin["symbol"]: coin["name"] for coin in data["data"]}
        return symbols, None
    except Exception as e:
        return None, str(e)
def get_coin_info(symbol):
    """
    Fetch price, 24h % change, volume, market cap for a coin.
    """
    data, err = _request("/cryptocurrency/quotes/latest", {"symbol": symbol, "convert": "USD"})
    if err:
        return None, err
    try:
        info = data["data"][symbol]["quote"]["USD"]
        return info, None
    except Exception as e:
        return None, str(e)

