import Clock from '../Clock.jsx'

export default function MobileTopBar({ title, onToggle, open, accountName, accountRank }) {
  return (
    <div className="mobile-topbar">
      <button className="hamburger" onClick={onToggle} aria-label="Toggle menu">
        {open ? '✕' : '☰'}
      </button>
      <div className="brand-logo" style={{ width: 26, height: 26, fontSize: 13 }}>Z</div>
      <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{title}</div>
      <Clock accountName={accountName} accountRank={accountRank} />
    </div>
  )
}
