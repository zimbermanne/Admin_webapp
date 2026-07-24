import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import RowActionsMenu from '../components/RowActionsMenu.jsx'

const money = (n) => `TZS ${(Number(n) || 0).toLocaleString()}`

const CATEGORY_LABELS = {
  property: 'Property',
  vehicle: 'Vehicle',
  equipment: 'Equipment',
  other: 'Other',
}

const emptyForm = () => ({ name: '', category: 'other', estimated_value: '', acquired_date: '', notes: '' })

export default function Assets() {
  const { t } = useTranslation()
  const api = useApi()

  const [assets, setAssets] = useState([])
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = () => {
    setListLoading(true)
    api.get('/assets/').then(setAssets).catch((e) => setError(e.message)).finally(() => setListLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setError(''); setOpen(true) }
  const openEdit = (a) => {
    setEditingId(a.id)
    setForm({
      name: a.name, category: a.category, estimated_value: a.estimated_value,
      acquired_date: a.acquired_date ? a.acquired_date.slice(0, 10) : '', notes: a.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        estimated_value: Number(form.estimated_value) || 0,
        acquired_date: form.acquired_date ? new Date(form.acquired_date).toISOString() : null,
        notes: form.notes || '',
      }
      if (editingId) await api.put(`/assets/${editingId}`, payload)
      else await api.post('/assets/', payload)
      setOpen(false); setEditingId(null); setForm(emptyForm()); load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    try {
      await api.del(`/assets/${a.id}`)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const totalValue = assets.reduce((s, a) => s + (Number(a.estimated_value) || 0), 0)

  const columns = [
    { key: 'name', header: 'Name', render: (a) => <strong>{a.name}</strong> },
    { key: 'category', header: 'Category', render: (a) => CATEGORY_LABELS[a.category] || a.category },
    { key: 'estimated_value', header: 'Estimated Value', render: (a) => money(a.estimated_value) },
    { key: 'acquired_date', header: 'Acquired', render: (a) => a.acquired_date ? new Date(a.acquired_date).toLocaleDateString() : '—' },
    {
      key: 'actions', header: '', stopRowClick: true,
      render: (a) => (
        <RowActionsMenu items={[
          { label: 'Edit', onClick: () => openEdit(a) },
          { label: 'Delete', onClick: () => remove(a), danger: true },
        ]} />
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Assets</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Total estimated value: {money(totalValue)}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Asset</button>
      </div>

      <Table columns={columns} rows={assets} loading={listLoading} emptyText="No assets recorded yet." onRowClick={openEdit} />

      {open && (
        <Modal
          title={editingId ? 'Edit Asset' : 'Add Asset'}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save'}
              </button>
            </>
          }
        >
          {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Family House, Toyota Hilux" />
          <label>Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label>Estimated Value</label>
          <input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
          <label>Acquired Date</label>
          <input type="date" value={form.acquired_date} onChange={(e) => setForm({ ...form, acquired_date: e.target.value })} />
          <label>Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Modal>
      )}
    </div>
  )
}
