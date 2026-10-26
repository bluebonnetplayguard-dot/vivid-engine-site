import { EstimateLineItem, EstimateResult } from '../estimating';
import { PHASES, PhaseId, Proposal, ProposalAlternate, ProposalOptions, ProposalPhase } from './types';

// Estimate version → customer proposal. Pure. All figures are computed here from the estimate; the wording
// (intro, phase descriptions, closing) comes from `wording`, which is either the template below or Claude's
// text after it passes checkWording().

export interface Wording { intro: string; phases: Record<PhaseId, string>; closing: string }

const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const usdSigned = (v: number) => `${v >= 0 ? 'add' : 'deduct'} ${usd(Math.abs(v))}`;
const round1 = (v: number) => Math.round(v * 10) / 10;

// Customer-facing scope bullets: what is included, in plain words with rounded quantities (no prices).
function scopeBullet(l: EstimateLineItem): string | null {
  const q = l.quantity;
  if (l.category === 'framing' && /^framing\.(cripples|headers|plates)/.test(l.key)) return null;   // rolled into "wall framing"
  if (l.category === 'drywall' && l.key === 'drywall.finish') return null;
  if (l.category === 'roofing' && /underlayment|drip-edge|starter|ridge-cap/.test(l.key)) return null;
  const amount = l.unit === 'ea' ? `${Math.round(q)}` : l.unit === 'lf' ? `about ${Math.round(q)} linear ft` : l.unit === 'sq ft' ? `about ${Math.round(q).toLocaleString('en-US')} sq ft`
    : l.unit === 'sq yd' ? `about ${Math.round(q)} sq yd` : l.unit === 'cu yd' ? `about ${round1(q)} cubic yards` : l.unit === 'squares' ? `about ${round1(q)} squares` : `${Math.round(q)} ${l.unit}`;
  if (l.category === 'framing' && /^framing\.studs/.test(l.key)) return 'Wall framing: studs, plates and headers (2x6 exterior walls, 2x4 interior walls)';
  return `${l.description}: ${amount}`;
}

export function phasesOf(est: EstimateResult): { id: PhaseId; title: string; direct: number; lines: EstimateLineItem[] }[] {
  return PHASES.map(p => {
    const lines = est.lines.filter(l => p.categories.includes(l.category) && l.total > 0);
    return { id: p.id, title: p.title, direct: lines.reduce((s, l) => s + l.total, 0), lines };
  }).filter(p => p.lines.length);
}

export function templateWording(est: EstimateResult, o: ProposalOptions): Wording {
  const who = o.customer.name ? (o.tone === 'formal' ? `Dear ${o.customer.name},` : `Hi ${o.customer.name},`) : (o.tone === 'formal' ? 'Dear customer,' : 'Hello,');
  return {
    intro: `${who}\n\nThank you for the opportunity to price your project. This proposal covers the work shown in the design we reviewed together (“${est.design.title}”). The scope is organized by phase below, with the price for each phase and the total.`,
    phases: {
      site: 'Forming, placing and finishing the concrete slab work shown in the design.',
      structure: 'Framing the walls and floor system, with wall and roof sheathing, so the building is ready for the exterior and interior finishes.',
      envelope: 'Weather-tight exterior: insulation, house wrap, siding, roofing, and installing the windows and doors selected in the design.',
      interior: 'Hanging and finishing drywall, painting, trim carpentry, flooring, cabinets and countertops as selected in the design.',
    },
    closing: o.tone === 'formal'
      ? 'Please review the scope and options. We would be glad to walk through any part of this proposal and adjust selections before work begins.'
      : 'Take a look and let us know what questions you have. We’re happy to walk through it with you and adjust selections before we start.',
  };
}

