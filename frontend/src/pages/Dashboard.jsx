import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.jsx'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`
}

function CashflowChart({ series }) {
  if (!series || series.length === 0) return null
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>Cash Flow</h3>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Money in vs. money out, last {series.length} months
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={series} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--success)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--success)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="outgoingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--danger)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
          />
          <Tooltip
            formatter={(value, name) => [money(value), name]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
          />
          <Area type="monotone" dataKey="incoming" name="Incoming" stroke="var(--success)" fill="url(#incomingFill)" strokeWidth={2} />
          <Area type="monotone" dataKey="outgoing" name="Outgoing" stroke="var(--danger)" fill="url(#outgoingFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CommunityDashboard() {
  const api = useApi()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/community/summary')
      .then(setSummary)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Home</h1>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">Members</div>
          <div className="value">{summary ? summary.member_count : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Total Contributions (All-time)</div>
          <div className="value">{summary ? money(summary.total_contributions) : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Total Payouts (All-time)</div>
          <div className="value">{summary ? money(summary.total_payouts) : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Loans Outstanding</div>
          <div className="value">{summary ? money(summary.total_loans_outstanding) : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Group features</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {summary?.rotation_enabled ? 'Merry-go-round payouts: enabled' : 'Merry-go-round payouts: not enabled'}
          {' · '}
          {summary?.lending_enabled ? 'Internal lending: enabled' : 'Internal lending: not enabled'}
        </div>
      </div>
    </div>
  )
}

function BusinessDashboard() {
  const api = useApi()
  const navigate = useNavigate()
  const [daily, setDaily] = useState(null)
  const [inv, setInv] = useState(null)
  const [fin, setFin] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [salesStats, setSalesStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-summary'),
      api.get('/inventory/metrics'),
      api.get('/reports/financial-summary'),
      api.get('/reports/cashflow?months=12'),
      api.get('/sales/stats/summary'),
      api.get('/inventory/low-stock/alerts'),
    ])
      .then(([d, i, f, c, s, ls]) => {
        setDaily(d)
        setInv(i)
        setFin(f)
        setCashflow(c)
        setSalesStats(s)
        setLowStock(ls)
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Home</h1>
      </div>

      {error && <div className="error-text">{error}</div>}

      {lowStock.length > 0 && (
        <div
          onClick={() => navigate('/app/inventory')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            background: '#fdf1e8', border: '1px solid var(--accent-soft)', color: 'var(--accent-hover)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14,
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>
            <strong>{lowStock.length} item{lowStock.length > 1 ? 's' : ''}</strong> at or below reorder point
            {lowStock.length <= 3 ? `: ${lowStock.map((i) => i.name).join(', ')}` : ''} — tap to review inventory.
          </span>
        </div>
      )}

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">Today's Earnings</div>
          <div className="value">TZS {daily ? daily.earnings.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Items Sold Today</div>
          <div className="value">{daily ? daily.items_sold : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Top Product Today</div>
          <div className="value" style={{ fontSize: 16 }}>{daily?.top_product || 'No sales yet'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Low Stock Items</div>
          <div className="value">{daily ? daily.low_stock_count : '—'}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">Inventory Value</div>
          <div className="value">TZS {inv ? inv.total_value.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Total Stock Units</div>
          <div className="value">{inv ? inv.total_units : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Net Profit (All-time)</div>
          <div className="value">TZS {fin ? fin.net_profit.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Total Revenue (All-time)</div>
          <div className="value">TZS {fin ? fin.revenue.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">Most Sold Item (All-time)</div>
          <div className="value" style={{ fontSize: 16 }}>
            {salesStats?.most_sold_item ? `${salesStats.most_sold_item.item_name} (${salesStats.most_sold_item.quantity} sold)` : 'No sales yet'}
          </div>
        </div>
        <div className="card metric-card">
          <div className="label">Top Revenue Item (All-time)</div>
          <div className="value" style={{ fontSize: 16 }}>
            {salesStats?.top_revenue_item ? `${salesStats.top_revenue_item.item_name} (TZS ${salesStats.top_revenue_item.revenue.toLocaleString()})` : 'No sales yet'}
          </div>
        </div>
      </div>

      <CashflowChart series={cashflow?.series} />
    </div>
  )
}

export default function Dashboard() {
  const { account } = useAuth()
  if (account?.account_type === 'community') return <CommunityDashboard />
  return <BusinessDashboard />
}
