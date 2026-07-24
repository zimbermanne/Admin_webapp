import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const money = (n) => `TZS ${(Number(n) || 0).toLocaleString()}`

export default function Personal() {
  const api = useApi()
  const [tab, setTab] = useState('overview')

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Personal Finance</h1>
      <div className="tabs" style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {[
          ['overview', 'Overview'],
          ['savings', 'Savings'],
          ['social', 'Social Savings'],
        ].map(([key, label]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              color: tab === key ? 'var(--accent, #C15F3C)' : 'var(--text-muted)',
              borderBottom: tab === key ? '2px solid var(--accent, #C15F3C)' : '2px solid transparent',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab api={api} />}
      {tab === 'savings' && <SavingsTab api={api} />}
      {tab === 'social' && <SocialSavingsTab api={api} />}
    </div>
  )
}

// ---------- Overview ----------

function OverviewTab({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/personal/overview').then(setData).catch((e) => setError(e.message))
  }, []) // eslint-disable-line

  if (error) return <div className="error-text">{error}</div>
  if (!data) return <div>Loading…</div>

  const netWorth = data.total_assets_value - data.total_bank_debt - data.total_owed_to_creditors + data.total_owed_by_debtors

  const cards = [
    ['Assets', data.total_assets_value],
    ['Bank Debt', data.total_bank_debt],
    ['Owed to Creditors', data.total_owed_to_creditors],
    ['Owed by Debtors', data.total_owed_by_debtors],
    ['Expenses This Month', data.expenses_this_month],
    ['Net Worth', netWorth],
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{money(value)}</div>
          </div>
        ))}
      </div>

      {data.vikoba_memberships.length > 0 && (
        <>
          <h3>Vikoba Memberships</h3>
          <Table
            columns={[
              { key: 'group_name', header: 'Group' },
              { key: 'group_role', header: 'Role' },
              { key: 'total_contributed', header: 'Contributed', render: (r) => money(r.total_contributed) },
              { key: 'active_loan_balance', header: 'Loan Balance', render: (r) => money(r.active_loan_balance) },
            ]}
            rows={data.vikoba_memberships}
            emptyText="Not a member of any Vikoba group yet."
          />
        </>
      )}
    </div>
  )
}

// ---------- Savings (categories, transactions, envelope/habit dashboards, insights) ----------

