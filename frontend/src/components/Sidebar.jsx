import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useNavigationGuard } from '../hooks/useNavigationGuard.jsx'

const NAV = [
  { type: 'item', label: 'Home', icon: '🏠', path: '/app' },
  { type: 'item', label: 'Point of Sale', icon: '🧾', path: '/app/pos' },
  {
    type: 'group', label: 'Sales', key: 'sales',
    children: [
      { label: 'Sales History', icon: '📜', path: '/app/sales' },
      { label: 'Customers', icon: '👥', path: '/app/customers' },
      { label: 'Clients / Debtors', icon: '📒', path: '/app/debtors' },
    ],
  },
  {
    type: 'group', label: 'Purchases', key: 'purchases',
    children: [
      { label: 'Purchases Ledger', icon: '📦', path: '/app/purchases' },
      { label: 'Creditors Ledger', icon: '🏦', path: '/app/creditors' },
    ],
  },
  {
    type: 'group', label: 'Proforma / Quotations', key: 'proforma',
    children: [
      { label: 'Invoices', icon: '🧾', path: '/app/invoices' },
      { label: 'Quotations / Estimates', icon: '📑', path: '/app/quotations' },
    ],
  },
  {
    type: 'group', label: 'Inventory', key: 'inventory',
    children: [
      { label: 'Inventory Ledger', icon: '📋', path: '/app/inventory' },
    ],
  },
  {
    type: 'group', label: 'Reports', key: 'reports',
    children: [
      { label: 'Profit & Loss', icon: '📈', path: '/app/reports/profit-loss' },
      { label: 'Financial Summary', icon: '💰', path: '/app/reports/financial-summary' },
      { label: 'Cash Flow', icon: '💵', path: '/app/reports/cashflow' },
      { label: 'Debtors Report', icon: '📒', path: '/app/reports/debtors' },
      { label: 'Creditors Report', icon: '🏦', path: '/app/reports/creditors' },
      { label: 'Inventory Valuation', icon: '📦', path: '/app/reports/inventory-valuation' },
    ],
  },
  { type: 'item', label: 'Expenses', icon: '💸', path: '/app/expenses' },
  { type: 'item', label: 'Activity Logs', icon: '🕵️', path: '/app/activity', roles: ['manager', 'admin', 'superadmin'] },
  { type: 'item', label: 'Settings', icon: '⚙️', path: '/app/settings' },
]

export default function Sidebar({ mobileOpen, onClose }) {
  const location = useLocation()
  const { guardedNavigate } = useNavigationGuard()
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
    guardedNavigate(path)
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
        <div className="brand-logo">M</div>
        <div className="brand-text">Moneytracer</div>
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
