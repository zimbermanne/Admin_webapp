import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const emptyManual = { name: '', phone: '', total_owed: 0, note: '' }
const emptyLine = { item_id: '', quantity: 1, unit_price: '' }

function statusBadge(status) {
  if (status === 'paid') return <span className="badge badge-paid">Paid</span>
  if (status === 'partial') return <span className="badge badge-partial">Partial</span>
  return <span className="badge badge-unpaid">Unpaid</span>
}

function itemsSummary(r) {
  if (!r.items || r.items.length === 0) return '—'
  const label = r.items.length === 1 ? r.items[0].item_name : `${r.items.length} items`
  const title = r.items.map((it) => `${it.item_name} — ${it.quantity} × TZS ${it.unit_price.toLocaleString()}`).join('\n')
  return <span title={title} style={{ cursor: 'help', textDecoration: 'underline dotted' }}>{label}</span>
}

export default function Debtors() {
  const api = useApi()
  const [debtors, setDebtors] = useState([])
  const [inventory, setInventory] = useState([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('inventory') // 'inventory' | 'manual'
  const [manual, setManual] = useState(emptyManual)
  const [contact, setContact] = useState({ name: '', phone: '', note: '' })
  const [lines, setLines] = useState([{ ...emptyLine }])
  const [payTarget, setPayTarget] = useState(null)
  const [payAmount, setPayAmount] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => { setListLoading(true); api.get('/ledgers/debtors').then(setDebtors).catch((e) => setError(e.message)).finally(() => setListLoading(false)) }
  const loadInventory = () => { api.get('/inventory/').then(setInventory).catch(() => {}) }

  useEffect(() => { load(); loadInventory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = (id) => inventory.find((i) => String(i.id) === String(id))

  const lineTotal = (line) => {
    const item = itemById(line.item_id)
    const price = line.unit_price !== '' ? Number(line.unit_price) : (item ? item.selling_price : 0)
    return Number(line.quantity || 0) * Number(price || 0)
  }

  const inventoryTotal = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines, inventory]) // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = () => setLines([...lines, { ...emptyLine }])
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx))
  const updateLine = (idx, patch) => setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const resetForm = () => {
    setMode('inventory')
    setManual(emptyManual)
    setContact({ name: '', phone: '', note: '' })
    setLines([{ ...emptyLine }])
  }

  const save = async () => {
    setError('')
    try {
      setSaving(true)
      if (mode === 'manual') {
        await api.post('/ledgers/debtors', manual)
      } else {
        if (!contact.name.trim()) throw new Error('Client name is required')
        const validLines = lines.filter((l) => l.item_id)
        if (validLines.length === 0) throw new Error('Pick at least one item from inventory')
        const payload = {
          ...contact,
          items: validLines.map((l) => ({
            item_id: Number(l.item_id),
            quantity: Number(l.quantity || 0),
            unit_price: l.unit_price !== '' ? Number(l.unit_price) : undefined,
          })),
        }
        await api.post('/ledgers/debtors', payload)
      }
      setOpen(false)
      resetForm()
      load()
      loadInventory()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const recordPayment = async () => {
    try {
      await api.post(`/ledgers/debtors/pay/${payTarget.id}`, { amount: Number(payAmount) })
      setPayTarget(null)
      setPayAmount(0)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'name', header: 'Client', sortable: true },
    { key: 'phone', header: 'Phone', sortable: true },
    { key: 'items', header: 'Items', render: itemsSummary },
    { key: 'total_owed', header: 'Owed', render: (r) => `TZS ${r.total_owed.toLocaleString()}`, sortable: true },
    { key: 'amount_paid', header: 'Paid', render: (r) => `TZS ${r.amount_paid.toLocaleString()}`, sortable: true },
    { key: 'balance', header: 'Balance', render: (r) => `TZS ${(r.total_owed - r.amount_paid).toLocaleString()}`, sortable: true, sortValue: (r) => r.total_owed - r.amount_paid },
    { key: 'status', header: 'Status', render: (r) => statusBadge(r.status), sortable: true },
    {
      key: 'actions', header: '',
      render: (r) => r.status !== 'paid'
        ? <button className="btn btn-outline" onClick={() => { setPayTarget(r); setPayAmount(0) }}>Record Payment</button>
        : null,
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>Clients / Debtors</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setOpen(true) }}>+ Add Debtor</button>
      </div>
      {error && !open && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <Table columns={columns} rows={debtors} loading={listLoading} loadingText="Loading debtors…" emptyText="No debtors recorded yet." />

      {open && (
        <Modal
          title="Add Debtor"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

          <div className="form-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={mode === 'inventory' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setMode('inventory')}>From Inventory</button>
              <button type="button" className={mode === 'manual' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setMode('manual')}>Manual Amount</button>
            </div>
          </div>

          {mode === 'manual' ? (
            <>
              <div className="form-row"><label>Name</label><input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></div>
              <div className="form-row"><label>Phone</label><input value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} /></div>
              <div className="form-row"><label>Total Owed</label><input type="number" value={manual.total_owed} onChange={(e) => setManual({ ...manual, total_owed: Number(e.target.value) })} /></div>
              <div className="form-row"><label>Note</label><input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} /></div>
            </>
          ) : (
            <>
              <div className="form-row"><label>Client Name</label><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
              <div className="form-row"><label>Phone</label><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              <div className="form-row"><label>Note</label><input value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} /></div>

              <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Items given out on credit</div>
              {lines.map((line, idx) => {
                const item = itemById(line.item_id)
                return (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <select style={{ flex: 2 }} value={line.item_id} onChange={(e) => updateLine(idx, { item_id: e.target.value, unit_price: '' })}>
                      <option value="">Select item…</option>
                      {inventory.map((inv) => (
                        <option key={inv.id} value={inv.id} disabled={inv.quantity <= 0}>
                          {inv.name} ({inv.quantity} {inv.unit} in stock)
                        </option>
                      ))}
                    </select>
                    <input type="number" min="0" step="any" style={{ flex: 1 }} placeholder="Qty"
                      value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                    <input type="number" min="0" step="any" style={{ flex: 1 }}
                      placeholder={item ? `TZS ${item.selling_price}` : 'Unit price'}
                      value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>TZS {lineTotal(line).toLocaleString()}</div>
                    {lines.length > 1 && <button type="button" className="btn btn-outline" onClick={() => removeLine(idx)}>✕</button>}
                  </div>
                )
              })}
              <button type="button" className="btn btn-outline" onClick={addLine} style={{ marginBottom: 12 }}>+ Add Item</button>

              <div style={{ fontWeight: 600, textAlign: 'right' }}>Total Owed: TZS {inventoryTotal.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>Stock quantities will be reduced automatically.</div>
            </>
          )}
        </Modal>
      )}

      {payTarget && (
        <Modal
          title={`Record Payment — ${payTarget.name}`}
          onClose={() => setPayTarget(null)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setPayTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={recordPayment}>Save</button>
          </>)}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Outstanding balance: TZS {(payTarget.total_owed - payTarget.amount_paid).toLocaleString()}
          </div>
          <div className="form-row"><label>Amount Paid</label><input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
        </Modal>
      )}
    </div>
  )
}
