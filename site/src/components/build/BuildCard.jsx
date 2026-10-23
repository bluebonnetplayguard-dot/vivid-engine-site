import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Undo2, Check, X, Ruler, Boxes } from 'lucide-react';
import { api } from '@/api/client';
import BuildViewer from './BuildViewer';
import './build.css';

const FAULT_LABEL = { collision: 'Clashes', 'unit-sanity': 'Size checks', defect: 'Defects', tolerance: 'Tolerances', constraint: 'Constraints' };

// One Build Studio answer in the chat: what was built, checks, 3D view, approval, drawings.
export default function BuildCard({ m, pending, canUndo, onApply, onDiscard, onUndo }) {
  const r = m.result;
  const [scene, setScene] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');
  const groups = useMemo(() => {
    const g = {};
    for (const f of r?.validation?.findings || []) (g[f.fault] ||= []).push(f);
    return g;
  }, [r]);

  if (m.status) return <div className="ais-answer"><div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div></div>;
  if (m.error) return <div className="ais-answer"><div className="ais-error" role="alert">{m.error.message}{m.error.code === 'QUOTA_DAY' && <> <Link to="/pricing">See plans</Link></>}</div></div>;
  if (r?.question) return <div className="ais-answer"><p>{r.reply}</p><p><b>{r.question}</b></p></div>;
  if (!r?.viewer) return <div className="ais-answer"><p>{r?.reply}</p></div>;

  const download = async scale => {
    setDownloading(scale); setError('');
    try {
      const blob = await api.buildStudio.sheet({ spec: r.spec, scale });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(r.spec?.project?.name || 'build-studio').replace(/[^\w-]+/g, '-')}-${scale.includes('1/2') ? 'half' : 'quarter'}-inch.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setError(e?.message || 'Couldn’t make the PDF. Try again.'); }
    finally { setDownloading(''); }
  };

  const ok = r.validation?.ok;
  return <div className="ais-answer vb-card">
    <p className="vb-reply">{r.reply}</p>
    <p className="vb-notice"><AlertTriangle size={15} aria-hidden="true" />{r.notice}</p>

    {r.changes?.length > 0 && <div className={`vb-changes${pending ? ' is-pending' : ''}`}>
      <b>{pending ? 'Proposed changes' : 'What changed'}</b>
      <ul>{r.changes.map(c => <li key={c}>{c}</li>)}</ul>
      {pending && <div className="vb-approve">
        <button type="button" className="vb-btn is-primary" onClick={onApply}><Check size={15} aria-hidden="true" />Apply changes</button>
        <button type="button" className="vb-btn" onClick={onDiscard}><X size={15} aria-hidden="true" />Discard</button>
      </div>}
    </div>}

    <BuildViewer viewer={r.viewer} highlight={scene ? r.validation.scenes[scene] || [] : []} />

    <div className="vb-row">
      <div className="vb-summary"><Boxes size={15} aria-hidden="true" /><span>{r.summary?.join(' · ')}</span></div>
      <div className={`vb-checks ${ok ? 'is-ok' : 'is-bad'}`}>
        {ok ? <><CheckCircle2 size={15} aria-hidden="true" />All checks passed</> : <><AlertTriangle size={15} aria-hidden="true" />{r.validation.findings.length} issue{r.validation.findings.length === 1 ? '' : 's'} found</>}
      </div>
    </div>
    {!ok && <div className="vb-findings">
      {Object.entries(groups).map(([fault, list]) => <div key={fault} className="vb-group">
        <button type="button" className="vb-scene" aria-pressed={scene === fault} onClick={() => setScene(scene === fault ? null : fault)}>{FAULT_LABEL[fault] || fault} ({list.length})</button>
        <ul>{list.slice(0, 6).map((f, i) => <li key={i}>{f.message}{f.suggestion && <em> {f.suggestion}.</em>}</li>)}</ul>
      </div>)}
    </div>}

    <div className="vh-acts vb-acts">
      <button type="button" onClick={() => download('1/4"=1\'-0"')} disabled={!!downloading}><Download size={15} aria-hidden="true" />{downloading.includes('1/4') ? 'Making PDF…' : 'Drawings 1/4"=1\'-0" (PDF)'}</button>
      <button type="button" onClick={() => download('1/2"=1\'-0"')} disabled={!!downloading}><Ruler size={15} aria-hidden="true" />{downloading.includes('1/2') ? 'Making PDF…' : '1/2"=1\'-0"'}</button>
      {canUndo && !pending && <button type="button" onClick={onUndo}><Undo2 size={15} aria-hidden="true" />Undo last change</button>}
      <Link className="is-quiet" to="/#inquiry">Have us draft it</Link>
    </div>
    {error && <p className="ais-error" role="alert">{error}</p>}
    <p className="vb-note">Print drawings at 100% / Actual Size and check the 1-inch square with a ruler. Sizes are preliminary estimates, not engineering.</p>
  </div>;
}
