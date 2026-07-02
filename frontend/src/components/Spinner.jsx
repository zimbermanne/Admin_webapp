/**
 * Lightweight loading indicator for use *inside* a page — a card, a table,
 * a modal, a button — as opposed to PageLoader, which takes over the whole
 * viewport. Drop <Spinner label="Loading invoices" /> anywhere data is
 * being fetched so every level of the app shows feedback, not just the
 * initial app boot.
 */
export default function Spinner({ label, inline = false }) {
  if (inline) return <span className="spinner" aria-label={label || 'Loading'} />
  return (
    <div className="spinner-block">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  )
}
