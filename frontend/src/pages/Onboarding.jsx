import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useApi } from '../hooks/useApi.js'
import { useI18n } from '../hooks/useI18n.jsx'
import { getSuggestedLanguage, AVAILABLE_LANGUAGES } from '../utils/countryLanguageMapping.js'
import { AFRICAN_COUNTRY_CURRENCIES } from '../african_currencies.js'

const STEPS_BUSINESS = [
  { n: 1, label: 'Business basics' },
  { n: 2, label: 'Contact & branding' },
  { n: 3, label: 'Tax & invoicing' },
  { n: 4, label: 'First items', optional: true },
  { n: 5, label: 'Invite staff', optional: true },
]

const STEPS_COMMUNITY = [
  { n: 1, label: 'Group basics' },
  { n: 2, label: 'Contributions & meetings' },
  { n: 3, label: 'Add members', optional: true },
  { n: 4, label: 'Assign roles', optional: true },
]

const BUSINESS_TYPES = ['Retail shop', 'Restaurant', 'Pharmacy', 'Wholesale', 'Salon / Barbershop', 'Hardware store', 'Other']

const GROUP_TYPES = ['Social savings group', 'VICOBA', 'Vibati', 'Chama', 'SACCO', 'Stokvel', 'Susu', 'Tontine', 'Other']

const GROUP_ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'chairman', label: 'Chairman' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'secretary', label: 'Secretary' },
]

