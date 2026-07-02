import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'

export default function Sales() {
  const api = useApi()
  const [sales, setSales] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(true)

  const load = () => {
    setListLoading(true)
    api.get('/sales/').then(setSales).catch((e) => setError(e.message)).finally(() => setListLoading(false))
    api.get('/sales/stats/summary').then(setStats).catch(() => {})
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id) => {
    if (!confirm('Delete this sale and restore stock?')) return
    try {
      await api.del(`/sales/${id}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const columns = [
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'item_name', header: 'Item' },
    { key: 'quantity', header: 'Qty' },
    { key: 'total', header: 'Total', render: (r) => `TZS ${r.total.toLocaleString()}` },
    { key: 'payment_mode', header: 'Payment' },
    { key: 'customer_name', header: 'Customer' },
    { key: 'actions', header: '', render: (r) => <button className="btn btn-danger" onClick={() => remove(r.id)}>Delete</button> },
  ]

  return (
    <div className="page">
      <div className="page-header"><h1>Sales History</h1></div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {stats && (
        <div className="card-grid">
          <div className="card metric-card"><div className="label">Total Sales</div><div className="value">{stats.total_sales}</div></div>
          <div className="card metric-card"><div className="label">Total Revenue</div><div className="value">TZS {stats.total_revenue.toLocaleString()}</div></div>
          <div className="card metric-card"><div className="label">Average Sale</div><div className="value">TZS {stats.average_sale.toLocaleString()}</div></div>
        </div>
      )}
      <Table columns={columns} rows={sales} loading={listLoading} loadingText="Loading sales…" />
    </div>
  )
}
