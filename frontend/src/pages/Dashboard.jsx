import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi.js'

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

export default function Dashboard() {
  const api = useApi()
  const [daily, setDaily] = useState(null)
  const [inv, setInv] = useState(null)
  const [fin, setFin] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-summary'),
      api.get('/inventory/metrics'),
      api.get('/reports/financial-summary'),
      api.get('/reports/cashflow?months=12'),
    ])
      .then(([d, i, f, c]) => {
        setDaily(d)
        setInv(i)
        setFin(f)
        setCashflow(c)
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

      <CashflowChart series={cashflow?.series} />
    </div>
  )
}
