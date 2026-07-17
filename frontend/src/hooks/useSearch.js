import { useMemo, useState } from 'react'

/**
 * Generic client-side search hook.
 * Filters `rows` by checking whether `query` (case-insensitive) appears in
 * any of the given fields. Fields can be dot-free keys, and a field can be
 * a function `(row) => string` for computed/formatted values (e.g. dates).
 */
export function useSearch(rows, fields) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      fields.some((field) => {
        const raw = typeof field === 'function' ? field(row) : row[field]
        if (raw === null || raw === undefined) return false
        return String(raw).toLowerCase().includes(q)
      })
    )
  }, [rows, fields, query])

  return { query, setQuery, filtered }
}
