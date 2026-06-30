import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

export default function Dashboard() {
  const api = useApi()
  const [daily, setDaily] = useState(null)
  const [inv, setInv] = useState(null)
  const [fin, setFin] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-summary'),
      api.get('/inventory/metrics'),
      api.get('/reports/financial-summary'),
    ])
      .then(([d, i, f]) => {
        setDaily(d)
        setInv(i)
        setFin(f)
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
    </div>
  )
}
