import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const emptyManual = { name: '', phone: '', total_owed: 0, note: '' }
const emptyLine = { mode: 'existing', item_id: '', item_name: '', category: 'General', unit: 'pcs', quantity: 1, unit_cost: '', selling_price: '' }

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

export default function Creditors() {
  const api = useApi()
  const [creditors, setCreditors] = useState([])
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

  const load = () => { setListLoading(true); api.get('/ledgers/creditors').then(setCreditors).catch((e) => setError(e.message)).finally(() => setListLoading(false)) }
  const loadInventory = () => { api.get('/inventory/').then(setInventory).catch(() => {}) }

  useEffect(() => { load(); loadInventory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = (id) => inventory.find((i) => String(i.id) === String(id))

  const lineTotal = (line) => {
    if (line.mode === 'existing') {
      const item = itemById(line.item_id)
      const cost = line.unit_cost !== '' ? Number(line.unit_cost) : (item ? item.cost_price : 0)
      return Number(line.quantity || 0) * Number(cost || 0)
    }
    return Number(line.quantity || 0) * Number(line.unit_cost || 0)
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
        await api.post('/ledgers/creditors', manual)
      } else {
        if (!contact.name.trim()) throw new Error('Supplier name is required')
        const validLines = lines.filter((l) => (l.mode === 'existing' ? l.item_id : l.item_name.trim()) && Number(l.quantity) > 0)
        if (validLines.length === 0) throw new Error('Add at least one item received from this supplier')
        const payload = {
          ...contact,
          items: validLines.map((l) => l.mode === 'existing' ? ({
            item_id: Number(l.item_id),
            quantity: Number(l.quantity || 0),
            unit_cost: l.unit_cost !== '' ? Number(l.unit_cost) : undefined,
          }) : ({
            item_name: l.item_name,
            category: l.category || 'General',
            unit: l.unit || 'pcs',
            quantity: Number(l.quantity || 0),
            unit_cost: l.unit_cost !== '' ? Number(l.unit_cost) : 0,
            selling_price: l.selling_price !== '' ? Number(l.selling_price) : 0,
          })),
        }
        await api.post('/ledgers/creditors', payload)
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
      await api.post(`/ledgers/creditors/pay/${payTarget.id}`, { amount: Number(payAmount) })
      setPayTarget(null)
      setPayAmount(0)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'name', header: 'Supplier', sortable: true },
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
        <h1>Creditors Ledger</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setOpen(true) }}>+ Add Creditor</button>
      </div>
      {error && !open && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <Table columns={columns} rows={creditors} loading={listLoading} loadingText="Loading creditors…" emptyText="No creditors recorded yet." />

      {open && (
        <Modal
          title="Add Creditor"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>)}
        >
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

          <div className="form-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={mode === 'inventory' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setMode('inventory')}>Add to Inventory</button>
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
              <div className="form-row"><label>Supplier Name</label><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
              <div className="form-row"><label>Phone</label><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              <div className="form-row"><label>Note</label><input value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} /></div>

              <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Items received on credit</div>
              {lines.map((line, idx) => {
                const item = itemById(line.item_id)
                return (
                  <div key={idx} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button type="button" className={line.mode === 'existing' ? 'btn btn-primary' : 'btn btn-outline'}
                        onClick={() => updateLine(idx, { mode: 'existing' })} style={{ fontSize: 12, padding: '4px 10px' }}>Existing item</button>
                      <button type="button" className={line.mode === 'new' ? 'btn btn-primary' : 'btn btn-outline'}
                        onClick={() => updateLine(idx, { mode: 'new' })} style={{ fontSize: 12, padding: '4px 10px' }}>+ New item</button>
                      {lines.length > 1 && <button type="button" className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }} onClick={() => removeLine(idx)}>✕ Remove</button>}
                    </div>

                    {line.mode === 'existing' ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select style={{ flex: 2 }} value={line.item_id} onChange={(e) => updateLine(idx, { item_id: e.target.value, unit_cost: '' })}>
                          <option value="">Select item to restock…</option>
                          {inventory.map((inv) => (
                            <option key={inv.id} value={inv.id}>{inv.name} ({inv.quantity} {inv.unit} in stock)</option>
                          ))}
                        </select>
                        <input type="number" min="0" step="any" style={{ flex: 1 }} placeholder="Qty received"
                          value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                        <input type="number" min="0" step="any" style={{ flex: 1 }}
                          placeholder={item ? `TZS ${item.cost_price}` : 'Unit cost'}
                          value={line.unit_cost} onChange={(e) => updateLine(idx, { unit_cost: e.target.value })} />
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input style={{ flex: 2 }} placeholder="New item name" value={line.item_name} onChange={(e) => updateLine(idx, { item_name: e.target.value })} />
                          <input style={{ flex: 1 }} placeholder="Category" value={line.category} onChange={(e) => updateLine(idx, { category: e.target.value })} />
                          <input style={{ flex: 1 }} placeholder="Unit (pcs, kg…)" value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input type="number" min="0" step="any" style={{ flex: 1 }} placeholder="Qty received"
                            value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                          <input type="number" min="0" step="any" style={{ flex: 1 }} placeholder="Unit cost"
                            value={line.unit_cost} onChange={(e) => updateLine(idx, { unit_cost: e.target.value })} />
                          <input type="number" min="0" step="any" style={{ flex: 1 }} placeholder="Selling price (optional)"
                            value={line.selling_price} onChange={(e) => updateLine(idx, { selling_price: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>Line total: TZS {lineTotal(line).toLocaleString()}</div>
                  </div>
                )
              })}
              <button type="button" className="btn btn-outline" onClick={addLine} style={{ marginBottom: 12 }}>+ Add Item</button>

              <div style={{ fontWeight: 600, textAlign: 'right' }}>Total Owed: TZS {inventoryTotal.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>Stock quantities will be increased automatically.</div>
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
