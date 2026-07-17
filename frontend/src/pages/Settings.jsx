import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'
import { useTranslation } from 'react-i18next'
import Modal from '../components/Modal.jsx'
import Table from '../components/Table.jsx'
import RowActionsMenu from '../components/RowActionsMenu.jsx'

export default function Settings() {
  const { user, logout } = useAuth()
  const api = useApi()
  const { t, i18n } = useTranslation()
  const isAdmin = user?.role === 'admin'
  const isSuperadmin = user?.role === 'superadmin'

  // Change own password
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')

  // Language preference
  const [language, setLanguage] = useState(user?.preferred_language || 'en')
  const [langMsg, setLangMsg] = useState('')
  const [langErr, setLangErr] = useState('')

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

  const changeLanguage = async (e) => {
    e.preventDefault(); setLangErr(''); setLangMsg('')
    try {
      await api.put('/users/me/language', { language })
      i18n.changeLanguage(language)
      setLangMsg('Language preference updated successfully.')
      setTimeout(() => setLangMsg(''), 3000)
    } catch (e) { setLangErr(e.message) }
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
      // Only send the fields this form actually edits — the loaded account
      // object also carries read-only fields (is_suspended, is_active,
      // account_type, id, created_at...) that shouldn't be echoed back.
      const {
        name, tin, vrn, owner_full_name, business_type, region, district,
        street_address, phone, email, tax_rate, invoice_prefix, payment_terms_days,
        bank_name, bank_account_name, bank_account_number, bank_branch,
      } = account
      const payload = {
        name, tin, vrn, owner_full_name, business_type, region, district,
        street_address, phone, email, tax_rate, invoice_prefix, payment_terms_days,
        bank_name, bank_account_name, bank_account_number, bank_branch,
      }
      const updated = await api.put('/accounts/my-account', payload)
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
      <span className={`badge badge-${u.is_active ? 'active' : 'inactive'}`}>
        {u.is_active ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: 'created_at', header: 'Joined', render: (u) => new Date(u.created_at).toLocaleDateString() },
    { key: 'actions', header: '', render: (u) => (
      <RowActionsMenu items={[
        { label: 'Reset Password', icon: '🔑', onClick: () => { setResetTarget(u); setResetPwd(''); setResetMsg('') } },
        { label: u.is_active ? 'Deactivate' : 'Activate', icon: u.is_active ? '⏸' : '▶', onClick: () => toggleActive(u) },
        { label: 'Delete', icon: '✕', onClick: () => deleteUser(u.username), danger: true, hidden: u.username === user.username },
      ]} />
    )},
  ]

  return (
    <div className="page">
      <div className="page-header"><h1>{t('settings.title')}</h1></div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* Profile card */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.profile')}</h3>
          <div className="form-row"><label>{t('settings.username')}</label><input value={user?.username || ''} disabled /></div>
          <div className="form-row"><label>{t('settings.fullName')}</label><input value={user?.full_name || ''} disabled /></div>
          <div className="form-row"><label>{t('settings.role')}</label><input value={user?.role || ''} disabled /></div>
          <button className="btn btn-danger" onClick={logout} style={{ marginTop: 8 }}>
            🚪 {t('settings.logout')}
          </button>
        </div>

        {/* Change password card */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.changePassword')}</h3>
          {user?.is_demo ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('settings.demoPassword')}
            </div>
          ) : (
            <form onSubmit={changePassword}>
              <div className="form-row"><label>{t('settings.currentPassword')}</label>
                <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required /></div>
              <div className="form-row"><label>{t('settings.newPassword')}</label>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required /></div>
              {pwdErr && <div className="error-text">{pwdErr}</div>}
              {pwdMsg && <div style={{ color:'var(--success)', fontSize:13, marginBottom:8 }}>{pwdMsg}</div>}
              <button className="btn btn-primary">{t('settings.updatePassword')}</button>
            </form>
          )}
        </div>

        {/* Language preference card */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.languagePreference')}</h3>
          <form onSubmit={changeLanguage}>
            <div className="form-row">
              <label>{t('settings.selectLanguage')}</label>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
            {langErr && <div className="error-text">{langErr}</div>}
            {langMsg && <div style={{ color:'var(--success)', fontSize:13, marginBottom:8 }}>{langMsg}</div>}
            <button className="btn btn-primary">{t('settings.selectLanguage')}</button>
          </form>
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
              <label>VRN (VAT Reg. Number)</label>
              <input value={account.vrn || ''} onChange={(e) => setAccount({...account, vrn: e.target.value})} />
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

          <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 600 }}>🏦 Bank Details (shown on invoices)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            <div className="form-row">
              <label>Bank Name</label>
              <input value={account.bank_name || ''} onChange={(e) => setAccount({...account, bank_name: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Account Name</label>
              <input value={account.bank_account_name || ''} onChange={(e) => setAccount({...account, bank_account_name: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Account Number</label>
              <input value={account.bank_account_number || ''} onChange={(e) => setAccount({...account, bank_account_number: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Branch</label>
              <input value={account.bank_branch || ''} onChange={(e) => setAccount({...account, bank_branch: e.target.value})} />
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
