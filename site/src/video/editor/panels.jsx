// Left-hand panels of the editor. `ed` carries the editor's state and actions (see VideoEditor.jsx).
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Film, Image as ImageIcon, Loader2, Music, Search, Sparkles, Upload, Wand2 } from 'lucide-react';
import { api } from '@/api/client';
import { soundRanges, speechPieces, wordsToCaptionClips } from '@/video/engine/audio';
import { hasMedia, importBlob, importFile, listLibrary, relink } from '@/video/engine/media';
import { allowed, CAPTION_PRESETS, FONTS, LEVEL_LABEL, makeClip, projectDuration, TEXT_PRESETS, uid } from '@/video/engine/model';
import { DEFAULT_BRAND, fitsAspect, projectFromTemplate, templateLevel, TEMPLATES } from '@/video/engine/templates';
import { ColorField, Field, LevelChoices, LockBadge, Meter, Section, Select, Slider, Toggle, UpgradeNote } from './ui';

const fmtBytes = n => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} KB`);
const orientationFor = aspect => (aspect === '16:9' ? 'landscape' : aspect === '1:1' ? 'square' : 'portrait');
const durationOfBlob = blob => new Promise(resolve => {
  const a = new Audio(); const url = URL.createObjectURL(blob);
  a.preload = 'metadata'; a.src = url;
  a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(url); };
  a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
});

function Busy({ label }) { return <p className="vs-busy" role="status"><Loader2 size={15} className="vs-spin" aria-hidden="true" />{label}</p>; }
function ErrorNote({ error }) { return error ? <p className="vs-err" role="alert">{error}</p> : null; }

// ---------- Media ----------

export function MediaPanel({ ed }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState([]);
  const [drag, setDrag] = useState(false);
  const [library, setLibrary] = useState([]);
  const assets = Object.values(ed.project.assets);
  const inProject = new Set(assets.map(a => a.id));
  const elsewhere = library.filter(a => !inProject.has(a.id));

  useEffect(() => { listLibrary().then(setLibrary).catch(() => {}); }, [assets.length]);

  useEffect(() => {
    let live = true;
    Promise.all(assets.map(async a => ((await hasMedia(a.id)) ? null : a))).then(list => live && setMissing(list.filter(Boolean)));
    return () => { live = false; };
  }, [ed.project.assets]);

  const upload = async files => {
    setError('');
    for (const file of files) {
      setBusy(`Adding ${file.name}…`);
      try { ed.addAsset(await importFile(file)); }
      catch (e) { setError(e.message || `${file.name} could not be added.`); }
    }
    setBusy('');
  };

  const relinkOne = async (asset, file) => {
    try { await relink(asset, file); setMissing(m => m.filter(a => a.id !== asset.id)); ed.refreshMedia(); }
    catch (e) { setError(e.message); }
  };

  return <div className="vs-panel-body"
    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
    onDrop={e => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); }}>
    <button type="button" className={`vs-drop${drag ? ' is-over' : ''}`} onClick={() => fileRef.current?.click()}>
      <Upload size={22} aria-hidden="true" /><b>Upload video, photos or music</b><small>or drop files here · stays on this device</small>
    </button>
    <input ref={fileRef} type="file" multiple accept="video/*,image/*,audio/*" hidden onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />
    {busy && <Busy label={busy} />}
    <ErrorNote error={error} />
    {ed.selectedPlaceholder && <div className="vs-callout">A placeholder is selected: the next file you pick fills it.</div>}
    {missing.length > 0 && <Section title="Not on this device">
      <p className="vs-muted"><AlertTriangle size={14} aria-hidden="true" /> These files were added on another device or browser. Choose them again to relink.</p>
      {missing.map(a => <label key={a.id} className="vs-relink"><span>{a.name}</span><input type="file" accept={`${a.kind}/*`} onChange={e => e.target.files[0] && relinkOne(a, e.target.files[0])} /></label>)}
    </Section>}
    {assets.length > 0 && <Section title="In this project">
      <div className="vs-assets">
        {assets.map(a => <button type="button" key={a.id} className="vs-asset" onClick={() => ed.addAsset(a)} title={`Add ${a.name}`}>
          {a.thumb ? <img src={a.thumb} alt="" /> : <span className="vs-asset-icon">{a.kind === 'audio' ? <Music size={22} /> : a.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />}</span>}
          <span>{a.name}</span><small>{a.kind}{a.duration ? ` · ${a.duration.toFixed(1)} s` : ''}{a.size ? ` · ${fmtBytes(a.size)}` : ''}</small>
        </button>)}
      </div>
      <div className="vs-inline">
        <Toggle label="Add videos and photos as an overlay layer" checked={ed.addAsOverlay} onChange={ed.setAddAsOverlay} />
      </div>
    </Section>}
    {elsewhere.length > 0 && <Section title="On this device" right={<small>from your other videos</small>}>
      <div className="vs-assets">
        {elsewhere.slice(0, 40).map(a => <button type="button" key={a.id} className="vs-asset" onClick={() => ed.addAsset(a)} title={`Add ${a.name}`}>
          {a.thumb ? <img src={a.thumb} alt="" /> : <span className="vs-asset-icon">{a.kind === 'audio' ? <Music size={22} /> : a.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />}</span>}
          <span>{a.name}</span><small>{a.kind}{a.duration ? ` · ${a.duration.toFixed(1)} s` : ''}</small>
        </button>)}
      </div>
    </Section>}
    <StockSearch ed={ed} />
  </div>;
}

function StockSearch({ ed }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('video');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!ed.ai.stock) return <Section title="Stock footage"><p className="vs-muted">Free stock video and photo search will appear here once it is turned on for the site.</p></Section>;

  const search = async e => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy('Searching…'); setError('');
    try { setResults((await api.video.stockSearch({ q: q.trim(), type, orientation: orientationFor(ed.project.aspect) })).results); }
    catch (err) { setError(err.message); }
    setBusy('');
  };
  const add = async r => {
    setBusy('Downloading 0%'); setError('');
    try {
      const blob = await api.video.stockFile(r.url, { onProgress: p => setBusy(`Downloading ${Math.round(p * 100)}%`) });
      setBusy('Adding…');
      ed.addAsset(await importBlob(blob, { name: `${q.trim() || 'Stock'} (${r.credit.name})`, source: 'stock', credit: r.credit }));
    } catch (err) { setError(err.message); }
    setBusy('');
  };
  return <Section title="Stock footage" right={<small>by <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Pexels</a></small>}>
    <form className="vs-search" onSubmit={search}>
      <Search size={15} aria-hidden="true" />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search free videos and photos" aria-label="Search stock media" />
      <select value={type} onChange={e => setType(e.target.value)} aria-label="Media type"><option value="video">Videos</option><option value="photo">Photos</option></select>
    </form>
    {busy && <Busy label={busy} />}
    <ErrorNote error={error} />
    {results && <div className="vs-stock">
      {results.length === 0 && <p className="vs-muted">Nothing found. Try simpler words.</p>}
      {results.map(r => <button type="button" key={r.id} onClick={() => add(r)} disabled={!!busy} title={`By ${r.credit.name}`}>
        <img src={r.thumb} alt="" loading="lazy" />{r.duration ? <small>{r.duration}s</small> : null}
      </button>)}
    </div>}
  </Section>;
}

// ---------- Templates ----------

export function TemplatesPanel({ ed }) {
  const [cat, setCat] = useState('All');
  const cats = ['All', ...new Set(TEMPLATES.map(t => t.category))];
  const list = TEMPLATES.filter(t => (cat === 'All' || t.category === cat) && fitsAspect(t, ed.project.aspect));
  const use = t => {
    if (!allowed(templateLevel(t), ed.tier.templateLevel)) return;
    const hasClips = ed.project.tracks.some(tr => tr.clips.length);
    if (hasClips && !window.confirm('Replace what is on your timeline with this template? (You can undo.)')) return;
    const fresh = projectFromTemplate(t, ed.project.aspect, ed.activeKit?.data);
    ed.setProject(p => ({ ...fresh, title: p.title, brandKitId: p.brandKitId, assets: p.assets, captionStyle: p.captionStyle }));
    ed.select(null); ed.seek(0);
  };
  return <div className="vs-panel-body">
    <div className="vs-cats">{cats.map(c => <button type="button" key={c} className={c === cat ? 'is-on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div className="vs-templates">
      {list.map(t => {
        const level = templateLevel(t);
        const locked = !allowed(level, ed.tier.templateLevel);
        return <button type="button" key={t.id} className={`vs-template${locked ? ' is-locked' : ''}`} onClick={() => use(t)} title={locked ? `Needs the ${LEVEL_LABEL[level]} plan` : `Use ${t.name}`}>
          <span className="vs-template-art" style={{ background: `linear-gradient(135deg, ${(ed.activeKit?.data ?? DEFAULT_BRAND).colors.secondary}, ${(ed.activeKit?.data ?? DEFAULT_BRAND).colors.primary})` }}>
            <b style={{ fontFamily: (ed.activeKit?.data ?? DEFAULT_BRAND).headingFont }}>{t.name}</b>
          </span>
          <span>{t.name}</span><small>{t.category} · {t.duration}s</small>{locked && <LockBadge level={level} />}
        </button>;
      })}
    </div>
    <p className="vs-muted">Templates use your brand kit’s colors and fonts. Placeholders show where your photos or videos go.</p>
  </div>;
}

// ---------- Text & shapes ----------

export function TextPanel({ ed }) {
  const textTrack = () => ed.project.tracks.filter(t => t.kind === 'visual').at(-1);
  const add = clip => { const tr = textTrack(); ed.setProject(p => ({ ...p, tracks: p.tracks.map(t => (t.id === tr.id ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t)) })); ed.select(clip.id); };
  const brand = ed.activeKit?.data ?? DEFAULT_BRAND;
  const addText = preset => {
    if (!allowed(preset.level, ed.tier.effectLevel)) return;
    const font = (preset.text.size ?? 96) >= 80 ? brand.headingFont : brand.bodyFont;
    add(makeClip('text', { start: ed.time(), x: preset.x ?? 0.5, y: preset.y ?? 0.5, anim: preset.anim ?? { in: 'fade', out: 'fade' },
      text: { color: brand.colors.text, ...preset.text, font: preset.text.font === 'Montserrat' || preset.text.font === 'Inter' ? font : preset.text.font, ...(preset.text.bg === '#1f6febee' ? { bg: `${brand.colors.primary}ee` } : {}) } }));
  };
  const addShape = shape => add(makeClip('shape', { start: ed.time(), duration: 4, ...shape }));
  return <div className="vs-panel-body">
    <Section title="Add text">
      <div className="vs-text-presets">
        {TEXT_PRESETS.map(p => {
          const locked = !allowed(p.level, ed.tier.effectLevel);
          return <button type="button" key={p.id} className={locked ? 'is-locked' : ''} onClick={() => addText(p)} style={{ fontFamily: p.text.font, fontWeight: p.text.weight }}>
            {p.label}{locked && <LockBadge level={p.level} />}
          </button>;
        })}
      </div>
    </Section>
    <Section title="Shapes & backgrounds">
      <div className="vs-text-presets">
        <button type="button" onClick={() => addShape({ shape: { kind: 'rect', color: brand.colors.secondary, color2: brand.colors.primary, w: 1, h: 1, angle: 120 }, anim: { in: 'none', out: 'none' }, duration: 5 })}>Gradient background</button>
        <button type="button" onClick={() => addShape({ shape: { kind: 'rect', color: brand.colors.background, w: 1, h: 1 }, anim: { in: 'none', out: 'none' }, duration: 5 })}>Solid background</button>
        <button type="button" onClick={() => addShape({ shape: { kind: 'rect', color: brand.colors.primary, w: 0.5, h: 0.14, radius: 18 } })}>Rectangle</button>
        <button type="button" onClick={() => addShape({ shape: { kind: 'circle', color: brand.colors.accent, w: 0.2, h: 0.2 } })}>Circle</button>
        <button type="button" onClick={() => addShape({ shape: { kind: 'line', color: brand.colors.accent, w: 0.3, h: 0.008, radius: 6 }, anim: { in: 'wipe', out: 'fade' } })}>Line</button>
        <button type="button" onClick={() => addShape({ x: 0.32, y: 0.84, shape: { kind: 'rect', color: brand.colors.primary, w: 0.44, h: 0.1, radius: 10 }, anim: { in: 'wipe', out: 'fade' } })}>Lower-third bar</button>
      </div>
    </Section>
  </div>;
}

// ---------- Captions ----------

const LANGS = [['', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['vi', 'Vietnamese'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['tl', 'Tagalog']];

export function CaptionsPanel({ ed }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('');
  const style = ed.project.captionStyle;
  const setStyle = patch => ed.setProject(p => ({ ...p, captionStyle: { ...p.captionStyle, ...patch } }), { key: 'caption-style' });
  const captionTrack = ed.project.tracks.find(t => t.kind === 'caption');
  const usage = ed.me?.usage?.captionMinutes;

  const run = async () => {
    setError('');
    if (!ed.ai.captions) { setError('Auto captions are not turned on for the site yet.'); return; }
    const duration = projectDuration(ed.project);
    if (!duration) { setError('Add a video or audio clip with speech first.'); return; }
    try {
      setBusy('Preparing audio…');
      const pieces = await speechPieces(ed.project, duration);
      if (!pieces.length) { setError('No speech was found in this video’s sound.'); setBusy(''); return; }
      const words = [];
      for (let i = 0; i < pieces.length; i++) {
        setBusy(`Listening… ${Math.round((i / pieces.length) * 100)}%`);
        const r = await api.video.transcribe(pieces[i].wav, language);
        for (const w of r.words) words.push({ word: w.word, start: w.start + pieces[i].offset, end: w.end + pieces[i].offset });
      }
      const clips = wordsToCaptionClips(words, makeClip);
      ed.setProject(p => ({ ...p, tracks: p.tracks.map(t => (t.id === captionTrack.id ? { ...t, clips } : t)) }));
      ed.refreshMe();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  return <div className="vs-panel-body">
    <Section title="Auto captions">
      <p className="vs-muted">Turns the speech in your video into timed captions. Edit any line by selecting it on the timeline.</p>
      <Select label="Language spoken" value={language} onChange={setLanguage} options={LANGS.map(([value, label]) => ({ value, label }))} />
      <button type="button" className="vs-btn vs-primary" onClick={run} disabled={!!busy}><Sparkles size={15} /> {captionTrack?.clips.length ? 'Redo captions' : 'Make captions'}</button>
      {busy && <Busy label={busy} />}
      <ErrorNote error={error} />
      {usage && <Meter label="Caption minutes this month" used={usage.used} limit={usage.limit} />}
      {captionTrack?.clips.length > 0 && <button type="button" className="vs-btn" onClick={() => ed.setProject(p => ({ ...p, tracks: p.tracks.map(t => (t.id === captionTrack.id ? { ...t, clips: [] } : t)) }))}>Remove all captions</button>}
    </Section>
    <Section title="Caption style">
      <LevelChoices items={CAPTION_PRESETS} value={style.preset} tierLevel={ed.tier.effectLevel} onChange={v => setStyle({ preset: v })} />
      <Select label="Font" value={style.font} onChange={v => setStyle({ font: v })} options={FONTS} />
      <Slider label="Size" value={style.size} min={28} max={140} step={1} format={v => `${v}`} onChange={v => setStyle({ size: v })} />
      <div className="vs-row2">
        <ColorField label="Text" value={style.color} onChange={v => setStyle({ color: v })} />
        <ColorField label="Highlight" value={style.highlight} onChange={v => setStyle({ highlight: v })} />
      </div>
      <Slider label="Height on screen" value={style.position} min={0.1} max={0.95} format={v => `${Math.round(v * 100)}%`} onChange={v => setStyle({ position: v })} />
      <Toggle label="ALL CAPS" checked={style.uppercase} onChange={v => setStyle({ uppercase: v })} />
    </Section>
  </div>;
}

// ---------- AI tools ----------

const VOICE_LABELS = { alloy: 'Alloy (neutral)', ash: 'Ash (warm male)', ballad: 'Ballad (soft)', coral: 'Coral (bright female)', echo: 'Echo (calm male)', fable: 'Fable (storyteller)', nova: 'Nova (friendly female)', onyx: 'Onyx (deep male)', sage: 'Sage (clear)', shimmer: 'Shimmer (gentle female)', verse: 'Verse (expressive)' };

export function AiPanel({ ed }) {
  return <div className="vs-panel-body">
    <ScriptToVideo ed={ed} />
    <Voiceover ed={ed} />
    <SilenceRemoval ed={ed} />
  </div>;
}

function ScriptToVideo({ ed }) {
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState('45');
  const [tone, setTone] = useState('friendly and clear');
  const [voice, setVoice] = useState('nova');
  const [withVoice, setWithVoice] = useState(true);
  const [withStock, setWithStock] = useState(true);
  const [withCaptions, setWithCaptions] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const usage = ed.me?.usage?.storyboards;

  const build = async () => {
    setError('');
    if (text.trim().length < 10) { setError('Paste a script or article, or describe the video you want.'); return; }
    if (ed.project.tracks.some(t => t.clips.length) && !window.confirm('Replace what is on your timeline with the AI draft? (You can undo.)')) return;
    try {
      setBusy('Writing the storyboard…');
      const board = await api.video.storyboard({ text, seconds: Number(seconds), tone });
      const brand = ed.activeKit?.data ?? DEFAULT_BRAND;
      const main = [], textClips = [], voiceClips = [], captions = [];
      const newAssets = {};
      let cursor = 0;
      for (let i = 0; i < board.scenes.length; i++) {
        const s = board.scenes[i];
        let length = s.seconds;
        let voiceClip = null;
        if (withVoice && ed.ai.voiceover && s.narration) {
          setBusy(`Recording voiceover ${i + 1} of ${board.scenes.length}…`);
          const mp3 = await api.video.tts({ text: s.narration, voice });
          const asset = await importBlob(mp3, { name: `Voiceover ${i + 1}`, source: 'tts' });
          newAssets[asset.id] = asset;
          const d = asset.duration || (await durationOfBlob(mp3));
          length = Math.max(length, d + 0.4);
          voiceClip = makeClip('audio', { start: cursor + 0.15, duration: d, assetId: asset.id, role: 'voice' });
        }
        let visual = null;
        if (withStock && ed.ai.stock && s.keywords) {
          setBusy(`Finding footage for scene ${i + 1}…`);
          try {
            const { results } = await api.video.stockSearch({ q: s.keywords, type: 'video', orientation: orientationFor(ed.project.aspect) });
            const pick = results[0];
            if (pick) {
              setBusy(`Downloading footage ${i + 1} of ${board.scenes.length}…`);
              const blob = await api.video.stockFile(pick.url);
              const asset = await importBlob(blob, { name: `${s.keywords} (${pick.credit.name})`, source: 'stock', credit: pick.credit });
              newAssets[asset.id] = asset;
              // A stock clip shorter than the scene holds on its last frame.
              visual = makeClip(asset.kind === 'image' ? 'image' : 'video', { start: cursor, duration: length, assetId: asset.id, muted: true, effects: [{ id: 'kenburns', params: { amount: 0.08 } }] });
            }
          } catch { /* fall back to a branded background */ }
        }
        if (!visual) visual = makeClip('shape', { start: cursor, duration: length, shape: { kind: 'rect', color: i % 2 ? brand.colors.primary : brand.colors.secondary, color2: i % 2 ? brand.colors.secondary : brand.colors.primary, w: 1, h: 1, angle: 120 }, anim: { in: 'none', out: 'none' } });
        if (i > 0) visual.transition = { type: 'fade', duration: 0.5 };
        main.push(visual);
        if (s.onScreen) textClips.push(makeClip('text', { start: cursor + 0.2, duration: length - 0.3, y: withCaptions ? 0.4 : 0.5, anim: { in: i % 2 ? 'rise' : 'pop', out: 'fade' }, text: { content: s.onScreen, font: brand.headingFont, color: brand.colors.text, size: 92, bg: withStock ? '#00000066' : '' } }));
        if (voiceClip) voiceClips.push(voiceClip);
        if (withCaptions && s.narration) captions.push(makeClip('caption', { start: cursor + 0.15, duration: Math.max(1, (voiceClip?.duration ?? length) - 0.05), text: s.narration, words: [] }));
        cursor += length;
      }
      ed.setProject(p => {
        const [mainT, overlayT, textT] = p.tracks.filter(t => t.kind === 'visual');
        const capT = p.tracks.find(t => t.kind === 'caption');
        const voiceT = p.tracks.find(t => t.kind === 'audio');
        return {
          ...p, title: p.title === 'Untitled video' ? board.title : p.title, assets: { ...p.assets, ...newAssets },
          tracks: p.tracks.map(t => (t === mainT ? { ...t, clips: main } : t === overlayT ? { ...t, clips: [] } : t === textT ? { ...t, clips: textClips }
            : t === capT ? { ...t, clips: withCaptions ? splitLongCaptions(captions) : [] } : t === voiceT ? { ...t, clips: voiceClips } : t)),
        };
      });
      ed.select(null); ed.seek(0); ed.refreshMe();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  return <Section title="Script to video" right={<Wand2 size={15} aria-hidden="true" />}>
    <p className="vs-muted">Paste a blog post, script or idea. AI writes the scenes, finds footage, reads it aloud and adds captions.</p>
    <textarea className="vs-textarea" rows={6} value={text} onChange={e => setText(e.target.value)} maxLength={12000} placeholder="e.g. 5 reasons Tomball homeowners should service their AC before summer…" aria-label="Script or article" />
    <div className="vs-row2">
      <Select label="Length" value={seconds} onChange={setSeconds} options={[['15', '15 seconds'], ['30', '30 seconds'], ['45', '45 seconds'], ['60', '1 minute'], ['90', '1.5 minutes'], ['120', '2 minutes']].map(([value, label]) => ({ value, label }))} />
      <Select label="Tone" value={tone} onChange={setTone} options={['friendly and clear', 'energetic', 'professional', 'inspiring', 'funny', 'calm'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
    </div>
    <Toggle label="AI voiceover" checked={withVoice && ed.ai.voiceover} disabled={!ed.ai.voiceover} onChange={setWithVoice} />
    {withVoice && ed.ai.voiceover && <Select label="Voice" value={voice} onChange={setVoice} options={(ed.voices ?? Object.keys(VOICE_LABELS)).map(v => ({ value: v, label: VOICE_LABELS[v] ?? v }))} />}
    <Toggle label="Stock footage for each scene" checked={withStock && ed.ai.stock} disabled={!ed.ai.stock} onChange={setWithStock} />
    <Toggle label="Captions" checked={withCaptions} onChange={setWithCaptions} />
    <button type="button" className="vs-btn vs-primary" onClick={build} disabled={!!busy || !ed.ai.storyboard}><Sparkles size={15} /> Make my video</button>
    {!ed.ai.storyboard && <p className="vs-muted">Script-to-video is not turned on for the site yet.</p>}
    {busy && <Busy label={busy} />}
    <ErrorNote error={error} />
    {usage && <Meter label="AI drafts this month" used={usage.used} limit={usage.limit} />}
  </Section>;
}

// Long narration lines become several caption lines of ~6 words, spread over the line's time.
function splitLongCaptions(clips) {
  return clips.flatMap(c => {
    const words = c.text.split(/\s+/).filter(Boolean);
    if (words.length <= 7) return [c];
    const groups = [];
    for (let i = 0; i < words.length; i += 6) groups.push(words.slice(i, i + 6));
    const per = c.duration / words.length;
    let used = 0;
    return groups.map(g => { const clip = makeClip('caption', { start: c.start + used * per, duration: g.length * per, text: g.join(' '), words: [] }); used += g.length; return clip; });
  });
}

function Voiceover({ ed }) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('nova');
  const [style, setStyle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const usage = ed.me?.usage?.ttsChars;
  const make = async () => {
    setError('');
    if (!text.trim()) { setError('Type what the voice should say.'); return; }
    setBusy('Recording…');
    try {
      const mp3 = await api.video.tts({ text: text.trim(), voice, style: style.trim() || undefined });
      const asset = await importBlob(mp3, { name: `Voiceover: ${text.trim().slice(0, 40)}`, source: 'tts' });
      const at = ed.time();
      const voiceTrack = ed.project.tracks.find(t => t.kind === 'audio');
      const clip = makeClip('audio', { start: at, duration: asset.duration || 3, assetId: asset.id, role: 'voice' });
      ed.setProject(p => ({ ...p, assets: { ...p.assets, [asset.id]: asset }, tracks: p.tracks.map(t => (t.id === voiceTrack.id ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t)) }));
      ed.select(clip.id); ed.refreshMe(); setText('');
    } catch (e) { setError(e.message); }
    setBusy('');
  };
  return <Section title="AI voiceover">
    {!ed.ai.voiceover ? <p className="vs-muted">AI voiceover is not turned on for the site yet.</p> : <>
      <textarea className="vs-textarea" rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={4000} placeholder="Type the narration…" aria-label="Narration text" />
      <div className="vs-row2">
        <Select label="Voice" value={voice} onChange={setVoice} options={(ed.voices ?? Object.keys(VOICE_LABELS)).map(v => ({ value: v, label: VOICE_LABELS[v] ?? v }))} />
        <Field label="Delivery (optional)"><input value={style} onChange={e => setStyle(e.target.value)} maxLength={200} placeholder="e.g. upbeat, like a radio ad" /></Field>
      </div>
      <button type="button" className="vs-btn vs-primary" onClick={make} disabled={!!busy}><Sparkles size={15} /> Add voiceover at playhead</button>
      {busy && <Busy label={busy} />}
      <ErrorNote error={error} />
      {usage && <Meter label="Voiceover characters this month" used={usage.used} limit={usage.limit} />}
      <p className="vs-fine">AI-generated voice. Let viewers know the narration is AI if you publish it.</p>
    </>}
  </Section>;
}

function SilenceRemoval({ ed }) {
  const [threshold, setThreshold] = useState(-38);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const sel = ed.selectedClip;
  const ok = sel && (sel.type === 'video' || sel.type === 'audio');
  const locked = !allowed('standard', ed.tier.effectLevel);
  const run = async () => {
    setBusy(true); setNote('');
    try {
      const ranges = await soundRanges(sel, { thresholdDb: threshold });
      if (!ranges) { setNote('This clip has no sound to analyze.'); setBusy(false); return; }
      const speed = sel.speed || 1;
      const kept = ranges.map(([a, b]) => ({ in: a, duration: (b - a) / speed })).filter(r => r.duration > 0.15);
      const removed = sel.duration - kept.reduce((s, r) => s + r.duration, 0);
      if (removed < 0.3) { setNote('No long pauses found.'); setBusy(false); return; }
      ed.setProject(p => {
        const track = p.tracks.find(t => t.clips.some(c => c.id === sel.id));
        let cursor = sel.start;
        const pieces = kept.map((r, i) => { const c = { ...sel, id: i ? uid() : sel.id, start: cursor, in: r.in, duration: r.duration, transition: i ? null : sel.transition }; cursor += r.duration; return c; });
        // Shift everything after the clip on this track left by the time removed.
        const after = track.clips.filter(c => c.start >= sel.start + sel.duration - 0.01).map(c => ({ ...c, start: c.start - removed }));
        const before = track.clips.filter(c => c.id !== sel.id && c.start < sel.start + sel.duration - 0.01);
        return { ...p, tracks: p.tracks.map(t => (t.id === track.id ? { ...t, clips: [...before, ...pieces, ...after].sort((a, b) => a.start - b.start) } : t)) };
      });
      setNote(`Removed ${removed.toFixed(1)} s of silence in ${kept.length} cuts.`);
    } catch (e) { setNote(e.message); }
    setBusy(false);
  };
  return <Section title="Remove silences" right={locked ? <LockBadge level="standard" /> : null}>
    <p className="vs-muted">Cuts long pauses out of the selected talking clip.</p>
    <Slider label="Quiet below" value={threshold} min={-60} max={-20} step={1} format={v => `${v} dB`} onChange={setThreshold} disabled={locked} />
    <button type="button" className="vs-btn" onClick={run} disabled={!ok || busy || locked}>{busy ? 'Listening…' : ok ? 'Remove silences' : 'Select a video or audio clip'}</button>
    {locked && <UpgradeNote>Silence removal comes with Creator.</UpgradeNote>}
    {note && <p className="vs-muted" role="status">{note}</p>}
  </Section>;
}

// ---------- Brand kit ----------

export function BrandPanel({ ed }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const limit = ed.tier.brandKits;
  const kits = ed.brandKits ?? [];

  const save = async () => {
    setError('');
    try {
      const body = { name: editing.name, data: editing.data };
      const saved = editing.id ? await api.video.saveBrandKit(editing.id, body) : await api.video.createBrandKit(body);
      ed.setBrandKits(list => [saved, ...list.filter(k => k.id !== saved.id)]);
      ed.setProject(p => ({ ...p, brandKitId: saved.id }), { history: false });
      setEditing(null);
    } catch (e) { setError(e.message); }
  };
  const remove = async kit => {
    if (!window.confirm(`Delete the brand kit “${kit.name}”?`)) return;
    try { await api.video.deleteBrandKit(kit.id); ed.setBrandKits(list => list.filter(k => k.id !== kit.id)); } catch (e) { setError(e.message); }
  };
  const logo = async file => {
    if (!file) return;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) { setError('That image could not be read.'); return; }
    const s = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    setEditing(e => ({ ...e, data: { ...e.data, logo: c.toDataURL('image/png') } }));
  };
  // Restyles the current video with the kit: fonts, text color and background colors.
  const apply = kit => ed.setProject(p => ({
    ...p, brandKitId: kit.id, background: kit.data.colors.background,
    tracks: p.tracks.map(t => ({ ...t, clips: t.clips.map(c => {
      if (c.type === 'text') return { ...c, text: { ...c.text, font: c.text.size >= 80 ? kit.data.headingFont : kit.data.bodyFont, color: kit.data.colors.text } };
      if (c.type === 'shape') {
        const full = c.shape.w >= 1 && c.shape.h >= 1;
        return { ...c, shape: { ...c.shape, color: full ? kit.data.colors.secondary : kit.data.colors.accent, color2: c.shape.color2 ? kit.data.colors.primary : '' } };
      }
      return c;
    }) })),
  }));

  if (limit < 1 && !kits.length) return <div className="vs-panel-body"><Section title="Brand kit">
    <p className="vs-muted">Save your logo, colors and fonts once, and every template and AI draft uses them.</p>
    <UpgradeNote>Brand kits come with the Creator plan and up.</UpgradeNote>
  </Section></div>;

  if (editing) {
    const d = editing.data;
    const setData = patch => setEditing(e => ({ ...e, data: { ...e.data, ...patch } }));
    return <div className="vs-panel-body"><Section title={editing.id ? 'Edit brand kit' : 'New brand kit'}>
      <Field label="Name"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={60} /></Field>
      <div className="vs-row2">
        {['primary', 'secondary', 'accent', 'text', 'background'].map(k => <ColorField key={k} label={k[0].toUpperCase() + k.slice(1)} value={d.colors[k]} onChange={v => setData({ colors: { ...d.colors, [k]: v } })} />)}
      </div>
      <div className="vs-row2">
        <Select label="Heading font" value={d.headingFont} onChange={v => setData({ headingFont: v })} options={FONTS} />
        <Select label="Body font" value={d.bodyFont} onChange={v => setData({ bodyFont: v })} options={FONTS} />
      </div>
      <Field label="Logo (PNG with a transparent background works best)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => logo(e.target.files[0])} /></Field>
      {d.logo && <img className="vs-logo-preview" src={d.logo} alt="Logo preview" />}
      <Select label="Logo position" value={d.logoPosition} onChange={v => setData({ logoPosition: v })} options={['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(v => ({ value: v, label: v.replace('-', ' ') }))} />
      <Toggle label="Show the logo on every video" checked={d.logoOnEveryVideo} onChange={v => setData({ logoOnEveryVideo: v })} />
      <div className="vs-inline"><button type="button" className="vs-btn vs-primary" onClick={save}>Save brand kit</button><button type="button" className="vs-btn" onClick={() => setEditing(null)}>Cancel</button></div>
      <ErrorNote error={error} />
    </Section></div>;
  }

  return <div className="vs-panel-body">
    <Section title="Brand kits" right={<small>{kits.filter(k => k.mine || k.shared).length} of {limit}</small>}>
      {kits.length === 0 && <p className="vs-muted">No brand kit yet.</p>}
      {kits.map(k => <div key={k.id} className={`vs-kit${ed.project.brandKitId === k.id ? ' is-on' : ''}`}>
        <span className="vs-kit-swatches">{Object.values(k.data.colors).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
        <span className="vs-kit-name">{k.name}{k.shared ? <small> · team</small> : null}</span>
        <button type="button" className="vs-btn" onClick={() => apply(k)}>Use</button>
        {k.mine && <button type="button" className="vs-btn" onClick={() => setEditing({ id: k.id, name: k.name, data: structuredClone(k.data) })}>Edit</button>}
        {k.mine && <button type="button" className="vs-btn" onClick={() => remove(k)} aria-label={`Delete ${k.name}`}>✕</button>}
      </div>)}
      {kits.length < limit && <button type="button" className="vs-btn vs-primary" onClick={() => setEditing({ name: 'My brand', data: structuredClone({ ...DEFAULT_BRAND, logoOnEveryVideo: false }) })}>New brand kit</button>}
      {kits.length >= limit && limit < 10 && <UpgradeNote>Need more brand kits?</UpgradeNote>}
      <ErrorNote error={error} />
    </Section>
    <p className="vs-muted">“Use” restyles this video with the kit’s fonts and colors. Templates and AI drafts use the kit you picked.</p>
  </div>;
}
