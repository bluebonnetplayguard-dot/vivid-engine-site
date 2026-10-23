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
const res = h => (h === 2160 ? '4K' : `${h}p`);

function TierCard({ tier, onBuy, busy }) {
  const [seats, setSeats] = useState(tier.minSeats);
  const [company, setCompany] = useState('');
  return <article className={`ais-card${tier.badge ? ' is-featured' : ''}`} aria-labelledby={`vtier-${tier.id}`}>
    {tier.badge && <span className="ais-ribbon">{tier.badge}</span>}
    <h2 id={`vtier-${tier.id}`}>{tier.name}</h2>
    <p className="ais-tag">{tier.tagline}</p>
    <div className="ais-price"><strong>{usd(tier.priceMonthly)}</strong><span>{tier.priceMonthly ? (tier.perSeat ? 'per seat / month' : '/ month') : 'forever'}</span></div>
    <p className="ais-model">{res(tier.maxHeight)} · {tier.maxFps} fps · {tier.watermark ? 'watermark' : 'no watermark'}</p>
    <ul>{tier.features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
    {tier.perSeat && <>
      <label className="ais-field">Company name<input value={company} onChange={e => setCompany(e.target.value)} maxLength={120} autoComplete="organization" /></label>
      <label className="ais-field">Seats ({usd(tier.priceMonthly * (Number(seats) || 0))}/month)<input type="number" min={tier.minSeats} max={500} value={seats} onChange={e => setSeats(e.target.value)} /></label>
    </>}
    {tier.priceMonthly === 0
      ? <Link className="engine-button engine-outline" to="/video">Start free</Link>
      : <button type="button" className={`engine-button ${tier.badge ? 'engine-primary' : 'engine-outline'}`} disabled={busy}
          onClick={() => onBuy(tier, tier.perSeat ? { seats: Number(seats), company_name: company.trim() } : {})}>
          {busy ? 'Opening checkout…' : `Choose ${tier.name}`}
        </button>}
  </article>;
}

export default function VideoPricing() {
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { api.video.plans().then(setPlans).catch(() => setError('Plans could not be loaded. Please refresh the page.')); }, []);

  const buy = async (tier, extra) => {
    if (!isAuthenticated) { api.auth.redirectToLogin('/video/pricing'); return; }
    setError(''); setBusy(tier.id);
    const q = new URLSearchParams({ kind: 'video_studio', tier: tier.id });
    if (extra.seats) q.set('seats', String(extra.seats));
    if (extra.company_name) q.set('company', extra.company_name);
    navigate(`/checkout?${q}`);
  };

  return <div className="engine-site">
    <PageMeta {...PAGE_META.videoPricing} />
    <EngineNav />
    <main className="ais-wrap">
      <header className="ais-head">
        <span className="engine-caps">Vivid Video Studio</span>
        <h1>Plans for every kind of <span className="engine-blue">video</span></h1>
        <p>Every plan includes the full timeline editor, templates and AI captions. Higher plans unlock HD and 4K, longer videos, pro effects, brand kits and more AI.</p>
      </header>
      {params.get('checkout') === 'cancel' && <div className="ais-error" role="status">Checkout was cancelled. You have not been charged.</div>}
      {error && <div className="ais-error" role="alert">{error}</div>}
      {!plans && !error && <p style={{ textAlign: 'center' }}>Loading plans…</p>}
      {plans && <div className="ais-grid">{plans.tiers.map(t => <TierCard key={t.id} tier={t} onBuy={buy} busy={busy === t.id} />)}</div>}
      <p className="ais-fine">Prices in USD, billed monthly. Cancel any time from <Link to="/video/account">your plan page</Link>. Sales tax may apply. Allowances reset on the 1st of each month (UTC).
        Videos render on your own computer, so export speed depends on your device; 4K needs a computer whose browser supports 4K encoding.<br />
        Want a video made for you? <Link to="/contact">Contact us</Link>. Website pricing is separate: <Link to="/pricing">see website pricing</Link>.</p>
    </main>
    <EngineFooter />
  </div>;
}
