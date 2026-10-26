import { z } from 'zod';
import { TakeoffCategory, TakeoffLine, TakeoffResult } from '../takeoff';
import {
  AlternateComparison, CategoryTotal, CostItem, CostTable, EstimateFlag, EstimateLineItem, EstimateResult, EstimateSettings,
  EstimateTotals, PriceSource,
} from './types';

// Takeoff + cost table → priced estimate. Pure and deterministic.
//
// Per line:  material = unit cost × ORDER quantity (waste included) × regional material factor
//            labor    = hours/unit × NET quantity × labor rate × regional labor factor
//            sub      = sub unit cost × NET quantity × regional labor factor
// Totals:    direct = material + sales tax on material + labor + sub
//            cost   = direct + overhead % + contingency %   (both on direct)
//            price  = cost / (1 − profit %)  (margin)   or   cost × (1 + profit %)  (markup)

const PRICE_RANK: Record<PriceSource, number> = { starter: 0, contractor: 1, supplier: 2, override: 3 };
const CATEGORY_ORDER: TakeoffCategory[] = ['concrete', 'framing', 'sheathing', 'insulation', 'exterior', 'roofing', 'openings', 'drywall', 'paint', 'trim', 'flooring', 'cabinets', 'countertops'];
const money = (v: number) => Math.round(v * 100) / 100;

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = {
  costTableId: 'starter',
  region: { region: 'Cost table prices', material: 1, labor: 1 },
  overheadPct: 10,
  contingencyPct: 5,
  pricing: 'margin',
  profitPct: 20,
  salesTaxPct: 0,
  overrides: {},
  exclude: [],
};

// ---------- cost item matching ----------

const patternCache = new Map<string, RegExp>();
function patternRe(p: string) {
  let re = patternCache.get(p);
  if (!re) { re = new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^]*')}$`); patternCache.set(p, re); }
  return re;
}
const specificity = (p: string) => [(p.match(/\*/g) || []).length, -p.replace(/\*/g, '').length] as const;

// The most specific cost item for a takeoff key: an exact match beats a pattern; fewer wildcards and more
// literal characters win. Returns the item and whether its unit fits the line.
export function matchCostItem(table: CostTable, line: Pick<TakeoffLine, 'key' | 'unit'>): { item: CostItem | null; unitMismatch: boolean } {
  const hits = table.items.filter(i => patternRe(i.match).test(line.key));
  if (!hits.length) return { item: null, unitMismatch: false };
  hits.sort((a, b) => { const sa = specificity(a.match), sb = specificity(b.match); return sa[0] - sb[0] || sa[1] - sb[1]; });
  const fit = hits.find(i => i.unit === line.unit);
  return fit ? { item: fit, unitMismatch: false } : { item: null, unitMismatch: true };
}

// ---------- line pricing ----------

export function priceLine(line: TakeoffLine, table: CostTable, s: EstimateSettings): { item: EstimateLineItem; unitMismatch: boolean } {
  const { item, unitMismatch } = matchCostItem(table, line);
  const ov = s.overrides[line.key] ?? {};
  const sources: PriceSource[] = [];
  const matUnit = ov.materialUnitCost ?? item?.material?.unitCost ?? 0;
  if (ov.materialUnitCost != null) sources.push('override'); else if (item?.material) sources.push(item.material.source);
  const hoursPerUnit = ov.hoursPerUnit ?? item?.labor?.hoursPerUnit ?? 0;
  if (ov.hoursPerUnit != null) sources.push('override');
  const subUnit = ov.subUnitCost ?? item?.sub?.unitCost ?? 0;
  if (ov.subUnitCost != null) sources.push('override'); else if (item?.sub) sources.push(item.sub.source);
  const priced = !!item || Object.keys(ov).length > 0;

  const materialCost = money(matUnit * line.order * s.region.material);
  const laborHours = Math.round(hoursPerUnit * line.quantity * 100) / 100;
  const laborCost = money(laborHours * table.laborRatePerHour * s.region.labor);
  const subCost = money(subUnit * line.quantity * s.region.labor);
  const priceSource = sources.length ? sources.reduce((w, x) => (PRICE_RANK[x] < PRICE_RANK[w] ? x : w)) : null;
  return {
    unitMismatch,
    item: {
      key: line.key, category: line.category, description: line.item, unit: line.unit,
      quantity: line.quantity, orderQuantity: line.order,
      materialUnitCost: matUnit, materialCost, laborHours, laborCost,
      subUnitCost: subUnit, subCost, subTrade: item?.sub?.trade ?? null,
      total: money(materialCost + laborCost + subCost),
      priced, priceSource,
      verified: line.verified, source: line.source,
    },
  };
}

// ---------- totals ----------

