function money(n) {
  return `TZS ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

/**
 * Slide-in side panel (reuses the doc-preview-* slide-in styling) for
 * viewing and editing a single purchase record, including how it relates
 * to the linked inventory item. Collapses automatically after a
 * successful save.
 */
export default function PurchaseDetailPanel({ purchase, form, onChange, matchedItem, saving, error, onCancel, onSave }) {
  if (!purchase) return null

  return (
    <div className="doc-preview-overlay" onClick={onCancel}>
      <div className="doc-preview-panel" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="doc-preview-header">
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Purchase Record</div>
            <h2 style={{ margin: 0 }}>{purchase.item_name}</h2>
          </div>
          <button className="btn btn-outline" onClick={onCancel} aria-label="Close panel">✕</button>
        </div>

        <div className="doc-preview-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>
            <span>Recorded {new Date(purchase.created_at).toLocaleString()}</span>
            <span>Purchase #{purchase.id}</span>
          </div>

          {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="form-row">
            <label>Item Name</label>
            <input
              list="purchase-inventory-options"
              value={form.item_name}
              onChange={(e) => onChange({ ...form, item_name: e.target.value })}
              autoComplete="off"
            />
            {form.item_name.trim() && (
              <div style={{ fontSize: 12, marginTop: 4, color: matchedItem ? 'var(--text-muted)' : 'var(--accent-hover)' }}>
                {matchedItem
                  ? `Linked to inventory — current stock: ${matchedItem.quantity} ${matchedItem.unit || ''}, selling price ${money(matchedItem.selling_price)}.`
                  : 'No matching inventory item — saving will create a new one.'}
              </div>
            )}
          </div>

          <div className="form-row"><label>Supplier</label><input value={form.supplier} onChange={(e) => onChange({ ...form, supplier: e.target.value })} /></div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-row" style={{ flex: 1 }}><label>Quantity</label><input type="number" value={form.quantity} onChange={(e) => onChange({ ...form, quantity: Number(e.target.value) })} /></div>
            <div className="form-row" style={{ flex: 1 }}><label>Unit Cost</label><input type="number" value={form.unit_cost} onChange={(e) => onChange({ ...form, unit_cost: Number(e.target.value) })} /></div>
          </div>

          <div className="card" style={{ marginTop: 8, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Line Total</span>
              <strong>{money((Number(form.quantity) || 0) * (Number(form.unit_cost) || 0))}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
