import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import RowActionsMenu from '../components/RowActionsMenu.jsx'

const money = (n) => `TZS ${(Number(n) || 0).toLocaleString()}`

const emptyForm = () => ({
  lender_name: '', principal: '', interest_type: 'simple', annual_rate: '',
  start_date: '', due_day_of_month: 1, term_months: '', grace_period_days: 0, notes: '',
})

function currentBalance(loan) {
  const paidPrincipal = (loan.payments || []).reduce((s, p) => s + p.principal_portion, 0)
  return Math.round((loan.principal - paidPrincipal) * 100) / 100
}

export default function BankLoans() {
  const { t } = useTranslation()
  const api = useApi()

  const [loans, setLoans] = useState([])
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState(null)          // the loan being viewed
  const [roadmap, setRoadmap] = useState(null)
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const load = () => {
    setListLoading(true)
    api.get('/bank-loans/').then(setLoans).catch((e) => setError(e.message)).finally(() => setListLoading(false))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm(emptyForm()); setError(''); setOpen(true) }

  const save = async () => {
    setError(''); setSaving(true)
    try {
      if (!form.lender_name.trim()) throw new Error(t('bankLoans.lenderRequired'))
      if (!form.principal || Number(form.principal) <= 0) throw new Error(t('bankLoans.principalRequired'))
      if (!form.start_date) throw new Error(t('bankLoans.startDateRequired'))
      await api.post('/bank-loans/', {
        lender_name: form.lender_name,
        principal: Number(form.principal),
        interest_type: form.interest_type,
        annual_rate: Number(form.annual_rate) || 0,
        start_date: new Date(form.start_date).toISOString(),
        due_day_of_month: Number(form.due_day_of_month) || 1,
        term_months: form.term_months ? Number(form.term_months) : null,
        grace_period_days: Number(form.grace_period_days) || 0,
        notes: form.notes,
      })
      setOpen(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const openDetail = async (loan) => {
    setDetail(loan)
    setRoadmap(null)
    setPayAmount('')
    setError('')
  }

  const loadRoadmap = async () => {
    setRoadmapLoading(true)
    try {
      const data = await api.get(`/bank-loans/${detail.id}/roadmap`)
      setRoadmap(data)
    } catch (e) { setError(e.message) }
    finally { setRoadmapLoading(false) }
  }

  const logPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) return
    setPaying(true); setError('')
    try {
      await api.post(`/bank-loans/${detail.id}/payments`, { amount: Number(payAmount) })
      const refreshed = await api.get(`/bank-loans/${detail.id}`)
      setDetail(refreshed)
      setPayAmount('')
      setRoadmap(null)
      load()
    } catch (e) { setError(e.message) }
    finally { setPaying(false) }
  }

  const setStatus = async (status) => {
    try {
      await api.put(`/bank-loans/${detail.id}`, { status })
      const refreshed = await api.get(`/bank-loans/${detail.id}`)
      setDetail(refreshed)
      load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (loan) => {
    if (!confirm(t('bankLoans.confirmDelete'))) return
    try { await api.del(`/bank-loans/${loan.id}`); load() } catch (e) { setError(e.message) }
  }

  const columns = [
    { key: 'lender_name', header: t('bankLoans.lender') },
    { key: 'principal', header: t('bankLoans.principal'), render: (r) => money(r.principal) },
    { key: 'balance', header: t('bankLoans.currentBalance'), render: (r) => money(currentBalance(r)) },
    { key: 'interest_type', header: t('bankLoans.interestType'), render: (r) => r.interest_type === 'simple' ? t('bankLoans.simple') : t('bankLoans.reducingBalance') },
    { key: 'annual_rate', header: t('bankLoans.annualRate'), render: (r) => `${r.annual_rate}%` },
    { key: 'status', header: t('documents.status'), render: (r) => <span className={`badge badge-${r.status === 'active' ? 'sent' : r.status === 'closed' ? 'paid' : 'unpaid'}`}>{t(`bankLoans.status.${r.status}`)}</span> },
    {
      key: 'actions', header: '', stopRowClick: true,
      render: (r) => (
        <RowActionsMenu items={[
          { label: t('common.viewEdit'), icon: '👁', onClick: () => openDetail(r) },
          { label: t('common.delete'), icon: '✕', onClick: () => remove(r), danger: true, hidden: r.payments?.length > 0 },
        ]} />
      ),
    },
  ]

  const totalOutstanding = loans.filter((l) => l.status === 'active').reduce((s, l) => s + currentBalance(l), 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('bankLoans.title')}</h1>
        <button className="btn btn-primary" onClick={openNew}>+ {t('bankLoans.newLoan')}</button>
      </div>
      {error && !detail && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="card metric-card">
          <div className="label">{t('bankLoans.totalOutstanding')}</div>
          <div className="value">{money(totalOutstanding)}</div>
        </div>
        <div className="card metric-card">
          <div className="label">{t('bankLoans.activeLoans')}</div>
          <div className="value">{loans.filter((l) => l.status === 'active').length}</div>
        </div>
      </div>

      <Table
        columns={columns}
        rows={loans}
        loading={listLoading}
        loadingText={t('common.loadingEllipsis')}
        emptyText={t('bankLoans.noLoans')}
        onRowClick={openDetail}
      />

      {open && (
        <Modal
          title={t('bankLoans.newLoan')}
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t('common.loadingEllipsis') : t('common.save')}</button>
          </>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="form-row"><label>{t('bankLoans.lender')} *</label>
            <input value={form.lender_name} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.principal')} *</label>
            <input type="number" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.interestType')}</label>
            <select value={form.interest_type} onChange={(e) => setForm({ ...form, interest_type: e.target.value })}>
              <option value="simple">{t('bankLoans.simple')}</option>
              <option value="reducing_balance">{t('bankLoans.reducingBalance')}</option>
            </select></div>
          <div className="form-row"><label>{t('bankLoans.annualRate')}</label>
            <input type="number" value={form.annual_rate} onChange={(e) => setForm({ ...form, annual_rate: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.startDate')} *</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.dueDay')}</label>
            <input type="number" min={1} max={28} value={form.due_day_of_month} onChange={(e) => setForm({ ...form, due_day_of_month: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.termMonths')} ({t('common.optional')})</label>
            <input type="number" value={form.term_months} onChange={(e) => setForm({ ...form, term_months: e.target.value })} /></div>
          <div className="form-row"><label>{t('bankLoans.gracePeriod')}</label>
            <input type="number" value={form.grace_period_days} onChange={(e) => setForm({ ...form, grace_period_days: e.target.value })} /></div>
          <div className="form-row"><label>{t('common.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`${detail.lender_name} — ${money(currentBalance(detail))} ${t('bankLoans.outstanding')}`}
          onClose={() => setDetail(null)}
          footer={(<button className="btn btn-outline" onClick={() => setDetail(null)}>{t('common.close')}</button>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('bankLoans.principal')}: {money(detail.principal)} · {detail.annual_rate}% {t('bankLoans.annualRate').toLowerCase()} ·{' '}
              {detail.interest_type === 'simple' ? t('bankLoans.simple') : t('bankLoans.reducingBalance')}
            </div>
          </div>

          {detail.status === 'active' && currentBalance(detail) > 0 && (
            <div className="form-row" style={{ alignItems: 'flex-end', display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>{t('bankLoans.logPayment')}</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={logPayment} disabled={paying}>
                {paying ? t('common.loadingEllipsis') : t('common.save')}
              </button>
            </div>
          )}

          {detail.status === 'active' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-outline" onClick={() => setStatus('closed')}>{t('bankLoans.markClosed')}</button>
              <button className="btn btn-outline" onClick={() => setStatus('defaulted')}>{t('bankLoans.markDefaulted')}</button>
            </div>
          )}

          <div className="invoice-editor-section-label">{t('bankLoans.paymentHistory')}</div>
          {(detail.payments || []).length === 0 ? (
            <div className="doc-sheet-muted" style={{ marginBottom: 16 }}>{t('bankLoans.noPayments')}</div>
          ) : (
            <table className="doc-sheet-items" style={{ marginBottom: 16 }}>
              <thead><tr>
                <th>{t('common.date')}</th><th>{t('common.amount')}</th>
                <th>{t('bankLoans.interest')}</th><th>{t('bankLoans.principalPortion')}</th><th>{t('bankLoans.balanceAfter')}</th>
              </tr></thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td>{money(p.amount)}</td>
                    <td>{money(p.interest_portion)}</td>
                    <td>{money(p.principal_portion)}</td>
                    <td>{money(p.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {detail.status === 'active' && currentBalance(detail) > 0 && (
            <>
              <div className="invoice-editor-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {t('bankLoans.roadmap')}
                <button className="btn btn-outline" onClick={loadRoadmap} disabled={roadmapLoading}>
                  {roadmapLoading ? t('common.loadingEllipsis') : t('bankLoans.viewRoadmap')}
                </button>
              </div>
              {roadmap && roadmap.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={roadmap.map((r) => ({ period: r.period, balance: r.balance }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Line type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
