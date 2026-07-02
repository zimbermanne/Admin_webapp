import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const NAV = [
  { type: 'item', label: 'Home', icon: '🏠', path: '/' },
  { type: 'item', label: 'Point of Sale', icon: '🧾', path: '/pos' },
  {
    type: 'group', label: 'Sales', key: 'sales',
    children: [
      { label: 'Sales History', icon: '📜', path: '/sales' },
      { label: 'Customers', icon: '👥', path: '/customers' },
      { label: 'Clients / Debtors', icon: '📒', path: '/debtors' },
    ],
  },
  {
    type: 'group', label: 'Purchases', key: 'purchases',
    children: [
      { label: 'Purchases Ledger', icon: '📦', path: '/purchases' },
      { label: 'Creditors Ledger', icon: '🏦', path: '/creditors' },
    ],
  },
  {
    type: 'group', label: 'Proforma / Quotations', key: 'proforma',
    children: [
      { label: 'Invoices', icon: '🧾', path: '/invoices' },
      { label: 'Quotations / Estimates', icon: '📑', path: '/quotations' },
    ],
  },
  {
    type: 'group', label: 'Inventory', key: 'inventory',
    children: [
      { label: 'Inventory Ledger', icon: '📋', path: '/inventory' },
    ],
  },
  {
    type: 'group', label: 'Reports', key: 'reports',
    children: [
      { label: 'Profit & Loss', icon: '📈', path: '/reports/profit-loss' },
      { label: 'Financial Summary', icon: '💰', path: '/reports/financial-summary' },
    ],
  },
  { type: 'item', label: 'Expenses', icon: '💸', path: '/expenses' },
  { type: 'item', label: 'Activity Logs', icon: '🕵️', path: '/activity', roles: ['manager', 'admin', 'superadmin'] },
  { type: 'item', label: 'Settings', icon: '⚙️', path: '/settings' },
]

export default function Sidebar({ mobileOpen, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [openGroups, setOpenGroups] = useState({})

  useEffect(() => {
    NAV.forEach((entry) => {
      if (entry.type === 'group') {
        const isActive = entry.children.some((c) => c.path === location.pathname)
        if (isActive) setOpenGroups((prev) => ({ ...prev, [entry.key]: true }))
      }
    })
  }, [location.pathname])

  const go = (path) => {
    navigate(path)
    onClose?.()
  }

  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-logo">Z</div>
        <div className="brand-text">Zimbermanne Accounting</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.filter((entry) => !entry.roles || entry.roles.includes(user?.role)).map((entry) => {
          if (entry.type === 'item') {
            const active = location.pathname === entry.path
            return (
              <div
                key={entry.path}
                className={`menu-item ${active ? 'active' : ''}`}
                onClick={() => go(entry.path)}
              >
                <span>{entry.icon}</span>
                <span>{entry.label}</span>
              </div>
            )
          }
          const open = !!openGroups[entry.key]
          return (
            <div key={entry.key}>
              <div
                className="group-header"
                onClick={() => setOpenGroups((p) => ({ ...p, [entry.key]: !p[entry.key] }))}
              >
                <span className="group-label">{entry.label}</span>
                <span className={`chevron ${open ? 'open' : ''}`}>›</span>
              </div>
              <div className={`group-children ${open ? 'open' : ''}`}>
                {entry.children.map((child) => {
                  const active = location.pathname === child.path
                  return (
                    <div
                      key={child.path}
                      className={`menu-item child ${active ? 'active' : ''}`}
                      onClick={() => go(child.path)}
                    >
                      <span>{child.icon}</span>
                      <span>{child.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.full_name || user?.username}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role}</div>
        </div>
        <button
          onClick={logout}
          title="Log out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 6px',
                   color: 'var(--text-muted)', borderRadius: 6 }}
          onMouseEnter={(e) => e.currentTarget.style.color='var(--danger)'}
          onMouseLeave={(e) => e.currentTarget.style.color='var(--text-muted)'}
        >⏻</button>
      </div>
    </aside>
  )
}

export { NAV }
