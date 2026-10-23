// Settings for the selected clip. Options above the customer's plan are shown locked.
import { Diamond, X } from 'lucide-react';
import { allowed, EFFECTS, FILTERS, FONTS, findClip, LEVEL_LABEL, mediaMaxDuration, TEXT_ANIMS, TRANSITIONS } from '@/video/engine/model';
import { ColorField, Field, LevelChoices, LockBadge, NumberField, Section, Select, Slider, Toggle, UpgradeNote } from './ui';

const pct = v => `${Math.round(v * 100)}%`;
const secs = v => `${v.toFixed(1)} s`;

function Keyframes({ clip, prop, label, value, localT, update, tierLevel, min, max, step }) {
  const list = clip.keyframes?.[prop] ?? [];
  const locked = !allowed('pro', tierLevel);
  const at = list.findIndex(k => Math.abs(k.t - localT) < 0.05);
  const set = v => update({ keyframes: { ...clip.keyframes, [prop]: [...list.filter((_, i) => i !== at), { t: Math.max(0, Math.min(clip.duration, localT)), v }].sort((a, b) => a.t - b.t) } });
  return <div className="vs-kf">
    <Slider label={label} value={at >= 0 ? list[at].v : value} min={min} max={max} step={step} format={prop === 'rotation' ? v => `${Math.round(v)}°` : prop === 'x' || prop === 'y' ? pct : v => v.toFixed(2)}
      onChange={v => (list.length ? set(v) : update({ [prop]: v }))} />
    <button type="button" className={`vs-kf-btn${list.length ? ' has' : ''}${at >= 0 ? ' on' : ''}`} disabled={locked} onClick={() => set(at >= 0 ? list[at].v : value)}
      title={locked ? 'Keyframes need the Pro plan' : at >= 0 ? 'Keyframe here (change the slider to edit it)' : 'Add a keyframe at the playhead'}><Diamond size={13} /></button>
    {list.length > 0 && <button type="button" className="vs-kf-btn" onClick={() => update({ keyframes: { ...clip.keyframes, [prop]: [] } })} title="Remove all keyframes"><X size={13} /></button>}
  </div>;
}

function Transform({ clip, update, localT, tierLevel }) {
  return <Section title="Position" right={!allowed('pro', tierLevel) ? <LockBadge level="pro" /> : <small>◆ = keyframe</small>}>
    <Keyframes clip={clip} prop="x" label="Left / right" value={clip.x} min={-0.5} max={1.5} step={0.005} localT={localT} update={update} tierLevel={tierLevel} />
    <Keyframes clip={clip} prop="y" label="Up / down" value={clip.y} min={-0.5} max={1.5} step={0.005} localT={localT} update={update} tierLevel={tierLevel} />
    <Keyframes clip={clip} prop="scale" label="Size" value={clip.scale} min={0.05} max={4} step={0.01} localT={localT} update={update} tierLevel={tierLevel} />
    <Keyframes clip={clip} prop="rotation" label="Rotate" value={clip.rotation || 0} min={-180} max={180} step={1} localT={localT} update={update} tierLevel={tierLevel} />
    <Keyframes clip={clip} prop="opacity" label="Opacity" value={clip.opacity ?? 1} min={0} max={1} step={0.01} localT={localT} update={update} tierLevel={tierLevel} />
  </Section>;
}

function Timing({ clip, update, asset }) {
  const max = mediaMaxDuration(clip, asset);
  return <Section title="Timing">
    <div className="vs-row2">
      <NumberField label="Starts at (s)" value={clip.start} onChange={v => update({ start: v })} />
      <NumberField label="Length (s)" value={clip.duration} min={0.1} max={Number.isFinite(max) ? max : undefined} onChange={v => update({ duration: v })} />
    </div>
  </Section>;
}

function Animations({ clip, update, tierLevel }) {
  return <Section title="Animation">
    <Field label="In"><LevelChoices items={TEXT_ANIMS} value={clip.anim?.in ?? 'none'} tierLevel={tierLevel} onChange={v => update({ anim: { ...clip.anim, in: v } })} columns={3} /></Field>
    <Field label="Out"><LevelChoices items={TEXT_ANIMS.filter(a => !['typewriter', 'words', 'wipe'].includes(a.id))} value={clip.anim?.out ?? 'none'} tierLevel={tierLevel} onChange={v => update({ anim: { ...clip.anim, out: v } })} columns={3} /></Field>
  </Section>;
}

