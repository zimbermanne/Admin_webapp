import { useEffect, useState } from 'react'

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

const RANK_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

/**
 * Topbar clock/reminders bar.
 *
 * `reminders` is optional — an array of { id, text } — so future features
 * (due invoices, low stock, follow-ups, etc.) can just pass items in here.
 * With none supplied it shows a quiet placeholder so the bar still reads
 * as "reserved for reminders" rather than empty dead space.
 *
 * `accountName`/`accountRank` render as a third segment (Account: X · Rank: Y)
 * so the bar doubles as a quick "who am I logged in as" indicator.
 */
export default function Clock({ reminders = [], accountName, accountRank }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('en-GB', { hour12: false })
  const month = now.toLocaleDateString('en-US', { month: 'short' })
  const week = isoWeek(now)
  const year = now.getFullYear()
  const day = now.getDate()
  const rankLabel = accountRank ? (RANK_LABELS[accountRank] || accountRank) : null

  return (
    <div className="clock-bar clock-bar-wide" title={now.toString()}>
      <div className="reminders-segment">
        {reminders.length === 0 ? (
          <span className="reminders-placeholder">No reminders</span>
        ) : (
          reminders.map((r) => (
            <span key={r.id} className="reminder-chip">{r.text}</span>
          ))
        )}
      </div>
      {(accountName || rankLabel) && (
        <>
          <div className="clock-divider" />
          <div className="account-segment">
            {accountName && <span className="account-chip">Account name: <strong>{accountName}</strong></span>}
            {rankLabel && <span className="account-chip">Account rank: <strong>{rankLabel}</strong></span>}
          </div>
        </>
      )}
      <div className="clock-divider" />
      <div className="clock-segment">
        <div className="clock-time">{time}</div>
        <div className="clock-date">Wk {week} · {month} {day} · {year}</div>
      </div>
    </div>
  )
}
