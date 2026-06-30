import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

export default function Dashboard() {
  const api = useApi()
  const [data, setData] = useState(null) // Combine your states for cleaner logic
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-summary'),
      api.get('/inventory/metrics'),
      api.get('/reports/financial-summary'),
    ])
      .then(([d, i, f]) => setData({ daily: d, inv: i, fin: f }))
      .catch((e) => setError(e.message))
  }, [])

  if (!data) return <div className="loading">Loading...</div>

  const { daily, inv, fin } = data

  return (
    <div className="page">
      <div className="page-header"><h1>Dashboard</h1></div>

      {/* KPI GRID */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon">🛒</div>
          <div className="kpi-label">Today's Revenue</div>
          <div className="kpi-value text-gold mono">TZS {daily.earnings.toLocaleString()}</div>
          <div className="kpi-change text-muted">Today · {daily.items_sold} items sold</div>
        </div>
        
        <div className="card kpi-card">
          <div className="kpi-icon">📦</div>
          <div className="kpi-label">Stock Alerts</div>
          <div className="kpi-value text-red">{daily.low_stock_count}</div>
          <div className="kpi-change text-muted">Items low or out of stock</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-label">Net Profit (All-time)</div>
          <div className="kpi-value mono text-green">TZS {fin.net_profit.toLocaleString()}</div>
          <div className="kpi-change text-muted">Total margin</div>
        </div>
      </div>

      {/* DASH GRID */}
      <div className="dash-grid">
        <div className="card card-pad">
          <div className="section-title">Inventory Overview</div>
          <div className="table-wrap">
             <table className="data-table">
               <tbody>
                 <tr><td>Total Inventory Value</td><td className="mono">TZS {inv.total_value.toLocaleString()}</td></tr>
                 <tr><td>Total Stock Units</td><td className="mono">{inv.total_units}</td></tr>
               </tbody>
             </table>
          </div>
        </div>
      </div>
    </div>
  )
}