import { useState } from 'react'
import { Link } from 'react-router-dom'

const BUSINESS_FEATURES = [
  { icon: '🧾', title: 'Sales Tracking', text: 'Fast multi-item checkout with live stock validation, built for the counter.' },
  { icon: '📦', title: 'Inventory', text: 'Track stock levels, batch import products, and get low-stock alerts before you run out.' },
  { icon: '📑', title: 'Invoice Generation', text: 'Send professional invoices and quotes, and turn accepted quotes into sales.' },
  { icon: '📒', title: 'Debtors & Creditors', text: 'Know who owes you and who you owe, at a glance.' },
  { icon: '📈', title: 'Loan-Ready Reports', text: 'Profit & loss and financial summaries you can show a bank to prove growth.' },
  { icon: '🕵️', title: 'Activity Logs', text: 'Full audit trail of who did what, so nothing slips through unnoticed.' },
]

const COMMUNITY_FEATURES = [
  { icon: '👥', title: 'Group Contributions', text: 'Record every member\'s savings contribution and see the group total update instantly.' },
  { icon: '🔄', title: 'Rotating Payouts', text: 'Track merry-go-round or dividend payouts fairly, with a full history per member.' },
  { icon: '🏦', title: 'Loan Management', text: 'Issue loans to members from group savings and track repayments to the shilling.' },
  { icon: '📊', title: 'Transparency Dashboard', text: 'One clear view of total savings, loans out, and group health — for every meeting.' },
  { icon: '🔐', title: 'Treasurer-led Access', text: 'One recorder login runs the books; members are tracked by name and phone, no accounts needed.' },
  { icon: '🤝', title: 'Works for any group', text: 'VICOBA, Vibati, Chama, Stokvel, Susu, Tontine — one flexible tool, whatever you call it.' },
]

const FAQS = [
  { q: 'Is my data private?', a: 'Yes. Your records belong to you alone — your business or group\'s data is never shared or sold.' },
  { q: 'Can I use it with a shaky connection?', a: 'Moneytracer is built with the realities of intermittent connectivity in mind, so it stays usable even when your signal isn\'t perfect.' },
  { q: 'Is it hard to learn?', a: 'No. It\'s built for the phone in your pocket, and recording a sale or a contribution takes a few taps.' },
  { q: 'Does it work for my currency and region?', a: 'Yes — Moneytracer is designed for the reality of African SMEs and community groups, in your local currency.' },
]

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