// Rejects AI wording that states figures or makes claims the estimate can't support. Numbers, prices and dates
// must come from the estimate, and claims about licensing, insurance, warranties, codes or experience must come
// from the contractor, never from the model.
const CLAIMS = /\b(licen[cs]ed|insured|bonded|warrant(y|ies|ied)|guarantee[ds]?|years? of experience|award|certified|code[- ]compliant|meets? (all )?codes?|engineered|permit(s|ted)? (approved|included)|lowest price|best price)\b/i;
export function checkWording(text: unknown, max = 900): { ok: boolean; text: string; reason?: string } {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, text: '', reason: 'empty' };
  const t = text.trim().slice(0, max);
  if (/\d/.test(t)) return { ok: false, text: t, reason: 'contains numbers' };
  if (/[$%]/.test(t)) return { ok: false, text: t, reason: 'contains prices or percentages' };
  const claim = t.match(CLAIMS);
  if (claim) return { ok: false, text: t, reason: `makes a claim (“${claim[0]}”)` };
  if (/<[a-z/!]|\]\(|https?:/i.test(t)) return { ok: false, text: t, reason: 'contains markup or links' };
  return { ok: true, text: t };
}

export function buildProposal(input: {
  estimate: EstimateResult; estimateVersion: number; projectName: string; options: ProposalOptions;
  wording?: Partial<Wording>; wordingEngine?: 'claude' | 'template'; now?: Date;
}): Proposal {
  const { estimate: est, options: o } = input;
  const now = input.now ?? new Date();
  const notices: string[] = [];
  const fallback = templateWording(est, o);
  let usedAi = 0;
  const pick = (field: string, candidate: unknown, fb: string) => {
    if (candidate == null) return fb;
    const c = checkWording(candidate);
    if (c.ok) { usedAi++; return c.text; }
    notices.push(`AI wording for “${field}” was not used (${c.reason}); the standard wording is used instead.`);
    return fb;
  };
  const w: Wording = {
    intro: pick('introduction', input.wording?.intro, fallback.intro),
    phases: Object.fromEntries(PHASES.map(p => [p.id, pick(p.title, input.wording?.phases?.[p.id], fallback.phases[p.id])])) as Record<PhaseId, string>,
    closing: pick('closing', input.wording?.closing, fallback.closing),
  };

  // Sell price per phase: its share of the direct line cost, scaled so the phases add up to the total exactly.
  const direct = est.lines.reduce((s, l) => s + l.total, 0);
  const total = Math.round(est.totals.price);
  const raw = phasesOf(est);
  let allocated = 0;
  const phases: ProposalPhase[] = raw.map((p, i) => {
    const price = i === raw.length - 1 ? total - allocated : Math.round(direct > 0 ? (p.direct / direct) * total : 0);
    allocated += price;
    return { id: p.id, title: p.title, price, scope: o.showLineItems ? [...new Set(p.lines.map(scopeBullet).filter((b): b is string => !!b))] : [], description: w.phases[p.id] };
  });

  const alternates: ProposalAlternate[] = o.includeAlternates ? est.alternates.map(a => ({
    title: a.title, delta: Math.round(a.delta), price: Math.round(a.price),
    summary: a.changes.slice(0, 4).map(c => `${c.description}`).filter((v, i, arr) => arr.indexOf(v) === i),
  })) : [];

  const verified = est.lines.filter(l => l.verified).length;
  const n = est.lines.length;
  const quantitiesNote = verified === n
    ? 'All quantities in this proposal come from measurements verified against your drawings or on site.'
    : verified === 0
      ? 'Quantities in this proposal come from the design model and have not yet been verified against construction drawings or field measurements. Final pricing may change after measurements are confirmed.'
      : `Some quantities in this proposal (${n - verified} of ${n} items) come from the design model and have not yet been verified against construction drawings or field measurements. Final pricing may change after they are confirmed.`;

  const exclusions = [
    'Permits, impact fees and utility connection charges, unless listed above.',
    'Plumbing, electrical and HVAC work, fixtures and appliances, unless listed above.',
    'Site work beyond the slab shown (grading, drainage, driveways, landscaping).',
    'Changes requested after the proposal is accepted, which are handled by written change order.',
  ];

  // Contractor-facing notices (never shown to the customer).
  if (est.costTable.kind === 'starter' || est.lines.some(l => l.priceSource === 'starter')) notices.unshift('This estimate still uses starter placeholder prices. Replace them before sending this proposal.');
  if (verified < n) notices.push(`${n - verified} of ${n} line items rest on unverified sizes; the proposal says so to the customer.`);
  for (const f of est.flags) if (/no price|different unit/.test(f.message)) notices.push(f.message);

  const validUntil = new Date(now.getTime() + o.validDays * 86_400_000);
  const proposal: Omit<Proposal, 'markdown'> = {
    engine: 'gc-proposal/1',
    wording: input.wordingEngine === 'claude' && usedAi > 0 ? 'claude' : 'template',
    createdAt: now.toISOString(),
    validUntil: validUntil.toISOString().slice(0, 10),
    project: { name: input.projectName, designTitle: est.design.title, estimateVersion: input.estimateVersion, address: o.projectAddress },
    company: o.company,
    customer: o.customer,
    intro: w.intro,
    phases,
    total,
    pricePerSqFt: est.totals.pricePerSqFt,
    floorArea: Math.round(est.totals.pricePerSqFt ? est.totals.price / est.totals.pricePerSqFt : 0),
    alternates,
    quantitiesNote,
    exclusions,
    closing: w.closing,
    terms: o.terms,
    notices,
  };
  return { ...proposal, markdown: toMarkdown(proposal, now) };
}

