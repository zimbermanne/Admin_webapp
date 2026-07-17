import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { NavigationGuardProvider } from './hooks/useNavigationGuard.jsx'
import { useApi } from './hooks/useApi.js'
import { useTranslation } from 'react-i18next'
import './i18n'
import Sidebar, { NAV } from './components/Sidebar.jsx'
import MobileTopBar from './components/MobileTopBar.jsx'
import PageLoader from './components/PageLoader.jsx'
import Clock from './Clock.jsx'
import Landing from './pages/Landing.jsx'
import Download from './pages/Download.jsx'
import Legal from './pages/Legal.jsx'
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
import VerifyDocument from './pages/VerifyDocument.jsx'

function pageTitle(pathname) {
  for (const entry of NAV) {
    if (entry.type === 'item' && entry.path === pathname) return entry.label
    if (entry.type === 'group') {
      const child = entry.children.find((c) => c.path === pathname)
      if (child) return child.label
    }
  }
  return 'Moneytracer'
}

function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const api = useApi()
  const [company, setCompany] = useState(null)
  const [reminders, setReminders] = useState([])

  const loadReminders = () => {
    api.get('/reminders/').then(setReminders).catch(() => {})
  }

  useEffect(() => {
    api.get('/accounts/company-info').then(setCompany).catch(() => {})
    loadReminders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addReminder = (text) => {
    api.post('/reminders/', { text }).then((r) => setReminders((prev) => [r, ...prev])).catch(() => {})
  }

  const dismissReminder = (id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    api.patch(`/reminders/${id}/done`, {}).catch(loadReminders)
  }

  return (
    <div className="app-shell">
      <MobileTopBar
        title={pageTitle(location.pathname)}
        open={mobileOpen}
        onToggle={() => setMobileOpen((o) => !o)}
        accountName={company?.name}
        accountRank={user?.role}
        reminders={reminders}
        onAddReminder={addReminder}
        onDismissReminder={dismissReminder}
      />
      <div className={`mobile-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="main-content">
        <div className="desktop-topbar">
          <Clock
            accountName={company?.name}
            accountRank={user?.role}
            reminders={reminders}
            onAddReminder={addReminder}
            onDismissReminder={dismissReminder}
          />
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
        <Route path="/reports/cashflow" element={<Reports view="cashflow" />} />
        <Route path="/reports/debtors" element={<Reports view="debtors" />} />
        <Route path="/reports/creditors" element={<Reports view="creditors" />} />
        <Route path="/reports/inventory-valuation" element={<Reports view="inventory-valuation" />} />
        <Route path="/invoices" element={<Documents kind="invoices" />} />
        <Route path="/quotations" element={<Documents kind="quotations" />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Layout>
  )
}

function LanguageLoader() {
  const { user } = useAuth()
  const { i18n } = useTranslation()
  
  useEffect(() => {
    if (user?.preferred_language) {
      i18n.changeLanguage(user.preferred_language)
    }
  }, [user, i18n])
  
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationGuardProvider>
        <LanguageLoader />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/download" element={<Download />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify/invoice/:id" element={<VerifyDocument kind="invoice" />} />
          <Route path="/verify/receipt/:id" element={<VerifyDocument kind="receipt" />} />
          <Route path="/app/*" element={<PrivateRoutes />} />
        </Routes>
      </NavigationGuardProvider>
    </AuthProvider>
  )
}
