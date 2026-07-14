import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import Spinner from '../components/Spinner.jsx'
import DocumentPreview from '../components/DocumentPreview.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { useSearch } from '../hooks/useSearch.js'

const emptyLine = () => ({ description: '', quantity: 1, unit_price: 0 })
const emptyForm = () => ({
  customer_name: '', customer_phone: '', customer_address: '',
  customer_tin: '', customer_vrn: '', due_date: '', po_number: '',
  tax_rate: 0, discount: 0, notes: '', valid_days: 14, items: [emptyLine()],
})

export default function Documents({ kind }) {
  const api = useApi()
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
  const [editingId, setEditingId] = useState(null)

  const lockedStatuses = isInvoice ? ['paid'] : ['accepted', 'rejected', 'expired']
  const isLocked = (doc) => lockedStatuses.includes(doc.status)

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

  const openEdit = (doc) => {
    setEditingId(doc.id)
    setForm({
      customer_name: doc.customer_name || '',
      customer_phone: doc.customer_phone || '',
      customer_address: doc.customer_address || '',
      customer_tin: doc.customer_tin || '',
      customer_vrn: doc.customer_vrn || '',
      due_date: doc.due_date ? doc.due_date.slice(0, 10) : '',
      po_number: doc.po_number || '',
      tax_rate: doc.tax_rate,
      discount: doc.discount,
      notes: doc.notes || '',
      valid_days: 14,
      items: doc.items.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price })),
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    setError('')
    try {
      const { customer_tin, customer_vrn, due_date, po_number, valid_days, ...rest } = form
      const payload = {
        ...rest,
        items: form.items.filter((l) => l.description.trim()),
        ...(isInvoice ? {
          customer_tin, customer_vrn, po_number,
          due_date: due_date ? new Date(due_date).toISOString() : null,
        } : { valid_days }),
      }
      if (!payload.items.length) { setError('Add at least one line item'); return }
      if (editingId) {
        await api.put(`/${kind}/${editingId}`, payload)
      } else {
        await api.post(`/${kind}/`, payload)
      }
      setOpen(false); setEditingId(null); setForm(emptyForm()); load()
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

  const downloadPdf = async (doc, variant = 'pdf', filenamePrefix = isInvoice ? 'Invoice' : 'Quotation') => {
    setPdfLoading(`${doc.id}:${variant}`)
    try {
      const path = variant === 'pdf' ? `/${kind}/${doc.id}/pdf` : `/${kind}/${doc.id}/${variant}/pdf`
      const res = await fetch(apiUrl(`/api${path}`), { credentials: 'include' })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filenamePrefix}-${doc[numberKey]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setPdfLoading(null) }
  }

  const columns = [
    { key: 'no', header: 'No.', render: (r) => <span className="cheque-number">{r[numberKey]}</span> },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'customer_name', header: 'Customer' },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}` },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge badge-${r.status}`}>{r.status}</span> },
    {
      key: 'actions', header: '',
      stopRowClick: true,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isLocked(r) ? (
            <span title={`A ${r.status} ${isInvoice ? 'invoice' : 'quotation'} cannot be edited`}
                  style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              🔒 Locked
            </span>
          ) : (
            <button className="btn btn-outline" onClick={() => openEdit(r)}>✎ Edit</button>
          )}
          <button className="btn btn-outline" onClick={() => downloadPdf(r)} disabled={pdfLoading === `${r.id}:pdf`}>
            {pdfLoading === `${r.id}:pdf` ? <Spinner inline /> : '⬇ PDF'}
          </button>
          {isInvoice && (
            <>
              <button className="btn btn-outline" onClick={() => downloadPdf(r, 'packing-list', 'PackingList')} disabled={pdfLoading === `${r.id}:packing-list`}>
                {pdfLoading === `${r.id}:packing-list` ? <Spinner inline /> : '📦 Packing List'}
              </button>
              <button className="btn btn-outline" onClick={() => downloadPdf(r, 'delivery-note', 'DeliveryNote')} disabled={pdfLoading === `${r.id}:delivery-note`}>
                {pdfLoading === `${r.id}:delivery-note` ? <Spinner inline /> : '🚚 Delivery Note'}
              </button>
            </>
          )}
          {!isInvoice && !['accepted','rejected'].includes(r.status) && (
            <button className="btn btn-outline" onClick={() => convert(r.id)}>→ Invoice</button>
          )}
          <button className="btn btn-danger" onClick={() => remove(r.id)}>✕</button>
        </div>
      ),
    },
  ]

  const { query, setQuery, filtered } = useSearch(docs, [
    'customer_name',
    numberKey,
    (r) => new Date(r.created_at).toLocaleDateString(),
  ])

  const subtotal = form.items.reduce((s, l) => s + (Number(l.quantity)||0) * (Number(l.unit_price)||0), 0)
  const taxAmt   = subtotal * ((Number(form.tax_rate)||0) / 100)
  const total    = subtotal + taxAmt - (Number(form.discount)||0)

  return (
    <div className="page">
      <div className="page-header">
        <h1>{title}</h1>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm()); setOpen(true) }}>
          + New {isInvoice ? 'Invoice' : 'Quotation'}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', marginBottom: 14 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search by customer, number, or date…" />
      </div>
      <Table columns={columns} rows={filtered} loading={listLoading} loadingText={`Loading ${title.toLowerCase()}…`}
        emptyText={query ? `No ${title.toLowerCase()} match your search.` : `No ${title.toLowerCase()} yet.`} onRowClick={(row) => setPreviewDoc(row)} />

      {previewDoc && (
        <DocumentPreview kind={kind} doc={previewDoc} company={company} onClose={() => setPreviewDoc(null)} />
      )}

      {open && (
        <Modal title={editingId ? `Edit ${isInvoice ? 'Invoice' : 'Quotation'}` : `New ${isInvoice ? 'Invoice' : 'Quotation'}`}
          onClose={() => { setOpen(false); setEditingId(null) }}
          footer={<>
            <button className="btn btn-outline" onClick={() => { setOpen(false); setEditingId(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editingId ? 'Save Changes' : 'Save'}</button>
          </>}>
          <div className="form-row"><label>Customer Name *</label>
            <input value={form.customer_name} onChange={(e) => setForm({...form, customer_name: e.target.value})} /></div>
          <div className="form-row"><label>Phone</label>
            <input value={form.customer_phone} onChange={(e) => setForm({...form, customer_phone: e.target.value})} /></div>
          <div className="form-row"><label>Address</label>
            <input value={form.customer_address} onChange={(e) => setForm({...form, customer_address: e.target.value})} /></div>
          {isInvoice && (
            <>
              <div className="form-row"><label>Customer TIN</label>
                <input value={form.customer_tin} onChange={(e) => setForm({...form, customer_tin: e.target.value})} /></div>
              <div className="form-row"><label>Customer VRN</label>
                <input value={form.customer_vrn} onChange={(e) => setForm({...form, customer_vrn: e.target.value})} /></div>
              <div className="form-row"><label>Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} /></div>
              <div className="form-row"><label>PO / DO Number</label>
                <input value={form.po_number} onChange={(e) => setForm({...form, po_number: e.target.value})} /></div>
            </>
          )}
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
