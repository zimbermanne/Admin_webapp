import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`
}

function FinancialSummary({ data }) {
  const marginColor = (pct) => (pct >= 0 ? 'var(--success)' : 'var(--danger)')

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Net Profit</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: marginColor(data.net_profit), marginTop: 2 }}>
              {money(data.net_profit)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {data.net_margin_pct}% net margin
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Revenue</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{money(data.revenue)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gross Profit</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{money(data.gross_profit)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.gross_margin_pct}% margin</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card metric-card"><div className="label">Revenue</div><div className="value">{money(data.revenue)}</div></div>
        <div className="card metric-card"><div className="label">Cost of Goods Sold</div><div className="value">{money(data.cogs)}</div></div>
        <div className="card metric-card"><div className="label">Gross Profit</div><div className="value">{money(data.gross_profit)}</div></div>
        <div className="card metric-card"><div className="label">Expenses</div><div className="value">{money(data.expenses)}</div></div>
        <div className="card metric-card"><div className="label">Purchases</div><div className="value">{money(data.purchases)}</div></div>
        <div className="card metric-card">
          <div className="label">Net Profit</div>
          <div className="value" style={{ color: marginColor(data.net_profit) }}>{money(data.net_profit)}</div>
        </div>
        <div className="card metric-card"><div className="label">Receivables (owed to you)</div><div className="value">{money(data.receivables)}</div></div>
        <div className="card metric-card"><div className="label">Payables (you owe)</div><div className="value">{money(data.payables)}</div></div>
      </div>
    </>
  )
}

export default function Reports({ view }) {
  const api = useApi()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // Reset state up front on every view change. Previously `data` from the
    // last view stuck around while the new request was in flight; since
    // financial-summary and profit-loss have different shapes, rendering
    // stale data under the new view's JSX threw and left the page blank —
    // which is what made it look like it "needed multiple reloads" to work.
    setData(null)
    setError('')

    const endpoint = view === 'profit-loss' ? '/reports/profit-loss' : '/reports/financial-summary'
    api.get(endpoint).then(setData).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const title = view === 'profit-loss' ? 'Profit & Loss' : 'Financial Summary'

  return (
    <div className="page">
      <div className="page-header"><h1>{title}</h1></div>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      {data && view === 'financial-summary' && <FinancialSummary data={data} />}

      {data && view === 'profit-loss' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ marginTop: 0 }}>Revenue by Item</h3>
            {Object.entries(data.revenue_by_item).map(([name, val]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid #f0ece1' }}>
                <span>{name}</span><span>{money(val)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 10 }}>
              <span>Total Revenue</span><span>{money(data.total_revenue)}</span>
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ marginTop: 0 }}>Expenses by Category</h3>
            {Object.entries(data.expense_by_category).map(([name, val]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid #f0ece1' }}>
                <span>{name}</span><span>{money(val)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 10 }}>
              <span>Total Expenses</span><span>{money(data.total_expenses)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', marginTop: 6, borderTop: '1px solid #f0ece1' }}>
              <span>Cost of Goods Sold</span><span>{money(data.cogs)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6, color: data.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              <span>Net Profit</span><span>{money(data.net_profit)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
