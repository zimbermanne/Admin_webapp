import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

function FeatureGrid({ features }) {
  return (
    <div className="landing-grid">
      {features.map((f) => (
        <div className="landing-feature-card" key={f.title}>
          <div className="landing-feature-icon">{f.icon}</div>
          <div className="landing-feature-title">{f.title}</div>
          <div className="landing-feature-text">{f.text}</div>
        </div>
      ))}
    </div>
  )
}

function LanguageSelector() {
  const { i18n } = useTranslation()
  
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'pt', name: 'Português' },
    { code: 'sw', name: 'Kiswahili' },
  ]
  
  return (
    <select 
      value={i18n.language} 
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="landing-language-selector"
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #ddd',
        backgroundColor: 'white',
        fontSize: '14px',
        cursor: 'pointer'
      }}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.name}
        </option>
      ))}
    </select>
  )
}

export default function Landing() {
  const [track, setTrack] = useState('business')
  const { t } = useTranslation()

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand">
            <span className="landing-brand-mark">M</span>
            <span className="landing-brand-name">{t('landing.brand.name')}</span>
          </div>
          <nav className="landing-nav">
            <a href="#features">{t('landing.nav.features')}</a>
            <Link to="/download">{t('landing.nav.download')}</Link>
            <a href="#about">{t('landing.nav.about')}</a>
            <a href="#pricing">{t('landing.nav.pricing')}</a>
            <Link to="/login" className="landing-nav-login">{t('landing.nav.login')}</Link>
            <Link to="/register" className="landing-nav-cta">{t('landing.nav.getStarted')}</Link>
            <LanguageSelector />
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1>{t('landing.hero.title')}</h1>
          <p className="landing-hero-sub">
            {t('landing.hero.subtitle')}
          </p>

          <div className="landing-track-switch">
            <button
              className={track === 'business' ? 'active' : ''}
              onClick={() => setTrack('business')}
            >
              {t('landing.hero.trackBusiness')}
            </button>
            <button
              className={track === 'community' ? 'active' : ''}
              onClick={() => setTrack('community')}
            >
              {t('landing.hero.trackCommunity')}
            </button>
            <button
              className={track === 'personal' ? 'active' : ''}
              onClick={() => setTrack('personal')}
            >
              {t('landing.hero.trackPersonal')}
            </button>
          </div>

          <div className="landing-hero-actions">
            <Link to={`/register?track=${track}`} className="landing-btn-primary">
              {track === 'business' && t('landing.hero.setupBusiness')}
              {track === 'community' && t('landing.hero.setupCommunity')}
              {track === 'personal' && t('landing.hero.setupPersonal')}
            </Link>
            <Link to="/login" className="landing-btn-secondary">{t('landing.hero.haveAccount')}</Link>
          </div>

          <Link to="/download" className="landing-app-download">
            <span className="landing-app-download-icon">⬇</span>
            {t('landing.hero.downloadApp')}
          </Link>
        </div>
      </section>

      {track === 'business' && (
        <section id="features" className="landing-section">
          <h2>{t('landing.features.business.title')}</h2>
          <p className="landing-section-sub">
            {t('landing.features.business.subtitle')}
          </p>
          <FeatureGrid features={[
            { icon: '🧾', title: t('landing.features.pos.title'), text: t('landing.features.pos.text') },
            { icon: '📦', title: t('landing.features.inventory.title'), text: t('landing.features.inventory.text') },
            { icon: '📑', title: t('landing.features.invoices.title'), text: t('landing.features.invoices.text') },
            { icon: '📒', title: t('landing.features.debtors.title'), text: t('landing.features.debtors.text') },
            { icon: '📈', title: t('landing.features.reports.title'), text: t('landing.features.reports.text') },
            { icon: '🕵️', title: t('landing.features.activity.title'), text: t('landing.features.activity.text') },
          ]} />
        </section>
      )}

      {track === 'community' && (
        <section id="community" className="landing-section">
          <h2>{t('landing.features.community.title')}</h2>
          <p className="landing-section-sub">
            {t('landing.features.community.subtitle')}
          </p>
          <FeatureGrid features={[
            { icon: '👥', title: t('landing.features.members.title'), text: t('landing.features.members.text') },
            { icon: '💰', title: t('landing.features.contributions.title'), text: t('landing.features.contributions.text') },
            { icon: '🤝', title: t('landing.features.payouts.title'), text: t('landing.features.payouts.text') },
            { icon: '🏦', title: t('landing.features.loans.title'), text: t('landing.features.loans.text') },
            { icon: '📊', title: t('landing.features.groupSummary.title'), text: t('landing.features.groupSummary.text') },
            { icon: '🔐', title: t('landing.features.roles.title'), text: t('landing.features.roles.text') },
          ]} />
        </section>
      )}

      {track === 'personal' && (
        <section id="personal" className="landing-section">
          <h2>{t('landing.features.personal.title')}</h2>
          <p className="landing-section-sub">
            {t('landing.features.personal.subtitle')}
          </p>
          <FeatureGrid features={[
            { icon: '💸', title: t('landing.features.expenseLog.title'), text: t('landing.features.expenseLog.text') },
            { icon: '🧮', title: t('landing.features.budgets.title'), text: t('landing.features.budgets.text') },
            { icon: '🔁', title: t('landing.features.habits.title'), text: t('landing.features.habits.text') },
            { icon: '🎯', title: t('landing.features.goals.title'), text: t('landing.features.goals.text') },
            { icon: '🧑‍🤝‍🧑', title: t('landing.features.challenges.title'), text: t('landing.features.challenges.text') },
            { icon: '📉', title: t('landing.features.insights.title'), text: t('landing.features.insights.text') },
          ]} />
        </section>
      )}

      <section className="landing-section landing-section-alt">
        <h2>{t('landing.accounts.title')}</h2>
        <p className="landing-section-sub">
          {t('landing.accounts.subtitle')}
        </p>
        <div className="landing-grid landing-grid-three">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🏪</div>
            <div className="landing-feature-title">{t('landing.accounts.business')}</div>
            <div className="landing-feature-text">
              {t('landing.accounts.businessText')}
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🌿</div>
            <div className="landing-feature-title">{t('landing.accounts.community')}</div>
            <div className="landing-feature-text">
              {t('landing.accounts.communityText')}
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">👛</div>
            <div className="landing-feature-title">{t('landing.accounts.personal')}</div>
            <div className="landing-feature-text">
              {t('landing.accounts.personalText')}
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="landing-section landing-about">
        <div className="landing-about-grid">
          <div className="landing-about-copy">
            <h2>{t('landing.about.title')}</h2>
            <p>
              {t('landing.about.description1')}
            </p>
            <p>
              {t('landing.about.description2')}
            </p>
            <div className="landing-about-stats">
              <div className="landing-about-stat">
                <div className="landing-about-stat-value">54</div>
                <div className="landing-about-stat-label">{t('landing.about.countries')}</div>
              </div>
              <div className="landing-about-stat">
                <div className="landing-about-stat-value">3</div>
                <div className="landing-about-stat-label">{t('landing.about.accountTypes')}</div>
              </div>
              <div className="landing-about-stat">
                <div className="landing-about-stat-value">1</div>
                <div className="landing-about-stat-label">{t('landing.about.dashboard')}</div>
              </div>
            </div>
          </div>
          <div className="landing-about-values">
            <div className="landing-about-value-card">
              <div className="landing-feature-icon">🎯</div>
              <div className="landing-feature-title">{t('landing.about.simple')}</div>
              <div className="landing-feature-text">
                {t('landing.about.simpleText')}
              </div>
            </div>
            <div className="landing-about-value-card">
              <div className="landing-feature-icon">🔒</div>
              <div className="landing-feature-title">{t('landing.about.protected')}</div>
              <div className="landing-feature-text">
                {t('landing.about.protectedText')}
              </div>
            </div>
            <div className="landing-about-value-card">
              <div className="landing-feature-icon">🌍</div>
              <div className="landing-feature-title">{t('landing.about.africa')}</div>
              <div className="landing-feature-text">
                {t('landing.about.africaText')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-section landing-cta-band">
        <h2>{t('landing.cta.title')}</h2>
        <p className="landing-section-sub">{t('landing.cta.subtitle')}</p>
        <Link to={`/register?track=${track}`} className="landing-btn-primary">{t('landing.cta.button')}</Link>

        <div className="landing-beta-notice">
          <div className="landing-beta-badge">{t('landing.cta.beta')}</div>
          <p>
            {t('landing.cta.betaText')}
          </p>
        </div>
      </section>

      <section className="landing-section landing-disclaimer">
        <h2>{t('landing.disclaimer.title')}</h2>
        <div className="landing-disclaimer-text">
          <p>
            {t('landing.disclaimer.text')}
          </p>
          <Link to="/legal" className="landing-legal-link">{t('landing.disclaimer.legalLink')}</Link>
          <p className="landing-disclaimer-note">{t('landing.disclaimer.languages')}</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div>{t('landing.footer.copyright', { year: new Date().getFullYear() })}</div>
        <div className="landing-footer-links">
          <Link to="/login">{t('landing.footer.login')}</Link>
          <Link to="/register">{t('landing.footer.signup')}</Link>
          <a href="https://instagram.com/zimbermanne_studios" target="_blank" rel="noopener noreferrer">Instagram</a>
          <a href="https://facebook.com/moneytracer" target="_blank" rel="noopener noreferrer">Facebook</a>
        </div>
      </footer>
    </div>
  )
}
