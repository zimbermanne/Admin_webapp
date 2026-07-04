import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const empty = { category: 'General', description: '', amount: 0 }

export default function Expenses() {
  const api = useApi()
  const [expenses, setExpenses] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [listLoading, setListLoading] = useState(true)

  const load = () => {
    setListLoading(true)
    api.get('/expenses/').then(setExpenses).catch((e) => setError(e.message)).finally(() => setListLoading(false))
    api.get('/expenses/stats/summary').then(setStats).catch(() => {})
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      await api.post('/expenses/', form)
      setOpen(false)
      setForm(empty)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this expense?')) return
    try {
      await api.del(`/expenses/${id}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', render: (r) => `TZS ${r.amount.toLocaleString()}` },
    { key: 'actions', header: '', render: (r) => <button className="btn btn-danger" onClick={() => remove(r.id)}>Delete</button> },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>Expenses</h1>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Record Expense</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {stats && (
        <div className="card-grid">
          <div className="card metric-card"><div className="label">Total Expenses</div><div className="value">{stats.total_expenses}</div></div>
          <div className="card metric-card"><div className="label">Total Amount</div><div className="value">TZS {stats.total_amount.toLocaleString()}</div></div>
        </div>
      )}
      <Table columns={columns} rows={expenses} loading={listLoading} loadingText="Loading expenses…" />

      {open && (
        <Modal
          title="Record Expense"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>)}
        >
          <div className="form-row"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="form-row"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="form-row"><label>Amount</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
        </Modal>
      )}
    </div>
  )
}