function SavingsTab({ api }) {
  const [categories, setCategories] = useState([])
  const [envelope, setEnvelope] = useState(null)
  const [habit, setHabit] = useState(null)
  const [insights, setInsights] = useState(null)
  const [error, setError] = useState('')

  const [catOpen, setCatOpen] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '', monthly_budget: '' })
  const [catSaving, setCatSaving] = useState(false)

  const [txnOpen, setTxnOpen] = useState(false)
  const [txnForm, setTxnForm] = useState({ category_id: '', amount: '', note: '', tag: '' })
  const [suggestion, setSuggestion] = useState(null)
  const [txnSaving, setTxnSaving] = useState(false)

  const loadAll = () => {
    api.get('/personal/categories').then(setCategories).catch((e) => setError(e.message))
    api.get('/personal/dashboard/envelope').then(setEnvelope).catch(() => {})
    api.get('/personal/dashboard/habit').then(setHabit).catch(() => {})
    api.get('/personal/dashboard/insights').then(setInsights).catch(() => {})
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line

  const saveCategory = async () => {
    if (!catForm.name.trim()) return
    setCatSaving(true)
    try {
      await api.post('/personal/categories', {
        name: catForm.name.trim(), icon: catForm.icon || '', monthly_budget: Number(catForm.monthly_budget) || 0,
      })
      setCatOpen(false); setCatForm({ name: '', icon: '', monthly_budget: '' }); loadAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setCatSaving(false)
    }
  }

  const onNoteBlur = async () => {
    if (!txnForm.note && !txnForm.amount) return
    try {
      const s = await api.get(`/personal/categories/suggest?note=${encodeURIComponent(txnForm.note)}&amount=${Number(txnForm.amount) || 0}`)
      setSuggestion(s)
      if (s.category_id && !txnForm.category_id) {
        setTxnForm((f) => ({ ...f, category_id: s.category_id }))
      }
    } catch (e) { /* best-effort, ignore */ }
  }

  const saveTransaction = async () => {
    if (!txnForm.category_id || !txnForm.amount) { setError('Category and amount are required.'); return }
    setTxnSaving(true)
    setError('')
    try {
      await api.post('/personal/transactions', {
        category_id: Number(txnForm.category_id),
        amount: Number(txnForm.amount),
        note: txnForm.note || '',
        tag: txnForm.tag || null,
      })
      setTxnOpen(false)
      setTxnForm({ category_id: '', amount: '', note: '', tag: '' })
      setSuggestion(null)
      loadAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setTxnSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setTxnOpen(true)}>+ Log Expense</button>
        <button className="btn btn-outline" onClick={() => setCatOpen(true)}>+ New Category</button>
      </div>

      {insights && insights.alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {insights.alerts.map((a, i) => (
            <div key={i} className="card" style={{
              padding: '10px 14px', marginBottom: 8,
              background: a.severity === 'warning' ? 'var(--warning-bg, #F5E9D3)' : 'var(--info-bg, #E1E9F0)',
              color: a.severity === 'warning' ? 'var(--warning, #B9862E)' : 'var(--info, #4C6B8A)',
              fontSize: 13,
            }}>
              {a.message}
            </div>
          ))}
        </div>
      )}

      {envelope && envelope.categories.length > 0 && (
        <>
          <h3>Envelope Budgets <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-muted)' }}>
            (safe to spend today: {money(envelope.safe_to_spend_today)})</span></h3>
          <Table
            columns={[
              { key: 'category_name', header: 'Category' },
              { key: 'budget', header: 'Budget', render: (r) => money(r.budget) },
              { key: 'spent', header: 'Spent', render: (r) => money(r.spent) },
              { key: 'remaining', header: 'Remaining', render: (r) => money(r.remaining) },
            ]}
            rows={envelope.categories}
          />
        </>
      )}

      {habit && (
        <div className="card" style={{ marginTop: 20, padding: '16px 18px' }}>
          <h3 style={{ marginTop: 0 }}>Habit Tracking</h3>
          <div>This week impulse spending: <strong>{habit.this_week_impulse_pct.toFixed(1)}%</strong></div>
          <div>Last week: {habit.last_week_impulse_pct.toFixed(1)}%
            {' '}({habit.change_vs_last_week >= 0 ? '+' : ''}{habit.change_vs_last_week.toFixed(1)} pts)</div>
        </div>
      )}

      {insights && insights.recurring.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Recurring Expenses</h3>
          <Table
            columns={[
              { key: 'category_name', header: 'Category' },
              { key: 'typical_amount', header: 'Typical Amount', render: (r) => money(r.typical_amount) },
              { key: 'typical_day_of_month', header: 'Usually on day' },
              { key: 'occurrences', header: 'Times seen' },
            ]}
            rows={insights.recurring}
          />
        </>
      )}

      {catOpen && (
        <Modal
          title="New Category"
          onClose={() => setCatOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCatOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCategory} disabled={catSaving}>
                {catSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <label>Name</label>
          <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g. Transport, Food" />
          <label>Icon (optional emoji)</label>
          <input value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} placeholder="🚌" />
          <label>Monthly Budget (leave 0 for habit-tracking only, no envelope budget)</label>
          <input type="number" value={catForm.monthly_budget} onChange={(e) => setCatForm({ ...catForm, monthly_budget: e.target.value })} />
        </Modal>
      )}

      {txnOpen && (
        <Modal
          title="Log Expense"
          onClose={() => setTxnOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setTxnOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTransaction} disabled={txnSaving}>
                {txnSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <label>Amount</label>
          <input type="number" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} onBlur={onNoteBlur} />
          <label>Note</label>
          <input value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} onBlur={onNoteBlur} placeholder="e.g. bus fare, lunch" />
          {suggestion && suggestion.category_name && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
              Suggested: {suggestion.category_name} ({suggestion.confidence} confidence)
            </div>
          )}
          <label>Category</label>
          <select value={txnForm.category_id} onChange={(e) => setTxnForm({ ...txnForm, category_id: e.target.value })}>
            <option value="">Select a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <label>Tag (optional)</label>
          <select value={txnForm.tag} onChange={(e) => setTxnForm({ ...txnForm, tag: e.target.value })}>
            <option value="">—</option>
            <option value="necessary">Necessary</option>
            <option value="impulse">Impulse</option>
          </select>
        </Modal>
      )}
    </div>
  )
}

// ---------- Social Savings (Vikoba memberships) ----------

function SocialSavingsTab({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/personal/overview').then(setData).catch((e) => setError(e.message))
  }, []) // eslint-disable-line

  if (error) return <div className="error-text">{error}</div>
  if (!data) return <div>Loading…</div>

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Vikoba groups you belong to. To join a new group or manage group settings, ask the group's
        chairman/treasurer for an invite — group administration happens on the group's own account.
      </p>
      <Table
        columns={[
          { key: 'group_name', header: 'Group' },
          { key: 'group_role', header: 'Your Role' },
          { key: 'total_contributed', header: 'Total Contributed', render: (r) => money(r.total_contributed) },
          { key: 'active_loan_balance', header: 'Active Loan Balance', render: (r) => money(r.active_loan_balance) },
        ]}
        rows={data.vikoba_memberships}
        emptyText="Not a member of any Vikoba group yet."
      />
    </div>
  )
}
