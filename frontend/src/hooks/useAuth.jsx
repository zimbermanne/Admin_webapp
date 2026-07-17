import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiUrl } from '../api-config.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // The real session lives in an httpOnly cookie set by the backend on
  // login — it's never readable by JS (that's the point: an XSS payload
  // can't steal it). `isAuthenticated` is just a local UI flag, hydrated by
  // asking the server "am I logged in?" via /auth/me (cookie sent
  // automatically with credentials: 'include').
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [accountLoading, setAccountLoading] = useState(false)

  const fetchAccount = useCallback(async (currentUser) => {
    // Only account admins have (or need) an onboarding wizard; superadmin
    // and staff accounts (manager/employee) never see it.
    if (!currentUser || currentUser.role !== 'admin') {
      setAccount(null)
      return
    }
    setAccountLoading(true)
    try {
      const res = await fetch(apiUrl('/api/accounts/my-account'), { credentials: 'include' })
      if (!res.ok) throw new Error('failed')
      setAccount(await res.json())
    } catch {
      setAccount(null)
    } finally {
      setAccountLoading(false)
    }
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
      if (!res.ok) throw new Error('unauthorized')
      const data = await res.json()
      setUser(data)
      setIsAuthenticated(true)
      await fetchAccount(data)
    } catch {
      setIsAuthenticated(false)
      setUser(null)
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }, [fetchAccount])

  useEffect(() => {
    // On first load we don't know yet whether a session cookie exists, so
    // always ask the server rather than trusting any local flag.
    fetchMe()
  }, [fetchMe])

  const refreshAccount = useCallback(() => {
    if (isAuthenticated && user) return fetchAccount(user)
  }, [isAuthenticated, user, fetchAccount])

  const login = useCallback(async (username, password) => {
    let res
    try {
      res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })
    } catch {
      throw new Error('Could not reach the server. Check your connection or the API configuration.')
    }
    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Login failed')
      }
      throw new Error(`Login failed (${res.status}) — the server returned an unexpected response. The API URL may be misconfigured.`)
    }
    const data = await res.json()
    setIsAuthenticated(true)
    setUser(data.user)
    await fetchAccount(data.user)
    return data.user
  }, [fetchAccount])

  const loginAsDemo = useCallback(async () => {
    let res
    try {
      res = await fetch(apiUrl('/api/auth/demo-login'), { method: 'POST', credentials: 'include' })
    } catch {
      throw new Error('Could not reach the server. Check your connection or the API configuration.')
    }
    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Demo login failed')
      }
      throw new Error(`Demo login failed (${res.status}) — the server returned an unexpected response. The API URL may be misconfigured.`)
    }
    const data = await res.json()
    setIsAuthenticated(true)
    setUser(data.user)
    await fetchAccount(data.user)
    return data.user
  }, [fetchAccount])

  const logout = useCallback(() => {
    if (isAuthenticated) {
      // Record the logout for the audit trail, then clear the server-side
      // cookie. Both fire-and-forget-ish, but we await the cookie clear so
      // we don't race a stale cookie against the next login.
      fetch(apiUrl('/api/activity/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'logout', details: 'User logged out' }),
      }).catch(() => {})
      fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' }).catch(() => {})
    }
    setIsAuthenticated(false)
    setUser(null)
    setAccount(null)
  }, [isAuthenticated])

  return (
    <AuthContext.Provider value={{
      isAuthenticated, user, loading, login, loginAsDemo, logout,
      account, accountLoading, setAccount, refreshAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
