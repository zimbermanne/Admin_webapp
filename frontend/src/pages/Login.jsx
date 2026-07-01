import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Login() {
  const { login, loginAsDemo, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const tryDemo = async () => {
    setError('')
    setDemoBusy(true)
    try {
      await loginAsDemo()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Zimbermanne Accounting OS</h1>
        <div className="sub">Login to your Business dashboard</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e8e4dc' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#e8e4dc' }} />
        </div>

        <button className="btn btn-gold" style={{ width: '100%' }} onClick={tryDemo} disabled={demoBusy}>
          {demoBusy ? 'Loading demo…' : '✨ Continue as Demo (no password)'}
        </button>

        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--navy)', fontWeight: 600 }}>Create one</Link>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          let take care of the money problem.
        </div>
      </div>
    </div>
  )
}
