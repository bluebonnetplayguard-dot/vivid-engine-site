import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Clock, HelpCircle } from 'lucide-react';
import './stack.css';

const BADGE = { verified: ['Verified', ShieldCheck], checked: ['Checked', ShieldCheck], indexed: ['Indexed', Clock], unknown: ['No evidence', HelpCircle] };

// Trust badge: tier + date. "Unknown" always reads "No evidence", never a guess.
export function TrustBadge({ tier, date, ageDays }) {
  const [label, Icon] = BADGE[tier] || BADGE.unknown;
  return <span className={`sa-badge is-${tier}`}><Icon size={13} aria-hidden="true" />{label}{date && <small> · {date}{ageDays != null ? ` (${ageDays} d ago)` : ''}</small>}</span>;
}

function Evidence({ list }) {
  if (!list?.length) return <p className="sa-none">No evidence these connect.</p>;
  return <ul className="sa-evidence">{list.map((e, i) => <li key={i}>
    <TrustBadge tier={e.badge.toLowerCase()} date={e.date} ageDays={e.ageDays} />
    <span>{e.method} · {e.result}{e.expired ? ' · expired, re-run needed' : ''}</span>
    <em>{e.notes}</em>
    {e.source && !e.mock && <a href={e.source} target="_blank" rel="noopener noreferrer">log</a>}
    {e.mock && <small className="sa-mock">sample data</small>}
  </li>)}</ul>;
}

export default function StackCard({ m }) {
  if (m.status) return <div className="ais-answer"><div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div></div>;
  if (m.error) return <div className="ais-answer"><div className="ais-error" role="alert">{m.error.message}{m.error.code === 'QUOTA_DAY' && <> <Link to="/pricing">See plans</Link></>}</div></div>;
  const r = m.result || {};
  return <div className="ais-answer sa-card">
    {r.reply && <p>{r.reply}</p>}
    {r.edge?.ok && <div className="sa-block">
      <b>{r.edge.a} + {r.edge.b}</b> <TrustBadge tier={r.edge.tier} />
      <Evidence list={r.edge.evidence} />
      {r.edge.caveats?.map(c => <p key={c} className="sa-caveat"><ShieldAlert size={14} aria-hidden="true" />{c}</p>)}
    </div>}
    {r.stack?.ok && <div className="sa-block">
      <b>Stack score {r.stack.score}/100</b> <TrustBadge tier={r.stack.weakestTier} />
      {r.stack.weakestLink && <p className="sa-weak">Weakest link: {r.stack.weakestLink}</p>}
      <ul className="sa-pairs">{r.stack.pairs.map(p => <li key={p.a + p.b}>{p.a} + {p.b} <TrustBadge tier={p.tier} /></li>)}</ul>
      {r.stack.issues?.length > 0 && <ul className="sa-issues">{r.stack.issues.map((i, k) => <li key={k} className={`is-${i.level}`}>{i.text}</li>)}</ul>}
    </div>}
    {r.results?.length > 0 && <ul className="sa-results">{r.results.map(t => <li key={t.id}><b>{t.name}</b> <span>{t.category} · {t.license}</span><p>{t.description}</p></li>)}</ul>}
    <p className="vb-note">Tiers come only from our evidence records and are never for sale. The “How Stack Advisor works” page is coming next.</p>
  </div>;
}