const esc = (s: string) => s.replace(/([\\`*_[\]#|<>])/g, '\\$1');

function party(p: { name: string; phone?: string; email?: string; address?: string; license?: string }) {
  return [p.name && `**${esc(p.name)}**`, p.address && esc(p.address), p.phone && esc(p.phone), p.email && esc(p.email), p.license && `License: ${esc(p.license)}`].filter(Boolean).join('  \n');
}

export function toMarkdown(p: Omit<Proposal, 'markdown'>, now: Date): string {
  const out: string[] = [];
  out.push(`# Proposal: ${esc(p.project.name)}`);
  out.push(`${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Valid until ${new Date(`${p.validUntil}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  out.push(`| From | Prepared for |\n|---|---|\n| ${party(p.company).replace(/\n/g, '<br>')} | ${party(p.customer).replace(/\n/g, '<br>') || '—'} |`);
  if (p.project.address) out.push(`**Project address:** ${esc(p.project.address)}`);
  out.push(esc(p.intro));
  out.push('## Scope and price by phase');
  for (const ph of p.phases) {
    out.push(`### ${ph.title} — ${usd(ph.price)}`);
    out.push(esc(ph.description));
    if (ph.scope.length) out.push(ph.scope.map(s => `- ${esc(s)}`).join('\n'));
  }
  out.push(`## Total: ${usd(p.total)}${p.pricePerSqFt ? ` (about ${usd(p.pricePerSqFt)} per sq ft of finished floor area)` : ''}`);
  if (p.alternates.length) {
    out.push('## Options');
    out.push('Each option changes the total by the amount shown.');
    out.push(p.alternates.map(a => `- **${esc(a.title)}**: ${usdSigned(a.delta)} (total ${usd(a.price)})${a.summary.length ? `. Changes: ${a.summary.map(esc).join('; ')}` : ''}`).join('\n'));
  }
  out.push('## About these quantities');
  out.push(esc(p.quantitiesNote));
  out.push('## Not included');
  out.push(p.exclusions.map(e => `- ${esc(e)}`).join('\n'));
  if (p.terms) { out.push('## Terms'); out.push(esc(p.terms)); }
  out.push(esc(p.closing));
  out.push('---\n*Prices are based on the selections in the design named above. Changes to the design or selections change the price.*');
  return out.join('\n\n');
}
