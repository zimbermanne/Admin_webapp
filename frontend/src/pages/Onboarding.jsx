import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'

const STEPS = [
  { n: 1, label: 'Business basics' },
  { n: 2, label: 'Contact & branding' },
  { n: 3, label: 'Tax & invoicing' },
  { n: 4, label: 'First items', optional: true },
  { n: 5, label: 'Invite staff', optional: true },
]

const BUSINESS_TYPES = ['Retail shop', 'Restaurant', 'Pharmacy', 'Wholesale', 'Salon / Barbershop', 'Hardware store', 'Other']

export default function Onboarding() {
  const { account, setAccount, refreshAccount, logout } = useAuth()
  const api = useApi()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    business_structure: 'solo',
    name: '',
    tin: '',
    owner_full_name: '',
    business_type: 'Retail shop',
    region: '',
    district: '',
    street_address: '',
    phone: '',
    email: '',
    logo_url: '',
    tax_rate: 0,
    invoice_prefix: 'INV',
    payment_terms_days: 7,
  })

  // Pre-fill from the account created at registration time.
  useEffect(() => {
    if (account) {
      setForm((f) => ({
        ...f,
        name: account.name || f.name,
        owner_full_name: account.owner_full_name || f.owner_full_name,
        business_type: account.business_type || f.business_type,
        email: account.email || f.email,
        phone: account.phone || f.phone,
        tax_rate: account.tax_rate ?? f.tax_rate,
        invoice_prefix: account.invoice_prefix || f.invoice_prefix,
        payment_terms_days: account.payment_terms_days ?? f.payment_terms_days,
      }))
    }
  }, [account])

  const set = (field) => (e) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
    setForm((f) => ({ ...f, [field]: val }))
  }

  // ---- Step 4: first inventory items ----
  const [items, setItems] = useState([])
  const [itemDraft, setItemDraft] = useState({ name: '', category: 'General', quantity: 0, unit: 'pcs', cost_price: 0, selling_price: 0 })
  const [importFile, setImportFile] = useState(null)
  const [itemsMsg, setItemsMsg] = useState('')

  const addItemDraft = () => {
    if (!itemDraft.name.trim()) return
    setItems((list) => [...list, itemDraft])
    setItemDraft({ name: '', category: 'General', quantity: 0, unit: 'pcs', cost_price: 0, selling_price: 0 })
  }
  const removeItem = (i) => setItems((list) => list.filter((_, idx) => idx !== i))

  // ---- Step 5: invite staff ----
  const [staff, setStaff] = useState([])
  const [staffDraft, setStaffDraft] = useState({ username: '', password: '', full_name: '', email: '', role: 'employee' })

  const addStaffDraft = () => {
    if (!staffDraft.username.trim() || !staffDraft.password.trim()) return
    setStaff((list) => [...list, staffDraft])
    setStaffDraft({ username: '', password: '', full_name: '', email: '', role: 'employee' })
  }
  const removeStaff = (i) => setStaff((list) => list.filter((_, idx) => idx !== i))

  const validateStep = () => {
    if (step === 1) {
      if (!form.name.trim()) return 'Business name is required.'
      if (form.business_structure === 'company' && !form.tin.trim()) return 'TIN is required for a registered company.'
      if (!form.region.trim() || !form.district.trim()) return 'Region and district are required.'
      return ''
    }
    if (step === 2) {
      if (!form.phone.trim()) return 'A contact phone number is required.'
      return ''
    }
    return ''
  }

  const goNext = async () => {
    const v = validateStep()
    if (v) { setError(v); return }
    setError('')

    if (step === 3) {
      // Steps 1–3 hold the mandatory data. Save it now, but don't mark
      // onboarding complete yet — that only happens once the wizard
      // actually finishes (after the optional steps below), otherwise
      // the dashboard gate in App.jsx would unmount this wizard early.
      setSaving(true)
      try {
        const updated = await api.put('/accounts/my-account', form)
        setAccount(updated)
      } catch (e) {
        setError(e.message)
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setStep((s) => Math.min(s + 1, STEPS.length))
  }

  const goBack = () => { setError(''); setStep((s) => Math.max(s - 1, 1)) }

  const saveItemsAndContinue = async () => {
    setError(''); setItemsMsg('')
    setSaving(true)
    try {
      let created = 0
      for (const it of items) {
        await api.post('/inventory/', it)
        created++
      }
      if (importFile) {
        const fd = new FormData()
        fd.append('file', importFile)
        const res = await api.post('/inventory/batch', fd)
        created += res?.created || 0
      }
      if (created > 0) setItemsMsg(`Added ${created} item(s).`)
      setItems([]); setImportFile(null)
    } catch (e) {
      setError(e.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setStep(5)
  }

  const saveStaffAndFinish = async () => {
    setError('')
    setSaving(true)
    try {
      for (const s of staff) {
        await api.post('/users/', s)
      }
    } catch (e) {
      setError(e.message)
      setSaving(false)
      return
    }
    setSaving(false)
    finishWizard()
  }

  const finishWizard = async () => {
    setError('')
    setSaving(true)
    try {
      const updated = await api.put('/accounts/my-account', { onboarding_completed: true })
      setAccount(updated)
    } catch (e) {
      setError(e.message)
      setSaving(false)
      return
    }
    setSaving(false)
    await refreshAccount()
  }

  const skipTo = (n) => { setError(''); setStep(n) }

  if (!account) return null

  return (
    <div className="wizard-screen">
      <div className="wizard-card">
        <h1 style={{ textAlign: 'center', fontSize: 20, marginBottom: 4 }}>Let's set up your business</h1>
        <div className="sub" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          A few quick details so your invoices, tax, and dashboard are ready to go.
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, idx) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
              <div className={`wizard-dot ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
                {step > s.n ? '✓' : s.n}
              </div>
              {idx < STEPS.length - 1 && <div className="wizard-dot-line" />}
            </div>
          ))}
        </div>
        <div className="wizard-step-label">
          Step {step} of {STEPS.length} — {STEPS[step - 1].label}
          {STEPS[step - 1].optional && <span className="wizard-optional-tag">OPTIONAL</span>}
        </div>

        {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

        {/* Step 1 — Business basics */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Owner name is set from your registration details — edit it anytime in Settings.
            </div>
            <div className="form-row">
              <label>Business structure</label>
              <select value={form.business_structure} onChange={set('business_structure')}>
                <option value="solo">Solo / Individual</option>
                <option value="company">Registered Company</option>
              </select>
            </div>
            <div className="wizard-row">
              <div className="form-row">
                <label>Business name *</label>
                <input value={form.name} onChange={set('name')} autoFocus />
              </div>
              <div className="form-row">
                <label>TIN {form.business_structure === 'company' ? '(required)' : '(optional)'}</label>
                <input value={form.tin} onChange={set('tin')} placeholder="Tax Identification Number" />
              </div>
              <div className="form-row">
                <label>Business type</label>
                <select value={form.business_type} onChange={set('business_type')}>
                  {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Region *</label>
                <input value={form.region} onChange={set('region')} />
              </div>
              <div className="form-row">
                <label>District *</label>
                <input value={form.district} onChange={set('district')} />
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label>Street / physical address</label>
                <input value={form.street_address} onChange={set('street_address')} />
              </div>
            </div>
          </>
        )}

        {/* Step 2 — Contact & branding */}
        {step === 2 && (
          <div className="wizard-row">
            <div className="form-row" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                Contact email is set from your registration details — edit it anytime in Settings.
              </div>
            </div>
            <div className="form-row">
              <label>Phone *</label>
              <input value={form.phone} onChange={set('phone')} autoFocus />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label>Logo URL (optional)</label>
              <input value={form.logo_url} onChange={set('logo_url')} placeholder="https://…" />
            </div>
          </div>
        )}

        {/* Step 3 — Tax & invoicing defaults */}
        {step === 3 && (
          <div className="wizard-row">
            <div className="form-row">
              <label>Default VAT / tax rate (%)</label>
              <input type="number" step="0.1" value={form.tax_rate} onChange={set('tax_rate')} />
            </div>
            <div className="form-row">
              <label>Invoice numbering prefix</label>
              <input value={form.invoice_prefix} onChange={set('invoice_prefix')} />
            </div>
            <div className="form-row">
              <label>Default payment terms (days)</label>
              <input type="number" value={form.payment_terms_days} onChange={set('payment_terms_days')} />
            </div>
          </div>
        )}

        {/* Step 4 — First inventory items (optional) */}
        {step === 4 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Add a few items now, or skip and import a full spreadsheet later from Inventory.
            </div>
            <div className="wizard-row">
              <div className="form-row"><label>Item name</label>
                <input value={itemDraft.name} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} /></div>
              <div className="form-row"><label>Category</label>
                <input value={itemDraft.category} onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })} /></div>
              <div className="form-row"><label>Quantity</label>
                <input type="number" value={itemDraft.quantity} onChange={(e) => setItemDraft({ ...itemDraft, quantity: parseFloat(e.target.value) || 0 })} /></div>
              <div className="form-row"><label>Unit</label>
                <input value={itemDraft.unit} onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })} /></div>
              <div className="form-row"><label>Cost price</label>
                <input type="number" value={itemDraft.cost_price} onChange={(e) => setItemDraft({ ...itemDraft, cost_price: parseFloat(e.target.value) || 0 })} /></div>
              <div className="form-row"><label>Selling price</label>
                <input type="number" value={itemDraft.selling_price} onChange={(e) => setItemDraft({ ...itemDraft, selling_price: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <button className="btn btn-outline" onClick={addItemDraft} type="button">+ Add item to list</button>

            {items.length > 0 && (
              <div className="wizard-mini-list">
                {items.map((it, i) => (
                  <div className="wizard-mini-item" key={i}>
                    <span className="grow"><b>{it.name}</b> — {it.quantity} {it.unit} @ {it.selling_price}</span>
                    <button className="btn btn-danger" type="button" onClick={() => removeItem(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-row" style={{ marginTop: 16 }}>
              <label>Or import a spreadsheet (.csv / .xlsx)</label>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </div>
            {itemsMsg && <div style={{ color: 'var(--success)', fontSize: 13 }}>{itemsMsg}</div>}
          </>
        )}

        {/* Step 5 — Invite staff (optional) */}
        {step === 5 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Add staff now, or skip and invite them later from Settings.
            </div>
            <div className="wizard-row">
              <div className="form-row"><label>Username</label>
                <input value={staffDraft.username} onChange={(e) => setStaffDraft({ ...staffDraft, username: e.target.value })} /></div>
              <div className="form-row"><label>Temporary password</label>
                <input type="password" value={staffDraft.password} onChange={(e) => setStaffDraft({ ...staffDraft, password: e.target.value })} /></div>
              <div className="form-row"><label>Full name</label>
                <input value={staffDraft.full_name} onChange={(e) => setStaffDraft({ ...staffDraft, full_name: e.target.value })} /></div>
              <div className="form-row"><label>Email</label>
                <input type="email" value={staffDraft.email} onChange={(e) => setStaffDraft({ ...staffDraft, email: e.target.value })} /></div>
              <div className="form-row"><label>Role</label>
                <select value={staffDraft.role} onChange={(e) => setStaffDraft({ ...staffDraft, role: e.target.value })}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button className="btn btn-outline" onClick={addStaffDraft} type="button">+ Add staff to list</button>

            {staff.length > 0 && (
              <div className="wizard-mini-list">
                {staff.map((s, i) => (
                  <div className="wizard-mini-item" key={i}>
                    <span className="grow"><b>{s.username}</b> — {s.role}</span>
                    <button className="btn btn-danger" type="button" onClick={() => removeStaff(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="wizard-actions">
          <div>
            {step > 1 && (
              <button className="btn btn-outline" onClick={goBack} disabled={saving}>Back</button>
            )}
            {step === 1 && (
              <button className="btn btn-outline" onClick={logout} disabled={saving}>Log out</button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {step === 4 && (
              <>
                <button className="btn btn-outline" onClick={() => skipTo(5)} disabled={saving}>Skip for now</button>
                <button className="btn btn-primary" onClick={saveItemsAndContinue} disabled={saving}>
                  {saving ? 'Saving…' : 'Save & Continue'}
                </button>
              </>
            )}
            {step === 5 && (
              <>
                <button className="btn btn-outline" onClick={finishWizard} disabled={saving}>Skip & go to dashboard</button>
                <button className="btn btn-primary" onClick={saveStaffAndFinish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Finish setup'}
                </button>
              </>
            )}
            {step <= 3 && (
              <button className="btn btn-primary" onClick={goNext} disabled={saving}>
                {saving ? 'Saving…' : step === 3 ? 'Continue' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
