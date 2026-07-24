import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { NavigationGuardProvider } from './hooks/useNavigationGuard.jsx'
import { useApi } from './hooks/useApi.js'
import Sidebar, { PAGE_TITLE_KEYS } from './components/Sidebar.jsx'
import MobileTopBar from './components/MobileTopBar.jsx'
import PageLoader from './components/PageLoader.jsx'
import PlatformBanner from './components/PlatformBanner.jsx'
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
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Expenses from './pages/Expenses.jsx'
import Debtors from './pages/Debtors.jsx'
import Creditors from './pages/Creditors.jsx'
import Reports from './pages/Reports.jsx'
import Documents from './pages/Documents.jsx'
import Customers from './pages/Customers.jsx'
import Settings from './pages/Settings.jsx'
import ActivityLogs from './pages/ActivityLogs.jsx'
import VerifyDocument from './pages/VerifyDocument.jsx'
import BankLoans from './pages/BankLoans.jsx'
import Deadlines from './pages/Deadlines.jsx'
import Assets from './pages/Assets.jsx'
import Personal from './pages/Personal.jsx'

function pageTitle(pathname, t) {
  const key = PAGE_TITLE_KEYS[pathname]
  return key ? t(key) : 'Moneytracer'
}

function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const api = useApi()
  const { t } = useTranslation()
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
        title={pageTitle(location.pathname, t)}
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
        <PlatformBanner />
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
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
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
        <Route path="/bank-loans" element={<BankLoans />} />
        <Route path="/deadlines" element={<Deadlines />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/personal" element={<Personal />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationGuardProvider>
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
