import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { apiUrl } from '../api-config.js'

export default function Register() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    navigate('/app', { replace: true })
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      let res
      try {
        res = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, full_name: fullName, email }),
        })
      } catch {
        throw new Error('Could not reach the server. Check your connection or the API configuration.')
      }
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Registration failed')
        }
        throw new Error(`Registration failed (${res.status}) — the server returned an unexpected response. The API URL may be misconfigured.`)
      }
      // Auto sign-in right after successful registration
      await login(username, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Create Account</h1>
        <div className="sub">Join Moneytracer</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </div>
          <div className="form-row">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Email (optional)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
            {busy ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--navy)', fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
