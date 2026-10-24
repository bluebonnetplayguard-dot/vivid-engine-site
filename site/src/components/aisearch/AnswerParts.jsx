// Pieces shared by the home-page search and the full /search page, so both look and behave the same.
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { matchSponsored } from '@/config/partners';

export const STATUS_TEXT = {
  routing: 'Choosing the best engine…', searching: 'Searching the web…', researching: 'Researching…', fallback: 'Trying another engine…',
  merging: 'Combining the answers…', thinking: 'Thinking…',
};
export const ENGINE_NAMES = { perplexity: 'Perplexity', claude: 'Claude', gemini: 'Gemini', combined: 'Combined' };
export const UPGRADE_CODES = new Set(['QUOTA_DAY', 'QUOTA_MONTH', 'FREE_LANE_BUSY', 'COMBINED_NOT_ALLOWED', 'DEPTH_NOT_ALLOWED', 'CREDITS_EXHAUSTED']);
export const SIGNUP_CODES = new Set(['GUEST_LIMIT', 'AUTH_REQUIRED']);
export const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
export const mdLinks = {
  a: ({ node: _node, href, children, ...props }) => {
    const cite = /^#cite-(\d+)$/.exec(href || '');
    if (cite) return <a className="ais-cite" href={href} aria-label={`Source ${cite[1]}`} onClick={e => { e.preventDefault(); document.getElementById(`src-${cite[1]}`)?.scrollIntoView({ block: 'nearest' }); document.getElementById(`src-${cite[1]}`)?.focus(); }}>{children}</a>;
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
  },
};

// Medical, legal and money questions get a short "not professional advice" note under the answer.
export const SENSITIVE = /\b(medic\w*|medicine|dos(e|age)|symptom\w*|diagnos\w*|prescri\w*|pregnan\w*|ibuprofen|tylenol|acetaminophen|lawsuit|sue|lawyer|attorney|legal|custody|divorce|evict\w*|tenant|contract|invest\w*|stocks?|crypto\w*|retire\w*|401k|ira|tax(es)?|loan|mortgage|debt|credit score)\b/i;

// Numbered markers like [2] become links to the matching source in the panel below the answer.
export function withCitationLinks(text, sources) {
  if (!text) return text;
  const known = new Set((sources || []).map(s => String(s.n)));
  return text.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (known.has(n) ? `[[${n}]](#cite-${n})` : m));
}

export function Sources({ sources }) {
  if (!sources?.length) return null;
  const list = [...sources].sort((a, b) => (a.n ?? 99) - (b.n ?? 99)).slice(0, 16);
  return <section className="ais-sources" aria-label="Sources">
    {list.map((s, i) => <a key={s.url} id={`src-${s.n ?? i + 1}`} tabIndex={-1} className={`ais-source${s.cited === false ? ' is-uncited' : ''}`} href={s.url} target="_blank" rel="noopener noreferrer nofollow">
      <b>{s.n ?? i + 1}</b><div style={{ minWidth: 0 }}><span>{s.title || host(s.url)}</span><small>{host(s.url)}</small></div>
    </a>)}
  </section>;
}

// "via Perplexity" (or the engines that took part in a Combined answer).
export function Via({ m }) {
  const meta = m.meta || m.routing;
  if (!meta?.provider && !meta?.engine) return null;
  const used = (m.meta?.routedTo || m.routing?.routedTo || []).map(id => ENGINE_NAMES[id] || id);
  const label = meta.engine === 'combined' && used.length > 1 ? `Combined: ${used.join(', ')}` : ENGINE_NAMES[meta.provider] || ENGINE_NAMES[meta.engine] || meta.provider;
  return <div className="ais-engines" aria-label="Engine"><span className="ais-engine ok">via {label}</span></div>;
}

export const whyThisEngine = m => m.meta?.why || m.routing?.why || '';

// True when an answer used Google Search grounding (Gemini): no sponsored card may sit beside it.
export const usedGoogleSearch = m => !!m.meta?.groundedWithGoogle || m.meta?.sponsoredAllowed === false;

export function WhyEngine({ m }) {
  const why = whyThisEngine(m);
  if (!why) return null;
  return <details className="vh-why"><summary><Sparkles size={14} aria-hidden="true" /><b>Why this engine?</b></summary><span>{why}</span></details>;
}

export function FollowUps({ m, onAsk, disabled }) {
  if (!m.followups?.length) return null;
  return <div className="vh-followups" aria-label="Related questions">
    {m.followups.slice(0, 5).map(q => <button key={q} type="button" className="ais-chip" disabled={disabled} onClick={() => onAsk(q)}>{q}</button>)}
  </div>;
}

// Partner cards: only after the organic answer, at most two, never beside an answer grounded with Google Search,
// and always labeled. Paying never changes the answer itself.
export function Sponsored({ m }) {
  if (!m.content || m.status || usedGoogleSearch(m) || m.meta?.sponsoredAllowed !== true) return null;
  const cards = matchSponsored(m.question || '').slice(0, 2);
  if (!cards.length) return null;
  return <aside className="vh-sponsored" aria-label="Sponsored">
    <p className="vh-sponsored-label">Sponsored · Vivid Engine Partners</p>
    <div>{cards.map(c => <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer sponsored" className="vh-sponsored-card"><b>{c.name}</b><span>{c.tagline}</span><small>{c.city}</small></a>)}</div>
    <p className="vh-sponsored-note"><Link to="/legal/recommendations">How recommendations work</Link></p>
  </aside>;
}

// Turns server-sent events into message updates. `patchLast(fn)` merges fn(lastMessage) into the last message.
export function answerEventHandler(patchLast, { onThread, onDone, onUsageWarning } = {}) {
  return (type, data) => {
    if (type === 'thread') onThread?.(data.id);
    else if (type === 'unsaved') patchLast(() => ({ unsaved: data.reason }));
    else if (type === 'routing') patchLast(m => ({ routing: { ...(m.routing || {}), ...data }, status: m.content ? '' : STATUS_TEXT.routing }));
    else if (type === 'status') patchLast(m => (m.content ? {} : { status: STATUS_TEXT[data.stage] || 'Working…' }));
    else if (type === 'sources') patchLast(() => ({ sources: data }));
    else if (type === 'delta') patchLast(m => ({ content: (m.content || '') + data.text, status: '' }));
    else if (type === 'answer') patchLast(() => ({ content: data.text, status: '' }));
    else if (type === 'usage_warning') onUsageWarning?.(data);
    else if (type === 'followups') patchLast(() => ({ followups: data.questions }));
    else if (type === 'done') { patchLast(() => ({ status: '', meta: data })); onDone?.(data); }
    else if (type === 'error') patchLast(() => ({ status: '', error: { message: data.message, code: data.code } }));
  };
}

// Same events as a patch for the last (assistant) message.
export function applyEvent(type, data, message) {
  let patch = {};
  answerEventHandler(fn => { patch = { ...patch, ...fn({ ...message, ...patch }) }; })(type, data);
  return patch;
}