function TransitionPicker({ clip, update, tierLevel }) {
  return <Section title="Transition in" right={<small>plays as this clip starts</small>}>
    <LevelChoices items={[{ id: 'none', label: 'None', level: 'basic' }, ...TRANSITIONS]} value={clip.transition?.type ?? 'none'} tierLevel={tierLevel}
      onChange={v => update({ transition: v === 'none' ? null : { type: v, duration: clip.transition?.duration ?? 0.6 } })} columns={3} />
    {clip.transition?.type && <Slider label="Length" value={clip.transition.duration} min={0.2} max={Math.min(2, clip.duration)} step={0.05} format={secs}
      onChange={v => update({ transition: { ...clip.transition, duration: v } })} />}
  </Section>;
}

function EffectsPicker({ clip, update, tierLevel }) {
  const has = id => clip.effects?.some(e => e.id === id);
  const setParam = (id, key, v) => update({ effects: clip.effects.map(e => (e.id === id ? { ...e, params: { ...e.params, [key]: v } } : e)) });
  return <Section title="Effects">
    {EFFECTS.map(fx => {
      const on = has(fx.id);
      const params = clip.effects?.find(e => e.id === fx.id)?.params ?? fx.params;
      return <div key={fx.id} className="vs-effect">
        <Toggle label={fx.label} checked={on} level={fx.level} tierLevel={tierLevel}
          onChange={v => update({ effects: v ? [...(clip.effects ?? []), { id: fx.id, params: { ...fx.params } }] : clip.effects.filter(e => e.id !== fx.id), ...(fx.id === 'blurfill' && v ? { fit: 'contain' } : {}) })} />
        {on && 'amount' in fx.params && <Slider label="Amount" value={params.amount} min={fx.id === 'rgbsplit' || fx.id === 'shake' ? 1 : 0.02} max={fx.id === 'rgbsplit' || fx.id === 'shake' ? 40 : 1} step={0.01}
          format={v => (v > 1 ? Math.round(v) : pct(v))} onChange={v => setParam(fx.id, 'amount', v)} />}
        {on && fx.id === 'chroma' && <>
          <ColorField label="Key color" value={params.color} onChange={v => setParam('chroma', 'color', v)} />
          <Slider label="Tolerance" value={params.tolerance} min={0.05} max={0.8} format={pct} onChange={v => setParam('chroma', 'tolerance', v)} />
        </>}
      </div>;
    })}
  </Section>;
}