export function computeTotals(lines: EstimateLineItem[], s: EstimateSettings, floorAreaSqFt: number | null): EstimateTotals {
  const byCat = new Map<TakeoffCategory, CategoryTotal>();
  for (const l of lines) {
    const c = byCat.get(l.category) ?? { category: l.category, material: 0, labor: 0, sub: 0, total: 0 };
    c.material += l.materialCost; c.labor += l.laborCost; c.sub += l.subCost; c.total += l.total;
    byCat.set(l.category, c);
  }
  const material = lines.reduce((t, l) => t + l.materialCost, 0);
  const labor = lines.reduce((t, l) => t + l.laborCost, 0);
  const sub = lines.reduce((t, l) => t + l.subCost, 0);
  const salesTax = material * s.salesTaxPct / 100;
  const direct = material + salesTax + labor + sub;
  const overhead = direct * s.overheadPct / 100;
  const contingency = direct * s.contingencyPct / 100;
  const cost = direct + overhead + contingency;
  const price = s.pricing === 'margin' ? cost / (1 - s.profitPct / 100) : cost * (1 + s.profitPct / 100);
  return {
    material: money(material), salesTax: money(salesTax), labor: money(labor), laborHours: Math.round(lines.reduce((t, l) => t + l.laborHours, 0) * 10) / 10,
    sub: money(sub), direct: money(direct), overhead: money(overhead), contingency: money(contingency), cost: money(cost),
    profit: money(price - cost), price: money(price),
    pricePerSqFt: floorAreaSqFt && floorAreaSqFt > 0 ? money(price / floorAreaSqFt) : null,
    byCategory: CATEGORY_ORDER.filter(c => byCat.has(c)).map(c => { const t = byCat.get(c)!; return { category: c, material: money(t.material), labor: money(t.labor), sub: money(t.sub), total: money(t.total) }; }),
  };
}

// ---------- estimate ----------

export interface EstimateInput {
  takeoff: TakeoffResult;
  takeoffHash: string;
  design: { id: string; title: string; version: number };
  costTable: CostTable;
  settings: EstimateSettings;
}

export function buildEstimate(input: EstimateInput): EstimateResult {
  const { takeoff, costTable: table, settings: s } = input;
  const excluded = new Set(s.exclude);
  const flags: EstimateFlag[] = [];
  const lines: EstimateLineItem[] = [];
  const unpriced: string[] = [], mismatched: string[] = [];
  for (const tl of takeoff.lines) {
    if (excluded.has(tl.key)) continue;
    const { item, unitMismatch } = priceLine(tl, table, s);
    if (!item.priced) unpriced.push(tl.key);
    if (unitMismatch) mismatched.push(tl.key);
    lines.push(item);
  }
  const totals = computeTotals(lines, s, takeoff.summary.floorArea || null);

  const starter = lines.filter(l => l.priceSource === 'starter');
  if (table.kind === 'starter' || starter.length) {
    flags.push({ severity: 'warning', message: `${starter.length} of ${lines.length} lines use starter placeholder prices. Replace them with your supplier and subcontractor prices before sending this estimate.`, lines: starter.map(l => l.key) });
  }
  const unverified = lines.filter(l => !l.verified);
  if (unverified.length) flags.push({ severity: 'warning', message: `${unverified.length} lines are priced on quantities from sizes that aren't verified against drawings or field measurements.`, lines: unverified.map(l => l.key) });
  if (unpriced.length) flags.push({ severity: 'warning', message: `${unpriced.length} takeoff lines have no price in “${table.name}” and are counted at $0.`, lines: unpriced });
  if (mismatched.length) flags.push({ severity: 'warning', message: `${mismatched.length} lines matched a cost item in a different unit and were left unpriced.`, lines: mismatched });
  if (s.exclude.length) flags.push({ severity: 'info', message: `${s.exclude.length} takeoff lines are excluded from this estimate.`, lines: [...s.exclude] });
  for (const f of takeoff.flags) if (f.severity === 'warning' && !/sample model|aren't verified/.test(f.message)) flags.push({ severity: 'warning', message: `Takeoff: ${f.message}` });
  if (takeoff.model.source === 'sample') flags.unshift({ severity: 'warning', message: 'Priced from the sample model, not your drawings.' });

  return {
    engine: 'gc-estimate/1',
    computedAt: new Date().toISOString(),
    design: input.design,
    takeoff: { inputHash: input.takeoffHash, lineCount: takeoff.lines.length },
    costTable: { id: table.id, name: table.name, kind: table.kind, notice: table.notice },
    settings: s,
    lines,
    totals,
    alternates: [],
    flags,
  };
}

// Alternate design vs base: price delta, per-category deltas and the lines that changed most.
export function compareAlternate(base: EstimateResult, alt: EstimateResult): AlternateComparison {
  const byCat = (e: EstimateResult) => new Map(e.totals.byCategory.map(c => [c.category, c.total]));
  const b = byCat(base), a = byCat(alt);
  const cats = CATEGORY_ORDER.filter(c => b.has(c) || a.has(c));
  const bl = new Map(base.lines.map(l => [l.key, l])), al = new Map(alt.lines.map(l => [l.key, l]));
  const keys = [...new Set([...bl.keys(), ...al.keys()])];
  const changes = keys.map(k => ({ key: k, description: (al.get(k) ?? bl.get(k))!.description, delta: money((al.get(k)?.total ?? 0) - (bl.get(k)?.total ?? 0)) }))
    .filter(c => Math.abs(c.delta) >= 0.01).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 25);
  return {
    designId: alt.design.id, title: alt.design.title,
    price: alt.totals.price, delta: money(alt.totals.price - base.totals.price),
    byCategory: cats.map(c => ({ category: c, delta: money((a.get(c) ?? 0) - (b.get(c) ?? 0)) })).filter(c => c.delta !== 0),
    changes,
  };
}

