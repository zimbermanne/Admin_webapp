import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import PurchaseDetailPanel from '../components/PurchaseDetailPanel.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { useSearch } from '../hooks/useSearch.js'

const emptyRow = () => ({ key: Math.random().toString(36).slice(2), item_name: '', quantity: 1, unit_cost: 0 })
const emptyEdit = { item_name: '', supplier: '', quantity: 1, unit_cost: 0 }

export default function Purchases() {
  const api = useApi()
  const [purchases, setPurchases] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [inventory, setInventory] = useState([])

  // Add-multiple-items modal state
  const [open, setOpen] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [rows, setRows] = useState([emptyRow()])
  const [saving, setSaving] = useState(false)

  // Detail/edit side panel state
  const [editPurchase, setEditPurchase] = useState(null)
  const [editForm, setEditForm] = useState(emptyEdit)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = () => {
    setListLoading(true)
    api.get('/purchases/').then(setPurchases).catch((e) => setError(e.message)).finally(() => setListLoading(false))
    api.get('/purchases/stats/summary').then(setStats).catch(() => {})
    api.get('/inventory/').then(setInventory).catch(() => {})
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const findMatch = (name) => inventory.find((i) => i.name.trim().toLowerCase() === (name || '').trim().toLowerCase())

  // ---- Add multiple items ----
  const openAdd = () => {
    setSupplier('')
    setRows([emptyRow()])
    setError('')
    setOpen(true)
  }

  const updateRow = (key, changes) => {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r
      const updated = { ...r, ...changes }
      if (changes.item_name !== undefined) {
        const match = findMatch(changes.item_name)
        if (match) updated.unit_cost = match.cost_price
      }
      return updated
    }))
  }

  const addRow = () => setRows((rs) => [...rs, emptyRow()])
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))

  const saveAll = async () => {
    const items = rows
      .filter((r) => r.item_name.trim())
      .map((r) => ({ item_name: r.item_name, supplier, quantity: Number(r.quantity) || 0, unit_cost: Number(r.unit_cost) || 0 }))
    if (items.length === 0) {
      setError('Add at least one item before saving.')
      return
    }
    setSaving(true)
    try {
      await api.post('/purchases/multi', { items })
      setOpen(false)
      setRows([emptyRow()])
      setSupplier('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- View / edit a purchase in the side panel ----
  const openEdit = (purchase) => {
    setEditPurchase(purchase)
    setEditForm({
      item_name: purchase.item_name,
      supplier: purchase.supplier,
      quantity: purchase.quantity,
      unit_cost: purchase.unit_cost,
    })
    setError('')
  }

  const saveEdit = async () => {
    setSavingEdit(true)
    try {
      await api.put(`/purchases/${editPurchase.id}`, editForm)
      setEditPurchase(null) // collapse the panel once the save succeeds
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const columns = [
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'item_name', header: 'Item' },
    { key: 'supplier', header: 'Supplier' },
    { key: 'quantity', header: 'Qty' },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}` },
    { key: 'actions', header: '', stopRowClick: true, render: (r) => <button className="btn btn-outline" onClick={() => openEdit(r)}>View / Edit</button> },
  ]

  const { query, setQuery, filtered } = useSearch(purchases, [
    'item_name',
    'supplier',
    (r) => new Date(r.created_at).toLocaleDateString(),
  ])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchases Ledger</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Record Purchase</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {stats && (
        <div className="card-grid">
          <div className="card metric-card"><div className="label">Total Purchases</div><div className="value">{stats.total_purchases}</div></div>
          <div className="card metric-card"><div className="label">Total Spent</div><div className="value">TZS {stats.total_spent.toLocaleString()}</div></div>
        </div>
      )}
      <div style={{ display: 'flex', marginBottom: 14 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search by item, supplier, or date…" />
      </div>
      <Table columns={columns} rows={filtered} loading={listLoading} loadingText="Loading purchases…" emptyText={query ? 'No purchases match your search.' : 'No purchases yet.'} onRowClick={openEdit} />

      <datalist id="purchase-inventory-options">
        {inventory.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>

      {open && (
        <Modal
          title="Record Purchase"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : 'Save All'}</button>
          </>)}
        >
          <div className="form-row"><label>Supplier</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Applies to all items below" /></div>

          {rows.map((row, idx) => {
            const match = findMatch(row.item_name)
            return (
              <div key={row.key} style={{ border: '1px solid var(--border-strong)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Item {idx + 1}</span>
                  {rows.length > 1 && (
                    <button className="btn btn-outline" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => removeRow(row.key)}>Remove</button>
                  )}
                </div>
                <div className="form-row">
                  <label>Item Name</label>
                  <input
                    list="purchase-inventory-options"
                    value={row.item_name}
                    onChange={(e) => updateRow(row.key, { item_name: e.target.value })}
                    placeholder="Search existing stock or type a new item…"
                    autoComplete="off"
                  />
                  {row.item_name.trim() && (
                    <div style={{ fontSize: 12, marginTop: 4, color: match ? 'var(--text-muted)' : 'var(--accent-hover)' }}>
                      {match
                        ? `Existing item — current stock: ${match.quantity} ${match.unit || ''}. This purchase will add to it.`
                        : 'New item — will be added to inventory when saved.'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-row" style={{ flex: 1 }}><label>Quantity</label><input type="number" value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })} /></div>
                  <div className="form-row" style={{ flex: 1 }}><label>Unit Cost</label><input type="number" value={row.unit_cost} onChange={(e) => updateRow(row.key, { unit_cost: Number(e.target.value) })} /></div>
                </div>
              </div>
            )
          })}

          <button className="btn btn-outline" onClick={addRow}>+ Add Another Item</button>
        </Modal>
      )}

      <PurchaseDetailPanel
        purchase={editPurchase}
        form={editForm}
        onChange={setEditForm}
        matchedItem={findMatch(editForm.item_name)}
        saving={savingEdit}
        error={error}
        onCancel={() => setEditPurchase(null)}
        onSave={saveEdit}
      />
    </div>
  )
}
