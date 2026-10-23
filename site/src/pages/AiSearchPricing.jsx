import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import EngineNav from '@/components/engine/EngineNav';
import EngineFooter from '@/components/engine/EngineFooter';
import '@/components/engine/engine.css';
import '@/components/aisearch/ai-search.css';

const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

function TierCard({ tier, engines, onBuy, busy }) {
  const [seats, setSeats] = useState(tier.minSeats);
  const [company, setCompany] = useState('');
  const available = new Set(engines.filter(e => e.available).map(e => e.id));
  const labels = Object.fromEntries(engines.map(e => [e.id, e.label]));
  const contributing = tier.contributors.filter(id => available.has(id)).map(id => labels[id]);
  return <article className={`ais-card${tier.badge ? ' is-featured' : ''}`} aria-labelledby={`tier-${tier.id}`}>
    {tier.badge && <span className="ais-ribbon">{tier.badge}</span>}
    <h2 id={`tier-${tier.id}`}>{tier.name}</h2>
    <p className="ais-tag">{tier.tagline}</p>
    <div className="ais-price"><strong>{usd(tier.priceMonthly)}</strong><span>{tier.priceMonthly ? (tier.perSeat ? 'per seat / month' : '/ month') : 'forever'}</span></div>
    <p className="ais-model">{tier.modelLabel}{contributing.length ? ` + ${contributing.join(', ')}` : ''}</p>
    <ul>{tier.features.filter(f => !/contribute/i.test(f) || contributing.length).map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
    {tier.perSeat && <>
      <label className="ais-field">Company name<input value={company} onChange={e => setCompany(e.target.value)} maxLength={120} autoComplete="organization" /></label>
      <label className="ais-field">Seats ({usd(tier.priceMonthly * (Number(seats) || 0))}/month)<input type="number" min={tier.minSeats} max={500} value={seats} onChange={e => setSeats(e.target.value)} /></label>
    </>}
    {tier.priceMonthly === 0
      ? <Link className="engine-button engine-outline" to="/ai-search">Start free</Link>
      : <button type="button" className={`engine-button ${tier.badge ? 'engine-primary' : 'engine-outline'}`} disabled={busy}
          onClick={() => onBuy(tier, tier.perSeat ? { seats: Number(seats), company_name: company.trim() } : {})}>
          {busy ? 'Opening checkout…' : `Choose ${tier.name}`}
        </button>}
  </article>;
}

export default function AiSearchPricing() {
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { api.aiSearch.plans().then(setPlans).catch(() => setError('Plans could not be loaded. Please refresh the page.')); }, []);

  const buy = async (tier, extra) => {
    if (!isAuthenticated) { api.auth.redirectToLogin('/ai-search/pricing'); return; }
    setError(''); setBusy(tier.id);
    const q = new URLSearchParams({ kind: 'ai_search', tier: tier.id });
    if (extra.seats) q.set('seats', String(extra.seats));
    if (extra.company_name) q.set('company', extra.company_name);
    navigate(`/checkout?${q}`);
  };

  return <div className="engine-site">
    <PageMeta {...PAGE_META.aiSearchPricing} />
    <EngineNav />
    <main className="ais-wrap">
      <header className="ais-head">
        <span className="engine-caps">Vivid AI Search</span>
        <h1>Plans for every kind of <span className="engine-blue">research</span></h1>
        <p>Every plan includes live web search with sources and help planning your website. Higher plans answer with stronger models, ask other AI engines for a second opinion, and never wait in the free lane.</p>
      </header>
      {params.get('checkout') === 'cancel' && <div className="ais-error" role="status">Checkout was cancelled. You have not been charged.</div>}
      {error && <div className="ais-error" role="alert">{error}</div>}
      {!plans && !error && <p style={{ textAlign: 'center' }}>Loading plans…</p>}
      {plans && <div className="ais-grid">{plans.tiers.map(t => <TierCard key={t.id} tier={t} engines={plans.engines} onBuy={buy} busy={busy === t.id} />)}</div>}
      <p className="ais-fine">Prices in USD, billed monthly. Cancel any time from <Link to="/ai-search/account">your plan page</Link>. Sales tax may apply. Question limits reset daily and on the 1st of each month (UTC).<br />
        Looking for a website built for you? Website and app pricing is unchanged: <Link to="/pricing">see website pricing</Link>.</p>
    </main>
    <EngineFooter />
  </div>;
}
