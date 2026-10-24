import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, MessageCircle } from 'lucide-react';
import SEO from '@/components/seo/SEO';
import EngineNav from '@/components/engine/EngineNav';
import EngineFooter from '@/components/engine/EngineFooter';
import AdditionalOptions from '@/components/pricing/AdditionalOptions';
import '@/components/engine/engine.css';
import './pricing.css';
import {
  APP_BUILDER_PLANS, BUILD_PACKAGES, BUNDLES, DEFAULT_CYCLE, DISCOUNTS, HISTORY_ROW_LABEL, PARTNER_TIERS, PRICING_AS_OF, PRODUCTION, SEARCH_PLANS, WEBSITE_PLANS,
  bundlePrice, competitorPrice, firstMonthPrice, formatUsd, historyLabel, nonprofitPrice, partnerPrice, planById, planPrice, savingsVsCompetitor, twoYearPrice,
} from '@/config/pricing-catalog';
import { SELF_SERVE_LIVE, consultationHref, earlyAccessHref, partnerApplyHref } from '@/config/launch';
import { BUSINESS, whatsappUrl } from '@/config/business';

// /pricing and /pricing/<category>. Every number on this page comes from config/pricing-catalog.ts; savings are
// worked out there, never typed here.
export const PRICING_CATEGORIES = [
  { slug: '', label: 'Overview', title: 'Pricing: AI Search, Websites, Apps and Production', description: `Prices for Vivid AI Search, website plans, the app builder, video production and done-for-you builds. Self-serve plans are 13% below the matching competitor as of ${asOfText()}.` },
  { slug: 'search', label: 'AI Search', title: 'AI Search Pricing: Free, Search Pro and Search Max', description: `Search Pro ${perMonth(SEARCH_PLANS[1], 'annual')} billed yearly or ${perMonth(SEARCH_PLANS[1], 'monthly')} monthly. Search Max ${perMonth(SEARCH_PLANS[2], 'annual')} billed yearly. Saved conversation history on every paid plan.` },
  { slug: 'websites', label: 'Websites', title: 'Website Plan Pricing: Spark, Core, Business and Business Elite', description: `Website plans from ${perMonth(WEBSITE_PLANS[1], 'annual')} billed yearly, 13% below the matching Wix plan as of ${asOfText()}.` },
  { slug: 'app-builder', label: 'App Builder', title: 'App Builder Pricing: Starter, Builder, Pro and Elite', description: `App Builder plans from ${perMonth(APP_BUILDER_PLANS[1], 'annual')} billed yearly with monthly credits, 13% below the matching Base44 plan as of ${asOfText()}.` },
  { slug: 'production', label: 'Production', title: 'Video Production Pricing: Owner Spotlight, Ads and Social Clips', description: 'Human-made video production for local businesses: Owner Spotlight from $1,495, social clips from $350, and a monthly content plan.' },
  { slug: 'custom-builds', label: 'We Build It', title: 'We Build It For You: Website and App Build Pricing', description: 'Done-for-you websites from $999 and $1,500, custom apps from $3,500, each with 3 months of the matching plan included. Book a free consultation.' },
  { slug: 'bundles', label: 'Bundles', title: 'Bundle Pricing: Launch, Builder and All-In-One', description: 'Save 15% with the Launch and Builder bundles, or 20% with All-In-One. Bundle savings are calculated from the plan prices.' },
  { slug: 'partners', label: 'Partners', title: 'Local Partner Pricing: Bronze, Silver, Gold and Platinum', description: 'Get listed as a Vivid Engine Partner in Local Businesses. Bronze $129, Silver $234, Gold $399 and Platinum $749 a month, 10% off annual.' },
  { slug: 'compare', label: 'Compare', title: 'Compare Vivid Engine Plans and Prices', description: `Every Vivid Engine plan side by side with the competitor plan it is priced against, as of ${asOfText()}, including saved conversation history.` },
];

function asOfText() {
  const [y, m, d] = PRICING_AS_OF.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}
