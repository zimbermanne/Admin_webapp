import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'

const empty = { name: '', phone: '', total_owed: 0, note: '' }

function statusBadge(status) {
  if (status === 'paid') return <span className="badge badge-paid">Paid</span>
  if (status === 'partial') return <span className="badge badge-partial">Partial</span>
  return <span className="badge badge-unpaid">Unpaid</span>
}

export default function Debtors() {
  const api = useApi()
  const [debtors, setDebtors] = useState([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [payTarget, setPayTarget] = useState(null)
  const [payAmount, setPayAmount] = useState(0)
  const [listLoading, setListLoading] = useState(true)

  const load = () => { setListLoading(true); api.get('/ledgers/debtors').then(setDebtors).catch((e) => setError(e.message)).finally(() => setListLoading(false)) }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      await api.post('/ledgers/debtors', form)
      setOpen(false)
      setForm(empty)
      load()
    } catch (e) {
      setError(e.message)
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
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add Debtor</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <Table columns={columns} rows={debtors} loading={listLoading} loadingText="Loading debtors…" emptyText="No debtors recorded yet." />

      {open && (
        <Modal
          title="Add Debtor"
          onClose={() => setOpen(false)}
          footer={(<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>)}
        >
          <div className="form-row"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-row"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="form-row"><label>Total Owed</label><input type="number" value={form.total_owed} onChange={(e) => setForm({ ...form, total_owed: Number(e.target.value) })} /></div>
          <div className="form-row"><label>Note</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
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
