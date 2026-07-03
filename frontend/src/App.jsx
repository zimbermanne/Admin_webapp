import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { useApi } from './hooks/useApi.js'
import Sidebar, { NAV } from './components/Sidebar.jsx'
import MobileTopBar from './components/MobileTopBar.jsx'
import PageLoader from './components/PageLoader.jsx'
import Clock from './Clock.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import POS from './pages/POS.jsx'
import Inventory from './pages/Inventory.jsx'
import Sales from './pages/Sales.jsx'
import Purchases from './pages/Purchases.jsx'
import Expenses from './pages/Expenses.jsx'
import Debtors from './pages/Debtors.jsx'
import Creditors from './pages/Creditors.jsx'
import Reports from './pages/Reports.jsx'
import Documents from './pages/Documents.jsx'
import Customers from './pages/Customers.jsx'
import Settings from './pages/Settings.jsx'
import ActivityLogs from './pages/ActivityLogs.jsx'

function pageTitle(pathname) {
  for (const entry of NAV) {
    if (entry.type === 'item' && entry.path === pathname) return entry.label
    if (entry.type === 'group') {
      const child = entry.children.find((c) => c.path === pathname)
      if (child) return child.label
    }
  }
  return 'Zimbermanne'
}

function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const api = useApi()
  const [company, setCompany] = useState(null)

  useEffect(() => {
    api.get('/accounts/company-info').then(setCompany).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app-shell">
      <MobileTopBar title={pageTitle(location.pathname)} open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} accountName={company?.name} accountRank={user?.role} />
      <div className={`mobile-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="main-content">
        <div className="desktop-topbar">
          <Clock accountName={company?.name} accountRank={user?.role} />
        </div>
        {children}
      </div>
    </div>
  )
}

function PrivateRoutes() {
  const { user, loading, account, accountLoading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />

  // Only account admins go through onboarding; wait for the account to
  // load before deciding, so we don't flash the dashboard first.
  if (user.role === 'admin') {
    if (accountLoading || account === null) return <PageLoader label="Preparing your account" />
    if (!account.onboarding_completed) return <Onboarding />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/debtors" element={<Debtors />} />
        <Route path="/creditors" element={<Creditors />} />
        <Route path="/reports/profit-loss" element={<Reports view="profit-loss" />} />
        <Route path="/reports/financial-summary" element={<Reports view="financial-summary" />} />
        <Route path="/invoices" element={<Documents kind="invoices" />} />
        <Route path="/quotations" element={<Documents kind="quotations" />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={<PrivateRoutes />} />
      </Routes>
    </AuthProvider>
  )
}
