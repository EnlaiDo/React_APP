import { create } from 'zustand';

const API_BASE = 'http://127.0.0.1:8000';
const USERNAME = 'Do';

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeMarketCoin = (coin) => ({
  ...coin,
  coingecko_id: coin.coingecko_id || coin.id,
  quote: {
    USD: {
      price: asNumber(coin.quote?.USD?.price),
      market_cap: asNumber(coin.quote?.USD?.market_cap),
      percent_change_24h: asNumber(coin.quote?.USD?.percent_change_24h),
    },
  },
  sparkline: Array.isArray(coin.sparkline) ? coin.sparkline : [],
});

const normalizeHistory = (points = []) =>
  points.map((point) => ({
    timestamp: point.timestamp,
    time: new Date(point.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    price: asNumber(point.price),
    value: asNumber(point.value),
  }));

const normalizePortfolio = (portfolio) => ({
  ...portfolio,
  balance_usd: asNumber(portfolio.balance_usd ?? portfolio.cash_balance),
  cash_balance: asNumber(portfolio.cash_balance ?? portfolio.balance_usd),
  portfolio_value: asNumber(portfolio.portfolio_value),
  net_worth: asNumber(portfolio.net_worth),
  holdings: (portfolio.holdings || []).map((holding) => ({
    ...holding,
    amount: asNumber(holding.amount ?? holding.quantity),
    quantity: asNumber(holding.quantity ?? holding.amount),
    price: asNumber(holding.price ?? holding.current_price),
    current_price: asNumber(holding.current_price ?? holding.price),
    value: asNumber(holding.value ?? holding.market_value),
    market_value: asNumber(holding.market_value ?? holding.value),
    history: normalizeHistory(holding.history || []),
  })),
});

async function requestJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Request failed');
  }
  return data;
}

export const useTradingStore = create((set, get) => ({
  username: USERNAME,
  market: [],
  portfolio: null,
  portfolioHistory: [],
  portfolioHistoryMeta: null,
  coinHistory: [],
  selectedCoin: null,
  aiInsight: '',
  loadingAi: false,
  loading: {
    market: false,
    portfolio: false,
    portfolioHistory: false,
    coinHistory: false,
    trade: false,
  },
  error: null,

  loadMarket: async () => {
    set((state) => ({ loading: { ...state.loading, market: true }, error: null }));
    try {
      const data = await requestJson('/api/market');
      set({ market: data.map(normalizeMarketCoin) });
    } catch (error) {
      set({ error: error.message });
    } finally {
      set((state) => ({ loading: { ...state.loading, market: false } }));
    }
  },

  loadPortfolio: async () => {
    const { username } = get();
    set((state) => ({ loading: { ...state.loading, portfolio: true }, error: null }));
    try {
      const data = await requestJson(`/api/user/${username}`);
      set({ portfolio: normalizePortfolio(data) });
    } catch (error) {
      set({ error: error.message });
    } finally {
      set((state) => ({ loading: { ...state.loading, portfolio: false } }));
    }
  },

  loadPortfolioHistory: async (days = '30') => {
    const { username } = get();
    set((state) => ({ loading: { ...state.loading, portfolioHistory: true }, error: null }));
    try {
      const data = await requestJson(`/api/portfolio/${username}/history?days=${days}`);
      set({
        portfolioHistory: normalizeHistory(data.history || []),
        portfolioHistoryMeta: {
          approximation: data.approximation,
          method: data.method,
        },
      });
    } catch (error) {
      set({ error: error.message, portfolioHistory: [] });
    } finally {
      set((state) => ({ loading: { ...state.loading, portfolioHistory: false } }));
    }
  },

  selectCoin: async (coin, days = '7') => {
    const selected = typeof coin === 'string'
      ? { symbol: coin.toUpperCase(), coingecko_id: null, price: 0 }
      : {
          ...coin,
          coingecko_id: coin.coingecko_id || coin.id,
          price: asNumber(coin.price ?? coin.quote?.USD?.price),
        };
    set((state) => ({
      selectedCoin: selected,
      coinHistory: [],
      aiInsight: '',
      loading: { ...state.loading, coinHistory: true },
      error: null,
    }));

    try {
      const data = await requestJson(`/api/coin/${selected.symbol}?days=${days}`);
      set({
        selectedCoin: {
          ...selected,
          coingecko_id: data.coingecko_id,
          symbol: data.symbol,
          price: asNumber(data.price || selected.price),
        },
        coinHistory: normalizeHistory(data.prices || data.history || []),
      });
    } catch (error) {
      set({ error: error.message, coinHistory: [] });
    } finally {
      set((state) => ({ loading: { ...state.loading, coinHistory: false } }));
    }
  },

  clearSelectedCoin: () => set({ selectedCoin: null, coinHistory: [], aiInsight: '' }),

  executeTrade: async ({ action, quantity, historyDays = '30' }) => {
    const { selectedCoin, username, loadPortfolio, loadPortfolioHistory } = get();
    if (!selectedCoin?.coingecko_id || !quantity) return;

    set((state) => ({ loading: { ...state.loading, trade: true }, error: null }));
    try {
      await requestJson(`/api/trade/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          coingecko_id: selectedCoin.coingecko_id,
          symbol: selectedCoin.symbol,
          quantity: String(quantity),
          action,
        }),
      });
      await loadPortfolio();
      await loadPortfolioHistory(historyDays);
    } catch (error) {
      set({ error: error.message });
      throw error;
    } finally {
      set((state) => ({ loading: { ...state.loading, trade: false } }));
    }
  },

  getAiInsight: async () => {
    const { selectedCoin } = get();
    if (!selectedCoin) return;

    set({ loadingAi: true });
    try {
      const data = await requestJson('/api/ai/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: selectedCoin.symbol }),
      });
      set({ aiInsight: data.answer });
    } catch (error) {
      set({ error: error.message });
    } finally {
      set({ loadingAi: false });
    }
  },
}));
