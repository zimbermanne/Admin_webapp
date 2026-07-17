import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'
import Modal from '../components/Modal.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { useSearch } from '../hooks/useSearch.js'

export default function Customers() {
  const api = useApi()
  const [customers, setCustomers] = useState([])
  const [selected, setSelected] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/customers/').then(setCustomers).catch((e) => setError(e.message))
  }, []) // eslint-disable-line

  const viewPurchases = async (customer) => {
    setSelected(customer)
    setLoading(true)
    try {
      const data = await api.get(`/customers/${encodeURIComponent(customer.customer_name)}/purchases`)
      setPurchases(data)
    } catch (e) {
      setError(e.message)
      setPurchases([])
    } finally { setLoading(false) }
  }

  const { query, setQuery, filtered: filteredCustomers } = useSearch(customers, ['customer_name'])

  const customerColumns = [
    { key: 'customer_name', header: 'Customer Name' },
    { key: 'purchase_count', header: 'Purchases' },
    { key: 'total_spent', header: 'Total Spent', render: (r) => `TZS ${r.total_spent.toLocaleString()}` },
    { key: 'last_purchase', header: 'Last Seen', render: (r) => new Date(r.last_purchase).toLocaleString() },
    { key: 'actions', header: '', render: (r) => (
      <button className="btn btn-outline" onClick={() => viewPurchases(r)}>View History</button>
    )},
  ]

  const purchaseColumns = [
    { key: 'created_at', header: 'Date & Time', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'item_name', header: 'Item' },
    { key: 'quantity', header: 'Qty' },
    { key: 'unit_price', header: 'Unit Price', render: (r) => `TZS ${r.unit_price.toLocaleString()}` },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}` },
    { key: 'payment_mode', header: 'Payment', render: (r) => <span className={`badge badge-${r.payment_mode}`}>{r.payment_mode.replace('_',' ')}</span> },
    { key: 'receipt_no', header: 'Receipt #' },
  ]

  return (
    <div className="page">
      <div className="page-header"><h1>Customers</h1></div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card-grid" style={{ marginBottom: 16 }}>
        <div className="card metric-card">
          <div className="label">Total Customers</div>
          <div className="value">{customers.length}</div>
        </div>
        <div className="card metric-card">
          <div className="label">Total Spent (All)</div>
          <div className="value">TZS {customers.reduce((s,c)=>s+c.total_spent,0).toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: 14 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search by customer name…" />
      </div>

      <Table columns={customerColumns} rows={filteredCustomers} emptyText={query ? 'No customers match your search.' : 'No customer sales recorded yet.'} />

      {selected && (
        <Modal title={`Purchase History — ${selected.customer_name}`} onClose={() => setSelected(null)}
          footer={<button className="btn btn-outline" onClick={() => setSelected(null)}>Close</button>}>
          {loading ? <div style={{ padding: 20, textAlign: 'center' }}>Loading…</div> : (
            <div style={{ overflowX: 'auto' }}>
              <Table columns={purchaseColumns} rows={purchases} emptyText="No purchases found." />
            </div>
          )}
          <div style={{ marginTop: 12, fontWeight: 700, textAlign: 'right' }}>
            Total Spent: TZS {selected.total_spent.toLocaleString()}
          </div>
        </Modal>
      )}
    </div>
  )
}
