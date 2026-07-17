import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`
}

const marginColor = (n) => (n >= 0 ? 'var(--success)' : 'var(--danger)')

function Row({ left, right, bold, color, border }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', fontSize: bold ? 15 : 14,
      fontWeight: bold ? 700 : 400, padding: '6px 0',
      borderTop: border ? '1px solid #f0ece1' : 'none', color: color || 'inherit',
    }}>
      <span>{left}</span><span>{right}</span>
    </div>
  )
}

// Financial Summary: point-in-time (or period) headline numbers.
function FinancialSummary({ data }) {
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

// Profit & Loss: revenue/expense breakdown plus per-item profitability.
function ProfitLoss({ data }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Revenue by Item</h3>
          {Object.entries(data.revenue_by_item).map(([name, val]) => (
            <Row key={name} left={name} right={money(val)} />
          ))}
          <Row left="Total Revenue" right={money(data.total_revenue)} bold border />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Expenses by Category</h3>
          {Object.entries(data.expense_by_category).map(([name, val]) => (
            <Row key={name} left={name} right={money(val)} />
          ))}
          <Row left="Total Expenses" right={money(data.total_expenses)} bold border />
          <Row left="Cost of Goods Sold" right={money(data.cogs)} />
          <Row left="Net Profit" right={money(data.net_profit)} bold color={marginColor(data.net_profit)} border />
        </div>
      </div>

      {data.item_profitability && data.item_profitability.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Item Profitability</h3>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Sorted by gross profit — which items are actually making you money.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px' }}>Item</th>
                  <th style={{ padding: '6px 8px' }}>Qty Sold</th>
                  <th style={{ padding: '6px 8px' }}>Revenue</th>
                  <th style={{ padding: '6px 8px' }}>COGS</th>
                  <th style={{ padding: '6px 8px' }}>Gross Profit</th>
                  <th style={{ padding: '6px 8px' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.item_profitability.map((r) => (
                  <tr key={r.item_name} style={{ borderTop: '1px solid #f0ece1' }}>
                    <td style={{ padding: '6px 8px' }}>{r.item_name}</td>
                    <td style={{ padding: '6px 8px' }}>{r.quantity_sold}</td>
                    <td style={{ padding: '6px 8px' }}>{money(r.revenue)}</td>
                    <td style={{ padding: '6px 8px' }}>{money(r.cogs)}</td>
                    <td style={{ padding: '6px 8px', color: marginColor(r.gross_profit), fontWeight: 600 }}>{money(r.gross_profit)}</td>
                    <td style={{ padding: '6px 8px' }}>{r.gross_margin_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function CashFlow({ data }) {
  return (
    <>
      <div className="card-grid">
        <div className="card metric-card"><div className="label">Total Incoming</div><div className="value">{money(data.total_incoming)}</div></div>
        <div className="card metric-card"><div className="label">Total Outgoing</div><div className="value">{money(data.total_outgoing)}</div></div>
        <div className="card metric-card"><div className="label">Net</div><div className="value" style={{ color: marginColor(data.net) }}>{money(data.net)}</div></div>
        <div className="card metric-card"><div className="label">Ending Balance</div><div className="value">{money(data.ending_balance)}</div></div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Monthly Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: '6px 8px' }}>Month</th>
                <th style={{ padding: '6px 8px' }}>Incoming</th>
                <th style={{ padding: '6px 8px' }}>Outgoing</th>
                <th style={{ padding: '6px 8px' }}>Net</th>
                <th style={{ padding: '6px 8px' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((m) => (
                <tr key={m.month} style={{ borderTop: '1px solid #f0ece1' }}>
                  <td style={{ padding: '6px 8px' }}>{m.month}</td>
                  <td style={{ padding: '6px 8px' }}>{money(m.incoming)}</td>
                  <td style={{ padding: '6px 8px' }}>{money(m.outgoing)}</td>
                  <td style={{ padding: '6px 8px', color: marginColor(m.net) }}>{money(m.net)}</td>
                  <td style={{ padding: '6px 8px' }}>{money(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function LedgerReport({ data, listKey, title }) {
  const list = data[listKey] || []
  return (
    <>
      <div className="card-grid">
        <div className="card metric-card"><div className="label">Total Outstanding</div><div className="value">{money(data.total_outstanding)}</div></div>
        <div className="card metric-card"><div className="label">Count</div><div className="value">{data.count}</div></div>
        {Object.entries(data.by_status || {}).map(([status, count]) => (
          <div className="card metric-card" key={status}>
            <div className="label" style={{ textTransform: 'capitalize' }}>{status}</div>
            <div className="value">{count}</div>
          </div>
        ))}
      </div>
      {list.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          {list.map((r, idx) => (
            <Row key={idx} left={`${r.name} (${r.status})`} right={money(r.outstanding)} />
          ))}
        </div>
      )}
    </>
  )
}

function InventoryValuation({ data }) {
  return (
    <>
      <div className="card-grid">
        <div className="card metric-card"><div className="label">Total Inventory Value</div><div className="value">{money(data.total_value)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 20 }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Value by Category</h3>
          {Object.entries(data.by_category).map(([name, val]) => (
            <Row key={name} left={name} right={money(val)} />
          ))}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Top Items by Value</h3>
          {(data.top_items || []).map((i) => (
            <Row
              key={i.item_name}
              left={i.low_stock ? `${i.item_name} ⚠️ low stock` : i.item_name}
              right={money(i.value)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

const VIEW_CONFIG = {
  'profit-loss': { title: 'Profit & Loss', endpoint: '/reports/profit-loss', dateFilter: true, Component: ProfitLoss },
  'financial-summary': { title: 'Financial Summary', endpoint: '/reports/financial-summary', dateFilter: true, Component: FinancialSummary },
  'cashflow': { title: 'Cash Flow', endpoint: '/reports/cashflow?months=12', dateFilter: false, Component: CashFlow },
  'debtors': { title: 'Debtors Report', endpoint: '/reports/debtors', dateFilter: false, Component: (p) => <LedgerReport {...p} listKey="top_debtors" title="Top Debtors" /> },
  'creditors': { title: 'Creditors Report', endpoint: '/reports/creditors', dateFilter: false, Component: (p) => <LedgerReport {...p} listKey="top_creditors" title="Top Creditors" /> },
  'inventory-valuation': { title: 'Inventory Valuation', endpoint: '/reports/inventory-valuation', dateFilter: false, Component: InventoryValuation },
}

export default function Reports({ view }) {
  const api = useApi()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [exporting, setExporting] = useState(false)

  const config = VIEW_CONFIG[view] || VIEW_CONFIG['financial-summary']

  const load = () => {
    setData(null)
    setError('')
    let endpoint = config.endpoint
    if (config.dateFilter && (start || end)) {
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      endpoint += (endpoint.includes('?') ? '&' : '?') + params.toString()
    }
    api.get(endpoint).then(setData).catch((e) => setError(e.message))
  }

  useEffect(() => {
    // Reset the date range whenever the view changes, then load fresh data.
    setStart('')
    setEnd('')
    setData(null)
    setError('')
    api.get(config.endpoint).then(setData).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const handleExport = async () => {
    setExporting(true)
    try {
      let endpoint = `/reports/export/${view}`
      const params = new URLSearchParams()
      if (config.dateFilter) {
        if (start) params.set('start', start)
        if (end) params.set('end', end)
      }
      if ([...params].length) endpoint += `?${params.toString()}`
      const res = await api.get(endpoint)
      // useApi returns the raw Response for non-JSON content types (xlsx)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${config.title.replace(/\s+/g, '_')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const Component = config.Component

  return (
    <div className="page">
      <div className="page-header">
        <h1>{config.title}</h1>
        <button className="btn btn-outline" onClick={handleExport} disabled={exporting || !data}>
          {exporting ? 'Exporting…' : '⬇ Export Excel'}
        </button>
      </div>

      {config.dateFilter && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={load}>Apply</button>
          {(start || end) && (
            <button className="btn btn-outline" onClick={() => { setStart(''); setEnd(''); setData(null); api.get(config.endpoint).then(setData).catch((e) => setError(e.message)) }}>
              Clear (All-time)
            </button>
          )}
        </div>
      )}

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {data && <Component data={data} />}
    </div>
  )
}
