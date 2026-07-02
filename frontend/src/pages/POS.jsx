import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

export default function POS() {
  const api = useApi()
  const [items, setItems] = useState([])
  const [cart, setCart] = useState([]) // [{item_id, name, price, original_price, qty, stock}]
  const [saleMode, setSaleMode] = useState('pos') // 'pos' = locked prices, 'salesman' = editable
  const [paymentMode, setPaymentMode] = useState('cash')
  const [customerName, setCustomerName] = useState('Walk-in')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/inventory/').then(setItems).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.id)
      if (existing) {
        if (existing.qty + 1 > item.quantity) return prev
        return prev.map((c) => c.item_id === item.id ? { ...c, qty: c.qty + 1 } : c)
      }
      if (item.quantity < 1) return prev
      return [...prev, { item_id: item.id, name: item.name, price: item.selling_price, original_price: item.selling_price, qty: 1, stock: item.quantity }]
    })
  }

  const updateQty = (item_id, qty) => {
    setCart((prev) => prev.map((c) => c.item_id === item_id ? { ...c, qty: Math.max(1, Math.min(qty, c.stock)) } : c))
  }

  const updatePrice = (item_id, price) => {
    setCart((prev) => prev.map((c) => c.item_id === item_id ? { ...c, price: Math.max(0, price) } : c))
  }

  const switchMode = (newMode) => {
    if (newMode === saleMode) return
    setSaleMode(newMode)
    if (newMode === 'pos') {
      setCart((prev) => prev.map((c) => ({ ...c, price: c.original_price })))
    }
    api.post('/activity/log', {
      action: 'pos_mode_switch',
      details: `Switched to ${newMode === 'salesman' ? 'Salesman (editable prices)' : 'POS (locked prices)'} mode`,
    }).catch(() => {}) // don't block the UI if logging fails
  }

  const removeLine = (item_id) => setCart((prev) => prev.filter((c) => c.item_id !== item_id))

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0)

  const checkout = async () => {
    if (cart.length === 0) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/sales/checkout', {
        lines: cart.map((c) => ({ item_id: c.item_id, quantity: c.qty, unit_price: c.price })),
        payment_mode: paymentMode,
        customer_name: customerName || 'Walk-in',
        sale_mode: saleMode,
      })
      setReceipt(res)
      setCart([])
      const refreshed = await api.get('/inventory/')
      setItems(refreshed)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1>Point of Sale</h1>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => switchMode('pos')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: saleMode === 'pos' ? 'var(--accent)' : 'var(--surface)',
              color: saleMode === 'pos' ? '#fff' : 'var(--text-muted)',
            }}
          >
            🔒 POS (locked prices)
          </button>
          <button
            onClick={() => switchMode('salesman')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: saleMode === 'salesman' ? 'var(--accent)' : 'var(--surface)',
              color: saleMode === 'salesman' ? '#fff' : 'var(--text-muted)',
            }}
          >
            ✎ Salesman (editable prices)
          </button>
        </div>
      </div>
      {saleMode === 'salesman' && (
        <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 12 }}>
          Salesman mode is on — prices can be changed at checkout and this is recorded in the activity log.
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 14 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{ cursor: item.quantity > 0 ? 'pointer' : 'not-allowed', opacity: item.quantity > 0 ? 1 : 0.5 }}
                onClick={() => item.quantity > 0 && addToCart(item)}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.category}</div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>TZS {item.selling_price.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Stock: {item.quantity}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Cart</h2>
            {cart.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No items added.</div>}
            {cart.map((c) => (
              <div key={c.item_id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <button className="btn btn-outline" style={{ padding: '2px 8px' }} onClick={() => removeLine(c.item_id)}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qty</label>
                    <input
                      type="number"
                      min="1"
                      max={c.stock}
                      value={c.qty}
                      onChange={(e) => updateQty(c.item_id, Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Price (each)</label>
                    <input
                      type="number"
                      min="0"
                      value={c.price}
                      disabled={saleMode === 'pos'}
                      onChange={(e) => updatePrice(c.item_id, Number(e.target.value))}
                      style={saleMode === 'pos' ? { background: 'var(--surface-sunken)', color: 'var(--text-muted)', cursor: 'not-allowed' } : undefined}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                  Line total: TZS {(c.price * c.qty).toLocaleString()}
                </div>
              </div>
            ))}

            {cart.length > 0 && (
              <>
                <div className="form-row">
                  <label>Customer name</label>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="form-row">
                  <label>Payment Mode</label>
                  <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="credit">Credit (Deni)</option>
                    <option value="mobile_money">Mobile Money</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
                  <span>Total</span>
                  <span>TZS {total.toLocaleString()}</span>
                </div>
                <button className="btn btn-gold" style={{ width: '100%' }} onClick={checkout} disabled={busy}>
                  {busy ? 'Processing…' : 'Complete Sale'}
                </button>
              </>
            )}
          </div>

          {receipt && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Receipt {receipt.receipt_no}</h3>
              {receipt.sales.map((s) => (
                <div key={s.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.item_name} x{s.quantity}</span>
                  <span>TZS {s.total.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ fontWeight: 700, marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
                Total: TZS {receipt.total.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