function perMonth(plan, cycle) { return `${formatUsd(planPrice(plan, cycle))}/mo`; }
const CYCLE_NOTE = { annual: 'per month, billed yearly', monthly: 'per month, billed monthly' };

function CycleToggle({ cycle, setCycle }) {
  return <div className="pr-toggle" role="radiogroup" aria-label="Billing period">
    {[['annual', 'Yearly'], ['monthly', 'Monthly']].map(([value, label]) =>
      <button key={value} type="button" role="radio" aria-checked={cycle === value} className={cycle === value ? 'is-on' : ''} onClick={() => setCycle(value)}>{label}{value === 'annual' ? <small> save more</small> : null}</button>)}
  </div>;
}

function CategoryTabs({ slug, cycle }) {
  const q = cycle === DEFAULT_CYCLE ? '' : `?cycle=${cycle}`;
  return <nav className="pr-tabs" aria-label="Pricing categories">
    {PRICING_CATEGORIES.map(c => <Link key={c.slug} to={`/pricing${c.slug ? `/${c.slug}` : ''}${q}`} aria-current={c.slug === slug ? 'page' : undefined} className={c.slug === slug ? 'is-on' : ''}>{c.label}</Link>)}
  </nav>;
}

function Breadcrumbs({ category }) {
  return <nav className="pr-crumbs" aria-label="Breadcrumb"><ol>
    <li><Link to="/">Home</Link></li>
    <li>{category.slug ? <Link to="/pricing">Pricing</Link> : <span aria-current="page">Pricing</span>}</li>
    {category.slug && <li><span aria-current="page">{category.label}</span></li>}
  </ol></nav>;
}

function liveFor(plan) {
  if (plan.id.startsWith('search_')) return SELF_SERVE_LIVE.search;
  if (plan.id.startsWith('web_')) return SELF_SERVE_LIVE.websites;
  if (plan.id.startsWith('app_')) return SELF_SERVE_LIVE.appBuilder;
  return false;
}
function planCta(plan, cycle) {
  const free = planPrice(plan, cycle) === 0;
  if (plan.id.startsWith('search_')) return free ? { to: '/ai-search', label: 'Start free' } : { to: `/checkout?kind=ai_search&tier=${plan.id}&cycle=${cycle}`, label: `Choose ${plan.name}` };
  if (!liveFor(plan)) return { to: earlyAccessHref(plan.id), label: 'Join early access' };
  return { to: `/checkout?kind=plan&plan=${plan.id}&cycle=${cycle}`, label: free ? 'Start free' : `Choose ${plan.name}` };
}

function PlanCard({ plan, cycle }) {
  const price = planPrice(plan, cycle);
  const cta = planCta(plan, cycle);
  const comp = competitorPrice(plan, cycle);
  const saves = savingsVsCompetitor(plan, cycle);
  return <article className={`pr-card${plan.badge ? ' is-featured' : ''}`} aria-labelledby={`plan-${plan.id}`}>
    {plan.badge && <span className="pr-ribbon">{plan.badge}</span>}
    <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
    <p className="pr-tag">{plan.tagline}</p>
    <div className="pr-price"><strong>{formatUsd(price)}</strong><span>{price ? CYCLE_NOTE[cycle] : 'free forever'}</span></div>
    {price > 0 && <p className="pr-sub">{cycle === 'annual'
      ? <>{formatUsd(Math.round(price * 12 * 100) / 100)} a year · or {formatUsd(twoYearPrice(price))}/mo on a 2-year term</>
      : <>First month {formatUsd(firstMonthPrice(price))} ({Math.round(DISCOUNTS.firstMonth * 100)}% off)</>}</p>}
    {comp != null && saves > 0 && <p className="pr-comp">{plan.competitor.name} lists {formatUsd(comp)}/mo. You pay {formatUsd(saves)}/mo less.</p>}
    {plan.credits && <p className="pr-credits">{(cycle === 'annual' ? plan.credits.annual : plan.credits.monthly).toLocaleString('en-US')} credits {cycle === 'annual' ? 'a year' : 'a month'}</p>}
    <ul>{plan.features.map(f => <li key={f}><Check size={16} aria-hidden="true" />{f}</li>)}</ul>
    <p className="pr-history"><b>{HISTORY_ROW_LABEL}:</b> {historyLabel(plan.history)}</p>
    <Link className={`engine-button ${plan.badge ? 'engine-primary' : 'engine-outline'}`} to={cta.to}>{cta.label}</Link>
    {!liveFor(plan) && !plan.id.startsWith('search_') && <p className="pr-fine">Opening soon. Join early access and we will hold this price for you.</p>}
  </article>;
}

