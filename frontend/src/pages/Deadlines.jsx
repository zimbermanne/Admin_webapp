import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import RowActionsMenu from '../components/RowActionsMenu.jsx'

const DEADLINE_TYPES = [
  'tra_paye', 'tra_sdl', 'tra_vat', 'brela_annual_fee',
  'business_name_renewal', 'nssf', 'wcf', 'osha', 'custom',
]

const emptyForm = () => ({ deadline_type: 'custom', label: '', due_date: '', recurrence: 'monthly', notes: '' })

function groupBucket(dueDate) {
  const now = new Date()
  const due = new Date(dueDate)
  const days = Math.floor((due - now) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'overdue'
  if (days <= 7) return 'thisWeek'
  return 'later'
}

export default function Deadlines() {
  const { t } = useTranslation()
  const api = useApi()

  const [deadlines, setDeadlines] = useState([])
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = () => {
    setListLoading(true)
    api.get('/deadlines/').then(setDeadlines).catch((e) => setError(e.message)).finally(() => setListLoading(false))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setError(''); setOpen(true) }
  const openEdit = (d) => {
    setEditingId(d.id)
    setForm({
      deadline_type: d.deadline_type, label: d.label,
      due_date: d.due_date ? d.due_date.slice(0, 10) : '',
      recurrence: d.recurrence, notes: d.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    setError(''); setSaving(true)
    try {
      if (!form.label.trim()) throw new Error(t('deadlines.labelRequired'))
      if (!form.due_date) throw new Error(t('deadlines.dueDateRequired'))
      const payload = {
        deadline_type: form.deadline_type,
        label: form.label,
        due_date: new Date(form.due_date).toISOString(),
        recurrence: form.recurrence,
        notes: form.notes,
      }
      if (editingId) {
        await api.put(`/deadlines/${editingId}`, payload)
      } else {
        await api.post('/deadlines/', payload)
      }
      setOpen(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const deactivate = async (d) => {
    try { await api.put(`/deadlines/${d.id}`, { is_active: false }); load() } catch (e) { setError(e.message) }
  }

  const remove = async (d) => {
    if (!confirm(t('deadlines.confirmDelete'))) return
    try { await api.del(`/deadlines/${d.id}`); load() } catch (e) { setError(e.message) }
  }

  const sorted = [...deadlines].sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  const groups = {
    overdue: sorted.filter((d) => groupBucket(d.due_date) === 'overdue'),
    thisWeek: sorted.filter((d) => groupBucket(d.due_date) === 'thisWeek'),
    later: sorted.filter((d) => groupBucket(d.due_date) === 'later'),
  }

  const columns = [
    { key: 'label', header: t('deadlines.label') },
    { key: 'deadline_type', header: t('deadlines.type'), render: (r) => <span className="badge">{t(`deadlines.types.${r.deadline_type}`)}</span> },
    { key: 'due_date', header: t('deadlines.dueDate'), render: (r) => new Date(r.due_date).toLocaleDateString() },
    { key: 'recurrence', header: t('deadlines.recurrence'), render: (r) => t(`deadlines.recurrences.${r.recurrence}`) },
    {
      key: 'actions', header: '', stopRowClick: true,
      render: (r) => (
        <RowActionsMenu items={[
          { label: t('common.edit'), icon: '✎', onClick: () => openEdit(r) },
          { label: t('deadlines.deactivate'), icon: '⏸', onClick: () => deactivate(r) },
          { label: t('common.delete'), icon: '✕', onClick: () => remove(r), danger: true },
        ]} />
      ),
    },
  ]

  const renderGroup = (key, rows) => rows.length > 0 && (
    <div key={key} style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 8, fontSize: 14, color: key === 'overdue' ? 'var(--danger)' : 'var(--text-dark)' }}>
        {t(`deadlines.groups.${key}`)} ({rows.length})
      </h3>
      <Table columns={columns} rows={rows} emptyText="" />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('deadlines.title')}</h1>
        <button className="btn btn-primary" onClick={openNew}>+ {t('deadlines.newDeadline')}</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      {listLoading ? (
        <div className="card"><div style={{ padding: 20, textAlign: 'center' }}>{t('common.loadingEllipsis')}</div></div>
      ) : deadlines.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('deadlines.noDeadlines')}</div>
      ) : (
        <>
          {renderGroup('overdue', groups.overdue)}
          {renderGroup('thisWeek', groups.thisWeek)}
          {renderGroup('later', groups.later)}
        </>
      )}

      {open && (
        <Modal
          title={editingId ? t('deadlines.editDeadline') : t('deadlines.newDeadline')}
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t('common.loadingEllipsis') : t('common.save')}</button>
          </>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="form-row"><label>{t('deadlines.type')}</label>
            <select value={form.deadline_type} onChange={(e) => setForm({ ...form, deadline_type: e.target.value })}>
              {DEADLINE_TYPES.map((tp) => <option key={tp} value={tp}>{t(`deadlines.types.${tp}`)}</option>)}
            </select></div>
          <div className="form-row"><label>{t('deadlines.label')} *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div className="form-row"><label>{t('deadlines.dueDate')} *</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-row"><label>{t('deadlines.recurrence')}</label>
            <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              <option value="monthly">{t('deadlines.recurrences.monthly')}</option>
              <option value="yearly">{t('deadlines.recurrences.yearly')}</option>
              <option value="once">{t('deadlines.recurrences.once')}</option>
            </select></div>
          <div className="form-row"><label>{t('common.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}