// ---------- untrusted input ----------

const pct = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const SettingsInput = z.object({
  costTableId: z.string().max(40).optional(),
  region: z.object({ region: z.string().max(80), material: z.number().min(0.5).max(2), labor: z.number().min(0.5).max(2) }).optional(),
  overheadPct: pct(0, 50).optional(),
  contingencyPct: pct(0, 50).optional(),
  pricing: z.enum(['margin', 'markup']).optional(),
  profitPct: pct(0, 90).optional(),
  salesTaxPct: pct(0, 15).optional(),
  overrides: z.record(z.string().max(120), z.object({ materialUnitCost: z.number().min(0).max(1e6).optional(), subUnitCost: z.number().min(0).max(1e6).optional(), hoursPerUnit: z.number().min(0).max(1000).optional() }).strict()).optional(),
  exclude: z.array(z.string().max(120)).max(500).optional(),
}).strict();

export function cleanEstimateSettings(input: unknown): EstimateSettings {
  if (input == null) return { ...DEFAULT_ESTIMATE_SETTINGS };
  const r = SettingsInput.safeParse(input);
  if (!r.success) throw new Error(`Estimate settings: ${r.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
  const d = DEFAULT_ESTIMATE_SETTINGS;
  if (Object.keys(r.data.overrides ?? {}).length > 500) throw new Error('Estimate settings: too many overrides.');
  return {
    costTableId: r.data.costTableId ?? d.costTableId,
    region: r.data.region ?? d.region,
    overheadPct: r.data.overheadPct ?? d.overheadPct,
    contingencyPct: r.data.contingencyPct ?? d.contingencyPct,
    pricing: r.data.pricing ?? d.pricing,
    profitPct: r.data.profitPct ?? d.profitPct,
    salesTaxPct: r.data.salesTaxPct ?? d.salesTaxPct,
    overrides: r.data.overrides ?? {},
    exclude: r.data.exclude ?? [],
  };
}

const UNITS = ['sq ft', 'sq yd', 'lf', 'cu yd', 'ea', 'sheets', 'gal', 'bundles', 'squares', 'rolls', 'pcs', 'bags'] as const;
const Money = z.number().finite().min(0).max(1e6);
const CostItemInput = z.object({
  match: z.string().min(1).max(120).regex(/^[a-z0-9.*_-]+$/i, 'letters, digits, . - _ and * only'),
  unit: z.enum(UNITS),
  material: z.object({ unitCost: Money, source: z.enum(['contractor', 'supplier']).default('contractor'), note: z.string().max(200).optional() }).strict().optional(),
  labor: z.object({ hoursPerUnit: z.number().finite().min(0).max(1000) }).strict().optional(),
  sub: z.object({ unitCost: Money, trade: z.string().min(1).max(60), source: z.enum(['contractor', 'supplier']).default('contractor') }).strict().optional(),
}).strict().refine(i => i.material || i.labor || i.sub, 'a cost item needs a material, labor or sub cost');

export const CostTableInput = z.object({
  name: z.string().min(1).max(120),
  laborRatePerHour: z.number().finite().min(0).max(1000),
  items: z.array(CostItemInput).min(1).max(1000),
}).strict();

// A contractor's table: their items first (they win ties by order), then any starter items they didn't replace.
export function contractorTable(id: string, input: z.infer<typeof CostTableInput>, base: CostTable, updatedAt: string): CostTable {
  const own = input.items.map(i => ({ ...i, material: i.material ? { ...i.material } : undefined, sub: i.sub ? { ...i.sub } : undefined })) as CostItem[];
  const ownMatches = new Set(own.map(i => i.match));
  return { id, name: input.name, kind: 'contractor', currency: 'USD', updatedAt, laborRatePerHour: input.laborRatePerHour, items: [...own, ...base.items.filter(i => !ownMatches.has(i.match))] };
}