function PlanGrid({ plans, cycle }) {
  return <div className="pr-grid">{plans.map(p => <PlanCard key={p.id} plan={p} cycle={cycle} />)}</div>;
}

// Plans as columns, facts as rows. Every comparison table has the saved-history row and the "as of" date.
function CompareTable({ title, plans, competitorLabel }) {
  const paid = plans.filter(p => p.competitor);
  const rows = [
    ['Price, billed yearly', p => `${formatUsd(planPrice(p, 'annual'))}/mo`],
    ['Price, billed monthly', p => `${formatUsd(planPrice(p, 'monthly'))}/mo`],
    [`Compared with (${competitorLabel})`, p => p.competitor?.name ?? '—'],
    ['Their price, yearly', p => (p.competitor ? `${formatUsd(p.competitor.annual)}/mo` : '—')],
    ['Their price, monthly', p => (p.competitor ? `${formatUsd(p.competitor.monthly)}/mo` : '—')],
    ['You save, yearly', p => (p.competitor ? `${formatUsd(savingsVsCompetitor(p, 'annual'))}/mo` : '—')],
    ...(plans.some(p => p.credits) ? [['Credits (monthly / yearly)', p => (p.credits ? `${p.credits.monthly.toLocaleString('en-US')} / ${p.credits.annual.toLocaleString('en-US')}` : '—')]] : []),
    [HISTORY_ROW_LABEL, p => historyLabel(p.history)],
  ];
  return <section className="pr-compare" aria-labelledby={`cmp-${competitorLabel}`}>
    <h2 id={`cmp-${competitorLabel}`}>{title}</h2>
    <div className="pr-table-wrap" tabIndex={0} role="region" aria-label={`${title} table`}>
      <table>
        <caption className="sr-only">{title}</caption>
        <thead><tr><th scope="col">Plan</th>{plans.map(p => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
        <tbody>{rows.map(([label, cell]) => <tr key={label}><th scope="row">{label}</th>{plans.map(p => <td key={p.id}>{cell(p)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="pr-asof">Competitor prices from each company&apos;s own pricing page, as of {asOfText()}. Prices change; check {paid.length ? <a href={paid[0].competitor.url} target="_blank" rel="noopener noreferrer">their page</a> : 'their page'} for today&apos;s price. We compare price only, not features.</p>
  </section>;
}

function SearchSection({ cycle }) {
  return <>
    <PlanGrid plans={SEARCH_PLANS} cycle={cycle} />
    <p className="pr-note">Guests and the Free plan save nothing. Paid plans keep conversations for 12 months; Search Max keeps them until you delete them, with full-text search, export and optional memory. If a plan ends, saved conversations stay readable for 30 days.</p>
    <CompareTable title="AI Search compared" plans={SEARCH_PLANS} competitorLabel="Perplexity" />
  </>;
}
function WebsitesSection({ cycle }) {
  return <><PlanGrid plans={WEBSITE_PLANS} cycle={cycle} /><CompareTable title="Website plans compared" plans={WEBSITE_PLANS} competitorLabel="Wix" />
    <p className="pr-note">Rather have us build it? <Link to="/pricing/custom-builds">See We Build It For You</Link>.</p></>;
}
function AppSection({ cycle }) {
  return <><PlanGrid plans={APP_BUILDER_PLANS} cycle={cycle} /><CompareTable title="App Builder compared" plans={APP_BUILDER_PLANS} competitorLabel="Base44" /></>;
}

function ProductionSection() {
  return <>
    <div className="pr-grid">{PRODUCTION.map(item => {
      const buy = item.price != null && !item.monthly;
      return <article key={item.id} className="pr-card">
        <h3>{item.name}</h3>
        <div className="pr-price"><strong>{item.price == null ? 'Quote' : formatUsd(item.price)}</strong><span>{item.price == null ? 'tell us what you need' : item.monthly ? 'per month' : item.unit ? item.unit : 'one-time'}</span></div>
        {item.bundle && <p className="pr-sub">or {item.bundle.qty} for {formatUsd(item.bundle.price)} (save {formatUsd(item.price * item.bundle.qty - item.bundle.price)})</p>}
        <p className="pr-tag">{item.detail}</p>
        {buy ? <Link className="engine-button engine-outline" to={`/checkout?plan=${item.id}`}>Book and pay</Link> : <Link className="engine-button engine-outline" to={consultationHref(item.id)}>Book a free consultation</Link>}
        {item.bundle && <Link className="engine-button engine-outline" to="/checkout?plan=social_clip_5">Buy the {item.bundle.qty}-pack</Link>}
      </article>;
    })}</div>
    <p className="pr-note">One-time purchases can be paid with card, Apple Pay, Google Pay, Cash App Pay, or Afterpay where eligible.</p>
  </>;
}

function CustomBuildsSection() {
  const builds = BUILD_PACKAGES.filter(b => !b.monthly); const care = BUILD_PACKAGES.filter(b => b.monthly);
  return <>
    <div className="pr-grid">{builds.map(b => {
      const inc = b.includesPlan ? planById(b.includesPlan) : null;
      return <article key={b.id} className="pr-card">
        <h3>{b.name}</h3>
        <div className="pr-price"><strong>{formatUsd(b.price)}</strong><span>{b.startingFrom ? 'and up, one-time' : 'one-time'}</span></div>
        <p className="pr-tag">{b.detail}</p>
        {inc && <p className="pr-credits">Includes {b.includedMonths} months of {inc.name} ({formatUsd(planPrice(inc, 'monthly') * b.includedMonths)} value)</p>}
        <Link className="engine-button engine-primary" to={consultationHref(b.id)}>Book a free consultation</Link>
        {!b.startingFrom && <Link className="engine-button engine-outline" to={`/checkout?plan=${b.id}`}>Pay online</Link>}
      </article>;
    })}</div>
    <h2 className="pr-h2">Monthly care after launch</h2>
    <div className="pr-grid">{care.map(b => <article key={b.id} className="pr-card">
      <h3>{b.name}</h3><div className="pr-price"><strong>{formatUsd(b.price)}</strong><span>per month</span></div><p className="pr-tag">{b.detail}</p>
      <Link className="engine-button engine-outline" to={consultationHref(b.id)}>Book a free consultation</Link></article>)}</div>
    <AdditionalOptions />
  </>;
}

function BundlesSection({ cycle }) {
  return <div className="pr-grid">{BUNDLES.map(b => {
    const p = bundlePrice(b, cycle);
    const live = p.parts.every(liveFor);
    return <article key={b.id} className="pr-card">
      <h3>{b.name}</h3><p className="pr-tag">{b.tagline}</p>
      <div className="pr-price"><strong>{formatUsd(p.price)}</strong><span>{CYCLE_NOTE[cycle]}</span></div>
      <p className="pr-sub"><s>{formatUsd(p.full)}</s> · you save {formatUsd(p.savings)}/mo ({Math.round(b.discount * 100)}%)</p>
      <ul>{p.parts.map(x => <li key={x.id}><Check size={16} aria-hidden="true" />{x.name}{x.id.startsWith('web_') ? ' website' : x.id.startsWith('app_') ? ' app builder' : ''} ({formatUsd(planPrice(x, cycle))}/mo)</li>)}</ul>
      <p className="pr-history"><b>{HISTORY_ROW_LABEL}:</b> {historyLabel(b.history)}</p>
      <Link className="engine-button engine-outline" to={live ? `/checkout?kind=plan&plan=${b.id}&cycle=${cycle}` : earlyAccessHref(b.id)}>{live ? `Choose ${b.name}` : 'Join early access'}</Link>
    </article>;
  })}</div>;
}

function PartnersSection({ cycle }) {
  return <>
    <div className="pr-grid">{PARTNER_TIERS.map(t => <article key={t.id} className="pr-card">
      <h3>{t.name}</h3>
      <div className="pr-price"><strong>{formatUsd(partnerPrice(t, cycle))}</strong><span>{CYCLE_NOTE[cycle]}</span></div>
      {cycle === 'annual' && <p className="pr-sub">{Math.round(t.annualDiscount * 100)}% off the {formatUsd(t.monthly)} monthly price</p>}
      <p className="pr-tag">{t.detail}</p>
      <p className="pr-credits">{t.listings} listing{t.listings === 1 ? '' : 's'}</p>
      <Link className="engine-button engine-outline" to={partnerApplyHref(t.id)}>Apply</Link>
    </article>)}</div>
    <p className="pr-note">Partner listings are labeled &quot;Vivid Engine Partner&quot; and sponsored cards are labeled &quot;Sponsored · Vivid Engine Partners&quot;. Paying never changes the organic answer. Partner tiers are billed monthly or yearly by card; Afterpay is not available for them.</p>
  </>;
}

function Overview({ cycle }) {
  const from = (plans, label, slug) => {
    const paid = plans.filter(p => planPrice(p, cycle) > 0);
    const low = Math.min(...paid.map(p => planPrice(p, cycle)));
    return <Link to={`/pricing/${slug}`} className="pr-card pr-link"><h3>{label}</h3><div className="pr-price"><strong>{formatUsd(low)}</strong><span>and up, {CYCLE_NOTE[cycle]}</span></div><p className="pr-tag">Free plan available.</p></Link>;
  };
  return <>
    <div className="pr-grid">
      {from(SEARCH_PLANS, 'AI Search', 'search')}
      {from(WEBSITE_PLANS, 'Websites', 'websites')}
      {from(APP_BUILDER_PLANS, 'App Builder', 'app-builder')}
      <Link to="/pricing/production" className="pr-card pr-link"><h3>Production</h3><div className="pr-price"><strong>{formatUsd(Math.min(...PRODUCTION.filter(p => p.price).map(p => p.price)))}</strong><span>and up</span></div><p className="pr-tag">Human-made video for your business.</p></Link>
      <Link to="/pricing/custom-builds" className="pr-card pr-link"><h3>We Build It For You</h3><div className="pr-price"><strong>{formatUsd(BUILD_PACKAGES[0].price)}</strong><span>and up, one-time</span></div><p className="pr-tag">Includes 3 months of the matching plan.</p></Link>
      <Link to="/pricing/bundles" className="pr-card pr-link"><h3>Bundles</h3><div className="pr-price"><strong>{Math.round(Math.max(...BUNDLES.map(b => b.discount)) * 100)}%</strong><span>off, at most</span></div><p className="pr-tag">Website, app builder and search together.</p></Link>
      <Link to="/pricing/partners" className="pr-card pr-link"><h3>Local Partners</h3><div className="pr-price"><strong>{formatUsd(partnerPrice(PARTNER_TIERS[0], cycle))}</strong><span>and up, {CYCLE_NOTE[cycle]}</span></div><p className="pr-tag">Get listed in Local Businesses.</p></Link>
    </div>
    <section className="pr-discounts" aria-labelledby="discounts">
      <h2 id="discounts">Ways to pay less</h2>
      <ul>
        <li><b>{Math.round(DISCOUNTS.twoYearTerm * 100)}% off a 2-year term</b> on the yearly price of any self-serve plan.</li>
        <li><b>{Math.round(DISCOUNTS.firstMonth * 100)}% off your first month</b> on monthly billing.</li>
        <li><b>{Math.round(DISCOUNTS.nonprofitVeteran * 100)}% off for nonprofits and veteran-owned businesses</b>. For example, Search Pro yearly becomes {formatUsd(nonprofitPrice(planPrice(SEARCH_PLANS[1], 'annual')))}/mo. Message us to verify.</li>
        <li><b>{formatUsd(DISCOUNTS.referralCreditUsd)} credit</b> for every friend you refer who becomes a paying customer.</li>
      </ul>
    </section>
  </>;
}

function CompareAll() {
  return <>
    <CompareTable title="AI Search compared" plans={SEARCH_PLANS} competitorLabel="Perplexity" />
    <CompareTable title="Website plans compared" plans={WEBSITE_PLANS} competitorLabel="Wix" />
    <CompareTable title="App Builder compared" plans={APP_BUILDER_PLANS} competitorLabel="Base44" />
    <section className="pr-compare" aria-labelledby="cmp-bundles">
      <h2 id="cmp-bundles">Bundles compared</h2>
      <div className="pr-table-wrap" tabIndex={0} role="region" aria-label="Bundles compared table"><table>
        <thead><tr><th scope="col">Bundle</th><th scope="col">Yearly</th><th scope="col">Monthly</th><th scope="col">You save (yearly)</th><th scope="col">{HISTORY_ROW_LABEL}</th></tr></thead>
        <tbody>{BUNDLES.map(b => <tr key={b.id}><th scope="row">{b.name}</th><td>{formatUsd(bundlePrice(b, 'annual').price)}/mo</td><td>{formatUsd(bundlePrice(b, 'monthly').price)}/mo</td><td>{formatUsd(bundlePrice(b, 'annual').savings)}/mo</td><td>{historyLabel(b.history)}</td></tr>)}</tbody>
      </table></div>
      <p className="pr-asof">Bundle prices are the sum of the plans inside, less the bundle discount, as of {asOfText()}.</p>
    </section>
  </>;
}

const SECTIONS = { '': Overview, search: SearchSection, websites: WebsitesSection, 'app-builder': AppSection, production: ProductionSection, 'custom-builds': CustomBuildsSection, bundles: BundlesSection, partners: PartnersSection, compare: CompareAll };
const HAS_CYCLE = new Set(['', 'search', 'websites', 'app-builder', 'bundles', 'partners']);

export default function PricingPage() {
  const { category = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const cat = PRICING_CATEGORIES.find(c => c.slug === category);
  if (!cat) return <Navigate to="/pricing" replace />;
  const cycle = params.get('cycle') === 'monthly' ? 'monthly' : DEFAULT_CYCLE;
  const setCycle = c => { const next = new URLSearchParams(params); if (c === DEFAULT_CYCLE) next.delete('cycle'); else next.set('cycle', c); setParams(next, { replace: true }); };
  const Section = SECTIONS[cat.slug];
  const path = `/pricing${cat.slug ? `/${cat.slug}` : ''}`;
  return <div className="engine-site">
    <SEO path={path} title={`${cat.title} | ${BUSINESS.brandName}`} description={cat.description} />
    <EngineNav />
    <main className="engine-wrap pr-wrap">
      <Breadcrumbs category={cat} />
      <header className="pr-head">
        <span className="engine-caps">Pricing</span>
        <h1>{cat.slug ? cat.title.split(':')[0] : 'Simple prices, worked out in the open'}</h1>
        <p>{cat.slug ? cat.description : `Self-serve plans are priced 13% below the matching competitor plan as of ${asOfText()}. Yearly billing is shown first; switch to monthly any time.`}</p>
      </header>
      <CategoryTabs slug={cat.slug} cycle={cycle} />
      {HAS_CYCLE.has(cat.slug) && <CycleToggle cycle={cycle} setCycle={setCycle} />}
      <Section cycle={cycle} />
      <p className="pr-whatsapp"><MessageCircle size={16} aria-hidden="true" /> Questions about a plan? <a href={whatsappUrl(`Hi Vivid Engine, I have a question about ${cat.slug ? cat.label : 'your'} pricing`)} target="_blank" rel="noopener noreferrer">WhatsApp us</a> at {BUSINESS.whatsappDisplay}.</p>
      <p className="pr-fine">Prices in US dollars. Sales tax may apply. Plans renew until you cancel. See our <Link to="/legal/refund">refund policy</Link>.</p>
    </main>
    <EngineFooter />
  </div>;
}
