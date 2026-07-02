import './PageLoader.css'

/**
 * Full-page loading state — a soft, morphing gradient orb
 * (Gemini-style) built from the app's own warm palette.
 */
export default function PageLoader({ label = 'Loading' }) {
  return (
    <div className="page-loader">
      <div className="page-loader-dots">
        <span className="page-loader-dot" />
        <span className="page-loader-dot" />
        <span className="page-loader-dot" />
      </div>
      <p className="page-loader-label">{label}</p>
    </div>
  )
}
