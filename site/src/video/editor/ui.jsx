// Small form controls shared by the Video Studio panels.
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { allowed, LEVEL_LABEL } from '@/video/engine/model';

export function Section({ title, children, right }) {
  return <section className="vs-section">
    {title && <div className="vs-section-head"><h3>{title}</h3>{right}</div>}
    {children}
  </section>;
}

export function Field({ label, children, hint }) {
  return <label className="vs-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format = v => v, disabled }) {
  return <label className="vs-field vs-slider">
    <span>{label}<b>{format(value)}</b></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
  </label>;
}

export function NumberField({ label, value, onChange, step = 0.1, min = 0, max }) {
  const [draft, setDraft] = useState(null);
  return <label className="vs-field vs-number"><span>{label}</span>
    <input type="number" step={step} min={min} max={max} value={draft ?? Number(value.toFixed(2))}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && draft !== '' && Number.isFinite(Number(draft))) onChange(Math.max(min, Math.min(max ?? Infinity, Number(draft)))); setDraft(null); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  </label>;
}

export function ColorField({ label, value, onChange }) {
  const hex = (value || '#000000').slice(0, 7);
  return <label className="vs-field vs-color"><span>{label}</span>
    <span className="vs-color-row"><input type="color" value={hex} onChange={e => onChange(e.target.value + (value?.length === 9 ? value.slice(7) : ''))} /><code>{hex}</code></span>
  </label>;
}

export function Toggle({ label, checked, onChange, disabled, level, tierLevel }) {
  const locked = level && !allowed(level, tierLevel);
  return <label className={`vs-toggle${locked ? ' is-locked' : ''}`}>
    <input type="checkbox" checked={!!checked} disabled={disabled || locked} onChange={e => onChange(e.target.checked)} />
    <span>{label}</span>{locked && <LockBadge level={level} />}
  </label>;
}

export function LockBadge({ level }) {
  return <span className="vs-lock" title={`${LEVEL_LABEL[level]} plan and up`}><Lock size={11} aria-hidden="true" />{LEVEL_LABEL[level]}</span>;
}

// A list of choices where some need a higher plan. Locked ones show a badge and link to pricing.
export function LevelChoices({ items, value, onChange, tierLevel, columns = 2 }) {
  return <div className="vs-choices" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {items.map(item => {
      const locked = !allowed(item.level, tierLevel);
      return <button type="button" key={item.id} className={`vs-choice${value === item.id ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
        aria-pressed={value === item.id} onClick={() => !locked && onChange(item.id)} title={locked ? `Needs the ${LEVEL_LABEL[item.level]} plan` : item.label}>
        <span>{item.label}</span>{locked && <LockBadge level={item.level} />}
      </button>;
    })}
  </div>;
}

export function Select({ label, value, onChange, options }) {
  return <label className="vs-field"><span>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
    </select>
  </label>;
}

export function UpgradeNote({ children }) {
  return <p className="vs-upgrade">{children} <Link to="/video/pricing">See plans</Link></p>;
}

export function Meter({ label, used, limit, unit = '' }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <div className="vs-meter"><div><span>{label}</span><span>{used.toLocaleString()} / {limit.toLocaleString()}{unit}</span></div><i><b style={{ width: `${pct}%` }} /></i></div>;
}

// Playhead time lives outside React state so playback does not re-render the whole editor.
export function createTimeStore() {
  let time = 0;
  const subs = new Set();
  return {
    get: () => time,
    set: t => { time = t; subs.forEach(fn => fn()); },
    subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function useTime(store) {
  const subscribe = useCallback(fn => store.subscribe(fn), [store]);
  return useSyncExternalStore(subscribe, store.get);
}
