import { useEffect, useState, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import RowActionsMenu from '../components/RowActionsMenu.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { useSearch } from '../hooks/useSearch.js'

const empty = { name: '', sku: '', category: 'General', quantity: 0, unit: 'pcs', cost_price: 0, selling_price: 0, reorder_point: 5 }

export default function Inventory() {
  const api = useApi()
  const fileRef = useRef()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [importing, setImporting] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [redundant, setRedundant] = useState(null)
  const [checkingRedundant, setCheckingRedundant] = useState(false)
  const [merging, setMerging] = useState(null)

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
      const res = await fetch(apiUrl('/api/inventory/export/spreadsheet'), { credentials: 'include' })
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

  const checkRedundant = async () => {
    setCheckingRedundant(true); setError('')
    try {
      const data = await api.get('/inventory/redundant/check')
      setRedundant(data)
    } catch (e) { setError(e.message) }
    finally { setCheckingRedundant(false) }
  }

  const mergeGroup = async (group) => {
    const [keep, ...rest] = group.items
    if (!confirm(`Merge ${rest.length} duplicate(s) into "${keep.name}"? Their quantities will be added to it and the duplicate rows deleted.`)) return
    setMerging(keep.id)
    try {
      await api.post('/inventory/redundant/merge', { keep_id: keep.id, merge_ids: rest.map((i) => i.id) })
      load()
      checkRedundant()
    } catch (e) { setError(e.message) }
    finally { setMerging(null) }
  }

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'category', header: 'Category' },
    { key: 'quantity', header: 'Qty', render: (r) => `${r.quantity} ${r.unit}` },
    { key: 'selling_price', header: 'Price', render: (r) => `TZS ${r.selling_price.toLocaleString()}` },
    {
      key: 'status', header: 'Status',
      render: (r) => r.quantity <= r.reorder_point
        ? <span className="badge badge-unpaid">Low Stock</span>
        : <span className="badge badge-paid">OK</span>,
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <RowActionsMenu items={[
          { label: 'Edit', icon: '✎', onClick: () => openEdit(r) },
          { label: 'Delete', icon: '✕', onClick: () => remove(r.id), danger: true },
        ]} />
      ),
    },
  ]

  const { query, setQuery, filtered } = useSearch(items, ['name', 'sku', 'category'])

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
          <button className="btn btn-outline" onClick={checkRedundant} disabled={checkingRedundant}>
            {checkingRedundant ? 'Checking…' : '🔎 Check for Duplicates'}
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', marginBottom: 14 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search by name, SKU, or category…" />
      </div>

      <Table columns={columns} rows={filtered} loading={listLoading} loadingText="Loading inventory…" emptyText={query ? 'No items match your search.' : 'No items yet.'} />

      {redundant && (
        <Modal
          title="Redundant / Duplicate Items"
          onClose={() => setRedundant(null)}
          footer={<button className="btn btn-outline" onClick={() => setRedundant(null)}>Close</button>}
        >
          {redundant.flagged_item_count === 0 ? (
            <div className="doc-sheet-muted">No likely duplicates found — inventory looks clean.</div>
          ) : (
            <>
              {redundant.exact_sku_duplicates.length > 0 && (
                <>
                  <div className="invoice-editor-section-label">Same SKU</div>
                  {redundant.exact_sku_duplicates.map((group, gi) => (
                    <RedundantGroup key={`sku-${gi}`} group={group} onMerge={() => mergeGroup(group)} merging={merging} />
                  ))}
                </>
              )}
              {redundant.same_name_duplicates.length > 0 && (
                <>
                  <div className="invoice-editor-section-label">Same Name / Category</div>
                  {redundant.same_name_duplicates.map((group, gi) => (
                    <RedundantGroup key={`name-${gi}`} group={group} onMerge={() => mergeGroup(group)} merging={merging} />
                  ))}
                </>
              )}
            </>
          )}
        </Modal>
      )}

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

function RedundantGroup({ group, onMerge, merging }) {
  const [keep, ...rest] = group.items
  return (
    <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-sunken)', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {group.items.map((i) => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>
              {i.id === keep.id && <span title="Item that will be kept">⭐ </span>}
              {i.name}{i.sku ? ` (SKU: ${i.sku})` : ''} — {i.category}
            </span>
            <span className="doc-sheet-muted">{i.quantity} units</span>
          </div>
        ))}
      </div>
      <button className="btn btn-outline" onClick={onMerge} disabled={merging === keep.id}>
        {merging === keep.id ? 'Merging…' : `Merge ${rest.length} into "${keep.name}"`}
      </button>
    </div>
  )
}
