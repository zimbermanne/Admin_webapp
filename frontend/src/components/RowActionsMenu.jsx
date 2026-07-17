import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Three-dot "kebab" menu for row actions in tables.
 * Pass an array of items: { label, icon, onClick, danger, disabled, hidden }
 * Falsy/hidden items are skipped automatically.
 *
 * The menu itself is rendered through a portal into document.body and
 * positioned with fixed coordinates from the trigger button's bounding
 * rect. Table rows live inside a `.card` with `overflow-x: auto` (needed so
 * wide tables scroll on small screens), which was clipping/cutting off the
 * dropdown whenever it opened near the edge of that container. Rendering
 * outside the DOM tree that container sidesteps the clipping entirely.
 */
export default function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const menuRef = useRef(null)

  const visibleItems = (items || []).filter((i) => i && !i.hidden)

  const openMenu = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      // Prefer opening below-right of the trigger; flip to the left edge
      // of the viewport if it would otherwise overflow off-screen.
      const menuWidth = 200
      let left = rect.right - menuWidth
      if (left < 8) left = rect.left
      setCoords({ top: rect.bottom + 4, left })
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScrollOrResize = () => setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
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
        onClick={openMenu}
      >
        ⋮
      </button>
      {open && coords && createPortal(
        <div
          className="row-actions-menu row-actions-menu-portal"
          role="menu"
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
        >
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
        </div>,
        document.body
      )}
    </div>
  )
}
