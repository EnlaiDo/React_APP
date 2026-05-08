//to start app backend: uvicorn main:app --reload
//run in frontend terminal: cd frontend and then npm run dev
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Search,
  Bell,
  Settings,
  ArrowLeft,
  BrainCircuit
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
  CartesianGrid
} from 'recharts';
import './App.css';

// --- COMPONENTS ---

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

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [market, setMarket] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Market Detail State
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [coinHistory, setCoinHistory] = useState([]);
  const [timeframe, setTimeframe] = useState("7");
  const [aiInsight, setAiInsight] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  // Portfolio Chart State
  const [portHistory, setPortHistory] = useState([]);
  const [portTimeframe, setPortTimeframe] = useState("30");

  // --- API CALLS ---

  const refreshData = async () => {
    try {
      const uRes = await fetch("http://127.0.0.1:8000/api/user/Do");
      setUser(await uRes.json());
      const mRes = await fetch("http://127.0.0.1:8000/api/market");
      setMarket(await mRes.json());
    } catch (e) {
      console.error("API Error", e);
    }
  };

  const fetchPortHistory = async (days) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/portfolio/history/Do?days=${days}`);
      setPortHistory(await res.json());
    } catch(e) {}
  };

  useEffect(() => {
    refreshData();
    fetchPortHistory("30");
  }, []);

  useEffect(() => {
    if (selectedCoin) {
      fetch(`http://127.0.0.1:8000/api/coin/${selectedCoin.symbol}?days=${timeframe}`)
        .then(r => r.json())
        .then(d => setCoinHistory(d.history));
    }
  }, [selectedCoin, timeframe]);

  useEffect(() => {
    fetchPortHistory(portTimeframe);
  }, [portTimeframe]);

  // --- HANDLERS ---

  const handleSearch = (e) => {
    e.preventDefault();
    if (!market.length) return;

    const found = market.find(c => c.symbol === searchQuery.toUpperCase());
    if (found) {
      setSelectedCoin({ symbol: found.symbol, price: found.quote.USD.price });
      setActiveTab("market");
      setSearchQuery("");
    } else {
      // Fallback if not in top list, still try to open details
      setSelectedCoin({ symbol: searchQuery.toUpperCase(), price: 0 });
      setActiveTab("market");
      setSearchQuery("");
    }
  };

  const executeTrade = async (type, amountStr) => {
    if (!amountStr || !selectedCoin) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    await fetch(`http://127.0.0.1:8000/api/trade/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: "Do",
        symbol: selectedCoin.symbol,
        amount,
        price: selectedCoin.price
      })
    });
    refreshData();
    alert(`Successfully ${type === 'buy' ? 'bought' : 'sold'} ${amount} ${selectedCoin.symbol}`);
  };

  const getAiInsight = async () => {
    if (!selectedCoin) return;
    setLoadingAi(true);
    const res = await fetch("http://127.0.0.1:8000/api/ai/insight", {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: selectedCoin.symbol })
    });
    const data = await res.json();
    setAiInsight(data.answer);
    setLoadingAi(false);
  };

  // --- RENDER ---

  return (
    <div className="app-layout">

      {/* SIDEBAR */}
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

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* GLOBAL HEADER */}
        <header className="global-header">
          <form onSubmit={handleSearch} className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search assets (e.g. BTC, ETH)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </form>
          <div className="header-actions">
            <button><Bell size={20} /></button>
            <button><Settings size={20} /></button>
          </div>
        </header>

        {/* SCROLLABLE VIEW */}
        <div className="content-area">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && user && (
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
                    <p className="stat-value">${user.net_worth.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
                <div className="card stat-card">
                  <div className="stat-icon-box"><Wallet size={24} /></div>
                  <div className="stat-info">
                    <h3>Cash Balance</h3>
                    <p className="stat-value">${user.balance_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>

              {/* Top Movers Grid */}
              <div className="card movers-section">
                <h2>Market Movers</h2>
                <div className="movers-grid">
                  {market.slice(0, 4).map(coin => (
                    <div
                      key={coin.id}
                      onClick={() => {
                        setSelectedCoin({ symbol: coin.symbol, price: coin.quote.USD.price });
                        setActiveTab('market');
                      }}
                      className="mover-card"
                    >
                      <div className="mover-top">
                        <span className="mover-symbol">{coin.symbol}</span>
                        <span className={`mover-change ${coin.quote.USD.percent_change_24h >= 0 ? 'pos' : 'neg'}`}>
                          {coin.quote.USD.percent_change_24h.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mover-price">${coin.quote.USD.price.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MARKET TAB */}
          {activeTab === 'market' && (
            <div className="view-market">
              {selectedCoin ? (
                // DETAIL VIEW
                <div className="detail-layout">
                  <button onClick={() => setSelectedCoin(null)} className="back-btn">
                    <ArrowLeft size={16} /> Back to List
                  </button>

                  <div className="detail-content">
                    {/* CHART SECTION */}
                    <div className="card detail-chart-card">
                      <div className="chart-header">
                        <div>
                          <h1>{selectedCoin.symbol}</h1>
                          <p className="detail-price">${selectedCoin.price ? selectedCoin.price.toLocaleString() : "..."}</p>
                        </div>
                        <TimeSelector active={timeframe} onChange={setTimeframe} />
                      </div>
                      <div className="chart-container">
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
                      </div>
                    </div>

                    {/* SIDEBAR ACTIONS */}
                    <div className="detail-sidebar">
                      {/* TRADE CARD */}
                      <div className="card trade-card">
                        <h3>Trade {selectedCoin.symbol}</h3>
                        <div className="trade-buttons">
                          <button
                            onClick={() => executeTrade('buy', prompt("Enter USD amount to BUY:"))}
                            className="btn-buy"
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => executeTrade('sell', prompt(`Enter ${selectedCoin.symbol} amount to SELL:`))}
                            className="btn-sell"
                          >
                            Sell
                          </button>
                        </div>
                      </div>

                      {/* AI CARD */}
                      <div className="card ai-card">
                        <div className="ai-title">
                          <BrainCircuit size={20} />
                          <h3>AI Analysis</h3>
                        </div>
                        <div className="ai-body">
                          {aiInsight || "Click generate to analyze current market sentiment."}
                        </div>
                        <button
                          onClick={getAiInsight}
                          disabled={loadingAi}
                          className="btn-ai"
                        >
                          {loadingAi ? "Analyzing..." : "Generate Insight"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // LIST VIEW
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
                      {market.map(coin => (
                        <tr
                          key={coin.id}
                          onClick={() => { setSelectedCoin({ symbol: coin.symbol, price: coin.quote.USD.price }); }}
                        >
                          <td className="coin-cell">
                            <div className="coin-icon">{coin.symbol[0]}</div>
                            <div>
                              <span className="coin-name">{coin.name}</span>
                              <span className="coin-sym">{coin.symbol}</span>
                            </div>
                          </td>
                          <td>${coin.quote.USD.price.toLocaleString()}</td>
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

          {/* PORTFOLIO TAB */}
          {activeTab === 'portfolio' && user && (
            <div className="view-portfolio">

              {/* Main Growth Chart */}
              <div className="card portfolio-chart-card">
                <div className="chart-header">
                  <div>
                    <h2>Portfolio Performance</h2>
                    <p className="detail-price">${user.net_worth.toLocaleString()}</p>
                  </div>
                  <TimeSelector active={portTimeframe} onChange={setPortTimeframe} />
                </div>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={portHistory}>
                      <defs>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis dataKey="time" tick={{fill: '#525252', fontSize: 12}} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#171717', border: '1px solid #333' }} />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#colorNet)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Holdings List with Sparklines */}
              <div className="holdings-list">
                {user.holdings.map((h) => (
                  <div key={h.symbol} className="card holding-item">

                    {/* Left: Info */}
                    <div className="holding-info">
                      <div className="coin-icon">{h.symbol[0]}</div>
                      <div>
                        <div className="holding-sym">{h.symbol}</div>
                        <div className="holding-amt">{h.amount.toFixed(4)} Coins</div>
                      </div>
                    </div>

                    {/* Middle: Sparkline Chart */}
                    <div className="holding-sparkline">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={h.history}>
                          <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Right: Value & Actions */}
                    <div className="holding-actions">
                      <div className="text-right">
                        <div className="holding-val">${h.value.toLocaleString()}</div>
                        <div className="holding-label">Current Value</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCoin({ symbol: h.symbol, price: h.price });
                          setActiveTab('market');
                        }}
                        className="btn-trade-small"
                      >
                        Trade
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}