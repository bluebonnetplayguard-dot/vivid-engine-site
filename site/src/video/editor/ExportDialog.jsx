// Export: checks the plan with the server, renders in this browser, then offers the file.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, X } from 'lucide-react';
import { api } from '@/api/client';
import { canExportMp4, exportVideo, supportsSize } from '@/video/engine/exporter';
import { ensureFonts } from '@/video/engine/fonts';
import { hasMedia } from '@/video/engine/media';
import { LEVEL_LABEL, LEVELS, projectDuration, projectLevel } from '@/video/engine/model';
import { LockBadge } from './ui';

const SIZES = [{ short: 720, label: '720p' }, { short: 1080, label: '1080p HD' }, { short: 2160, label: '4K' }];
const fmtBytes = n => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);

export default function ExportDialog({ project, tier, brand, onClose, onExported }) {
  const [short, setShort] = useState(Math.min(1080, tier.maxHeight));
  const [fps, setFps] = useState(30);
  const [supported, setSupported] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const abort = useRef(null);
  const duration = projectDuration(project);
  const level = projectLevel(project);
  const levelTooHigh = LEVELS[level] > LEVELS[tier.effectLevel];
  const tooLong = duration > tier.maxDurationSec + 0.5;

  useEffect(() => {
    let live = true;
    (async () => {
      const s = {};
      for (const { short: sh } of SIZES) s[sh] = await supportsSize(project, sh, 30);
      if (live) setSupported(s);
      const w = [];
      const clips = project.tracks.flatMap(t => t.clips);
      if (clips.some(c => c.placeholder && !project.assets[c.assetId])) w.push('Some template placeholders are still empty. They will show as gray boxes.');
      const ids = [...new Set(clips.map(c => c.assetId).filter(Boolean))];
      const missing = (await Promise.all(ids.map(async id => ((await hasMedia(id)) ? null : project.assets[id]?.name ?? 'a file')))).filter(Boolean);
      if (missing.length) w.push(`Not on this device: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Relink them in Media first.`);
      if (!canExportMp4()) w.push('This browser will record the video in real time as a WebM file. Chrome or Edge make MP4s faster.');
      if (live) setWarnings(w);
    })();
    return () => { live = false; abort.current?.abort(); };
  }, [project]);

  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  const start = async () => {
    setError(''); setResult(null);
    abort.current = new AbortController();
    try {
      setProgress({ value: 0, label: 'Checking your plan' });
      const { watermark } = await api.video.startExport({ width: short, height: short, fps, duration, level });
      setProgress({ value: 0, label: 'Loading fonts' });
      await ensureFonts(project);
      const out = await exportVideo(project, {
        short, fps, watermark, brand: brand?.logoOnEveryVideo ? brand : null, signal: abort.current.signal,
        onProgress: (value, label) => setProgress({ value, label }),
      });
      setResult({ ...out, url: URL.createObjectURL(out.blob), size: out.blob.size, watermark });
      onExported?.();
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || 'The export failed. Try a lower resolution.');
    }
    setProgress(null);
  };

  const name = `${(project.title || 'video').replace(/[^\w\- ]+/g, '').trim() || 'video'}.${result?.ext ?? 'mp4'}`;
  return <div className="vs-modal" role="dialog" aria-modal="true" aria-labelledby="export-h" onKeyDown={e => e.key === 'Escape' && !progress && onClose()}>
    <div className="vs-modal-card">
      <div className="vs-modal-head"><h2 id="export-h">Export video</h2><button type="button" onClick={onClose} disabled={!!progress} aria-label="Close"><X size={18} /></button></div>
      {!result && !progress && <>
        <p className="vs-muted">{duration.toFixed(1)} seconds · rendered on this computer, nothing is uploaded.</p>
        <div className="vs-field"><span>Resolution</span><div className="vs-choices" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {SIZES.map(s => {
            const planOk = s.short <= tier.maxHeight;
            const deviceOk = supported[s.short] !== false;
            return <button type="button" key={s.short} className={`vs-choice${short === s.short ? ' is-on' : ''}${!planOk || !deviceOk ? ' is-locked' : ''}`}
              onClick={() => planOk && deviceOk && setShort(s.short)} title={!planOk ? 'Not on your plan' : !deviceOk ? 'This computer cannot encode this size' : s.label}>
              <span>{s.label}</span>{!planOk && <span className="vs-lock">{s.short === 2160 ? 'Studio' : 'Creator'}</span>}{planOk && !deviceOk && <small>not supported here</small>}
            </button>;
          })}
        </div></div>
        <div className="vs-field"><span>Frame rate</span><div className="vs-choices" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          {[30, 60].map(f => <button type="button" key={f} className={`vs-choice${fps === f ? ' is-on' : ''}${f > tier.maxFps ? ' is-locked' : ''}`} onClick={() => f <= tier.maxFps && setFps(f)}>
            <span>{f} fps</span>{f > tier.maxFps && <LockBadge level="pro" />}</button>)}
        </div></div>
        {tier.watermark && <p className="vs-muted">Free exports include a small “Made with Vivid Video Studio” mark. <Link to="/video/pricing">Remove it</Link></p>}
        {warnings.map(w => <p key={w} className="vs-warn">{w}</p>)}
        {levelTooHigh && <p className="vs-err">This video uses {LEVEL_LABEL[level]} features (effects, transitions, filters or text animations). Remove them or <Link to="/video/pricing">upgrade</Link> to export.</p>}
        {tooLong && <p className="vs-err">Your plan exports videos up to {Math.round(tier.maxDurationSec / 60)} minutes. <Link to="/video/pricing">Upgrade</Link> for longer videos.</p>}
        <button type="button" className="vs-btn vs-primary vs-wide" onClick={start} disabled={levelTooHigh || tooLong || duration <= 0}><Download size={16} /> Export {SIZES.find(s => s.short === short)?.label}</button>
      </>}
      {progress && <div className="vs-progress" role="status">
        <p><Loader2 size={16} className="vs-spin" aria-hidden="true" /> {progress.label}</p>
        <i><b style={{ width: `${Math.round(progress.value * 100)}%` }} /></i>
        <small>{Math.round(progress.value * 100)}% · keep this tab open</small>
        <button type="button" className="vs-btn" onClick={() => abort.current?.abort()}>Cancel</button>
      </div>}
      {result && <div className="vs-result">
        <video src={result.url} controls playsInline />
        <p className="vs-muted">{result.width}×{result.height} · {fmtBytes(result.size)}{result.watermark ? ' · watermarked' : ''}</p>
        <a className="vs-btn vs-primary vs-wide" href={result.url} download={name}><Download size={16} /> Download {name}</a>
      </div>}
      {error && <p className="vs-err" role="alert">{error}{/plan|upgrade|exports/i.test(error) && <> <Link to="/video/pricing">See plans</Link></>}</p>}
    </div>
  </div>;
}
