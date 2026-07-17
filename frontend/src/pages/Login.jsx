import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import PasswordInput from '../components/PasswordInput.jsx'

export default function Login() {
  const { login, loginAsDemo, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  if (user) {
    navigate('/app', { replace: true })
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/app', { replace: true })
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
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="login-brand">
          <div className="login-brand-mark">M</div>
          <div className="login-brand-name">Moneytracer</div>
        </div>

        <div className="login-card">
          <h1>Welcome back</h1>
          <div className="sub">Sign in to your business dashboard</div>
          <form onSubmit={submit}>
            <div className="form-row">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </div>
            <div className="form-row">
              <label>Password</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button className="btn btn-outline" style={{ width: '100%' }} onClick={tryDemo} disabled={demoBusy}>
            {demoBusy ? 'Loading demo…' : 'Continue as demo'}
          </button>

          <div style={{ marginTop: 20, fontSize: 13, textAlign: 'center', color: 'var(--text-muted)' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create one</Link>
          </div>
        </div>

        <div className="login-tagline">Payroll, compliance, and books — handled quietly.</div>
      </div>
    </div>
  )
}
