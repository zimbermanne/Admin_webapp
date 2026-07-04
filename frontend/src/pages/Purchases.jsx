import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const empty = { item_name: '', supplier: '', quantity: 1, unit_cost: 0 }

export default function Purchases() {
  const api = useApi()
  const [purchases, setPurchases] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [listLoading, setListLoading] = useState(true)

  const load = () => {
    setListLoading(true)
    api.get('/purchases/').then(setPurchases).catch((e) => setError(e.message)).finally(() => setListLoading(false))
    api.get('/purchases/stats/summary').then(setStats).catch(() => {})
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      await api.post('/purchases/', form)
      setOpen(false)
      setForm(empty)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this purchase?')) return
    try {
      await api.del(`/purchases/${id}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString(), sortable: true },
    { key: 'item_name', header: 'Item', sortable: true },
    { key: 'supplier', header: 'Supplier', sortable: true },
    { key: 'quantity', header: 'Qty', sortable: true },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}`, sortable: true },
    { key: 'actions', header: '', render: (r) => <button className="btn btn-danger" onClick={() => remove(r.id)}>Delete</button> },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchases Ledger</h1>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Record Purchase</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {stats && (
        <div className="card-grid">
          <div className="card metric-card"><div className="label">Total Purchases</div><div className="value">{stats.total_purchases}</div></div>
          <div className="card metric-card"><div className="label">Total Spent</div><div className="value">TZS {stats.total_spent.toLocaleString()}</div></div>
        </div>
      )}
      <Table columns={columns} rows={purchases} loading={listLoading} loadingText="Loading purchases…" />

      {open && (
        <Modal
          title="Record Purchase"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>)}
        >
          <div className="form-row"><label>Item Name</label><input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} /></div>
          <div className="form-row"><label>Supplier</label><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-row" style={{ flex: 1 }}><label>Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
            <div className="form-row" style={{ flex: 1 }}><label>Unit Cost</label><input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
