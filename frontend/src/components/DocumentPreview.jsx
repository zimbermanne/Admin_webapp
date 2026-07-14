import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function DocumentPreview({ kind, doc, company, onClose }) {
  const api = useApi()
  const isInvoice = kind === 'invoices'
  const numberKey = isInvoice ? 'invoice_no' : 'quote_no'
  const label = isInvoice ? 'Invoice' : 'Quotation'

  const [pdfLoading, setPdfLoading] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailAddr, setEmailAddr] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const fetchPdfBlob = async () => {
    const res = await fetch(apiUrl(`/api/${kind}/${doc.id}/pdf`), { credentials: 'include' })
    if (!res.ok) throw new Error('PDF generation failed')
    return res.blob()
  }

  const handleExportPdf = async () => {
    setError(''); setPdfLoading(true)
    try {
      const blob = await fetchPdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${label}-${doc[numberKey]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setPdfLoading(false) }
  }

  const handlePrint = async () => {
    setError(''); setPdfLoading(true)
    try {
      const blob = await fetchPdfBlob()
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      // Give the PDF a moment to render before invoking print.
      if (win) win.onload = () => { try { win.print() } catch {} }
    } catch (e) { setError(e.message) }
    finally { setPdfLoading(false) }
  }

  const handleSendEmail = async () => {
    if (!emailAddr.trim()) { setError('Enter a recipient email'); return }
    setError(''); setEmailSending(true); setNotice('')
    try {
      const res = await api.post(`/${kind}/${doc.id}/email`, { to_email: emailAddr.trim() })
      setNotice(res.detail || 'Email sent.')
      setEmailOpen(false)
      setEmailAddr('')
    } catch (e) { setError(e.message) }
    finally { setEmailSending(false) }
  }

  const items = doc.items || []

  return (
    <div className="doc-preview-overlay" onClick={onClose}>
      <div className="doc-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doc-preview-header">
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
            <h2 style={{ margin: 0 }}>{doc[numberKey]}</h2>
          </div>
          <button className="btn btn-outline" onClick={onClose} aria-label="Close preview">✕</button>
        </div>

        <div className="doc-preview-toolbar">
          <button className="btn btn-outline" onClick={() => setEmailOpen((o) => !o)}>
            ✉ Send by Email
          </button>
          <button className="btn btn-outline" onClick={handlePrint} disabled={pdfLoading}>
            🖨 Print
          </button>
          <button className="btn btn-primary" onClick={handleExportPdf} disabled={pdfLoading}>
            ⬇ Export PDF
          </button>
        </div>

        {emailOpen && (
          <div className="doc-preview-email-row">
            <input
              type="email"
              placeholder="customer@email.com"
              value={emailAddr}
              onChange={(e) => setEmailAddr(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleSendEmail} disabled={emailSending}>
              {emailSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}

        {notice && <div style={{ color: 'var(--success)', fontSize: 13, padding: '0 20px' }}>{notice}</div>}
        {error && <div className="error-text" style={{ padding: '0 20px' }}>{error}</div>}

        <div className="doc-preview-body">
          <div className="doc-sheet">
            <div className="doc-sheet-head">
              <div>
                <div className="doc-sheet-company">{company?.name || 'Your Company'}</div>
                {company?.address && <div className="doc-sheet-muted">{company.address}</div>}
                {company?.email && <div className="doc-sheet-muted">{company.email}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="doc-sheet-title">{label}</div>
                <div className="doc-sheet-muted"># {doc[numberKey]}</div>
                <span className={`badge badge-${doc.status}`} style={{ marginTop: 6, display: 'inline-block' }}>
                  {doc.status}
                </span>
              </div>
            </div>

            <div className="doc-sheet-meta">
              <div>
                <div className="doc-sheet-label">Bill To</div>
                <div style={{ fontWeight: 600 }}>{doc.customer_name}</div>
                {doc.customer_phone && <div className="doc-sheet-muted">{doc.customer_phone}</div>}
                {doc.customer_address && <div className="doc-sheet-muted">{doc.customer_address}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="doc-sheet-label">Date</div>
                <div>{new Date(doc.created_at).toLocaleDateString()}</div>
                {!isInvoice && doc.valid_until && (
                  <>
                    <div className="doc-sheet-label" style={{ marginTop: 8 }}>Valid Until</div>
                    <div>{new Date(doc.valid_until).toLocaleDateString()}</div>
                  </>
                )}
              </div>
            </div>

            <table className="doc-sheet-items">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td>{i + 1}</td>
                    <td>{line.description}</td>
                    <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{money(line.unit_price)}</td>
                    <td style={{ textAlign: 'right' }}>{money(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="doc-sheet-totals">
              <div><span>Subtotal</span><span>{money(doc.subtotal)}</span></div>
              {doc.tax_rate > 0 && <div><span>Tax ({doc.tax_rate}%)</span><span>{money(doc.tax_amount)}</span></div>}
              {doc.discount > 0 && <div><span>Discount</span><span>-{money(doc.discount)}</span></div>}
              <div className="doc-sheet-total-row"><span>Total</span><span>{money(doc.total)}</span></div>
            </div>

            {doc.notes && (
              <div style={{ marginTop: 18 }}>
                <div className="doc-sheet-label">Notes</div>
                <div className="doc-sheet-muted">{doc.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
