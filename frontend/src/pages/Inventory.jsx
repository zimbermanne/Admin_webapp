import { useEffect, useState, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'
import { useAuth } from '../hooks/useAuth.jsx'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const empty = { name: '', sku: '', category: 'General', quantity: 0, unit: 'pcs', cost_price: 0, selling_price: 0, reorder_point: 5 }

export default function Inventory() {
  const api = useApi()
  const { token } = useAuth()
  const fileRef = useRef()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [importing, setImporting] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const load = () => { setListLoading(true); api.get('/inventory/').then(setItems).catch((e) => setError(e.message)).finally(() => setListLoading(false)) }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm(empty); setEditing({}) }
  const openEdit = (item) => { setForm(item); setEditing(item) }

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setImporting(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      // Use the shared api hook (same URL/auth resolution as every other
      // working request on this page) instead of a separate raw fetch call.
      const data = await api.post('/inventory/batch', fd)
      load()
      const skippedNote = data.skipped ? ` (${data.skipped} row${data.skipped === 1 ? '' : 's'} skipped)` : ''
      const dupNote = data.duplicate_skus ? `\n${data.duplicate_skus}` : ''
      alert(`✅ Imported ${data.created} items successfully.${skippedNote}${dupNote}`)
    } catch (e) { setError(e.message) }
    finally { setImporting(false); e.target.value = '' }
  }

  const handleExport = async () => {
    try {
      const res = await fetch(apiUrl('/api/inventory/export/spreadsheet'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'inventory-export.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
  }

  const save = async () => {
    try {
      if (editing && editing.id) {
        await api.put(`/inventory/${editing.id}`, form)
      } else {
        await api.post('/inventory/', form)
      }
      setEditing(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this item?')) return
    try {
      await api.del(`/inventory/${id}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'category', header: 'Category', sortable: true },
    {
      key: 'quantity', header: 'Qty', sortable: true,
      render: (r) => `${r.quantity} ${r.unit}`,
    },
    {
      key: 'selling_price', header: 'Price', sortable: true,
      render: (r) => `TZS ${r.selling_price.toLocaleString()}`,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      // Sort low-stock items to one end regardless of exact quantity —
      // true (low stock) sorts before false when ascending.
      sortValue: (r) => (r.quantity <= r.reorder_point ? 0 : 1),
      render: (r) => r.quantity <= r.reorder_point
        ? <span className="badge badge-unpaid">Low Stock</span>
        : <span className="badge badge-paid">OK</span>,
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn btn-danger" onClick={() => remove(r.id)}>Delete</button>
        </div>
      ),
    },
  ]

  const visibleItems = items.filter((r) => {
    if (lowStockOnly && r.quantity > r.reorder_point) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${r.name} ${r.category} ${r.sku || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inventory Ledger</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-outline" onClick={() => fileRef.current.click()} disabled={importing}>
            {importing ? 'Importing…' : '⬆ Import'}
          </button>
          <button className="btn btn-outline" onClick={handleExport}>⬇ Export</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name, category, or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 260px', maxWidth: 360 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          Low stock only
        </label>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {visibleItems.length} of {items.length} item{items.length === 1 ? '' : 's'} · click a column header to sort
        </span>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <Table columns={columns} rows={visibleItems} loading={listLoading} loadingText="Loading inventory…" />

      {editing !== null && (
        <Modal
          title={editing.id ? 'Edit Item' : 'Add Item'}
          onClose={() => setEditing(null)}
          footer={(
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </>
          )}
        >
          <div className="form-row">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>SKU</label>
            <input value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Category</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Quantity</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Cost Price</label>
              <input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Selling Price</label>
              <input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-row">
            <label>Reorder Point</label>
            <input type="number" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: Number(e.target.value) })} />
          </div>
        </Modal>
      )}
    </div>
  )
}
