import { useState } from 'react'

function money(n) {
  return `TZS ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

/**
 * Full-screen invoice/quotation editor. Renders the form on the left and a
 * live-updating preview of the document sheet on the right, so the user can
 * see exactly what the customer will get as they fill it in. Also includes
 * an "Amount to Collect" field so the user can key in what they expect the
 * total to be and instantly see whether it matches the computed total.
 */
export default function InvoiceEditor({
  kind, isInvoice, editingId, form, setForm, company, error,
  updateLine, addLine, removeLine, subtotal, taxAmt, total,
  onClose, onSave, saving,
}) {
  const [checkAmount, setCheckAmount] = useState('')
  const label = isInvoice ? 'Invoice' : 'Quotation'

  const checkValue = checkAmount === '' ? null : Number(checkAmount)
  const checkDiff = checkValue === null ? null : Math.round((checkValue - total) * 100) / 100
  const checkMatches = checkValue !== null && Math.abs(checkDiff) < 0.5
  const itemsWithText = form.items.filter((l) => l.description.trim())

  return (
    <div className="invoice-editor-overlay">
      <div className="invoice-editor">
        <div className="invoice-editor-topbar">
          <div>
            <div className="doc-sheet-muted">{editingId ? `Edit ${label}` : `New ${label}`}</div>
            <h2 style={{ margin: 0 }}>{form.customer_name || 'New customer'}</h2>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div className="error-text" style={{ padding: '0 24px' }}>{error}</div>}

        <div className="invoice-editor-body">
          <div className="invoice-editor-form">
            <div className="form-row"><label>Customer Name *</label>
              <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="form-row"><label>Phone</label>
              <input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div className="form-row"><label>Address</label>
              <input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} /></div>
            {isInvoice && (
              <>
                <div className="form-row"><label>Customer TIN</label>
                  <input value={form.customer_tin} onChange={(e) => setForm({ ...form, customer_tin: e.target.value })} /></div>
                <div className="form-row"><label>Customer VRN</label>
                  <input value={form.customer_vrn} onChange={(e) => setForm({ ...form, customer_vrn: e.target.value })} /></div>
                <div className="form-row"><label>Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                <div className="form-row"><label>PO / DO Number</label>
                  <input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} /></div>
              </>
            )}
            {!isInvoice && (
              <div className="form-row"><label>Valid for (days)</label>
                <input type="number" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: Number(e.target.value) })} /></div>
            )}

            <div className="invoice-editor-section-label">Line Items</div>
            {form.items.map((line, idx) => (
              <div key={idx} className="invoice-editor-line">
                <input placeholder="Description" value={line.description}
                  onChange={(e) => updateLine(idx, 'description', e.target.value)} />
                <input type="number" placeholder="Qty" value={line.quantity}
                  onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))} />
                <input type="number" placeholder="Unit Price" value={line.unit_price}
                  onChange={(e) => updateLine(idx, 'unit_price', Number(e.target.value))} />
                <span className="invoice-editor-line-total">{money((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</span>
                <button className="btn btn-danger" onClick={() => removeLine(idx)} aria-label="Remove line">✕</button>
              </div>
            ))}
            <button className="btn btn-outline" onClick={addLine} style={{ marginBottom: 20 }}>+ Add Line</button>

            <div className="form-row"><label>Tax Rate (%)</label>
              <input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} /></div>
            <div className="form-row"><label>Discount (TZS)</label>
              <input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} /></div>
            <div className="form-row"><label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            <div className="invoice-editor-checkline">
              <div>
                <label>Amount to Collect (cross-check)</label>
                <div className="doc-sheet-muted" style={{ marginBottom: 6 }}>
                  Enter the amount you expect to charge, and we'll check it against the computed total.
                </div>
                <input
                  type="number"
                  placeholder={`e.g. ${Math.round(total)}`}
                  value={checkAmount}
                  onChange={(e) => setCheckAmount(e.target.value)}
                />
              </div>
              {checkValue !== null && (
                <div className={`invoice-editor-check-result ${checkMatches ? 'match' : 'mismatch'}`}>
                  {checkMatches ? (
                    <>✅ Matches the computed total ({money(total)})</>
                  ) : (
                    <>
                      ⚠️ {checkDiff > 0 ? 'Over' : 'Under'} the computed total by {money(Math.abs(checkDiff))}
                      <span className="doc-sheet-muted" style={{ display: 'block', marginTop: 2 }}>
                        Computed total is {money(total)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="invoice-editor-preview">
            <div className="invoice-editor-preview-label">Live Preview</div>
            <div className="doc-sheet doc-sheet-live">
              <div className="doc-sheet-head">
                <div>
                  <div className="doc-sheet-company">{company?.name || 'Your Company'}</div>
                  {company?.address && <div className="doc-sheet-muted">{company.address}</div>}
                  {company?.email && <div className="doc-sheet-muted">{company.email}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="doc-sheet-title">{label}</div>
                  <div className="doc-sheet-muted">{editingId ? '(editing)' : '# (assigned on save)'}</div>
                </div>
              </div>

              <div className="doc-sheet-meta">
                <div>
                  <div className="doc-sheet-label">Bill To</div>
                  <div style={{ fontWeight: 600 }}>{form.customer_name || '—'}</div>
                  {form.customer_phone && <div className="doc-sheet-muted">{form.customer_phone}</div>}
                  {form.customer_address && <div className="doc-sheet-muted">{form.customer_address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="doc-sheet-label">Date</div>
                  <div>{new Date().toLocaleDateString()}</div>
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
                  {itemsWithText.map((line, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{line.description}</td>
                      <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{money(line.unit_price)}</td>
                      <td style={{ textAlign: 'right' }}>{money((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</td>
                    </tr>
                  ))}
                  {itemsWithText.length === 0 && (
                    <tr><td colSpan={5} className="doc-sheet-muted" style={{ padding: '14px 10px' }}>Add a line item to see it here.</td></tr>
                  )}
                </tbody>
              </table>

              <div className="doc-sheet-totals">
                <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
                {form.tax_rate > 0 && <div><span>Tax ({form.tax_rate}%)</span><span>{money(taxAmt)}</span></div>}
                {form.discount > 0 && <div><span>Discount</span><span>-{money(form.discount)}</span></div>}
                <div className="doc-sheet-total-row"><span>Total</span><span>{money(total)}</span></div>
              </div>

              {form.notes && (
                <div style={{ marginTop: 18 }}>
                  <div className="doc-sheet-label">Notes</div>
                  <div className="doc-sheet-muted">{form.notes}</div>
                </div>
              )}
            </div>
          </div>

          {/* Compact mobile-only stand-in for the desktop live preview above.
              A phone screen can't fit the form and the full invoice sheet at
              once, so instead of hiding the preview entirely we show a
              condensed summary: totals up front, line items as a simple
              stacked list (a wide 5-column table doesn't fit a phone width
              at all) rather than trying to shrink the real sheet. */}
          <div className="invoice-editor-preview-mobile">
            <div className="mobile-summary-row">
              <div>
                <div className="doc-sheet-label">{label} for</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{form.customer_name || 'New customer'}</div>
              </div>
              <div className="mobile-summary-total">
                <div className="doc-sheet-label">Total</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{money(total)}</div>
              </div>
            </div>

            {itemsWithText.length > 0 ? (
              <div className="mobile-summary-items">
                {itemsWithText.map((line, i) => (
                  <div key={i} className="mobile-summary-item">
                    <div className="mobile-summary-item-desc">{line.description}</div>
                    <div className="mobile-summary-item-meta">
                      {line.quantity} × {money(line.unit_price)}
                      <span className="mobile-summary-item-amount">
                        {money((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="doc-sheet-muted" style={{ padding: '10px 0' }}>Add a line item to see it here.</div>
            )}

            <div className="mobile-summary-totals">
              <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {form.tax_rate > 0 && <div><span>Tax ({form.tax_rate}%)</span><span>{money(taxAmt)}</span></div>}
              {form.discount > 0 && <div><span>Discount</span><span>-{money(form.discount)}</span></div>}
              <div className="mobile-summary-total-row"><span>Total</span><span>{money(total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
