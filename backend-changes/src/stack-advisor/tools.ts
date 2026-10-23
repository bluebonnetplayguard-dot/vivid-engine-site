import type { Db, Tool, Tier } from './types';
import { edgeStatus, badge, weakest } from './trust';

const find = (db: Db, id: string) => db.tools.find(x => x.id === id.toLowerCase() || x.name.toLowerCase() === id.toLowerCase());
const edgeOf = (db: Db, a: string, b: string) => db.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
const MOCK_NOTE = 'Development data: evidence records marked mock are not real test results.';

export function search_tools(db: Db, query: string, f: { category?: string; license?: string; selfHost?: boolean; language?: string } = {}) {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = db.tools.filter(t => (!f.category || t.category === f.category) && (!f.license || t.license === f.license)
      && (f.selfHost === undefined || t.selfHost === f.selfHost) && (!f.language || t.languages.includes(f.language)))
    .map(t => ({ t, score: q.reduce((s, w) => s + (`${t.name} ${t.category} ${t.description}`.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter(x => !q.length || x.score > 0).sort((a, b) => b.score - a.score);
  return hits.map(({ t }) => ({ id: t.id, name: t.name, category: t.category, license: t.license, description: t.description }));
}

export function get_tool(db: Db, id: string, now = new Date()) {
  const tool = find(db, id); if (!tool) return null;
  const edges = db.edges.filter(e => e.a === tool.id || e.b === tool.id).map(e => {
    const other = e.a === tool.id ? e.b : e.a; const s = edgeStatus(e, now);
    return { with: other, type: e.type, tier: badge(s.tier) };
  });
  return { ...tool, edges };
}

export function check_edge(db: Db, a: string, b: string, now = new Date()) {
  const A = find(db, a), B = find(db, b);
  if (!A || !B) return { ok: false as const, error: `Unknown tool: ${!A ? a : b}` };
  const edge = edgeOf(db, A.id, B.id); const s = edgeStatus(edge, now);
  return { ok: true as const, a: A.name, b: B.name, tier: s.tier, badge: badge(s.tier), summary: s.tier === 'unknown' && !s.failures.length ? 'No evidence these connect' : s.label,
    type: edge?.type ?? null, evidence: s.evidence.map(e => ({ badge: badge(e.tier), method: e.method, result: e.result, date: e.date, ageDays: e.ageDays, expired: e.expired, source: e.source, notes: e.notes, mock: !!e.mock })),
    caveats: [...s.evidence.filter(e => e.expired).map(e => `Lab pass from ${e.date} is ${e.ageDays} days old; shown as Checked until re-run.`),
              ...s.failures.map(e => `Failure recorded ${e.date}: ${e.notes}`),
              ...(s.evidence.some(e => e.mock) ? [MOCK_NOTE] : [])] };
}

const rank = (t: Tier) => ({ verified: 3, checked: 2, indexed: 1, unknown: 0 }[t]);
const REQUIRED: Record<string, string[]> = { rag: ['framework', 'vector-db', 'llm|model-runtime'] };

export function check_stack(db: Db, ids: string[], now = new Date(), opts: { closedSource?: boolean; kind?: 'rag' } = {}) {
  const tools = ids.map(i => find(db, i)); const missing = ids.filter((_, i) => !tools[i]);
  if (missing.length) return { ok: false as const, error: `Unknown tool(s): ${missing.join(', ')}` };
  const T = tools as Tool[]; const issues: { level: 'problem' | 'warning' | 'note'; text: string }[] = [];
  const pairs: { a: string; b: string; tier: Tier; badge: string; summary: string }[] = [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const s = edgeStatus(edgeOf(db, T[i].id, T[j].id), now);
    pairs.push({ a: T[i].name, b: T[j].name, tier: s.tier, badge: badge(s.tier), summary: s.tier === 'unknown' ? 'No evidence these connect' : s.label });
  }
  // Whole-stack rules
  for (const t of T) {
    if (t.copyleft && opts.closedSource) issues.push({ level: 'problem', text: `${t.name} is ${t.license} (copyleft); not suitable inside a closed-source product without review.` });
    if (!t.commercialUseOk) issues.push({ level: 'problem', text: `${t.name} has a license (${t.license}) that restricts commercial use. Read the license text.` });
  }
  const py = T.filter(t => t.runtime?.python); if (py.length > 1) issues.push({ level: 'note', text: `Python runtime constraints: ${py.map(t => `${t.name} ${t.runtime!.python}`).join('; ')}. Use one interpreter that satisfies all.` });
  if (opts.kind === 'rag') for (const need of REQUIRED.rag) if (!T.some(t => need.split('|').includes(t.category))) issues.push({ level: 'warning', text: `A RAG stack usually needs a ${need.replace('|', ' or ')}; none selected.` });
  if (!T.some(t => t.category === 'embedding')) issues.push({ level: 'note', text: 'No embedding model listed. Retrieval needs one (the framework or runtime may supply a default).' });
  const cloudOnly = T.filter(t => t.cloud && !t.selfHost); if (cloudOnly.length) issues.push({ level: 'warning', text: `Cloud-only single point of failure: ${cloudOnly.map(t => t.name).join(', ')}.` });
  for (const p of pairs) if (p.tier === 'unknown') issues.push({ level: 'warning', text: `${p.a} + ${p.b}: no evidence these connect.` });
  const weakestTier = weakest(pairs.map(p => p.tier)); 
  const pairScore = pairs.length ? pairs.reduce((s, p) => s + rank(p.tier), 0) / (pairs.length * 3) : 1;
  const score = Math.max(0, Math.round(100 * pairScore - 25 * issues.filter(i => i.level === 'problem').length - 5 * issues.filter(i => i.level === 'warning').length));
  const weakLink = pairs.length ? pairs.reduce((w, p) => rank(p.tier) < rank(w.tier) ? p : w) : null;
  return { ok: true as const, tools: T.map(t => t.name), score, weakestTier, weakestLink: weakLink && `${weakLink.a} + ${weakLink.b} (${weakLink.badge})`, pairs, issues,
    note: 'Score is built only from evidence tiers and license/runtime rules. No vendor can pay for a tier, placement or score.',
    mockNote: db.edges.some(e => e.evidence.some(v => v.mock)) ? MOCK_NOTE : undefined };
}
