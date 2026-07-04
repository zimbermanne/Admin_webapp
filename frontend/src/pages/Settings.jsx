import { useState, useEffect } from 'react'
import { AFRICAN_COUNTRY_CURRENCIES, currencyForCountry } from '../data/africanCountryCurrencies.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'
import Modal from '../components/Modal.jsx'
import Table from '../components/Table.jsx'

export default function Settings() {
  const { user, logout } = useAuth()
  const api = useApi()
  const isAdmin = user?.role === 'admin'
  const isSuperadmin = user?.role === 'superadmin'

  // Change own password
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')

  // Account settings (for regular admins)
  const [account, setAccount] = useState(null)
  const [accountErr, setAccountErr] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMsg, setAccountMsg] = useState('')

  // Admin panel
  const [users, setUsers] = useState([])
  const [usersErr, setUsersErr] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState({ username:'', password:'', full_name:'', email:'', role:'employee' })
  const [createErr, setCreateErr] = useState('')
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPwd, setResetPwd] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  useEffect(() => {
    if (isAdmin && !isSuperadmin) {
      // Load account settings for regular admins
      api.get('/accounts/my-account').then(setAccount).catch((e) => setAccountErr(e.message))
    }
    if (isAdmin) {
      api.get('/users/').then(setUsers).catch((e) => setUsersErr(e.message))
    }
  }, [isAdmin, isSuperadmin]) // eslint-disable-line

  const changePassword = async (e) => {
    e.preventDefault(); setPwdErr(''); setPwdMsg('')
    try {
      await api.put('/auth/change-password', { old_password: oldPwd, new_password: newPwd })
      setPwdMsg('Password updated successfully.'); setOldPwd(''); setNewPwd('')
    } catch (e) { setPwdErr(e.message) }
  }

  const createUser = async () => {
    setCreateErr('')
    try {
      const u = await api.post('/users/', newUser)
      setUsers([...users, u])
      setCreateOpen(false)
      setNewUser({ username:'', password:'', full_name:'', email:'', role:'employee' })
    } catch (e) { setCreateErr(e.message) }
  }

  const toggleActive = async (u) => {
    try {
      const updated = await api.put(`/users/${u.username}`, { is_active: !u.is_active })
      setUsers(users.map((x) => x.username === u.username ? updated : x))
    } catch (e) { setUsersErr(e.message) }
  }

  const deleteUser = async (username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await api.del(`/users/${username}`)
      setUsers(users.filter((u) => u.username !== username))
    } catch (e) { setUsersErr(e.message) }
  }

  const resetPassword = async () => {
    if (!resetPwd.trim()) return
    try {
      await api.post(`/users/${resetTarget.username}/reset-password`, { new_password: resetPwd })
      setResetMsg(`Password reset for ${resetTarget.username}.`)
      setResetPwd('')
      setTimeout(() => { setResetTarget(null); setResetMsg('') }, 1500)
    } catch (e) { setResetMsg('Error: ' + e.message) }
  }

  const saveAccountSettings = async () => {
    setAccountSaving(true)
    setAccountErr('')
    setAccountMsg('')
    try {
      const updated = await api.put('/accounts/my-account', account)
      setAccount(updated)
      setAccountMsg('Account settings updated successfully!')
      setTimeout(() => setAccountMsg(''), 3000)
    } catch (e) {
      setAccountErr(e.message)
    } finally {
      setAccountSaving(false)
    }
  }

  const userColumns = [
    { key: 'username', header: 'Username' },
    { key: 'full_name', header: 'Full Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (u) => <span className={`badge badge-${u.role}`}>{u.role}</span> },
    { key: 'status', header: 'Status', render: (u) => (
      <span style={{ color: u.is_active ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
        {u.is_active ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: 'created_at', header: 'Joined', render: (u) => new Date(u.created_at).toLocaleDateString() },
    { key: 'actions', header: '', render: (u) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-outline" onClick={() => { setResetTarget(u); setResetPwd(''); setResetMsg('') }}>
          🔑 Reset Pwd
        </button>
        <button className="btn btn-outline" onClick={() => toggleActive(u)}>
          {u.is_active ? 'Deactivate' : 'Activate'}
        </button>
        {u.username !== user.username && (
          <button className="btn btn-danger" onClick={() => deleteUser(u.username)}>✕</button>
        )}
      </div>
    )},
  ]

  return (
    <div className="page">
      <div className="page-header"><h1>Settings</h1></div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* Profile card */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>My Profile</h3>
          <div className="form-row"><label>Username</label><input value={user?.username || ''} disabled /></div>
          <div className="form-row"><label>Full Name</label><input value={user?.full_name || ''} disabled /></div>
          <div className="form-row"><label>Role</label><input value={user?.role || ''} disabled /></div>
          <button className="btn btn-danger" onClick={logout} style={{ marginTop: 8 }}>
            🚪 Log Out
          </button>
        </div>

        {/* Change password card */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Change Password</h3>
          {user?.is_demo ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              The demo account's password can't be changed.
            </div>
          ) : (
            <form onSubmit={changePassword}>
              <div className="form-row"><label>Current Password</label>
                <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required /></div>
              <div className="form-row"><label>New Password</label>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required /></div>
              {pwdErr && <div className="error-text">{pwdErr}</div>}
              {pwdMsg && <div style={{ color:'var(--success)', fontSize:13, marginBottom:8 }}>{pwdMsg}</div>}
              <button className="btn btn-primary">Update Password</button>
            </form>
          )}
        </div>
      </div>

      {/* Account settings — only for regular admins (not superadmin) */}
      {isAdmin && !isSuperadmin && account && (
        <div className="card" style={{ marginTop: 4 }}>
          <h3 style={{ margin: 0, marginBottom: 16 }}>🏢 Business Settings</h3>
          {accountErr && <div className="error-text" style={{ marginBottom: 12 }}>{accountErr}</div>}
          {accountMsg && <div style={{ color:'var(--success)', fontSize:13, marginBottom:12 }}>{accountMsg}</div>}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            <div className="form-row">
              <label>Business Name</label>
              <input value={account.name} onChange={(e) => setAccount({...account, name: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Business Type</label>
              <input value={account.business_type} onChange={(e) => setAccount({...account, business_type: e.target.value})} />
            </div>
            <div className="form-row">
              <label>TIN (Tax ID)</label>
              <input value={account.tin || ''} onChange={(e) => setAccount({...account, tin: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Phone</label>
              <input value={account.phone || ''} onChange={(e) => setAccount({...account, phone: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={account.email || ''} onChange={(e) => setAccount({...account, email: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Region</label>
              <input value={account.region || ''} onChange={(e) => setAccount({...account, region: e.target.value})} />
            </div>
            <div className="form-row">
              <label>District</label>
              <input value={account.district || ''} onChange={(e) => setAccount({...account, district: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Country</label>
              <select
                value={account.country || ''}
                onChange={(e) => {
                  const country = e.target.value
                  setAccount({ ...account, country, currency: currencyForCountry(country) || account.currency })
                }}
              >
                <option value="">Select a country…</option>
                {AFRICAN_COUNTRY_CURRENCIES.map((c) => (
                  <option key={c.country} value={c.country}>{c.country}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Currency</label>
              <input value={account.currency || ''} readOnly placeholder="Auto-filled from country" />
            </div>
            <div className="form-row">
              <label>Street Address</label>
              <input value={account.street_address || ''} onChange={(e) => setAccount({...account, street_address: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Tax Rate (%)</label>
              <input type="number" step="0.1" value={account.tax_rate} onChange={(e) => setAccount({...account, tax_rate: parseFloat(e.target.value) || 0})} />
            </div>
            <div className="form-row">
              <label>Invoice Prefix</label>
              <input value={account.invoice_prefix} onChange={(e) => setAccount({...account, invoice_prefix: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Payment Terms (days)</label>
              <input type="number" value={account.payment_terms_days} onChange={(e) => setAccount({...account, payment_terms_days: parseInt(e.target.value) || 7})} />
            </div>
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={saveAccountSettings}
            disabled={accountSaving}
            style={{ marginTop: 16 }}
          >
            {accountSaving ? 'Saving...' : 'Save Business Settings'}
          </button>
        </div>
      )}

      {/* Admin panel — only visible to admin role */}
      {isAdmin && (
        <div className="card" style={{ marginTop: 4 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h3 style={{ margin: 0 }}>🛡️ Admin — User Management</h3>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Add Staff</button>
          </div>
          {usersErr && <div className="error-text" style={{ marginBottom: 12 }}>{usersErr}</div>}
          <Table columns={userColumns} rows={users} emptyText="No users found." />
        </div>
      )}

      {/* Create user modal */}
      {createOpen && (
        <Modal title="Add Staff Account" onClose={() => setCreateOpen(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createUser}>Create</button>
          </>}>
          <div className="form-row"><label>Username *</label>
            <input value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} /></div>
          <div className="form-row"><label>Password *</label>
            <input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} /></div>
          <div className="form-row"><label>Full Name</label>
            <input value={newUser.full_name} onChange={(e) => setNewUser({...newUser, full_name: e.target.value})} /></div>
          <div className="form-row"><label>Email</label>
            <input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} /></div>
          <div className="form-row"><label>Role</label>
            <select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {createErr && <div className="error-text">{createErr}</div>}
        </Modal>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.username}`} onClose={() => setResetTarget(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setResetTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={resetPassword}>Reset</button>
          </>}>
          <div className="form-row"><label>New Password</label>
            <input type="password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)}
              placeholder="Enter new password" /></div>
          {resetMsg && <div style={{ color: resetMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{resetMsg}</div>}
        </Modal>
      )}
    </div>
  )
}
