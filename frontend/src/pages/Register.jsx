import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'
import { apiUrl } from '../api-config.js'

const STEPS = [
  { n: 1, label: 'Business basics' },
  { n: 2, label: 'Contact & branding' },
  { n: 3, label: 'Tax & invoicing' },
  { n: 4, label: 'Inventory' },
  { n: 5, label: 'Invite staff' },
]

const emptyForm = {
  // Login
  fullName: '',
  username: '',
  email: '',
  password: '',
  confirm: '',
  // Step 1 — business basics
  businessStructure: 'solo',
  businessName: '',
  tin: '',
  businessType: 'retail',
  region: '',
  district: '',
  streetAddress: '',
  // Step 2 — contact & branding
  businessPhone: '',
  businessEmail: '',
  logoUrl: '',
  // Step 3 — tax & invoicing
  taxRate: '0',
  invoicePrefix: 'INV',
  paymentTermsDays: '7',
}

const emptyInventoryRow = { name: '', sku: '', quantity: '1', costPrice: '0', sellingPrice: '0' }
const emptyStaffRow = { fullName: '', username: '', password: '', role: 'employee' }

function Stepper({ step }) {
  return (
    <div className="wizard-stepper">
      {STEPS.map((s) => (
        <div key={s.n} className={`wizard-step ${step === s.n ? 'active' : ''} ${step > s.n ? 'done' : ''}`}>
          <div className="wizard-step-dot">{step > s.n ? '✓' : s.n}</div>
          <div className="wizard-step-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function Register() {
  const { login, user } = useAuth()
  const api = useApi()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [inventoryRows, setInventoryRows] = useState([{ ...emptyInventoryRow }])
  const [staffRows, setStaffRows] = useState([{ ...emptyStaffRow }])

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const validateStep1 = () => {
    if (!form.fullName.trim()) return 'Your full name is required.'
    if (!form.username.trim()) return 'Choose a username.'
    if (form.password.length < 6) return 'Password must be at least 6 characters.'
    if (form.password !== form.confirm) return 'Passwords do not match.'
    if (!form.businessName.trim()) return 'Business name is required.'
    if (form.businessStructure === 'company' && !form.tin.trim()) {
      return 'TIN is required for a registered company.'
    }
    return ''
  }

  const goNext = () => {
    setError('')
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
    }
    setStep((s) => s + 1)
  }

  const goBack = () => {
    setError('')
    setStep((s) => Math.max(1, s - 1))
  }

  // Step 3 -> submit account + admin user, then log in, then move to step 4.
  const createAccount = async () => {
    setError('')
    setBusy(true)
    try {
      let res
      try {
        res = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            full_name: form.fullName,
            email: form.email,
            business_structure: form.businessStructure,
            business_name: form.businessName,
            tin: form.businessStructure === 'company' ? form.tin : (form.tin || null),
            business_type: form.businessType,
            region: form.region,
            district: form.district,
            street_address: form.streetAddress,
            business_phone: form.businessPhone,
            business_email: form.businessEmail || form.email,
            logo_url: form.logoUrl,
            tax_rate: Number(form.taxRate) || 0,
            invoice_prefix: form.invoicePrefix || 'INV',
            payment_terms_days: Number(form.paymentTermsDays) || 0,
          }),
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
      await login(form.username, form.password)
      setStep(4)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ---- Step 4: optional inventory rows ----
  const updateInventoryRow = (i, field, value) => {
    setInventoryRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }
  const addInventoryRow = () => setInventoryRows((rows) => [...rows, { ...emptyInventoryRow }])
  const removeInventoryRow = (i) => setInventoryRows((rows) => rows.filter((_, idx) => idx !== i))

  const saveInventoryAndContinue = async () => {
    setError('')
    const usable = inventoryRows.filter((r) => r.name.trim())
    if (usable.length === 0) { setStep(5); return }
    setBusy(true)
    try {
      for (const row of usable) {
        await api.post('/inventory/', {
          name: row.name,
          sku: row.sku || null,
          quantity: Number(row.quantity) || 0,
          cost_price: Number(row.costPrice) || 0,
          selling_price: Number(row.sellingPrice) || 0,
        })
      }
      setStep(5)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ---- Step 5: optional staff invites ----
  const updateStaffRow = (i, field, value) => {
    setStaffRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }
  const addStaffRow = () => setStaffRows((rows) => [...rows, { ...emptyStaffRow }])
  const removeStaffRow = (i) => setStaffRows((rows) => rows.filter((_, idx) => idx !== i))

  const saveStaffAndFinish = async () => {
    setError('')
    const usable = staffRows.filter((r) => r.username.trim() && r.password.trim())
    if (usable.length === 0) { navigate('/', { replace: true }); return }
    setBusy(true)
    try {
      for (const row of usable) {
        if (row.password.length < 6) {
          throw new Error(`Password for "${row.username}" must be at least 6 characters.`)
        }
        await api.post('/users/', {
          username: row.username,
          password: row.password,
          full_name: row.fullName,
          role: row.role,
        })
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cardWidth = step <= 3 ? 420 : 620

  return (
    <div className="login-screen">
      <div className="login-card wizard-card" style={{ width: cardWidth }}>
        <h1>Set up your business</h1>
        <div className="sub">
          {step <= 3 ? 'A few details before we build your dashboard' : 'Optional — you can always finish this later'}
        </div>

        <Stepper step={step} />

        {step === 1 && (
          <div className="wizard-panel">
            <div className="form-row">
              <label>Your full name</label>
              <input value={form.fullName} onChange={set('fullName')} required autoFocus />
            </div>
            <div className="wizard-grid-2">
              <div className="form-row">
                <label>Username</label>
                <input value={form.username} onChange={set('username')} required />
              </div>
              <div className="form-row">
                <label>Email (optional)</label>
                <input type="email" value={form.email} onChange={set('email')} />
              </div>
            </div>
            <div className="wizard-grid-2">
              <div className="form-row">
                <label>Password</label>
                <input type="password" value={form.password} onChange={set('password')} required />
              </div>
              <div className="form-row">
                <label>Confirm password</label>
                <input type="password" value={form.confirm} onChange={set('confirm')} required />
              </div>
            </div>

            <hr className="wizard-divider" />

            <div className="form-row">
              <label>Business structure</label>
              <select value={form.businessStructure} onChange={set('businessStructure')}>
                <option value="solo">Solo / Individual</option>
                <option value="company">Registered Company</option>
              </select>
            </div>
            <div className="form-row">
              <label>Business name</label>
              <input value={form.businessName} onChange={set('businessName')} required />
            </div>
            {form.businessStructure === 'company' && (
              <div className="form-row">
                <label>TIN (Tax Identification Number)</label>
                <input value={form.tin} onChange={set('tin')} required />
              </div>
            )}
            <div className="form-row">
              <label>Business type</label>
              <select value={form.businessType} onChange={set('businessType')}>
                <option value="retail">Retail shop</option>
                <option value="restaurant">Restaurant</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="wholesale">Wholesale</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="wizard-grid-2">
              <div className="form-row">
                <label>Region</label>
                <input value={form.region} onChange={set('region')} />
              </div>
              <div className="form-row">
                <label>District</label>
                <input value={form.district} onChange={set('district')} />
              </div>
            </div>
            <div className="form-row">
              <label>Street address</label>
              <input value={form.streetAddress} onChange={set('streetAddress')} />
            </div>

            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary wizard-full" onClick={goNext}>Continue</button>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <div className="form-row">
              <label>Business phone</label>
              <input value={form.businessPhone} onChange={set('businessPhone')} />
            </div>
            <div className="form-row">
              <label>Business email</label>
              <input type="email" value={form.businessEmail} onChange={set('businessEmail')} placeholder={form.email || 'business@example.com'} />
            </div>
            <div className="form-row">
              <label>Logo URL (optional)</label>
              <input value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://…" />
            </div>
            <div className="wizard-note">Used on your invoices and quotations instead of a hardcoded company name.</div>

            {error && <div className="error-text">{error}</div>}
            <div className="wizard-actions">
              <button className="btn btn-outline" onClick={goBack}>Back</button>
              <button className="btn btn-primary" onClick={goNext}>Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel">
            <div className="form-row">
              <label>Default VAT / tax rate (%)</label>
              <input type="number" min="0" step="0.1" value={form.taxRate} onChange={set('taxRate')} />
            </div>
            <div className="form-row">
              <label>Invoice numbering prefix</label>
              <input value={form.invoicePrefix} onChange={set('invoicePrefix')} placeholder="INV" />
            </div>
            <div className="form-row">
              <label>Default payment terms (days)</label>
              <input type="number" min="0" value={form.paymentTermsDays} onChange={set('paymentTermsDays')} />
            </div>

            {error && <div className="error-text">{error}</div>}
            <div className="wizard-actions">
              <button className="btn btn-outline" onClick={goBack} disabled={busy}>Back</button>
              <button className="btn btn-primary" onClick={createAccount} disabled={busy}>
                {busy ? 'Creating your account…' : 'Create account'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-panel">
            <div className="wizard-note">Add a few items to get started, or skip and import a spreadsheet later.</div>
            <table className="wizard-table">
              <thead>
                <tr>
                  <th>Item name</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row, i) => (
                  <tr key={i}>
                    <td><input value={row.name} onChange={(e) => updateInventoryRow(i, 'name', e.target.value)} placeholder="e.g. Cooking oil 5L" /></td>
                    <td><input value={row.sku} onChange={(e) => updateInventoryRow(i, 'sku', e.target.value)} /></td>
                    <td><input type="number" min="0" value={row.quantity} onChange={(e) => updateInventoryRow(i, 'quantity', e.target.value)} /></td>
                    <td><input type="number" min="0" value={row.costPrice} onChange={(e) => updateInventoryRow(i, 'costPrice', e.target.value)} /></td>
                    <td><input type="number" min="0" value={row.sellingPrice} onChange={(e) => updateInventoryRow(i, 'sellingPrice', e.target.value)} /></td>
                    <td>
                      {inventoryRows.length > 1 && (
                        <button type="button" className="btn btn-outline wizard-row-remove" onClick={() => removeInventoryRow(i)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-outline" onClick={addInventoryRow}>+ Add row</button>

            {error && <div className="error-text">{error}</div>}
            <div className="wizard-actions">
              <button className="btn btn-outline" onClick={() => setStep(5)} disabled={busy}>Skip</button>
              <button className="btn btn-primary" onClick={saveInventoryAndContinue} disabled={busy}>
                {busy ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="wizard-panel">
            <div className="wizard-note">Invite staff now, or skip and add them later from Settings.</div>
            <table className="wizard-table">
              <thead>
                <tr>
                  <th>Full name</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((row, i) => (
                  <tr key={i}>
                    <td><input value={row.fullName} onChange={(e) => updateStaffRow(i, 'fullName', e.target.value)} /></td>
                    <td><input value={row.username} onChange={(e) => updateStaffRow(i, 'username', e.target.value)} /></td>
                    <td><input type="password" value={row.password} onChange={(e) => updateStaffRow(i, 'password', e.target.value)} /></td>
                    <td>
                      <select value={row.role} onChange={(e) => updateStaffRow(i, 'role', e.target.value)}>
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                      </select>
                    </td>
                    <td>
                      {staffRows.length > 1 && (
                        <button type="button" className="btn btn-outline wizard-row-remove" onClick={() => removeStaffRow(i)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-outline" onClick={addStaffRow}>+ Add row</button>

            {error && <div className="error-text">{error}</div>}
            <div className="wizard-actions">
              <button className="btn btn-outline" onClick={() => navigate('/', { replace: true })} disabled={busy}>Skip</button>
              <button className="btn btn-primary" onClick={saveStaffAndFinish} disabled={busy}>
                {busy ? 'Finishing…' : 'Finish'}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--navy)', fontWeight: 600 }}>Sign in</Link>
          </div>
        )}
      </div>
    </div>
  )
}
