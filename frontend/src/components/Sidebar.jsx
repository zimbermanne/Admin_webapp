import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth.jsx'
import { useNavigationGuard } from '../hooks/useNavigationGuard.jsx'

// NAV is built from a function so labels re-translate whenever the
// active language changes (t comes from the component, not module scope).
function buildNav(t) {
  return [
    { type: 'item', label: t('nav.home'), icon: '🏠', path: '/app' },
    { type: 'item', label: t('nav.pos'), icon: '🧾', path: '/app/pos' },
    {
      type: 'group', label: t('nav.salesGroup'), key: 'sales',
      children: [
        { label: t('nav.salesHistory'), icon: '📜', path: '/app/sales' },
        { label: t('nav.customers'), icon: '👥', path: '/app/customers' },
        { label: t('nav.clientsDebtors'), icon: '📒', path: '/app/debtors' },
      ],
    },
    {
      type: 'group', label: t('nav.purchasesGroup'), key: 'purchases',
      children: [
        { label: t('nav.purchasesLedger'), icon: '📦', path: '/app/purchases' },
        { label: t('nav.purchaseOrders'), icon: '📝', path: '/app/purchase-orders' },
        { label: t('nav.creditorsLedger'), icon: '🏦', path: '/app/creditors' },
      ],
    },
    {
      type: 'group', label: t('nav.proformaGroup'), key: 'proforma',
      children: [
        { label: t('nav.invoices'), icon: '🧾', path: '/app/invoices' },
        { label: t('nav.quotations'), icon: '📑', path: '/app/quotations' },
      ],
    },
    {
      type: 'group', label: t('nav.inventoryGroup'), key: 'inventory',
      children: [
        { label: t('nav.inventoryLedger'), icon: '📋', path: '/app/inventory' },
      ],
    },
    {
      type: 'group', label: t('nav.reportsGroup'), key: 'reports',
      children: [
        { label: t('nav.profitLoss'), icon: '📈', path: '/app/reports/profit-loss' },
        { label: t('nav.financialSummary'), icon: '💰', path: '/app/reports/financial-summary' },
        { label: t('nav.cashFlow'), icon: '💵', path: '/app/reports/cashflow' },
        { label: t('nav.debtorsReport'), icon: '📒', path: '/app/reports/debtors' },
        { label: t('nav.creditorsReport'), icon: '🏦', path: '/app/reports/creditors' },
        { label: t('nav.inventoryValuation'), icon: '📦', path: '/app/reports/inventory-valuation' },
      ],
    },
    { type: 'item', label: t('nav.expensesItem'), icon: '💸', path: '/app/expenses' },
    { type: 'item', label: t('nav.bankLoans'), icon: '🏦', path: '/app/bank-loans' },
    { type: 'item', label: t('nav.deadlines'), icon: '⏰', path: '/app/deadlines' },
    { type: 'item', label: t('nav.activityLogsItem'), icon: '🕵️', path: '/app/activity', roles: ['manager', 'admin', 'superadmin'] },
    { type: 'item', label: t('nav.settingsItem'), icon: '⚙️', path: '/app/settings' },
  ]
}

// Static path -> translation key map, used by App.jsx to resolve page titles
// without needing the fully-built (and thus language-dependent) NAV array.
export const PAGE_TITLE_KEYS = {
  '/app': 'nav.home',
  '/app/pos': 'nav.pos',
  '/app/sales': 'nav.salesHistory',
  '/app/customers': 'nav.customers',
  '/app/debtors': 'nav.clientsDebtors',
  '/app/purchases': 'nav.purchasesLedger',
  '/app/purchase-orders': 'nav.purchaseOrders',
  '/app/creditors': 'nav.creditorsLedger',
  '/app/invoices': 'nav.invoices',
  '/app/quotations': 'nav.quotations',
  '/app/inventory': 'nav.inventoryLedger',
  '/app/reports/profit-loss': 'nav.profitLoss',
  '/app/reports/financial-summary': 'nav.financialSummary',
  '/app/reports/cashflow': 'nav.cashFlow',
  '/app/reports/debtors': 'nav.debtorsReport',
  '/app/reports/creditors': 'nav.creditorsReport',
  '/app/reports/inventory-valuation': 'nav.inventoryValuation',
  '/app/expenses': 'nav.expensesItem',
  '/app/bank-loans': 'nav.bankLoans',
  '/app/deadlines': 'nav.deadlines',
  '/app/activity': 'nav.activityLogsItem',
  '/app/settings': 'nav.settingsItem',
}

export default function Sidebar({ mobileOpen, onClose }) {
  const location = useLocation()
  const { guardedNavigate } = useNavigationGuard()
  const { user, logout } = useAuth()
  const [openGroups, setOpenGroups] = useState({})
  const { t } = useTranslation()
  const NAV = buildNav(t)

  useEffect(() => {
    NAV.forEach((entry) => {
      if (entry.type === 'group') {
        const isActive = entry.children.some((c) => c.path === location.pathname)
        if (isActive) setOpenGroups((prev) => ({ ...prev, [entry.key]: true }))
      }
    })
  }, [location.pathname]) // eslint-disable-line

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
          title={t('nav.logOut')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 6px',
                   color: 'var(--text-muted)', borderRadius: 6 }}
          onMouseEnter={(e) => e.currentTarget.style.color='var(--danger)'}
          onMouseLeave={(e) => e.currentTarget.style.color='var(--text-muted)'}
        >⏻</button>
      </div>
    </aside>
  )
}