export default function Onboarding() {
  const { account, setAccount, refreshAccount, logout } = useAuth()
  const api = useApi()
  const { t, changeLanguage, currentLanguage, availableLanguages } = useI18n()

  const isCommunity = account?.account_type === 'community'
  const STEPS = isCommunity ? STEPS_COMMUNITY : STEPS_BUSINESS

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    business_structure: 'solo',
    name: '',
    tin: '',
    owner_full_name: '',
    business_type: 'Retail shop',
    country: '',
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

  const [groupForm, setGroupForm] = useState({
    name: '',
    registration_number: '',
    group_type: 'Social savings group',
    region: '',
    district: '',
    contribution_style: 'fixed',
    contribution_amount: 0,
    currency: 'TZS',
    cycle_frequency: 'monthly',
    meeting_day: '',
    rotation_enabled: false,
    lending_enabled: false,
  })

  // Pre-fill from the account created at registration time.
  useEffect(() => {
    if (account) {
      setForm((f) => ({
        ...f,
        name: account.name || f.name,
        owner_full_name: account.owner_full_name || f.owner_full_name,
        business_type: account.business_type || f.business_type,
        country: account.country || f.country,
        email: account.email || f.email,
        phone: account.phone || f.phone,
        tax_rate: account.tax_rate ?? f.tax_rate,
        invoice_prefix: account.invoice_prefix || f.invoice_prefix,
        payment_terms_days: account.payment_terms_days ?? f.payment_terms_days,
      }))
      setGroupForm((g) => ({
        ...g,
        name: account.name || g.name,
      }))
    }
  }, [account])

  // Auto-suggest language when country changes
  useEffect(() => {
    if (form.country) {
      const suggestedLang = getSuggestedLanguage(form.country)
      if (suggestedLang && suggestedLang !== currentLanguage) {
        changeLanguage(suggestedLang)
      }
    }
  }, [form.country, currentLanguage, changeLanguage])

  const set = (field) => (e) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
    setForm((f) => ({ ...f, [field]: val }))
  }

  const setGroup = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? parseFloat(e.target.value) || 0
      : e.target.value
    setGroupForm((g) => ({ ...g, [field]: val }))
  }

  // ---- Step 4: first inventory items (business) ----
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

  // ---- Step 3 (community): add group members ----
  const [members, setMembers] = useState([])
  const [memberDraft, setMemberDraft] = useState({ name: '', age: '', phone: '', group_role: 'member' })

  const addMemberDraft = () => {
    if (!memberDraft.name.trim()) return
    setMembers((list) => [...list, { ...memberDraft, age: memberDraft.age ? parseInt(memberDraft.age, 10) : null }])
    setMemberDraft({ name: '', age: '', phone: '', group_role: 'member' })
  }
  const removeMember = (i) => setMembers((list) => list.filter((_, idx) => idx !== i))
  const setMemberRole = (i, role) => setMembers((list) => list.map((m, idx) => idx === i ? { ...m, group_role: role } : m))

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
    if (isCommunity) {
      if (step === 1) {
        if (!groupForm.name.trim()) return 'Group name is required.'
        if (!groupForm.region.trim() || !groupForm.district.trim()) return 'Region and district are required.'
        return ''
      }
      return ''
    }
    if (step === 1) {
      if (!form.name.trim()) return 'Business name is required.'
      if (!form.owner_full_name.trim()) return 'Owner / representative full name is required.'
      if (form.business_structure === 'company' && !form.tin.trim()) return 'TIN is required for a registered company.'
      if (!form.region.trim() || !form.district.trim()) return 'Region and district are required.'
      return ''
    }
    if (step === 2) {
      if (!form.phone.trim()) return 'A contact phone number is required.'
      if (!form.email.trim()) return 'A contact email is required.'
      return ''
    }
    return ''
  }

  const goNext = async () => {
    const v = validateStep()
    if (v) { setError(v); return }
    setError('')

    if (isCommunity && step === 2) {
      // Steps 1–2 hold the mandatory group data. Save it now via the
      // community setup endpoint, but don't mark onboarding complete yet —
      // that happens after the optional members/roles steps below.
      setSaving(true)
      try {
        await api.post('/community/setup', groupForm)
        await refreshAccount()
      } catch (e) {
        setError(e.message)
        setSaving(false)
        return
      }
      setSaving(false)
    }

    if (!isCommunity && step === 3) {
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

  const goBack = () => setStep((s) => Math.max(s - 1, 1))

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

  const continueFromMembers = () => setStep(4)

  const saveMembersAndFinish = async () => {
    setError('')
    setSaving(true)
    try {
      for (const m of members) {
        await api.post('/community/members', {
          name: m.name, age: m.age, phone: m.phone, group_role: m.group_role,
        })
      }
    } catch (e) {
      setError(e.message)
      setSaving(false)
      return
    }
    setSaving(false)
    finishWizard()
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
        <h1 style={{ textAlign: 'center', fontSize: 20, marginBottom: 4 }}>
          {isCommunity ? "Let's set up your savings group" : "Let's set up your business"}
        </h1>
        <div className="sub" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {isCommunity
            ? 'A few quick details so your contributions, members, and dashboard are ready to go.'
            : 'A few quick details so your invoices, tax, and dashboard are ready to go.'}
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

        {/* Step 1 — Group basics (community) */}
        {isCommunity && step === 1 && (
          <>
            <div className="form-row">
              <label>Group type</label>
              <select value={groupForm.group_type} onChange={setGroup('group_type')}>
                {GROUP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="wizard-row">
              <div className="form-row">
                <label>Group name *</label>
                <input value={groupForm.name} onChange={setGroup('name')} autoFocus />
              </div>
              <div className="form-row">
                <label>Group registration number (optional)</label>
                <input value={groupForm.registration_number} onChange={setGroup('registration_number')} placeholder="e.g. from your local government office" />
              </div>
              <div className="form-row">
                <label>Region *</label>
                <input value={groupForm.region} onChange={setGroup('region')} />
              </div>
              <div className="form-row">
                <label>District *</label>
                <input value={groupForm.district} onChange={setGroup('district')} />
              </div>
            </div>
          </>
        )}

        {/* Step 2 — Contributions & meetings (community) */}
        {isCommunity && step === 2 && (
          <div className="wizard-row">
            <div className="form-row">
              <label>Contribution style</label>
              <select value={groupForm.contribution_style} onChange={setGroup('contribution_style')}>
                <option value="fixed">Fixed — everyone pays the same amount</option>
                <option value="flexible">Flexible — members vary how much they contribute</option>
              </select>
            </div>
            {groupForm.contribution_style === 'fixed' && (
              <div className="form-row">
                <label>Contribution amount (per cycle)</label>
                <input type="number" value={groupForm.contribution_amount} onChange={setGroup('contribution_amount')} />
              </div>
            )}
            <div className="form-row">
              <label>Currency</label>
              <input value={groupForm.currency} onChange={setGroup('currency')} />
            </div>
            <div className="form-row">
              <label>Cycle frequency</label>
              <select value={groupForm.cycle_frequency} onChange={setGroup('cycle_frequency')}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-row">
              <label>Meeting day (optional)</label>
              <input value={groupForm.meeting_day} onChange={setGroup('meeting_day')} placeholder="e.g. Last Saturday of the month" />
            </div>
            <div className="form-row" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={groupForm.rotation_enabled} onChange={setGroup('rotation_enabled')} />
                Merry-go-round payouts
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={groupForm.lending_enabled} onChange={setGroup('lending_enabled')} />
                Internal lending
              </label>
            </div>
          </div>
        )}

        {/* Step 1 — Business basics */}
        {!isCommunity && step === 1 && (
          <>
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
                <label>Owner / representative full name *</label>
                <input value={form.owner_full_name} onChange={set('owner_full_name')} />
              </div>
              <div className="form-row">
                <label>Country *</label>
                <select value={form.country} onChange={set('country')}>
                  <option value="">Select country...</option>
                  {AFRICAN_COUNTRY_CURRENCIES.map((c) => (
                    <option key={c[1]} value={c[0]}>{c[0]}</option>
                  ))}
                </select>
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
        {!isCommunity && step === 2 && (
          <div className="wizard-row">
            <div className="form-row">
              <label>Phone *</label>
              <input value={form.phone} onChange={set('phone')} autoFocus />
            </div>
            <div className="form-row">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label>Logo URL (optional)</label>
              <input value={form.logo_url} onChange={set('logo_url')} placeholder="https://…" />
            </div>
          </div>
        )}

        {/* Step 3 — Tax & invoicing defaults (business only — no VAT/invoicing for savings groups) */}
        {!isCommunity && step === 3 && (
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


        {/* Step 4 — First inventory items (optional, business) */}
        {!isCommunity && step === 4 && (
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

        {/* Step 5 — Invite staff (optional, business) */}
        {!isCommunity && step === 5 && (
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

        {/* Step 3 — Add group members (optional, community) */}
        {isCommunity && step === 3 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Add members now, or skip and add them later from Members.
            </div>
            <div className="wizard-row">
              <div className="form-row"><label>Member name</label>
                <input value={memberDraft.name} onChange={(e) => setMemberDraft({ ...memberDraft, name: e.target.value })} /></div>
              <div className="form-row"><label>Age</label>
                <input type="number" value={memberDraft.age} onChange={(e) => setMemberDraft({ ...memberDraft, age: e.target.value })} /></div>
              <div className="form-row"><label>Phone number</label>
                <input value={memberDraft.phone} onChange={(e) => setMemberDraft({ ...memberDraft, phone: e.target.value })} /></div>
            </div>
            <button className="btn btn-outline" onClick={addMemberDraft} type="button">+ Add member to list</button>

            {members.length > 0 && (
              <div className="wizard-mini-list">
                {members.map((m, i) => (
                  <div className="wizard-mini-item" key={i}>
                    <span className="grow"><b>{m.name}</b>{m.age ? `, age ${m.age}` : ''} — {m.phone || 'no phone'}</span>
                    <button className="btn btn-danger" type="button" onClick={() => removeMember(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Step 4 — Assign roles (optional, community) */}
        {isCommunity && step === 4 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Assign chairman, treasurer, and secretary from the members you added, or skip and assign roles later.
            </div>
            {members.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                No members were added in the previous step — go back to add members first, or skip to finish setup.
              </div>
            )}
            {members.length > 0 && (
              <div className="wizard-mini-list">
                {members.map((m, i) => (
                  <div className="wizard-mini-item" key={i}>
                    <span className="grow"><b>{m.name}</b></span>
                    <select value={m.group_role} onChange={(e) => setMemberRole(i, e.target.value)}>
                      {GROUP_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
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
            {!isCommunity && step === 4 && (
              <>
                <button className="btn btn-outline" onClick={() => skipTo(5)} disabled={saving}>Skip for now</button>
                <button className="btn btn-primary" onClick={saveItemsAndContinue} disabled={saving}>
                  {saving ? 'Saving…' : 'Save & Continue'}
                </button>
              </>
            )}
            {!isCommunity && step === 5 && (
              <>
                <button className="btn btn-outline" onClick={finishWizard} disabled={saving}>Skip & go to dashboard</button>
                <button className="btn btn-primary" onClick={saveStaffAndFinish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Finish setup'}
                </button>
              </>
            )}
            {!isCommunity && step <= 3 && (
              <button className="btn btn-primary" onClick={goNext} disabled={saving}>
                {saving ? 'Saving…' : step === 3 ? 'Continue' : 'Next'}
              </button>
            )}

            {isCommunity && step === 3 && (
              <>
                <button className="btn btn-outline" onClick={() => skipTo(4)} disabled={saving}>Skip for now</button>
                <button className="btn btn-primary" onClick={continueFromMembers} disabled={saving}>Continue</button>
              </>
            )}
            {isCommunity && step === 4 && (
              <>
                <button className="btn btn-outline" onClick={finishWizard} disabled={saving}>Skip & go to dashboard</button>
                <button className="btn btn-primary" onClick={saveMembersAndFinish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Finish setup'}
                </button>
              </>
            )}
            {isCommunity && step <= 2 && (
              <button className="btn btn-primary" onClick={goNext} disabled={saving}>
                {saving ? 'Saving…' : step === 2 ? 'Continue' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
