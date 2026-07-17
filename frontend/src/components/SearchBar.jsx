export default function SearchBar({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div style={{ position: 'relative', maxWidth: 340, flex: '1 1 240px', ...style }}>
      <span style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none',
      }}>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 32px' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: 4,
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
