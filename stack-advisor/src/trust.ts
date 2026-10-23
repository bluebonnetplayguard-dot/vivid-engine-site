import type { Evidence, Tier, Edge } from './types.ts';
export const VERIFIED_DAYS = 30;
const RANK: Record<Tier, number> = { verified: 3, checked: 2, indexed: 1, unknown: 0 };
const days = (from: string, now: Date) => Math.floor((now.getTime() - new Date(from).getTime()) / 86400000);

// Evidence expires: a lab-verified pass older than 30 days falls back to Checked until re-run.
export function effective(e: Evidence, now: Date) {
  const age = days(e.date, now);
  let tier = e.tier, expired = false;
  if (e.tier === 'verified' && age > VERIFIED_DAYS) { tier = 'checked'; expired = true; }
  return { ...e, tier, expired, ageDays: age };
}
export const badge = (t: Tier) => ({ verified: 'Verified', checked: 'Checked', indexed: 'Indexed', unknown: 'Unknown' }[t]);

// Best tier from passing evidence; failures are reported, never hidden.
export function edgeStatus(edge: Edge | undefined, now: Date) {
  if (!edge || !edge.evidence.length) return { tier: 'unknown' as Tier, label: 'No evidence these connect', evidence: [], failures: [] as ReturnType<typeof effective>[] };
  const ev = edge.evidence.map(e => effective(e, now)).sort((x, y) => +new Date(y.date) - +new Date(x.date));
  const failures = ev.filter(e => e.result === 'fail');
  const passing = ev.filter(e => e.result !== 'fail');
  const tier = passing.reduce<Tier>((best, e) => RANK[e.tier] > RANK[best] ? e.tier : best, 'unknown');
  // A newer lab failure overrides an older pass.
  const latestLab = ev.find(e => e.method === 'lab');
  const labFailedLast = latestLab?.result === 'fail';
  return { tier: labFailedLast ? ('unknown' as Tier) : tier, label: labFailedLast ? 'Latest lab run failed' : badge(tier), evidence: ev, failures };
}
export const weakest = (tiers: Tier[]): Tier => tiers.reduce((w, t) => RANK[t] < RANK[w] ? t : w, 'verified' as Tier);
