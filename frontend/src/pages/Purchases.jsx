import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const empty = {
  mode: 'existing', item_id: '', item_name: '', category: 'General', unit: 'pcs',
  selling_price: '', supplier: '', quantity: 1, unit_cost: 0,
}

export default function Purchases() {
  const api = useApi()
  const [purchases, setPurchases] = useState([])
  const [inventory, setInventory] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [listLoading, setListLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setListLoading(true)
    api.get('/purchases/').then(setPurchases).catch((e) => setError(e.message)).finally(() => setListLoading(false))
    api.get('/purchases/stats/summary').then(setStats).catch(() => {})
  }
  const loadInventory = () => { api.get('/inventory/').then(setInventory).catch(() => {}) }

  useEffect(() => { load(); loadInventory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = (id) => inventory.find((i) => String(i.id) === String(id))
  const selectedItem = itemById(form.item_id)
  const total = Number(form.quantity || 0) * Number(form.unit_cost || 0)

  const save = async () => {
    setError('')
    try {
      setSaving(true)
      const payload = form.mode === 'existing'
        ? {
            item_id: Number(form.item_id),
            supplier: form.supplier,
            quantity: Number(form.quantity),
            unit_cost: Number(form.unit_cost),
          }
        : {
            item_name: form.item_name,
            category: form.category || 'General',
            unit: form.unit || 'pcs',
            selling_price: form.selling_price !== '' ? Number(form.selling_price) : undefined,
            supplier: form.supplier,
            quantity: Number(form.quantity),
            unit_cost: Number(form.unit_cost),
          }
      if (form.mode === 'existing' && !form.item_id) throw new Error('Pick an item from the list')
      if (form.mode === 'new' && !form.item_name.trim()) throw new Error('New item needs a name')
      await api.post('/purchases/', payload)
      setOpen(false)
      setForm(empty)
      load()
      loadInventory()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
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
        <button className="btn btn-primary" onClick={() => { setForm(empty); setOpen(true) }}>+ Record Purchase</button>
      </div>
      {error && !open && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
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
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className={form.mode === 'existing' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={() => setForm({ ...form, mode: 'existing' })}>Existing Item</button>
            <button type="button" className={form.mode === 'new' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={() => setForm({ ...form, mode: 'new' })}>+ New Item</button>
          </div>

          {form.mode === 'existing' ? (
            <div className="form-row">
              <label>Item</label>
              <select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                <option value="">Select item from inventory…</option>
                {inventory.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.name} ({inv.quantity} {inv.unit} in stock)</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="form-row"><label>Item Name</label><input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-row" style={{ flex: 1 }}><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div className="form-row" style={{ flex: 1 }}><label>Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              </div>
              <div className="form-row"><label>Selling Price (optional)</label><input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
            </>
          )}

          <div className="form-row"><label>Supplier</label><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-row" style={{ flex: 1 }}><label>Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Unit Cost</label>
              <input type="number" value={form.unit_cost}
                placeholder={form.mode === 'existing' && selectedItem ? `TZS ${selectedItem.cost_price}` : undefined}
                onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
            </div>
          </div>
          <div style={{ fontWeight: 600, textAlign: 'right' }}>Total: TZS {total.toLocaleString()}</div>
        </Modal>
      )}
    </div>
  )
}
