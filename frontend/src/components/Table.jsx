import { useMemo, useState } from 'react'
import Spinner from './Spinner.jsx'

function defaultCompare(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export default function Table({ columns, rows, emptyText = 'No records yet.', loading = false, loadingText = 'Loading…', onRowClick }) {
  // sortKey/sortDir live here so every page gets sorting for free just by
  // marking a column `sortable: true` — no per-page state wiring needed.
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'

  const sortedRows = useMemo(() => {
    if (!sortKey || !rows) return rows
    const col = columns.find((c) => c.key === sortKey)
    const getValue = col?.sortValue || ((r) => r[sortKey])
    const sorted = [...rows].sort((a, b) => defaultCompare(getValue(a), getValue(b)))
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [rows, sortKey, sortDir, columns])

  const toggleSort = (col) => {
    if (!col.sortable) return
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

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
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col)}
                style={col.sortable ? { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } : undefined}
                title={col.sortable ? 'Click to sort' : undefined}
              >
                {col.header}
                {col.sortable && (
                  <span style={{ marginLeft: 4, opacity: sortKey === col.key ? 1 : 0.3 }}>
                    {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
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
