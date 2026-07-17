import { Link } from 'react-router-dom'
import LanguageSwitcher from '../components/LanguageSwitcher'

const STEPS = [
  {
    title: 'Tap the download button below',
    text: 'Your browser will download the Moneytracer APK file. You may see a notification when it finishes.',
  },
  {
    title: 'Open the downloaded file',
    text: 'Tap the download notification, or find "moneytracer.apk" in your Downloads app or file manager, and tap it.',
  },
  {
    title: 'If Google Play Protect warns you',
    text: 'You may see "App blocked to protect your device." This appears because the app isn\'t distributed through the Play Store yet, not because it\'s unsafe. Tap "Install anyway" to continue.',
  },
  {
    title: 'Allow installs from this source (first time only)',
    text: 'If prompted, tap Settings, then turn on "Allow from this source" for your browser, and go back to install.',
  },
  {
    title: 'Install and open',
    text: 'Tap Install, wait for it to finish, then tap Open. Log in with your existing Moneytracer account or create a new one.',
  },
]

export default function Download() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            <span className="landing-brand-mark">M</span>
            <span className="landing-brand-name">Moneytracer</span>
          </Link>
          <nav className="landing-nav">
            <Link to="/">Home</Link>
            <a href="/#features">Features</a>
            <a href="/#about">About us</a>
            <a href="/#pricing">Pricing</a>
            <Link to="/login" className="landing-nav-login">Log in</Link>
            <Link to="/register" className="landing-nav-cta">Get started</Link>
            <LanguageSwitcher />
          </nav>
        </div>
      </header>

      <section className="download-hero">
        <div className="download-hero-inner">
          <div className="download-hero-icon">📱</div>
          <h1>Take Moneytracer with you</h1>
          <p className="download-hero-sub">
            The Moneytracer Android app gives you the same dashboard, POS, and reports
            as the website — built for quick access on the go, right from your home screen.
          </p>
          <a href="/downloads/moneytracer.apk" download className="download-btn-primary">
            <span className="download-btn-icon">⬇</span>
            Download for Android
          </a>
          <div className="download-meta">Free · v1.0.0 · Direct APK download</div>
        </div>
      </section>

      <section className="landing-section">
        <h2>How to install</h2>
        <p className="landing-section-sub">
          Since Moneytracer isn't on the Play Store yet, Android needs a couple of extra
          taps to install it directly. Here's exactly what to expect.
        </p>

        <div className="download-steps">
          {STEPS.map((step, i) => (
            <div className="download-step" key={step.title}>
              <div className="download-step-number">{i + 1}</div>
              <div>
                <div className="download-step-title">{step.title}</div>
                <div className="download-step-text">{step.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-alt">
        <h2>Is this safe?</h2>
        <p className="landing-section-sub">
          Yes. The "App blocked" warning is Android's standard message for any app
          installed outside the Play Store, regardless of who made it — it doesn't mean
          Moneytracer has been flagged for a specific problem. We're a small, independent
          team, so we haven't yet been through Play Store's developer review process.
          Your data works exactly the same as on the website: encrypted in transit, and
          scoped to your account only.
        </p>
      </section>

      <footer className="landing-footer">
        <div>© {new Date().getFullYear()} Moneytracer.</div>
        <div className="landing-footer-links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Sign up</Link>
          <a href="https://instagram.com/zimbermanne_studios" target="_blank" rel="noopener noreferrer">Instagram</a>
          <a href="https://facebook.com/moneytracer" target="_blank" rel="noopener noreferrer">Facebook</a>
        </div>
      </footer>
    </div>
  )
}
