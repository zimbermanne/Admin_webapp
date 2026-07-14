import { useEffect, useRef, useState } from 'react'

/**
 * Three-dot "kebab" menu for row actions in tables.
 * Pass an array of items: { label, icon, onClick, danger, disabled, hidden }
 * Falsy/hidden items are skipped automatically.
 */
export default function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const visibleItems = (items || []).filter((i) => i && !i.hidden)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (visibleItems.length === 0) return null

  return (
    <div className="row-actions" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="row-actions-trigger"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="row-actions-menu" role="menu">
          {visibleItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              className={`row-actions-item${item.danger ? ' row-actions-item-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick?.() }}
            >
              {item.icon && <span className="row-actions-icon">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
