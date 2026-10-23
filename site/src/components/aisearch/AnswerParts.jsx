// Pieces shared by the home-page search and the full /ai-search page, so both always look and behave the same.
import { Check, X } from 'lucide-react';

export const STATUS_TEXT = { researching: 'Researching…', searching: 'Searching the web…' };
export const UPGRADE_CODES = new Set(['QUOTA_DAY', 'QUOTA_MONTH', 'FREE_LANE_BUSY']);
export const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
export const mdLinks = { a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" /> };

// Medical, legal and money questions get a short "not professional advice" note under the answer.
export const SENSITIVE = /\b(medic\w*|medicine|dos(e|age)|symptom\w*|diagnos\w*|prescri\w*|pregnan\w*|ibuprofen|tylenol|acetaminophen|lawsuit|sue|lawyer|attorney|legal|custody|divorce|evict\w*|tenant|contract|invest\w*|stocks?|crypto\w*|retire\w*|401k|ira|tax(es)?|loan|mortgage|debt|credit score)\b/i;

export function Sources({ sources }) {
  if (!sources?.length) return null;
  return <div className="ais-sources" aria-label="Sources">
    {sources.slice(0, 12).map((s, i) => <a key={s.url} className="ais-source" href={s.url} target="_blank" rel="noopener noreferrer nofollow">
      <b>{i + 1}</b><div style={{ minWidth: 0 }}><span>{s.title || host(s.url)}</span><small>{host(s.url)}</small></div>
    </a>)}
  </div>;
}

export function Engines({ engines }) {
  if (!engines?.length) return null;
  return <div className="ais-engines" aria-label="Contributing engines">
    <span className="ais-engine ok">Claude</span>
    {engines.map(e => <span key={e.label} className={`ais-engine${e.ok ? ' ok' : ''}`} title={e.ok ? 'Contributed to this answer' : 'Unavailable for this answer'}>
      {e.ok ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{e.label}
    </span>)}
  </div>;
}

// Plain-language note on which engines answered, built only from what the server reported.
export function whyThisEngine(message) {
  const used = (message.engines || []).filter(e => e.ok).map(e => e.label);
  const web = message.sources?.length > 0;
  const parts = [];
  parts.push(web ? 'Claude wrote this answer from live web results' : 'Claude wrote this answer');
  if (used.length) parts.push(`with second opinions from ${used.join(', ')}`);
  return `${parts.join(' ')}.`;
}

// True when an answer used Google Search (Gemini), so no sponsored card is shown next to it.
export const usedGoogleSearch = message => (message.engines || []).some(e => e.ok && /gemini|google/i.test(e.label));

// Turns server-sent events into message updates. `patchLast(fn)` merges fn(lastMessage) into the last message.
export function answerEventHandler(patchLast, { onThread, onDone } = {}) {
  return (type, data) => {
    if (type === 'thread') onThread?.(data.id);
    else if (type === 'status') patchLast(() => ({ status: data.stage === 'consulting' ? `Asking ${data.engines.join(', ')}…` : STATUS_TEXT[data.stage] || 'Working…' }));
    else if (type === 'contributor') patchLast(m => ({ engines: [...(m.engines || []), { label: data.label, ok: data.ok }] }));
    else if (type === 'sources') patchLast(() => ({ sources: data }));
    else if (type === 'delta') patchLast(m => ({ content: m.content + data.text, status: '' }));
    else if (type === 'done') { patchLast(() => ({ status: '' })); onDone?.(data); }
    else if (type === 'error') patchLast(() => ({ status: '', error: { message: data.message, code: data.code } }));
  };
}
