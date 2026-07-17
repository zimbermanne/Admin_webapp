import Clock from '../Clock.jsx'

export default function MobileTopBar({
  title, onToggle, open, accountName, accountRank,
  reminders, onAddReminder, onDismissReminder,
}) {
  const hasInfoRow = accountName || accountRank || (reminders && reminders.length > 0) || onAddReminder

  return (
    <>
      <div className="mobile-topbar">
        <button className="hamburger" onClick={onToggle} aria-label="Toggle menu">
          {open ? '✕' : '☰'}
        </button>
        <div className="brand-logo" style={{ width: 26, height: 26, fontSize: 13 }}>M</div>
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{title}</div>
        <Clock showAccount={false} showReminders={false} />
      </div>
      {hasInfoRow && (
        <div className="mobile-info-row">
          <Clock
            showClock={false}
            accountName={accountName}
            accountRank={accountRank}
            reminders={reminders}
            onAddReminder={onAddReminder}
            onDismissReminder={onDismissReminder}
          />
        </div>
      )}
    </>
  )
}
