import { useState } from 'react'
import { Link } from 'react-router-dom'

const BUSINESS_FEATURES = [
  { icon: '🧾', title: 'Point of Sale', text: 'Fast multi-item checkout with live stock validation, built for the counter.' },
  { icon: '📦', title: 'Inventory', text: 'Track stock levels, batch import products, and get low-stock alerts before you run out.' },
  { icon: '📑', title: 'Invoices & Quotations', text: 'Send professional invoices and quotes, and turn accepted quotes into sales.' },
  { icon: '📒', title: 'Debtors & Creditors', text: 'Know who owes you and who you owe, at a glance.' },
  { icon: '📈', title: 'Reports', text: 'Profit & loss, financial summaries, and inventory valuation — always current.' },
  { icon: '🕵️', title: 'Activity Logs', text: 'Full audit trail of who did what, so nothing slips through unnoticed.' },
]

const COMMUNITY_FEATURES = [
  { icon: '👥', title: 'Member Management', text: 'Add members, assign co-recorders, and give members their own read-only login.' },
  { icon: '💰', title: 'Contributions', text: 'Record every member\'s savings contribution and see the group total update instantly.' },
  { icon: '🤝', title: 'Payouts', text: 'Track merry-go-round or dividend payouts fairly, with a full history per member.' },
  { icon: '🏦', title: 'Group Loans', text: 'Issue loans to members from group savings and track repayments to the shilling.' },
  { icon: '📊', title: 'Group Summary', text: 'One clear view of total savings, loans out, and group health — for every meeting.' },
  { icon: '🔐', title: 'Role-based Access', text: 'Admins and recorders manage entries; members can always see their own records.' },
]

const PERSONAL_FEATURES = [
  { icon: '💸', title: 'Quick Expense Log', text: 'Add a spend in seconds — amount, category, done. No spreadsheets, no friction.' },
  { icon: '🧮', title: 'Envelope Budgets', text: 'Set a monthly budget per category and always know what\'s safe to spend today.' },
  { icon: '🔁', title: 'Spending Habits', text: 'Tag spends as necessary or impulse and watch your habits improve week over week.' },
  { icon: '🎯', title: 'Savings Goals', text: 'Set a goal, track progress, and stay motivated with a clear visual finish line.' },
  { icon: '🧑‍🤝‍🧑', title: 'Group Challenges', text: 'Save together with friends toward a shared goal, with everyone\'s progress in view.' },
  { icon: '📉', title: 'Personal Insights', text: 'See where your money actually goes, and which weeks or categories creep up.' },
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
            <a href="#community">Community groups</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login" className="landing-nav-login">Log in</Link>
            <Link to="/register" className="landing-nav-cta">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1>Money in, money out — always in view.</h1>
          <p className="landing-hero-sub">
            Moneytracer is the bookkeeping and finance tool for small businesses,
            community savings groups, and personal spending. Track sales and stock,
            run your chama's contributions, or manage your own budget — all from one
            simple dashboard.
          </p>

          <div className="landing-track-switch">
            <button
              className={track === 'business' ? 'active' : ''}
              onClick={() => setTrack('business')}
            >
              I run a business
            </button>
            <button
              className={track === 'community' ? 'active' : ''}
              onClick={() => setTrack('community')}
            >
              I run a savings group
            </button>
            <button
              className={track === 'personal' ? 'active' : ''}
              onClick={() => setTrack('personal')}
            >
              I track my own spending
            </button>
          </div>

          <div className="landing-hero-actions">
            <Link to="/register" className="landing-btn-primary">
              {track === 'business' && 'Set up my business'}
              {track === 'community' && 'Set up my savings group'}
              {track === 'personal' && 'Start tracking my spending'}
            </Link>
            <Link to="/login" className="landing-btn-secondary">I already have an account</Link>
          </div>
        </div>
      </section>

      {track === 'business' && (
        <section id="features" className="landing-section">
          <h2>Everything a small business needs to track its money</h2>
          <p className="landing-section-sub">
            From the till to the balance sheet, Moneytracer keeps your sales, stock,
            and cash flow organized without spreadsheets.
          </p>
          <FeatureGrid features={BUSINESS_FEATURES} />
        </section>
      )}

      {track === 'community' && (
        <section id="community" className="landing-section">
          <h2>Built for chamas, table banking, and merry-go-rounds</h2>
          <p className="landing-section-sub">
            Stop tracking contributions in a notebook. Moneytracer gives your group
            a shared, accurate record every member can trust.
          </p>
          <FeatureGrid features={COMMUNITY_FEATURES} />
        </section>
      )}

      {track === 'personal' && (
        <section id="personal" className="landing-section">
          <h2>Spend wisely, without the spreadsheets</h2>
          <p className="landing-section-sub">
            Log a spend in seconds, see what's safe to spend today, and build better
            habits over time — your way, whether that's budgets, habits, or saving
            with friends.
          </p>
          <FeatureGrid features={PERSONAL_FEATURES} />
        </section>
      )}

      <section className="landing-section landing-section-alt">
        <h2>One account, any way you need it</h2>
        <p className="landing-section-sub">
          Choose a business, community, or personal account when you sign up — the
          dashboard, roles, and reports adapt to fit.
        </p>
        <div className="landing-grid landing-grid-three">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🏪</div>
            <div className="landing-feature-title">Business accounts</div>
            <div className="landing-feature-text">
              POS, inventory, invoicing, and reports for shops, traders, and service
              businesses of any size.
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🌿</div>
            <div className="landing-feature-title">Community accounts</div>
            <div className="landing-feature-text">
              Contributions, payouts, and group loans for savings groups and community
              finance circles.
            </div>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">👛</div>
            <div className="landing-feature-title">Personal accounts</div>
            <div className="landing-feature-text">
              Budgets, habits, and savings goals for anyone who wants to spend more
              wisely, on their own or with friends.
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-section landing-cta-band">
        <h2>Ready to get your finances in order?</h2>
        <p className="landing-section-sub">Create an account in minutes. No spreadsheet required.</p>
        <Link to="/register" className="landing-btn-primary">Get started free</Link>
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
