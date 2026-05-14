import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Search,
  Bell,
  Settings,
  ArrowLeft,
  BrainCircuit,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { useTradingStore } from './store/useTradingStore';
import './App.css';

const formatCurrency = (value, options = {}) =>
  Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    ...options,
  });

const TimeSelector = ({ active, onChange }) => (
  <div className="time-selector">
    {['1', '7', '30', '90'].map((d) => (
      <button
        key={d}
        onClick={() => onChange(d)}
        className={active === d ? 'active' : ''}
      >
        {d === '1' ? '24H' : `${d}D`}
      </button>
    ))}
  </div>
);

const EmptyChart = ({ children }) => (
  <div className="empty-chart">{children || 'No chart data available yet.'}</div>
);

const PortfolioTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const change = Number(point.normalizedChange || 0);

  return (
    <div className="portfolio-tooltip">
      <div className="tooltip-date">{point.time}</div>
      <div className="tooltip-row">
        <span>Portfolio value</span>
        <strong>${formatCurrency(point.value)}</strong>
      </div>
      <div className="tooltip-row">
        <span>Change</span>
        <strong className={change >= 0 ? 'pos' : 'neg'}>
          {change >= 0 ? '+' : ''}{change.toFixed(4)}%
        </strong>
      </div>
    </div>
  );
};

