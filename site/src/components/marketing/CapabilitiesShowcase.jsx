// components/CapabilitiesShowcase.jsx
// "What We Can Build": illustrative EXAMPLE CONCEPTS (not past client work).
// Add to Home or a /examples page: <CapabilitiesShowcase />
// Do not label these as real client projects, and don't add client names, results, or
// testimonials unless you have that client's permission and the facts are true.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

// Put the images in public/images/ and set their paths here, e.g. '/images/banner.jpg' (or leave '').
// The banner used to be hosted on Base44 media; copy it into public/images/ before re-enabling.
const BG_IMAGE = ''; // assets/tech-desk-background.jpeg
const BANNER_IMAGE = '';

/* ---------- tiny mockup helpers (pure CSS, no images, light on performance) ---------- */
const Line = ({ w = 'w-full', c = 'bg-slate-600' }) => <div className={`h-1.5 rounded ${w} ${c}`} />;
const Btn = ({ children }) => <div className="rounded-full bg-blue-500 px-2 py-0.5 text-[8px] font-bold text-white">{children}</div>;

function Frame({ children }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-inner" aria-hidden="true">
      <div className="flex gap-1 bg-slate-800 px-2 py-1.5">
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-500" />)}
      </div>
      <div className="h-36 p-3">{children}</div>
    </div>
  );
}