export default function Landing() {
  const [track, setTrack] = useState('business')

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand">
            <span className="landing-brand-mark">M</span>
            <span className="landing-brand-name">Moneytracer</span>
          </div>
          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
            <Link to="/login" className="landing-nav-login">Log in</Link>
            <Link to="/register" className="landing-nav-cta">Get started</Link>
          </nav>
        </div>
      </header>

      {/* ---- Dual-path hero ---- */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1>MoneyTracer: Your Wealth, Managed.</h1>
          <p className="landing-hero-sub">
            Whether you're building a business empire or organizing a community
            savings group, MoneyTracer gives you the clarity to scale.
            Stop hustling in the dark. Start optimizing.
          </p>
        </div>

        <div className="landing-path-cards">
          <button
            className={`landing-path-card ${track === 'business' ? 'active' : ''}`}
            onClick={() => setTrack('business')}
          >
            <div className="landing-path-icon">🏪</div>
            <div className="landing-path-title">Scale Your Business</div>
            <div className="landing-path-text">
              Sales, inventory, invoicing, and loan-ready reports for SMEs and traders.
            </div>
            <span className="landing-path-tag">Business-Class</span>
          </button>

          <button
            className={`landing-path-card ${track === 'community' ? 'active' : ''}`}
            onClick={() => setTrack('community')}
          >
            <div className="landing-path-icon">🌿</div>
            <div className="landing-path-title">Organize Your Group</div>
            <div className="landing-path-text">
              Contributions, rotating payouts, and micro-loans for VICOBA, Vibati, and Chama groups.
            </div>
            <span className="landing-path-tag">Community Finance</span>
          </button>
        </div>

        <div className="landing-hero-actions">
          <Link to={`/register?type=${track}`} className="landing-btn-primary">
            {track === 'business' ? 'Set up my business' : 'Set up my group'}
          </Link>
          <Link to="/login" className="landing-btn-secondary">I already have an account</Link>
        </div>
      </section>

      {/* ---- Regional trust strip ---- */}
      <section className="landing-trust-strip">
        <div className="landing-trust-item">
          <span className="landing-trust-icon">📱</span>
          Mobile-first — built for the phone in your pocket
        </div>
        <div className="landing-trust-item">
          <span className="landing-trust-icon">🌍</span>
          Built for African SMEs &amp; community groups, in your currency
        </div>
        <div className="landing-trust-item">
          <span className="landing-trust-icon">🔒</span>
          Your data is private and yours alone
        </div>
      </section>

      {/* ---- Features for the selected path ---- */}
      {track === 'business' ? (
        <section id="features" className="landing-section">
          <h2>Everything a small business needs to track its money</h2>
          <p className="landing-section-sub">
            From the till to the balance sheet, Moneytracer keeps your sales, stock,
            and cash flow organized — and gives you records clean enough to show a bank.
          </p>
          <FeatureGrid features={BUSINESS_FEATURES} />
        </section>
      ) : (
        <section id="features" className="landing-section">
          <h2>Built for chamas, table banking, and merry-go-rounds</h2>
          <p className="landing-section-sub">
            Stop tracking contributions in a notebook. Moneytracer gives your group
            a shared, accurate record every member can trust.
          </p>
          <FeatureGrid features={COMMUNITY_FEATURES} />
        </section>
      )}

      {/* ---- Manifesto ---- */}
      <section className="landing-section landing-manifesto">
        <h2>From Hustler to Empire Builder</h2>
        <p className="landing-manifesto-lead">
          You are not just a business owner or a group treasurer — you are an
          architect of wealth. The difference between staying small and building
          an empire is rarely effort alone. It's the clarity of your data.
        </p>
        <div className="landing-grid landing-grid-three">
          <div className="landing-feature-card">
            <div className="landing-feature-title">Stop the leaks</div>
            <div className="landing-feature-text">
              You work hard for your money — stop letting it slip through the cracks
              of unrecorded expenses or untracked contributions.
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-title">Prove your worth</div>
            <div className="landing-feature-text">
              Banks don't lend to records kept in someone's head. Clean, organized
              history is how you prove growth — to a bank, or to your members.
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-title">Master your growth</div>
            <div className="landing-feature-text">
              When you know exactly what's moving — in your shop or your group —
              you gain the power to scale with confidence.
            </div>
          </div>
        </div>
        <p className="landing-manifesto-cta">
          Whether you're tracking shop inventory or managing community savings,
          MoneyTracer gives you the data to stop guessing and start growing.
        </p>
      </section>

      {/* ---- How it works ---- */}
      <section id="how-it-works" className="landing-section landing-section-alt">
        <h2>The 3-click promise</h2>
        <p className="landing-section-sub">
          No jargon, no complicated setup. Most accounting software is built for
          accountants — MoneyTracer is built for you.
        </p>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <div className="landing-step-title">Choose your path</div>
            <div className="landing-step-text">Business or Savings Group — pick what fits, at sign-up.</div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <div className="landing-step-title">Quick setup</div>
            <div className="landing-step-text">A short wizard asks only what's essential — no jargon.</div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <div className="landing-step-title">Start tracking</div>
            <div className="landing-step-text">Record a sale or a contribution and watch your dashboard update instantly.</div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-cta-band">
        <h2>Ready to get your finances in order?</h2>
        <p className="landing-section-sub">Create an account in minutes. No spreadsheet required.</p>
        <Link to={`/register?type=${track}`} className="landing-btn-primary">Get started free</Link>
      </section>

      {/* ---- FAQ / trust ---- */}
      <section id="faq" className="landing-section landing-faq">
        <h2>Frequently asked</h2>
        <div className="landing-faq-list">
          {FAQS.map((f) => (
            <div className="landing-faq-item" key={f.q}>
              <div className="landing-faq-q">{f.q}</div>
              <div className="landing-faq-a">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div>© {new Date().getFullYear()} Moneytracer.</div>
        <div className="landing-footer-links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Sign up</Link>
        </div>
      </footer>
    </div>
  )
}
