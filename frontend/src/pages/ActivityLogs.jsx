import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import Table from '../components/Table.jsx'

const ACTION_LABELS = {
  login: 'Logged in',
  logout: 'Logged out',
  demo_login: 'Demo login',
  pos_mode_switch: 'Switched POS mode',
  pos_checkout: 'Completed a sale',
  invoice_pdf: 'Downloaded invoice PDF',
  quotation_pdf: 'Downloaded quotation PDF',
  inventory_export: 'Exported inventory',
  inventory_batch_import: 'Imported inventory',
  invoice_create: 'Created invoice',
  quotation_delete: 'Deleted quotation',
  invoice_delete: 'Deleted invoice',
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ')
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString()
}

function fmtDuration(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso)
  if (ms < 0) return '—'
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return `${hrs}h ${rem}m`
}

/**
 * Groups a flat, newest-first activity log into per-employee sessions:
 * each "login" opens a session, everything that employee does afterwards
 * belongs to it, and the next "logout" (or "login") closes it.
 */
function buildSessions(logs) {
  const chronological = [...logs].reverse() // oldest first
  const openSessions = {} // username -> session in progress
  const sessions = []

  for (const log of chronological) {
    const user = log.username
    if (log.action === 'login' || log.action === 'demo_login') {
      // Close any dangling session for this user (missed logout)
      if (openSessions[user]) sessions.push(openSessions[user])
      openSessions[user] = {
        username: user,
        login_at: log.created_at,
        logout_at: null,
        events: [],
      }
    } else if (log.action === 'logout') {
      if (openSessions[user]) {
        openSessions[user].logout_at = log.created_at
        sessions.push(openSessions[user])
        delete openSessions[user]
      } else {
        // Logout with no known login (e.g. session pre-dates the log)
        sessions.push({ username: user, login_at: null, logout_at: log.created_at, events: [] })
      }
    } else {
      if (openSessions[user]) {
        openSessions[user].events.push(log)
      } else {
        // Activity with no open session — surface it as its own row
        sessions.push({ username: user, login_at: null, logout_at: null, events: [log], ongoing: false })
      }
    }
  }
  // Any sessions still open (employee hasn't logged out yet)
  Object.values(openSessions).forEach((s) => { s.ongoing = true; sessions.push(s) })

  return sessions.sort((a, b) => new Date(b.login_at || b.logout_at || 0) - new Date(a.login_at || a.logout_at || 0))
}

export default function ActivityLogs() {
  const api = useApi()
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('sessions') // 'sessions' | 'raw'
  const [userFilter, setUserFilter] = useState('all')
  const [expanded, setExpanded] = useState({})

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/activity/?limit=500'),
      api.get('/activity/stats').catch(() => null),
    ])
      .then(([logData, statsData]) => { setLogs(logData); setStats(statsData) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const usernames = useMemo(
    () => Array.from(new Set(logs.map((l) => l.username))).sort(),
    [logs]
  )

  const filteredLogs = useMemo(
    () => userFilter === 'all' ? logs : logs.filter((l) => l.username === userFilter),
    [logs, userFilter]
  )

  const sessions = useMemo(() => buildSessions(filteredLogs), [filteredLogs])

  const toggle = (i) => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))

  const rawColumns = [
    { key: 'created_at', header: 'When', render: (r) => fmtTime(r.created_at), sortable: true },
    { key: 'username', header: 'Employee', sortable: true },
    { key: 'action', header: 'Action', render: (r) => actionLabel(r.action), sortable: true },
    { key: 'details', header: 'Details', sortable: true },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>Activity Logs</h1>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      {stats && (
        <div className="card-grid" style={{ marginBottom: 16 }}>
          <div className="card metric-card"><div className="label">Total Events</div><div className="value">{stats.total_events}</div></div>
          <div className="card metric-card"><div className="label">Employees Active</div><div className="value">{Object.keys(stats.by_user).length}</div></div>
          <div className="card metric-card"><div className="label">Most Common Action</div>
            <div className="value" style={{ fontSize: 15, textTransform: 'capitalize' }}>
              {Object.entries(stats.by_action).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') || '—'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setView('sessions')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: view === 'sessions' ? 'var(--accent)' : 'var(--surface)',
              color: view === 'sessions' ? '#fff' : 'var(--text-muted)',
            }}
          >
            👤 Employee Sessions
          </button>
          <button
            onClick={() => setView('raw')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: view === 'raw' ? 'var(--accent)' : 'var(--surface)',
              color: view === 'raw' ? '#fff' : 'var(--text-muted)',
            }}
          >
            📜 Raw Log
          </button>
        </div>

        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">All employees</option>
          {usernames.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <button className="btn btn-outline" onClick={load}>↻ Refresh</button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}

      {!loading && view === 'raw' && <Table columns={rawColumns} rows={filteredLogs} />}

      {!loading && view === 'sessions' && (
        sessions.length === 0
          ? <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No sessions recorded yet.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map((s, i) => (
                <div key={i} className="card">
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: s.events.length ? 'pointer' : 'default' }}
                    onClick={() => s.events.length && toggle(i)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)',
                        color: 'var(--accent-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13,
                      }}>
                        {s.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {s.login_at ? `In: ${fmtTime(s.login_at)}` : 'Login not recorded'}
                          {'  ·  '}
                          {s.ongoing
                            ? <span style={{ color: 'var(--success)' }}>Still active</span>
                            : s.logout_at ? `Out: ${fmtTime(s.logout_at)}` : 'Logout not recorded'}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {s.login_at && s.logout_at && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDuration(s.login_at, s.logout_at)}</div>
                      )}
                      {s.events.length > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                          {s.events.length} action{s.events.length > 1 ? 's' : ''} {expanded[i] ? '▲' : '▼'}
                        </div>
                      )}
                    </div>
                  </div>

                  {expanded[i] && s.events.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      {s.events.map((ev) => (
                        <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                          <span>
                            <strong>{actionLabel(ev.action)}</strong>
                            {ev.details && <span style={{ color: 'var(--text-muted)' }}> — {ev.details}</span>}
                          </span>
                          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>{fmtTime(ev.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      )}
    </div>
  )
}
