import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.jsx'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`
}

function CashflowChart({ series }) {
  const { t } = useTranslation()
  if (!series || series.length === 0) return null
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('dashboard.cashFlowTitle')}</h3>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('dashboard.cashFlowSubtitle', { count: series.length })}
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
  const { t } = useTranslation()
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
        <h1>{t('nav.home')}</h1>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">{t('dashboard.members')}</div>
          <div className="value">{summary ? summary.member_count : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.totalContributionsAllTime')}</div>
          <div className="value">{summary ? money(summary.total_contributions) : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.totalPayoutsAllTime')}</div>
          <div className="value">{summary ? money(summary.total_payouts) : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.loansOutstanding')}</div>
          <div className="value">{summary ? money(summary.total_loans_outstanding) : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('dashboard.groupFeatures')}</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {summary?.rotation_enabled ? t('dashboard.rotationEnabled') : t('dashboard.rotationDisabled')}
          {' · '}
          {summary?.lending_enabled ? t('dashboard.lendingEnabled') : t('dashboard.lendingDisabled')}
        </div>
      </div>
    </div>
  )
}

function LoansAndDeadlinesWidget({ loans, deadlines }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const activeLoans = (loans || []).filter((l) => l.status === 'active')
  const totalOutstanding = activeLoans.reduce((s, l) => {
    const paidPrincipal = (l.payments || []).reduce((sp, p) => sp + p.principal_portion, 0)
    return s + (l.principal - paidPrincipal)
  }, 0)

  const upcomingDeadlines = [...(deadlines || [])]
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3)

  if (activeLoans.length === 0 && upcomingDeadlines.length === 0) return null

  return (
    <div className="card-grid" style={{ marginBottom: 20 }}>
      {activeLoans.length > 0 && (
        <div className="card metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/app/bank-loans')}>
          <div className="label">{t('bankLoans.totalOutstanding')}</div>
          <div className="value">TZS {totalOutstanding.toLocaleString()}</div>
        </div>
      )}
      {upcomingDeadlines.length > 0 && (
        <div className="card" style={{ cursor: 'pointer', gridColumn: 'span 2' }} onClick={() => navigate('/app/deadlines')}>
          <div className="label" style={{ marginBottom: 8 }}>{t('deadlines.upcomingCompliance')}</div>
          {upcomingDeadlines.map((d) => (
            <div key={d.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{d.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{new Date(d.due_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BusinessDashboard() {
  const api = useApi()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [daily, setDaily] = useState(null)
  const [inv, setInv] = useState(null)
  const [fin, setFin] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [salesStats, setSalesStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [loans, setLoans] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-summary'),
      api.get('/inventory/metrics'),
      api.get('/reports/financial-summary'),
      api.get('/reports/cashflow?months=12'),
      api.get('/sales/stats/summary'),
      api.get('/inventory/low-stock/alerts'),
      api.get('/bank-loans/').catch(() => []),
      api.get('/deadlines/').catch(() => []),
    ])
      .then(([d, i, f, c, s, ls, bl, dl]) => {
        setDaily(d)
        setInv(i)
        setFin(f)
        setCashflow(c)
        setSalesStats(s)
        setLowStock(ls)
        setLoans(bl)
        setDeadlines(dl)
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('nav.home')}</h1>
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
            <strong>{lowStock.length} item{lowStock.length > 1 ? 's' : ''}</strong> {t('dashboard.lowStockAlert')}
            {lowStock.length <= 3 ? `: ${lowStock.map((i) => i.name).join(', ')}` : ''} — {t('dashboard.tapToReview')}.
          </span>
        </div>
      )}

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">{t('dashboard.todaysEarnings')}</div>
          <div className="value">TZS {daily ? daily.earnings.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.itemsSoldToday')}</div>
          <div className="value">{daily ? daily.items_sold : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.topProductToday')}</div>
          <div className="value" style={{ fontSize: 16 }}>{daily?.top_product || t('dashboard.noSalesYet')}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.lowStockItems')}</div>
          <div className="value">{daily ? daily.low_stock_count : '—'}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">{t('dashboard.inventoryValue')}</div>
          <div className="value">TZS {inv ? inv.total_value.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.totalStockUnits')}</div>
          <div className="value">{inv ? inv.total_units : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.netProfitAllTime')}</div>
          <div className="value">TZS {fin ? fin.net_profit.toLocaleString() : '—'}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.totalRevenueAllTime')}</div>
          <div className="value">TZS {fin ? fin.revenue.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card metric-card">
          <div className="label">{t('dashboard.mostSoldItemAllTime')}</div>
          <div className="value" style={{ fontSize: 16 }}>
            {salesStats?.most_sold_item ? `${salesStats.most_sold_item.item_name} (${salesStats.most_sold_item.quantity} sold)` : t('dashboard.noSalesYet')}
          </div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('dashboard.topRevenueItemAllTime')}</div>
          <div className="value" style={{ fontSize: 16 }}>
            {salesStats?.top_revenue_item ? `${salesStats.top_revenue_item.item_name} (TZS ${salesStats.top_revenue_item.revenue.toLocaleString()})` : t('dashboard.noSalesYet')}
          </div>
        </div>
      </div>

      <LoansAndDeadlinesWidget loans={loans} deadlines={deadlines} />

      <CashflowChart series={cashflow?.series} />
    </div>
  )
}

export default function Dashboard() {
  const { account } = useAuth()
  if (account?.account_type === 'community') return <CommunityDashboard />
  return <BusinessDashboard />
}