const TradeModal = ({ action, coin, loading, error, onClose, onSubmit }) => {
  const [quantity, setQuantity] = useState('');

  if (!action || !coin) return null;

  const label = action === 'buy' ? 'Buy' : 'Sell';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="trade-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{label} {coin.symbol}</h3>
          <button onClick={onClose}>x</button>
        </div>
        <label className="trade-input-label" htmlFor="trade-quantity">
          Quantity
        </label>
        <input
          id="trade-quantity"
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          autoFocus
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSubmit(quantity)}
            disabled={loading || !quantity}
            className={action === 'buy' ? 'btn-buy' : 'btn-sell'}
          >
            {loading ? 'Working...' : label}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('7');
  const [portTimeframe, setPortTimeframe] = useState('30');
  const [tradeAction, setTradeAction] = useState(null);
  const lastTimeframeRef = useRef(timeframe);

  const {
    market,
    portfolio,
    portfolioHistory,
    portfolioHistoryMeta,
    coinHistory,
    selectedCoin,
    aiInsight,
    loadingAi,
    loading,
    error,
    loadMarket,
    loadPortfolio,
    loadPortfolioHistory,
    selectCoin,
    clearSelectedCoin,
    executeTrade,
    getAiInsight,
  } = useTradingStore();

  const portfolioChartData = useMemo(() => {
    if (!portfolioHistory.length) return [];

    const baseline = Number(portfolioHistory[0].value);
    if (!Number.isFinite(baseline) || baseline === 0) {
      return portfolioHistory.map((point) => ({
        ...point,
        normalizedChange: 0,
      }));
    }

    return portfolioHistory.map((point) => {
      const value = Number(point.value);
      return {
        ...point,
        normalizedChange: ((value - baseline) / baseline) * 100,
      };
    });
  }, [portfolioHistory]);

  const portfolioChartDomain = useMemo(() => {
    if (!portfolioChartData.length) return [-1, 1];

    const values = portfolioChartData.map((point) => point.normalizedChange);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    const padding = spread === 0 ? 0.05 : Math.max(spread * 0.15, 0.01);

    return [min - padding, max + padding];
  }, [portfolioChartData]);

  useEffect(() => {
    loadMarket();
    loadPortfolio();
  }, [loadMarket, loadPortfolio]);

  useEffect(() => {
    loadPortfolioHistory(portTimeframe);
  }, [loadPortfolioHistory, portTimeframe]);

  useEffect(() => {
    if (!selectedCoin || lastTimeframeRef.current === timeframe) {
      return;
    }
    lastTimeframeRef.current = timeframe;
    selectCoin(selectedCoin, timeframe);
  }, [selectedCoin, selectCoin, timeframe]);

  const openCoin = async (coin) => {
    lastTimeframeRef.current = timeframe;
    await selectCoin(coin, timeframe);
    setActiveTab('market');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const symbol = searchQuery.trim().toUpperCase();
    const found = market.find((coin) => coin.symbol === symbol);
    await openCoin(found || { symbol, price: 0 });
    setSearchQuery('');
  };

  const handleTrade = async (quantity) => {
    try {
      await executeTrade({ action: tradeAction, quantity, historyDays: portTimeframe });
      setTradeAction(null);
    } catch {
      // Store owns the visible error state.
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">TN</div>
          <span className="logo-text">TradeNet</span>
        </div>

        <nav>
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button className={activeTab === 'market' ? 'active' : ''} onClick={() => setActiveTab('market')}>
            <TrendingUp size={20} /> Market
          </button>
          <button className={activeTab === 'portfolio' ? 'active' : ''} onClick={() => setActiveTab('portfolio')}>
            <Wallet size={20} /> Portfolio
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar">DO</div>
            <div>
              <p className="user-name">Do Profile</p>
              <p className="user-plan">Pro Plan</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="global-header">
          <form onSubmit={handleSearch} className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search assets (e.g. BTC, ETH)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
          <div className="header-actions">
            <button><Bell size={20} /></button>
            <button><Settings size={20} /></button>
          </div>
        </header>

        <div className="content-area">
          {error && <div className="error-banner">{error}</div>}

          {activeTab === 'dashboard' && portfolio && (
            <div className="view-dashboard">
              <div className="page-header">
                <h1>Overview</h1>
                <span>{new Date().toLocaleDateString()}</span>
              </div>

              <div className="stats-grid">
                <div className="card stat-card">
                  <div className="stat-icon-box"><TrendingUp size={24} /></div>
                  <div className="stat-info">
                    <h3>Total Net Worth</h3>
                    <p className="stat-value">${formatCurrency(portfolio.net_worth, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
                <div className="card stat-card">
                  <div className="stat-icon-box"><Wallet size={24} /></div>
                  <div className="stat-info">
                    <h3>Cash Balance</h3>
                    <p className="stat-value">${formatCurrency(portfolio.cash_balance, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>

              <div className="card movers-section">
                <h2>Market Movers</h2>
                <div className="movers-grid">
                  {market.slice(0, 4).map((coin) => (
                    <div
                      key={coin.coingecko_id}
                      onClick={() => openCoin(coin)}
                      className="mover-card"
                    >
                      <div className="mover-top">
                        <span className="mover-symbol">{coin.symbol}</span>
                        <span className={`mover-change ${coin.quote.USD.percent_change_24h >= 0 ? 'pos' : 'neg'}`}>
                          {coin.quote.USD.percent_change_24h.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mover-price">${formatCurrency(coin.quote.USD.price)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <div className="view-market">
              {selectedCoin ? (
                <div className="detail-layout">
                  <button onClick={clearSelectedCoin} className="back-btn">
                    <ArrowLeft size={16} /> Back to List
                  </button>

                  <div className="detail-content">
                    <div className="card detail-chart-card">
                      <div className="chart-header">
                        <div>
                          <h1>{selectedCoin.symbol}</h1>
                          <p className="detail-price">${formatCurrency(selectedCoin.price)}</p>
                        </div>
                        <TimeSelector active={timeframe} onChange={setTimeframe} />
                      </div>
                      <div className="chart-container">
                        {coinHistory.length ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={coinHistory}>
                              <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <Tooltip contentStyle={{ backgroundColor: '#171717', border: '1px solid #333' }} />
                              <Area type="monotone" dataKey="price" stroke="#10b981" fill="url(#colorPrice)" />
                              <XAxis dataKey="time" hide />
                              <YAxis hide domain={['auto', 'auto']} />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <EmptyChart>{loading.coinHistory ? 'Loading chart...' : 'No price history available.'}</EmptyChart>
                        )}
                      </div>
                    </div>

                    <div className="detail-sidebar">
                      <div className="card trade-card">
                        <h3>Trade {selectedCoin.symbol}</h3>
                        <div className="trade-buttons">
                          <button onClick={() => setTradeAction('buy')} className="btn-buy">Buy</button>
                          <button onClick={() => setTradeAction('sell')} className="btn-sell">Sell</button>
                        </div>
                      </div>

                      <div className="card ai-card">
                        <div className="ai-title">
                          <BrainCircuit size={20} />
                          <h3>AI Analysis</h3>
                        </div>
                        <div className="ai-body">
                          {aiInsight || 'Click generate to analyze current market sentiment.'}
                        </div>
                        <button onClick={getAiInsight} disabled={loadingAi} className="btn-ai">
                          {loadingAi ? 'Analyzing...' : 'Generate Insight'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card market-list">
                  <table className="market-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Price</th>
                        <th>24h Change</th>
                        <th>Market Cap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {market.map((coin) => (
                        <tr key={coin.coingecko_id} onClick={() => openCoin(coin)}>
                          <td className="coin-cell">
                            <div className="coin-icon">{coin.symbol[0]}</div>
                            <div>
                              <span className="coin-name">{coin.name}</span>
                              <span className="coin-sym">{coin.symbol}</span>
                            </div>
                          </td>
                          <td>${formatCurrency(coin.quote.USD.price)}</td>
                          <td className={coin.quote.USD.percent_change_24h >= 0 ? 'pos' : 'neg'}>
                            {coin.quote.USD.percent_change_24h.toFixed(2)}%
                          </td>
                          <td>${(coin.quote.USD.market_cap / 1e9).toFixed(2)}B</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'portfolio' && portfolio && (
            <div className="view-portfolio">
              <div className="card portfolio-chart-card">
                <div className="chart-header">
                  <div>
                    <h2>Portfolio Performance</h2>
                    <p className="detail-price">${formatCurrency(portfolio.net_worth)}</p>
                    {portfolioHistoryMeta?.approximation && (
                      <p className="chart-note">Approximate: current holdings times historical prices.</p>
                    )}
                  </div>
                  <TimeSelector active={portTimeframe} onChange={setPortTimeframe} />
                </div>
                <div className="chart-container">
                  {portfolioChartData.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={portfolioChartData} margin={{ top: 12, right: 18, bottom: 4, left: 0 }}>
                        <defs>
                          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.36}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 6" stroke="rgba(82, 82, 91, 0.35)" vertical={false} />
                        <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis
                          dataKey="normalizedChange"
                          domain={portfolioChartDomain}
                          tickFormatter={(value) => `${Number(value).toFixed(3)}%`}
                          tick={{ fill: '#71717a', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={64}
                        />
                        <Tooltip content={<PortfolioTooltip />} cursor={{ stroke: '#52525b', strokeDasharray: '4 4' }} />
                        <Area
                          type="monotone"
                          dataKey="normalizedChange"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fill="url(#colorNet)"
                          dot={false}
                          activeDot={{ r: 5, stroke: '#bfdbfe', strokeWidth: 2, fill: '#3b82f6' }}
                          animationDuration={550}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart>{loading.portfolioHistory ? 'Loading portfolio chart...' : 'No portfolio history yet.'}</EmptyChart>
                  )}
                </div>
              </div>

              <div className="holdings-list">
                {portfolio.holdings.length ? portfolio.holdings.map((holding) => (
                  <div key={holding.coingecko_id} className="card holding-item">
                    <div className="holding-info">
                      <div className="coin-icon">{holding.symbol[0]}</div>
                      <div>
                        <div className="holding-sym">{holding.symbol}</div>
                        <div className="holding-amt">{holding.quantity.toFixed(6)} Coins</div>
                      </div>
                    </div>

                    <div className="holding-sparkline">
                      {holding.history.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={holding.history}>
                            <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : null}
                    </div>

                    <div className="holding-actions">
                      <div className="text-right">
                        <div className="holding-val">${formatCurrency(holding.market_value)}</div>
                        <div className="holding-label">Current Value</div>
                      </div>
                      <button onClick={() => openCoin(holding)} className="btn-trade-small">Trade</button>
                    </div>
                  </div>
                )) : (
                  <div className="card empty-holdings">No holdings yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <TradeModal
        action={tradeAction}
        coin={selectedCoin}
        loading={loading.trade}
        error={error}
        onClose={() => setTradeAction(null)}
        onSubmit={handleTrade}
      />
    </div>
  );
}
