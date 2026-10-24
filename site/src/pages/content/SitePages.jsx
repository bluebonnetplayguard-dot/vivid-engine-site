import { Link, Navigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import SEO from '@/components/seo/SEO';
import { seoProps } from '@/seo/pageSeo';
import InfoPage from '@/pages/InfoPage';
import LeadForm from '@/components/content/LeadForm';
import PaymentOptions from '@/components/payments/PaymentOptions';
import BusinessContact from '@/components/marketing/BusinessContact';
import { WhatsAppLink } from '@/components/shell/WhatsAppButton';
import { usePageShell } from '@/components/shell/ShellContext';
import { SERVICES, serviceBySlug } from '@/config/services';
import { AREAS, areaBySlug } from '@/config/areas';
import { BUSINESS } from '@/config/business';
import { VIVID_TEMPLATES } from '@/config/templates';
import { EXAMPLE_LISTINGS, LOCAL_CATEGORIES, PARTNER_DISCLOSURE, categoryBySlug, listingsFor } from '@/config/partners';
import { PARTNER_TIERS, formatUsd, partnerPrice } from '@/config/pricing-catalog';
import { partnerApplyHref } from '@/config/launch';
import { STEPS } from '@/components/engine/siteContent';
import '@/components/content/content.css';

const title = t => `${t} | ${BUSINESS.brandName}`;
const wa = (placement, message) => <p className="ct-wa">Questions? <WhatsAppLink placement={placement} message={message} /></p>;

// ---------- Services ----------
export function ServicesHub() {
  return <main className="ct-wrap">
    <SEO {...seoProps('/services')} />
    <header className="ct-head"><h1>Services</h1><p>Websites, apps, business tools, local search, video and AI help, from one local team. Every project starts with a free consultation and a written quote.</p>
      <div className="ct-ctas"><Link className="engine-button engine-primary" to="/quote">Get a quote</Link><Link className="engine-button engine-outline" to="/pricing">See pricing</Link></div></header>
    <ul className="ct-items">{SERVICES.map(s => <li key={s.slug}><Link to={s.path}><b>{s.name}</b><span>{s.short}</span></Link></li>)}</ul>
    {wa('services', 'Hi Vivid Engine, I have a question about your services: ')}
  </main>;
}

export function ServicePage() {
  const { slug } = useParams();
  const s = serviceBySlug(slug);
  if (!s) { const other = SERVICES.find(x => x.slug === slug); return <Navigate to={other ? other.path : '/services'} replace />; }
  return <main className="ct-wrap">
    <SEO {...seoProps(s.path)} />
    <header className="ct-head"><h1>{s.h1}</h1>{s.intro.map(p => <p key={p.slice(0, 20)}>{p}</p>)}
      <div className="ct-ctas"><Link className="engine-button engine-primary" to={`/quote?plan=${s.slug}`}>Get a quote</Link><Link className="engine-button engine-outline" to={s.pricingPath}>See pricing</Link></div></header>
    <section className="ct-section" aria-labelledby="svc-what"><h2 id="svc-what">What you get</h2>
      <ul className="ct-items">{s.points.map(p => <li key={p.title}><div><b>{p.title}</b><span>{p.text}</span></div></li>)}</ul></section>
    <section className="ct-section" aria-labelledby="svc-price"><h2 id="svc-price">Pricing</h2><p>{s.priceNote} <Link to={s.pricingPath} className="ct-link">Full pricing</Link>.</p></section>
    <section className="ct-section" aria-labelledby="svc-areas"><h2 id="svc-areas">Where we work</h2>
      <ul className="vh-areas">{AREAS.map(a => <li key={a.slug}><Link to={`/areas/${a.slug}`}>{a.city}, {a.state}</Link></li>)}</ul></section>
    {wa(`service-${s.slug}`, `Hi Vivid Engine, I have a question about ${s.name}: `)}
  </main>;
}

// ---------- Areas ----------
export function AreasHub() {
  return <main className="ct-wrap">
    <SEO {...seoProps('/areas')} />
    <header className="ct-head"><h1>Service areas</h1><p>{BUSINESS.regionLine}. We meet clients in person across these cities and work remotely anywhere.</p></header>
    <ul className="ct-items">{AREAS.map(a => <li key={a.slug}><Link to={`/areas/${a.slug}`}><b>{a.city}, {a.state}</b><span>{a.county} · {a.region}</span></Link></li>)}</ul>
    <p className="ct-wa">Near one of these cities? We work across the surrounding communities too. <Link className="ct-link" to="/consultation">Book a free consultation</Link>.</p>
  </main>;
}

export function AreaPage() {
  const { slug } = useParams();
  const a = areaBySlug(slug);
  if (!a) return <Navigate to="/areas" replace />;
  const schema = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Service', name: `Website design and apps in ${a.city}, ${a.state}`, provider: { '@id': 'https://vividenginesolutions.com/#business' }, areaServed: { '@type': 'City', name: `${a.city}, ${a.state}` } }] };
  return <main className="ct-wrap">
    <SEO {...seoProps(`/areas/${a.slug}`)} schema={schema} />
    <header className="ct-head"><h1>{a.city}, {a.state}: websites, apps and AI tools</h1><p><MapPin size={16} aria-hidden="true" /> {a.county} · {a.region}</p></header>
    <section className="ct-section" aria-labelledby="area-h2"><h2 id="area-h2">{a.h2}</h2>{a.intro.map(p => <p key={p.slice(0, 24)}>{p}</p>)}</section>
    <section className="ct-section" aria-labelledby="area-focus"><h2 id="area-focus">What {a.city} businesses ask us for</h2>
      <ul className="ct-items">{a.focus.map(f => <li key={f}><div><b>{f}</b></div></li>)}</ul></section>
    <section className="ct-section" aria-labelledby="area-svc"><h2 id="area-svc">Services in {a.city}</h2>
      <ul className="ct-items">{SERVICES.map(s => <li key={s.slug}><Link to={s.path}><b>{s.name}</b><span>{s.short}</span></Link></li>)}</ul></section>
    <section className="ct-section" aria-labelledby="area-near"><h2 id="area-near">Nearby</h2><p>We also work with businesses in {a.nearby.join(', ')}.</p>
      <p><Link className="engine-button engine-primary" to={`/consultation?plan=${a.slug}`}>Book a free consultation in {a.city}</Link></p></section>
    <section className="ct-section" aria-labelledby="area-local"><h2 id="area-local">Local businesses in {a.city}</h2>
      <ul className="vh-areas">{LOCAL_CATEGORIES.slice(0, 8).map(c => <li key={c.slug}><Link to={`/local/${a.slug}/${c.slug}`}>{c.name}</Link></li>)}</ul></section>
    {wa(`area-${a.slug}`, `Hi Vivid Engine, I'm in ${a.city} and have a question about `)}
  </main>;
}

// ---------- Local Businesses ----------
function ExampleCards() {
  return <ul className="ct-cards">{EXAMPLE_LISTINGS.map(x => <li key={x.id} className="ct-card"><span className="ct-tag">Vivid Engine Partner · Example</span><h3>{x.name}</h3><p>{x.tagline}</p><small>{x.city} · {x.category}</small></li>)}</ul>;
}
export function LocalHub() {
  return <main className="ct-wrap">
    <SEO {...seoProps('/local')} />
    <header className="ct-head"><h1>Local businesses</h1><p>Find businesses by city and category, or ask Vivid AI Search. {PARTNER_DISCLOSURE}</p>
      <div className="ct-ctas"><Link className="engine-button engine-primary" to="/partners">List your business</Link></div></header>
    {AREAS.map(a => <section key={a.slug} className="ct-section" aria-labelledby={`loc-${a.slug}`}><h2 id={`loc-${a.slug}`}>{a.city}, {a.state}</h2>
      <ul className="vh-areas">{LOCAL_CATEGORIES.map(c => <li key={c.slug}><Link to={`/local/${a.slug}/${c.slug}`}>{c.name}</Link></li>)}</ul></section>)}
    <section className="ct-section" aria-labelledby="loc-ex"><h2 id="loc-ex">What a partner listing looks like</h2><ExampleCards /></section>
  </main>;
}
export function LocalCategoryPage() {
  const { city, category } = useParams();
  const a = areaBySlug(city); const c = categoryBySlug(category);
  if (!a || !c) return <Navigate to="/local" replace />;
  const listings = listingsFor(a.slug, c.slug);
  const q = encodeURIComponent(`Recommended ${c.name.toLowerCase()} in ${a.city}, ${a.state}`);
  return <main className="ct-wrap">
    <SEO path={`/local/${a.slug}/${c.slug}`} title={title(`${c.name} in ${a.city}, ${a.state}`)} description={`${c.name} in ${a.city}, ${a.state}: ask Vivid AI Search for options with sources, and see labeled Vivid Engine Partner listings.`} noindex={!listings.length} />
    <header className="ct-head"><h1>{c.name} in {a.city}, {a.state}</h1><p>{PARTNER_DISCLOSURE}</p>
      <div className="ct-ctas"><Link className="engine-button engine-primary" to={`/search?q=${q}`}>Ask Vivid AI Search</Link><Link className="engine-button engine-outline" to={partnerApplyHref()}>List your business here</Link></div></header>
    {listings.length ? <ul className="ct-cards">{listings.map(l => <li key={l.id} className="ct-card"><span className="ct-tag">Vivid Engine Partner</span><h3>{l.name}</h3><p>{l.tagline}</p><a className="ct-link" href={l.url} target="_blank" rel="noopener noreferrer sponsored">Visit website</a></li>)}</ul>
      : <section className="ct-section"><h2>No partner listings yet</h2><p>No {c.name.toLowerCase()} in {a.city} have a partner listing yet. Ask Vivid AI Search for options with sources, or list your own business.</p><ExampleCards /></section>}
    <p className="ct-wa"><Link className="ct-link" to="/legal/recommendations">How recommendations work</Link></p>
  </main>;
}

// ---------- Partners ----------
export function PartnerTiersPage() {
  return <InfoPage path="/partners/tiers">
    <ul className="ct-cards">{PARTNER_TIERS.map(t => <li key={t.id} className="ct-card">
      <h3>{t.name}</h3><p><b>{formatUsd(t.monthly)}</b>/mo, or {formatUsd(partnerPrice(t, 'annual'))}/mo billed yearly</p><p>{t.detail}</p><small>{t.listings} listing{t.listings === 1 ? '' : 's'}</small>
      <Link className="engine-button engine-outline" to={`/partners/apply?plan=${t.id}`}>Apply for {t.name}</Link>
    </li>)}</ul>
    <p className="ct-wa"><Link className="ct-link" to="/pricing/partners">Partner pricing with yearly savings</Link></p>
  </InfoPage>;
}
export function PartnerApplyPage() { return <InfoPage path="/partners/apply"><LeadForm topic="partner" /></InfoPage>; }
export function PartnerDashboard() {
  const shell = usePageShell(null);
  const user = shell?.account?.user;
  return <main className="ct-wrap">
    <SEO path="/partners/dashboard" title={title('Partner dashboard')} description="Your Vivid Engine Partner listings." noindex />
    <header className="ct-head"><h1>Partner dashboard</h1><p>{user ? `Signed in as ${user.email}.` : ''} Your listings, sponsored cards and monthly report will appear here once your partner application is approved and your listing is live.</p></header>
    <section className="ct-section"><h2>Need a change to your listing?</h2><p>Send us your new hours, photos or offer and we will update it, usually the same business day.</p>
      <p><WhatsAppLink className="engine-button engine-primary" placement="partner-dashboard" message="Hi Vivid Engine, I'm a partner and need a change to my listing: ">WhatsApp us</WhatsAppLink></p></section>
  </main>;
}

// ---------- Templates, process, pay, quote, consultation ----------
export function TemplatesPage() {
  const groups = [...new Set(VIVID_TEMPLATES.map(t => t.category))];
  return <InfoPage path="/templates">
    {groups.map(g => <section key={g} className="ct-section" aria-labelledby={`tpl-${g}`}><h2 id={`tpl-${g}`}>{g}</h2>
      <ul className="ct-items">{VIVID_TEMPLATES.filter(t => t.category === g).map(t => <li key={t.id}><Link to={`/?tpl=${t.id}`}><b>{t.title}</b><span>{t.prompt}</span></Link></li>)}</ul></section>)}
    <section className="ct-section"><h2>Community templates</h2><p>Sharing your own templates opens soon.</p></section>
  </InfoPage>;
}
export function ProcessPage() {
  return <InfoPage path="/process">
    <ol className="ct-steps">{STEPS.map(([t, text], i) => <li key={t}><b>Step {i + 1}: {t}.</b> {text}</li>)}</ol>
  </InfoPage>;
}
export function PayPage() {
  return <InfoPage path="/pay" after={<><p className="ct-wa">Questions before you pay? <WhatsAppLink placement="pay" message="Hi Vivid Engine, I have a question before I pay: " /></p></>}>
    <PaymentOptions variant="section" />
    <p className="ct-fine">Have a plan to start instead? <Link className="ct-link" to="/pricing">See pricing</Link>. Our <Link className="ct-link" to="/legal/refund">refund policy</Link> covers what happens if something is not right.</p>
  </InfoPage>;
}
export function QuotePage() { return <InfoPage path="/quote"><div className="ct-two"><LeadForm topic="quote" /><aside className="ct-aside"><b>What happens next</b><p>We read every request ourselves and reply within one business day with questions or a written quote. Nothing starts until you approve it.</p><b>Prefer to talk?</b><p><WhatsAppLink placement="quote" /></p></aside></div></InfoPage>; }
export function ConsultationPage() { return <InfoPage path="/consultation"><div className="ct-two"><LeadForm topic="consultation" /><aside className="ct-aside"><b>In person or by phone</b><p>We meet clients at their business across {BUSINESS.serviceAreas.join(', ')}.</p><b>Free, no pressure</b><p>A consultation is free and there is nothing to sign.</p></aside></div></InfoPage>; }

export function ContactPage() {
  return <main className="ct-wrap">
    <SEO {...seoProps('/contact')} />
    <header className="ct-head"><h1>Contact Vivid Engine Solutions</h1><p>Send us a message and a team member will follow up within one business day, or reach us on WhatsApp. We work with businesses from the Houston area to Lafayette, Louisiana.</p>
      <div className="ct-ctas"><Link className="engine-button engine-outline" to="/quote">Get a quote</Link><Link className="engine-button engine-outline" to="/consultation">Book a free consultation</Link></div></header>
    <div className="ct-two"><LeadForm /><aside className="ct-aside"><BusinessContact placement="contact" /></aside></div>
  </main>;
}

// ---------- Signed-in hubs ----------
export function AccountPage() {
  const shell = usePageShell(null);
  const { user, me, access = {} } = shell?.account || {};
  return <main className="ct-wrap">
    <SEO path="/account" title={title('Your account')} description="Your Vivid Engine account." noindex />
    <header className="ct-head"><h1>Your account</h1><p>{user?.email}</p></header>
    <ul className="ct-items">
      <li><Link to="/ai-search/account"><b>AI Search plan</b><span>{me?.tier?.name ? `${me.tier.name} plan` : 'Your plan, usage and billing'}</span></Link></li>
      <li><Link to="/recents"><b>Saved conversations</b><span>{access.allowed ? 'History on' : access.readOnly ? 'Read-only' : 'Comes with any paid plan'}</span></Link></li>
      <li><Link to="/projects"><b>Projects</b><span>Websites and apps we are building for you</span></Link></li>
      <li><Link to="/video/account"><b>Video Studio plan</b><span>Plan, usage and billing</span></Link></li>
      <li><Link to="/settings"><b>Settings</b><span>Account details and deletion</span></Link></li>
    </ul>
    <section id="refer" className="ct-section"><h2>Refer a friend</h2><p>Tell a friend about Vivid Engine. When they become a paying customer and mention your email, we add a credit to your account.</p>
      <p><WhatsAppLink className="ct-link" placement="referral" message="Hi Vivid Engine, I'd like to refer a friend: ">Tell us about your referral on WhatsApp</WhatsAppLink></p></section>
  </main>;
}
export function ProjectsPage() {
  return <main className="ct-wrap">
    <SEO path="/projects" title={title('Projects')} description="Your Vivid Engine projects." noindex />
    <header className="ct-head"><h1>Projects</h1><p>Websites and apps we build for you live in the client portal. Builder projects will appear here when the builders open.</p></header>
    <ul className="ct-items">
      <li><Link to="/portal"><b>Client portal</b><span>Project progress, tasks and messages</span></Link></li>
      <li><Link to="/start"><b>Start a new project</b><span>Send us your business details and requirements</span></Link></li>
      <li><Link to="/video"><b>Video projects</b><span>Your Video Studio edits</span></Link></li>
    </ul>
  </main>;
}