function MediaInspector({ clip, update, asset, tierLevel, localT, onReplace }) {
  const isVideo = clip.type === 'video';
  return <>
    {clip.placeholder && !asset && <div className="vs-callout">This is a placeholder. Pick a photo or video in <b>Media</b> to fill it.</div>}
    {asset && <p className="vs-asset-name">{asset.name}{asset.credit ? <> · <a href={asset.credit.url} target="_blank" rel="noreferrer">{asset.credit.name} on Pexels</a></> : ''}</p>}
    {asset && <button type="button" className="vs-btn" onClick={onReplace}>Replace media…</button>}
    <Timing clip={clip} update={update} asset={asset} />
    <Section title="Frame">
      <Select label="Fit" value={clip.fit} onChange={v => update({ fit: v })} options={[{ value: 'cover', label: 'Fill the frame (crop)' }, { value: 'contain', label: 'Fit inside (no crop)' }]} />
      <Slider label="Rounded corners" value={clip.radius || 0} min={0} max={200} step={1} format={v => `${v}`} onChange={v => update({ radius: v })} />
    </Section>
    {isVideo && <Section title="Speed & sound">
      <Slider label="Speed" value={clip.speed || 1} min={0.25} max={4} step={0.05} format={v => `${v.toFixed(2)}×`} disabled={!allowed('standard', tierLevel)}
        onChange={v => update(c => ({ speed: v, duration: Math.min(c.duration * ((c.speed || 1) / v), asset?.duration ? (asset.duration - (c.in || 0)) / v : Infinity) }))} />
      {!allowed('standard', tierLevel) && <UpgradeNote>Speed changes need the Creator plan.</UpgradeNote>}
      <Toggle label="Mute this clip" checked={clip.muted} onChange={v => update({ muted: v })} />
      <Slider label="Volume" value={clip.volume ?? 1} min={0} max={2} format={pct} onChange={v => update({ volume: v })} />
      <div className="vs-row2">
        <Slider label="Fade in" value={clip.fadeIn || 0} min={0} max={5} step={0.1} format={secs} onChange={v => update({ fadeIn: v })} />
        <Slider label="Fade out" value={clip.fadeOut || 0} min={0} max={5} step={0.1} format={secs} onChange={v => update({ fadeOut: v })} />
      </div>
    </Section>}
    <Section title="Filter">
      <LevelChoices items={FILTERS} value={clip.filter || 'none'} tierLevel={tierLevel} onChange={v => update({ filter: v })} columns={3} />
    </Section>
    <Section title="Adjust">
      {['brightness', 'contrast', 'saturation'].map(k => <Slider key={k} label={k[0].toUpperCase() + k.slice(1)} value={clip.adjust?.[k] ?? 0} min={-0.8} max={0.8} format={v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`} onChange={v => update({ adjust: { ...clip.adjust, [k]: v } })} />)}
      <Slider label="Blur" value={clip.adjust?.blur ?? 0} min={0} max={1} format={pct} onChange={v => update({ adjust: { ...clip.adjust, blur: v } })} />
    </Section>
    <EffectsPicker clip={clip} update={update} tierLevel={tierLevel} />
    <TransitionPicker clip={clip} update={update} tierLevel={tierLevel} />
    <Transform clip={clip} update={update} localT={localT} tierLevel={tierLevel} />
  </>;
}

function TextInspector({ clip, update, tierLevel, localT }) {
  const t = clip.text;
  const setText = patch => update({ text: { ...t, ...patch } });
  const bgAlpha = t.bg?.length === 9 ? parseInt(t.bg.slice(7), 16) / 255 : 1;
  return <>
    <Section title="Text">
      <textarea className="vs-textarea" id="vs-text-content" rows={3} value={t.content} onChange={e => setText({ content: e.target.value })} aria-label="Text" />
      <div className="vs-row2">
        <Select label="Font" value={t.font} onChange={v => setText({ font: v })} options={FONTS} />
        <Select label="Weight" value={String(t.weight)} onChange={v => setText({ weight: Number(v) })} options={['400', '500', '600', '700', '800', '900']} />
      </div>
      <Slider label="Size" value={t.size} min={16} max={400} step={1} format={v => `${v}`} onChange={v => setText({ size: v })} />
      <div className="vs-row2">
        <ColorField label="Color" value={t.color} onChange={v => setText({ color: v })} />
        <Select label="Align" value={t.align} onChange={v => setText({ align: v })} options={['left', 'center', 'right']} />
      </div>
      <Slider label="Line width" value={t.maxWidth} min={0.2} max={1} format={pct} onChange={v => setText({ maxWidth: v })} />
      <Slider label="Letter spacing" value={t.letterSpacing || 0} min={-5} max={40} step={0.5} format={v => `${v}`} onChange={v => setText({ letterSpacing: v })} />
      <Toggle label="ALL CAPS" checked={t.uppercase} onChange={v => setText({ uppercase: v })} />
      <Toggle label="Shadow" checked={t.shadow} onChange={v => setText({ shadow: v })} />
      <Toggle label="Background box" checked={!!t.bg} onChange={v => setText({ bg: v ? '#000000aa' : '' })} />
      {t.bg && <div className="vs-row2">
        <ColorField label="Box color" value={t.bg} onChange={v => setText({ bg: v.slice(0, 7) + Math.round(bgAlpha * 255).toString(16).padStart(2, '0') })} />
        <Slider label="Box opacity" value={bgAlpha} min={0} max={1} format={pct} onChange={v => setText({ bg: t.bg.slice(0, 7) + Math.round(v * 255).toString(16).padStart(2, '0') })} />
      </div>}
      <Toggle label="Outline" checked={!!t.strokeWidth} onChange={v => setText({ stroke: '#000000', strokeWidth: v ? 4 : 0 })} />
      {!!t.strokeWidth && <div className="vs-row2">
        <ColorField label="Outline color" value={t.stroke || '#000000'} onChange={v => setText({ stroke: v })} />
        <Slider label="Outline width" value={t.strokeWidth} min={1} max={20} step={0.5} format={v => `${v}`} onChange={v => setText({ strokeWidth: v })} />
      </div>}
      <Toggle label="Neon glow" checked={!!t.glow} level="pro" tierLevel={tierLevel} onChange={v => setText({ glow: v ? t.color : '' })} />
    </Section>
    <Timing clip={clip} update={update} />
    <Animations clip={clip} update={update} tierLevel={tierLevel} />
    <Transform clip={clip} update={update} localT={localT} tierLevel={tierLevel} />
  </>;
}

function ShapeInspector({ clip, update, tierLevel, localT }) {
  const s = clip.shape;
  const setShape = patch => update({ shape: { ...s, ...patch } });
  return <>
    <Section title="Shape">
      <Select label="Kind" value={s.kind} onChange={v => setShape({ kind: v })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'circle', label: 'Circle' }, { value: 'line', label: 'Line' }]} />
      <div className="vs-row2">
        <ColorField label="Color" value={s.color} onChange={v => setShape({ color: v })} />
        <Toggle label="Gradient" checked={!!s.color2} onChange={v => setShape({ color2: v ? '#000000' : '' })} />
      </div>
      {s.color2 && <div className="vs-row2">
        <ColorField label="Second color" value={s.color2} onChange={v => setShape({ color2: v })} />
        <Slider label="Angle" value={s.angle ?? 90} min={0} max={360} step={1} format={v => `${v}°`} onChange={v => setShape({ angle: v })} />
      </div>}
      <Slider label="Width" value={s.w} min={0.01} max={1.2} format={pct} onChange={v => setShape({ w: v })} />
      {s.kind !== 'circle' && <Slider label="Height" value={s.h} min={0.002} max={1.2} step={0.002} format={pct} onChange={v => setShape({ h: v })} />}
      {s.kind === 'rect' && <Slider label="Rounded corners" value={s.radius || 0} min={0} max={200} step={1} format={v => `${v}`} onChange={v => setShape({ radius: v })} />}
    </Section>
    <Timing clip={clip} update={update} />
    <TransitionPicker clip={clip} update={update} tierLevel={tierLevel} />
    <Animations clip={clip} update={update} tierLevel={tierLevel} />
    <Transform clip={clip} update={update} localT={localT} tierLevel={tierLevel} />
  </>;
}

function AudioInspector({ clip, update, asset, tierLevel }) {
  return <>
    {asset && <p className="vs-asset-name">{asset.name}</p>}
    <Timing clip={clip} update={update} asset={asset} />
    <Section title="Sound">
      <Select label="Type" value={clip.role} onChange={v => update({ role: v })} options={[{ value: 'music', label: 'Music' }, { value: 'voice', label: 'Voice / narration' }, { value: 'sfx', label: 'Sound effect' }]} />
      <Slider label="Volume" value={clip.volume ?? 1} min={0} max={2} format={pct} onChange={v => update({ volume: v })} />
      <div className="vs-row2">
        <Slider label="Fade in" value={clip.fadeIn || 0} min={0} max={8} step={0.1} format={secs} onChange={v => update({ fadeIn: v })} />
        <Slider label="Fade out" value={clip.fadeOut || 0} min={0} max={8} step={0.1} format={secs} onChange={v => update({ fadeOut: v })} />
      </div>
      {clip.role === 'music' && <Toggle label="Auto-duck under voice" checked={clip.duck} level="standard" tierLevel={tierLevel} onChange={v => update({ duck: v })} />}
      <Slider label="Speed" value={clip.speed || 1} min={0.5} max={2} step={0.05} format={v => `${v.toFixed(2)}×`} disabled={!allowed('standard', tierLevel)}
        onChange={v => update(c => ({ speed: v, duration: Math.min(c.duration * ((c.speed || 1) / v), asset?.duration ? (asset.duration - (c.in || 0)) / v : Infinity) }))} />
    </Section>
  </>;
}

function CaptionInspector({ clip, update }) {
  return <>
    <Section title="Caption line">
      <textarea className="vs-textarea" rows={3} value={clip.text} aria-label="Caption text"
        onChange={e => update({ text: e.target.value, words: [] })} />
      <small className="vs-muted">Editing the words spreads them evenly over the line. Style all captions in the Captions panel.</small>
    </Section>
    <Timing clip={clip} update={update} />
  </>;
}

export default function Inspector({ project, selectedId, update, tierLevel, time, onReplace }) {
  const found = selectedId && findClip(project, selectedId);
  if (!found) {
    return <div className="vs-inspector-empty">
      <p><b>Select a clip</b> on the timeline or in the preview to change it.</p>
      <ul>
        <li><kbd>Space</kbd> play / pause</li><li><kbd>S</kbd> split at playhead</li><li><kbd>Del</kbd> delete clip</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</li><li><kbd>←</kbd> <kbd>→</kbd> step one frame</li>
      </ul>
      <p className="vs-muted">Your plan: {LEVEL_LABEL[tierLevel]} effects.</p>
    </div>;
  }
  const { clip } = found;
  const asset = project.assets[clip.assetId];
  const localT = Math.max(0, Math.min(clip.duration, time - clip.start));
  const props = { clip, update, asset, tierLevel, localT, onReplace };
  return <div className="vs-inspector">
    {clip.type === 'video' || clip.type === 'image' ? <MediaInspector {...props} />
      : clip.type === 'text' ? <TextInspector {...props} />
      : clip.type === 'shape' ? <ShapeInspector {...props} />
      : clip.type === 'audio' ? <AudioInspector {...props} />
      : <CaptionInspector {...props} />}
  </div>;
}
