import Spinner from './Spinner.jsx'

export default function Table({ columns, rows, emptyText = 'No records yet.', loading = false, loadingText = 'Loading…' }) {
  if (loading) {
    return <div className="card"><Spinner label={loadingText} /></div>
  }
  if (!rows || rows.length === 0) {
    return <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{emptyText}</div>
  }
  return (
    <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
      <table>
        <thead>
          <tr>
            {columns.map((col) => <th key={col.key}>{col.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
