import Spinner from './Spinner.jsx'

export default function Table({ columns, rows, emptyText = 'No records yet.', loading = false, loadingText = 'Loading…', onRowClick }) {
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
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} onClick={col.stopRowClick ? (e) => e.stopPropagation() : undefined}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