const MOCKS = {
  service: () => (
    <Frame>
      <div className="rounded bg-linear-to-r from-blue-900 to-slate-800 p-2"><Line w="w-2/3" c="bg-white" /><div className="mt-1.5"><Line w="w-1/2" /></div><div className="mt-2"><Btn>Request a Quote</Btn></div></div>
      <div className="mt-2 grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <div key={i} className="rounded bg-slate-800 p-2"><div className="mb-1 h-4 w-4 rounded bg-blue-500/60" /><Line /></div>)}</div>
    </Frame>
  ),
  menu: () => (
    <Frame>
      <div className="mb-2 flex items-center justify-between"><Line w="w-1/3" c="bg-white" /><Btn>Order Online</Btn></div>
      {[1, 2, 3, 4].map((i) => <div key={i} className="mb-1.5 flex items-center justify-between border-b border-white/5 pb-1"><Line w="w-1/2" /><Line w="w-6" c="bg-blue-400" /></div>)}
      <div className="mt-1 rounded bg-slate-800 p-1.5"><Line w="w-1/3" c="bg-blue-300" /></div>
    </Frame>
  ),
  booking: () => (
    <Frame>
      <div className="grid grid-cols-7 gap-1">{Array.from({ length: 14 }).map((_, i) => <div key={i} className={`h-4 rounded text-center text-[7px] ${i === 9 ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div>)}</div>
      <div className="mt-2 flex gap-1">{['9:00', '11:30', '2:00'].map((t) => <div key={t} className="rounded border border-blue-400/50 px-1.5 py-0.5 text-[8px] text-blue-200">{t}</div>)}</div>
      <div className="mt-2"><Btn>Request Appointment</Btn></div>
    </Frame>
  ),
  portal: () => (
    <Frame>
      <div className="flex gap-2">
        <div className="w-1/4 space-y-1.5 rounded bg-slate-800 p-1.5">{[1, 2, 3, 4].map((i) => <Line key={i} c={i === 1 ? 'bg-blue-400' : 'bg-slate-600'} />)}</div>
        <div className="flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-2">{[1, 2].map((i) => <div key={i} className="rounded bg-slate-800 p-1.5"><Line w="w-1/2" /><div className="mt-1"><Line w="w-3/4" c="bg-white" /></div></div>)}</div>
          <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full w-2/3 bg-blue-500" /></div>
          <Line w="w-1/2" />
        </div>
      </div>
    </Frame>
  ),
  estimator: () => (
    <Frame>
      {[1, 2, 3].map((i) => <div key={i} className="mb-1.5 flex items-center justify-between rounded bg-slate-800 px-2 py-1"><Line w="w-1/3" /><div className="h-3 w-10 rounded border border-white/10" /></div>)}
      <div className="mt-2 flex items-center justify-between rounded bg-blue-900/60 px-2 py-1.5"><span className="text-[8px] text-blue-100">Estimate</span><Line w="w-10" c="bg-white" /></div>
    </Frame>
  ),
  assistant: () => (
    <Frame>
      <div className="space-y-1.5">
        <div className="w-3/4 rounded-lg bg-slate-700 p-1.5"><Line /><div className="mt-1"><Line w="w-2/3" /></div></div>
        <div className="ml-auto w-1/2 rounded-lg bg-blue-600 p-1.5"><Line c="bg-white" /></div>
        <div className="w-2/3 rounded-lg bg-slate-700 p-1.5"><Line /></div>
        <div className="flex flex-wrap gap-1">{[1, 2, 3].map((i) => <div key={i} className="rounded-full border border-blue-400/60 px-2 py-0.5 text-[7px] text-blue-200">Option {i}</div>)}</div>
      </div>
    </Frame>
  ),
};

const EXAMPLES = [
  { id: 'service-site', cat: 'websites', mock: 'service', title: 'Local Service Business Website', blurb: 'A polished site for contractors, repair shops, and trades that turns visitors into quote requests.',
    items: ['Service pages and service-area pages', 'Quote request form with instant notifications', 'Mobile-first, tap-to-call layout'] },
  { id: 'restaurant-site', cat: 'websites', mock: 'menu', title: 'Restaurant & Retail Website', blurb: 'Menus, hours, specials, and optional online ordering in a clean, fast layout.',
    items: ['Easy-to-update menu or product list', 'Hours, location, and contact info', 'Optional online ordering or payments'] },
  { id: 'booking-app', cat: 'apps', mock: 'booking', title: 'Appointment Request System', blurb: 'Let customers request times online while you stay in control of approvals.',
    items: ['Requests you approve or decline', 'Prevents double bookings', 'Confirmation messages to customers'] },
  { id: 'estimator-app', cat: 'apps', mock: 'estimator', title: 'Custom Estimate & Calculator Tool', blurb: 'Interactive calculators and estimating tools built around how your business prices work.',
    items: ['Your formulas and rules, not a template', 'Saves and shares estimates', 'Exportable summaries'] },
  { id: 'client-portal', cat: 'portals', mock: 'portal', title: 'Secure Customer Portal', blurb: 'A private login where customers see their own project status, files, invoices, and messages.',
    items: ['Each customer sees only their records', 'File uploads and messaging', 'Project progress tracking'] },
  { id: 'ai-assistant', cat: 'portals', mock: 'assistant', title: 'AI Receptionist & Lead Capture', blurb: 'A virtual assistant that answers common questions after hours and passes leads to your phone.',
    items: ['Answers only from approved business info', 'Collects contact details with consent', 'Text alert to the owner'] },
];

const FILTERS = [['all', 'All Examples'], ['websites', 'Websites'], ['apps', 'Business Apps'], ['portals', 'Portals & Automation']];

export default function CapabilitiesShowcase() {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const list = EXAMPLES.filter((e) => filter === 'all' || e.cat === filter);

  return (
    <section id="examples" aria-labelledby="examples-h" className="relative overflow-hidden px-4 py-16 text-white"
      style={{ background: BG_IMAGE ? `linear-gradient(rgba(6,11,24,.88), rgba(6,11,24,.95)), url(${BG_IMAGE}) center/cover` : 'linear-gradient(#0a1226, #060b18)' }}>
      <div className="mx-auto max-w-6xl">
        {BANNER_IMAGE && (
          <Image
            src={BANNER_IMAGE}
            alt="Vivid Engine Solutions: website design, maintenance, and domain leasing for Southeast Texas and Southwest Louisiana"
            originWidth={2056}
            originHeight={765}
            loading="lazy"
            className="mb-10 w-full rounded-2xl border border-white/10"
            fittingType="fit"
          />
        )}
        <h2 id="examples-h" className="text-center text-3xl font-bold sm:text-4xl">What We Can Build for Your Business</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
          From professional websites to custom business apps, here are examples of the solutions we design and build for local businesses.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-slate-400">
          Illustrative example concepts, not past client projects. Every build is custom-designed around your business.
        </p>

        <div role="tablist" aria-label="Filter examples" className="mt-8 flex flex-wrap justify-center gap-2">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => { setFilter(id); setOpen(null); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-white ${
                filter === id ? 'bg-blue-600 text-white' : 'border border-blue-400/60 text-blue-200 hover:bg-blue-500/20'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => {
            const Mock = MOCKS[e.mock];
            const isOpen = open === e.id;
            return (
              <article key={e.id} className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/80 p-4 transition motion-safe:hover:-translate-y-1 hover:border-blue-500/60">
                <Mock />
                <span className="mt-4 w-fit rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-200">Example concept</span>
                <h3 className="mt-2 text-lg font-semibold">{e.title}</h3>
                <p className="mt-1 text-sm text-slate-300">{e.blurb}</p>

                <button onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} aria-controls={`ex-${e.id}`}
                  className="mt-3 w-fit text-sm font-semibold text-blue-300 underline-offset-2 hover:underline focus:outline-hidden focus:ring-2 focus:ring-white">
                  {isOpen ? 'Hide details' : 'What could be included'}
                </button>
                <ul id={`ex-${e.id}`} hidden={!isOpen} className="mt-2 space-y-1 text-sm text-slate-200">
                  {e.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-blue-400">✓</span>{i}</li>)}
                </ul>

                <Link to={`/consultation?interest=${e.id}`}
                  className="mt-auto pt-4">
                  <span className="block rounded-full bg-blue-600 px-4 py-2 text-center text-sm font-semibold hover:bg-blue-500">Request Something Like This</span>
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-center text-slate-300">
          Have something else in mind? <Link to="/consultation" className="font-semibold text-blue-300 underline">Schedule a free consultation</Link> and we'll talk through it in person or by phone.
        </p>
      </div>
    </section>
  );
}