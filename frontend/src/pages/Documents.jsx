import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'
import { useAuth } from '../hooks/useAuth.jsx'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import Spinner from '../components/Spinner.jsx'
import DocumentPreview from '../components/DocumentPreview.jsx'

const emptyLine = () => ({ description: '', quantity: 1, unit_price: 0 })
const emptyForm = () => ({
  customer_name: '', customer_phone: '', customer_address: '',
  tax_rate: 0, discount: 0, notes: '', valid_days: 14, items: [emptyLine()],
})

export default function Documents({ kind }) {
  const api = useApi()
  const { token } = useAuth()
  const isInvoice = kind === 'invoices'
  const title = isInvoice ? 'Invoices' : 'Quotations / Proforma'
  const numberKey = isInvoice ? 'invoice_no' : 'quote_no'

  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [pdfLoading, setPdfLoading] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [company, setCompany] = useState(null)

  const load = () => {
    setListLoading(true)
    api.get(`/${kind}/`).then(setDocs).catch((e) => setError(e.message)).finally(() => setListLoading(false))
  }
  useEffect(() => { load() }, [kind]) // eslint-disable-line
  useEffect(() => { api.get('/accounts/company-info').then(setCompany).catch(() => {}) }, []) // eslint-disable-line

  const updateLine = (idx, field, value) => {
    const items = form.items.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    setForm({ ...form, items })
  }

  const save = async () => {
    setError('')
    try {
      const payload = { ...form, items: form.items.filter((l) => l.description.trim()) }
      if (!payload.items.length) { setError('Add at least one line item'); return }
      await api.post(`/${kind}/`, payload)
      setOpen(false); setForm(emptyForm()); load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (id) => {
    if (!confirm(`Delete this ${isInvoice ? 'invoice' : 'quotation'}?`)) return
    try { await api.del(`/${kind}/${id}`); load() } catch (e) { setError(e.message) }
  }

  const convert = async (id) => {
    try { await api.post(`/quotations/${id}/convert`, {}); load() }
    catch (e) { setError(e.message) }
  }

  const downloadPdf = async (doc) => {
    setPdfLoading(doc.id)
    try {
      const res = await fetch(apiUrl(`/api/${kind}/${doc.id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${isInvoice ? 'Invoice' : 'Quotation'}-${doc[numberKey]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setPdfLoading(null) }
  }

  const columns = [
    { key: 'no', header: 'No.', render: (r) => <span className="cheque-number">{r[numberKey]}</span>, sortable: true, sortValue: (r) => r[numberKey] },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString(), sortable: true },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}`, sortable: true },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge badge-${r.status}`}>{r.status}</span>, sortable: true },
    {
      key: 'actions', header: '',
      stopRowClick: true,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline" onClick={() => downloadPdf(r)} disabled={pdfLoading === r.id}>
            {pdfLoading === r.id ? <Spinner inline /> : '⬇ PDF'}
          </button>
          {!isInvoice && !['accepted','rejected'].includes(r.status) && (
            <button className="btn btn-outline" onClick={() => convert(r.id)}>→ Invoice</button>
          )}
          <button className="btn btn-danger" onClick={() => remove(r.id)}>✕</button>
        </div>
      ),
    },
  ]

  const subtotal = form.items.reduce((s, l) => s + (Number(l.quantity)||0) * (Number(l.unit_price)||0), 0)
  const taxAmt   = subtotal * ((Number(form.tax_rate)||0) / 100)
  const total    = subtotal + taxAmt - (Number(form.discount)||0)

  return (
    <div className="page">
      <div className="page-header">
        <h1>{title}</h1>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setOpen(true) }}>
          + New {isInvoice ? 'Invoice' : 'Quotation'}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <Table columns={columns} rows={docs} loading={listLoading} loadingText={`Loading ${title.toLowerCase()}…`}
        emptyText={`No ${title.toLowerCase()} yet.`} onRowClick={(row) => setPreviewDoc(row)} />

      {previewDoc && (
        <DocumentPreview kind={kind} doc={previewDoc} company={company} onClose={() => setPreviewDoc(null)} />
      )}

      {open && (
        <Modal title={`New ${isInvoice ? 'Invoice' : 'Quotation'}`} onClose={() => setOpen(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>}>
          <div className="form-row"><label>Customer Name *</label>
            <input value={form.customer_name} onChange={(e) => setForm({...form, customer_name: e.target.value})} /></div>
          <div className="form-row"><label>Phone</label>
            <input value={form.customer_phone} onChange={(e) => setForm({...form, customer_phone: e.target.value})} /></div>
          <div className="form-row"><label>Address</label>
            <input value={form.customer_address} onChange={(e) => setForm({...form, customer_address: e.target.value})} /></div>
          {!isInvoice && (
            <div className="form-row"><label>Valid for (days)</label>
              <input type="number" value={form.valid_days} onChange={(e) => setForm({...form, valid_days: Number(e.target.value)})} /></div>
          )}

          <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600 }}>Line Items</div>
          {form.items.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input placeholder="Description" value={line.description} style={{ flex: 2 }}
                onChange={(e) => updateLine(idx, 'description', e.target.value)} />
              <input type="number" placeholder="Qty" value={line.quantity} style={{ width: 65 }}
                onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))} />
              <input type="number" placeholder="Unit Price" value={line.unit_price} style={{ width: 100 }}
                onChange={(e) => updateLine(idx, 'unit_price', Number(e.target.value))} />
              <button className="btn btn-danger" onClick={() => setForm({...form, items: form.items.filter((_,i)=>i!==idx)})}>✕</button>
            </div>
          ))}
          <button className="btn btn-outline" onClick={() => setForm({...form, items: [...form.items, emptyLine()]})}
            style={{ marginBottom: 14 }}>+ Add Line</button>

          <div className="form-row"><label>Tax Rate (%)</label>
            <input type="number" value={form.tax_rate} onChange={(e) => setForm({...form, tax_rate: Number(e.target.value)})} /></div>
          <div className="form-row"><label>Discount (TZS)</label>
            <input type="number" value={form.discount} onChange={(e) => setForm({...form, discount: Number(e.target.value)})} /></div>
          <div className="form-row"><label>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} /></div>

          <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 10, padding: '8px 0', borderTop: '1px solid #e0ddd4' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 8 }}>Total:</span>
            TZS {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          {error && <div className="error-text">{error}</div>}
        </Modal>
      )}
    </div>
  )
}
