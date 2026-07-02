import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiUrl } from '../api-config.js'

const AuthContext = createContext(null)

const TOKEN_KEY = 'zr_token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [accountLoading, setAccountLoading] = useState(false)

  const fetchAccount = useCallback(async (tok, currentUser) => {
    // Only account admins have (or need) an onboarding wizard; superadmin
    // and staff accounts (manager/employee) never see it.
    if (!currentUser || currentUser.role !== 'admin') {
      setAccount(null)
      return
    }
    setAccountLoading(true)
    try {
      const res = await fetch(apiUrl('/api/accounts/my-account'), {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!res.ok) throw new Error('failed')
      setAccount(await res.json())
    } catch {
      setAccount(null)
    } finally {
      setAccountLoading(false)
    }
  }, [])

  const fetchMe = useCallback(async (tok) => {
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!res.ok) throw new Error('unauthorized')
      const data = await res.json()
      setUser(data)
      await fetchAccount(tok, data)
    } catch {
      setToken(null)
      setUser(null)
      setAccount(null)
      sessionStorage.removeItem(TOKEN_KEY)
    } finally {
      setLoading(false)
    }
  }, [fetchAccount])

  useEffect(() => {
    if (token) {
      fetchMe(token)
    } else {
      setLoading(false)
    }
  }, [token, fetchMe])

  const refreshAccount = useCallback(() => {
    if (token && user) return fetchAccount(token, user)
  }, [token, user, fetchAccount])

  const login = useCallback(async (username, password) => {
    let res
    try {
      res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
    sessionStorage.setItem(TOKEN_KEY, data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    await fetchAccount(data.access_token, data.user)
    return data.user
  }, [fetchAccount])

  const loginAsDemo = useCallback(async () => {
    let res
    try {
      res = await fetch(apiUrl('/api/auth/demo-login'), { method: 'POST' })
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
    sessionStorage.setItem(TOKEN_KEY, data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    await fetchAccount(data.access_token, data.user)
    return data.user
  }, [fetchAccount])

  const logout = useCallback(() => {
    if (token) {
      // Fire-and-forget: record the logout for the audit trail before we
      // drop the token. Use the raw fetch (not useApi) to avoid a circular
      // dependency, and don't let a failed request block logging out.
      fetch(apiUrl('/api/activity/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'logout', details: 'User logged out' }),
      }).catch(() => {})
    }
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setAccount(null)
  }, [token])

  return (
    <AuthContext.Provider value={{
      token, user, loading, login, loginAsDemo, logout,
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
