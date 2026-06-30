import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'

export default function Settings() {
  const { user, logout } = useAuth()
  const api = useApi()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const changePassword = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.put('/auth/change-password', { old_password: oldPassword, new_password: newPassword })
      setMessage('Password updated successfully.')
      setOldPassword('')
      setNewPassword('')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Settings</h1></div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Profile</h3>
          <div className="form-row"><label>Username</label><input value={user?.username || ''} disabled /></div>
          <div className="form-row"><label>Full Name</label><input value={user?.full_name || ''} disabled /></div>
          <div className="form-row"><label>Role</label><input value={user?.role || ''} disabled /></div>
          <button className="btn btn-danger" onClick={logout}>Log out</button>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Change Password</h3>
          {user?.is_demo ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              This is a shared demo account, so its password can't be changed.
            </div>
          ) : (
          <form onSubmit={changePassword}>
            <div className="form-row"><label>Current Password</label><input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required /></div>
            <div className="form-row"><label>New Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
            {error && <div className="error-text">{error}</div>}
            {message && <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{message}</div>}
            <button className="btn btn-primary">Update Password</button>
          </form>
          )}
        </div>
      </div>
    </div>
  )
}
