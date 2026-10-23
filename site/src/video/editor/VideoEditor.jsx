// Vivid Video Studio editor: preview, timeline, inspector and tool panels, with undo/redo and autosave.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileVideo, LayoutTemplate, Palette, Redo2, Sparkles, Subtitles, Type, Undo2 } from 'lucide-react';
import { api } from '@/api/client';
import { linkFonts } from '@/video/engine/fonts';
import { importFile } from '@/video/engine/media';
import { ASPECTS, findClip, makeClip, projectDuration, splitClip, trackEnd, uid, updateClip } from '@/video/engine/model';
import ExportDialog from './ExportDialog';
import Inspector from './Inspector';
import { AiPanel, BrandPanel, CaptionsPanel, MediaPanel, TemplatesPanel, TextPanel } from './panels';
import Stage from './Stage';
import Timeline from './Timeline';
import { createTimeStore, useTime } from './ui';

const TABS = [
  { id: 'media', label: 'Media', icon: FileVideo },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'captions', label: 'Captions', icon: Subtitles },
  { id: 'ai', label: 'AI tools', icon: Sparkles },
  { id: 'brand', label: 'Brand', icon: Palette },
];

// Undo history. Changes with the same `key` within a second merge into one step (slider drags).
function useHistory(initial) {
  const [state, setState] = useState({ present: initial, past: [], future: [], key: null, at: 0 });
  const set = useCallback((next, { key = null, history = true } = {}) => setState(s => {
    const value = typeof next === 'function' ? next(s.present) : next;
    if (value === s.present) return s;
    if (!history) return { ...s, present: value };
    const now = Date.now();
    const merge = key && key === s.key && now - s.at < 1000;
    return { present: value, past: merge ? s.past : [...s.past.slice(-80), s.present], future: [], key, at: now };
  }), []);
  const undo = useCallback(() => setState(s => (s.past.length ? { present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future], key: null, at: 0 } : s)), []);
  const redo = useCallback(() => setState(s => (s.future.length ? { present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1), key: null, at: 0 } : s)), []);
  return { project: state.present, setProject: set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

function SaveState({ state }) {
  const label = { saved: 'All changes saved', saving: 'Saving…', dirty: 'Unsaved changes', error: 'Not saved: retrying' }[state];
  return <span className={`vs-save is-${state}`} role="status">{label}</span>;
}

function InspectorWithTime({ timeStore, ...props }) {
  const time = useTime(timeStore);
  return <Inspector {...props} time={time} />;
}

export default function VideoEditor({ projectId, initial }) {
  const { project, setProject, undo, redo, canUndo, canRedo } = useHistory(initial);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('media');
  const [playing, setPlaying] = useState(false);
  const [me, setMe] = useState(null);
  const [plans, setPlans] = useState(null);
  const [brandKits, setBrandKits] = useState([]);
  const [save, setSave] = useState('saved');
  const [exporting, setExporting] = useState(false);
  const [addAsOverlay, setAddAsOverlay] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  const timeStore = useMemo(() => createTimeStore(), []);
  const playerRef = useRef(null);
  const playingRef = useRef(false);
  const replaceRef = useRef(null);
  playingRef.current = playing;

  const refreshMe = useCallback(() => api.video.me().then(setMe).catch(() => {}), []);
  useEffect(() => {
    linkFonts();
    refreshMe();
    api.video.plans().then(setPlans).catch(() => {});
    api.video.brandKits().then(setBrandKits).catch(() => {});
  }, [refreshMe]);

  const tier = me?.tier ?? { id: 'free', name: 'Free', effectLevel: 'basic', templateLevel: 'basic', brandKits: 0, maxHeight: 720, maxFps: 30, maxDurationSec: 180, watermark: true };
  const activeKit = brandKits.find(k => k.id === project.brandKitId) ?? null;
  useEffect(() => { playerRef.current?.setBrand(activeKit?.data?.logoOnEveryVideo ? activeKit.data : null); }, [activeKit, playerRef]);

  // ---------- autosave ----------
  const lastSaved = useRef(initial);
  const thumbAt = useRef(0);
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef(0);
  useEffect(() => {
    if (project === lastSaved.current) return undefined;
    setSave('dirty');
    const timer = setTimeout(async () => {
      setSave('saving');
      let thumbnail;
      if (Date.now() - thumbAt.current > 30_000) {
        try {
          const src = document.querySelector('.vs-canvas-box canvas');
          const c = document.createElement('canvas');
          const s = 320 / Math.max(src.width, src.height);
          c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
          c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
          thumbnail = c.toDataURL('image/jpeg', 0.7);
          thumbAt.current = Date.now();
        } catch { /* skip thumbnail */ }
      }
      try {
        await api.video.saveProject(projectId, { title: project.title, aspect: project.aspect, duration: projectDuration(project), data: project, thumbnail });
        lastSaved.current = project;
        setSave('saved');
      } catch {
        setSave('error');
        retryTimer.current = setTimeout(() => setRetry(r => r + 1), 5000);
      }
    }, 1500);
    return () => { clearTimeout(timer); clearTimeout(retryTimer.current); };
  }, [project, projectId, retry]);

  useEffect(() => {
    const warn = e => { if (save !== 'saved') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  // ---------- actions ----------
  const seek = useCallback(t => {
    const p = playerRef.current;
    if (p?.playing) { p.pause(); setPlaying(false); }
    timeStore.set(Math.max(0, t));
    p?.seek(Math.max(0, t));
  }, [timeStore]);

  const updateSelected = useCallback(patch => setProject(p => updateClip(p, selectedId, patch), { key: `edit:${selectedId}` }), [selectedId, setProject]);

  const selectedClip = selectedId ? findClip(project, selectedId)?.clip ?? null : null;
  const selectedPlaceholder = selectedClip?.placeholder && !project.assets[selectedClip.assetId] ? selectedClip : null;

  // Adds a library file to the project: fills a selected placeholder, or appends to the right track.
  const addAsset = useCallback(asset => {
    setProject(p => {
      const assets = { ...p.assets, [asset.id]: asset };
      const sel = selectedId && findClip(p, selectedId)?.clip;
      if (sel && sel.placeholder && !p.assets[sel.assetId] && asset.kind !== 'audio') {
        const type = asset.kind === 'image' ? 'image' : 'video';
        return { ...updateClip(p, sel.id, { assetId: asset.id, type, in: 0, placeholder: false }), assets };
      }
      if (asset.kind === 'audio') {
        const track = p.tracks.filter(t => t.kind === 'audio').at(-1);
        const clip = makeClip('audio', { start: timeStore.get(), duration: asset.duration || 5, assetId: asset.id, role: 'music', duck: me?.tier?.effectLevel !== 'basic', fadeOut: 1.5 });
        return { ...p, assets, tracks: p.tracks.map(t => (t.id === track.id ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t)) };
      }
      const visual = p.tracks.filter(t => t.kind === 'visual');
      const track = addAsOverlay ? visual[1] ?? visual[0] : visual[0];
      const type = asset.kind === 'image' ? 'image' : 'video';
      const start = addAsOverlay ? timeStore.get() : trackEnd(track);
      const clip = makeClip(type, { start, duration: type === 'image' ? 5 : asset.duration || 5, assetId: asset.id, ...(addAsOverlay ? { scale: 0.4, x: 0.75, y: 0.3, radius: 16 } : {}) });
      return { ...p, assets, tracks: p.tracks.map(t => (t.id === track.id ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t)) };
    });
  }, [selectedId, setProject, timeStore, addAsOverlay, me]);

  const replaceMedia = async file => {
    if (!file || !selectedClip) return;
    try {
      const asset = await importFile(file);
      setProject(p => ({ ...updateClip(p, selectedClip.id, { assetId: asset.id, type: asset.kind === 'image' ? 'image' : 'video', in: 0 }), assets: { ...p.assets, [asset.id]: asset } }));
    } catch (e) { window.alert(e.message); }
  };

  const changeAspect = aspect => setProject(p => ({ ...p, aspect }));

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = e => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        setProject(p => {
          const f = findClip(p, selectedId);
          if (!f) return p;
          const copy = { ...structuredClone(f.clip), id: uid(), start: f.clip.start + f.clip.duration };
          return { ...p, tracks: p.tracks.map(t => (t.id === f.track.id ? { ...t, clips: [...t.clips, copy].sort((a, b) => a.start - b.start) } : t)) };
        });
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        const p = playerRef.current;
        if (!p) return;
        if (p.playing) { p.pause(); setPlaying(false); } else { p.play(); setPlaying(true); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); setProject(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== selectedId) })) })); setSelectedId(null); return; }
      if (e.key.toLowerCase() === 's' && !mod && selectedId) { e.preventDefault(); setProject(p => splitClip(p, selectedId, timeStore.get())); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const step = e.shiftKey ? 1 : 1 / (project.fps || 30); seek(timeStore.get() + (e.key === 'ArrowLeft' ? -step : step)); }
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, setProject, undo, redo, seek, timeStore, project.fps]);

  const ed = {
    project, setProject, select: setSelectedId, selectedClip, selectedPlaceholder, seek, time: () => timeStore.get(),
    me, refreshMe, tier, ai: me?.ai ?? plans?.ai ?? {}, voices: plans?.voices, brandKits, setBrandKits, activeKit,
    addAsset, addAsOverlay, setAddAsOverlay, refreshMedia: () => { setMediaVersion(v => v + 1); playerRef.current?.pool.destroy(); playerRef.current?.seek(timeStore.get()); },
  };
  const assetsPeaks = useMemo(() => new Map(), []);

  return <div className="vs-editor" data-media-version={mediaVersion}>
    <header className="vs-top">
      <Link to="/video" className="vs-back" aria-label="Back to your videos"><ArrowLeft size={18} /></Link>
      <input className="vs-title" value={project.title} maxLength={120} aria-label="Video title"
        onChange={e => setProject(p => ({ ...p, title: e.target.value }), { key: 'title' })} />
      <SaveState state={save} />
      <span className="vs-top-spacer" />
      <label className="vs-aspect"><span className="sr-only">Video shape</span>
        <select value={project.aspect} onChange={e => changeAspect(e.target.value)}>
          {Object.entries(ASPECTS).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.hint}</option>)}
        </select>
      </label>
      <button type="button" className="vs-icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={17} /></button>
      <button type="button" className="vs-icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)"><Redo2 size={17} /></button>
      <span className="vs-plan">{tier.name}{tier.id === 'free' && <Link to="/video/pricing">Upgrade</Link>}</span>
      <button type="button" className="vs-btn vs-primary" onClick={() => { playerRef.current?.pause(); setPlaying(false); setExporting(true); }}><Download size={16} /> Export</button>
    </header>
    <div className="vs-body">
      <nav className="vs-tabs" aria-label="Tools">
        {TABS.map(t => <button type="button" key={t.id} className={tab === t.id ? 'is-on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}><t.icon size={18} aria-hidden="true" /><span>{t.label}</span></button>)}
      </nav>
      <aside className="vs-panel" aria-label={TABS.find(t => t.id === tab).label}>
        {tab === 'media' && <MediaPanel ed={ed} />}
        {tab === 'templates' && <TemplatesPanel ed={ed} />}
        {tab === 'text' && <TextPanel ed={ed} />}
        {tab === 'captions' && <CaptionsPanel ed={ed} />}
        {tab === 'ai' && <AiPanel ed={ed} />}
        {tab === 'brand' && <BrandPanel ed={ed} />}
      </aside>
      <main className="vs-center">
        <Stage project={project} setProject={setProject} selectedId={selectedId} onSelect={setSelectedId} timeStore={timeStore}
          playerRef={playerRef} playing={playing} setPlaying={setPlaying} watermark={tier.watermark} />
      </main>
      <aside className="vs-side" aria-label="Clip settings">
        <InspectorWithTime timeStore={timeStore} project={project} selectedId={selectedId} update={updateSelected} tierLevel={tier.effectLevel}
          onReplace={() => replaceRef.current?.click()} />
        <input ref={replaceRef} type="file" accept="video/*,image/*" hidden onChange={e => { replaceMedia(e.target.files[0]); e.target.value = ''; }} />
      </aside>
    </div>
    <Timeline project={project} setProject={setProject} selectedId={selectedId} onSelect={setSelectedId} timeStore={timeStore} onSeek={seek}
      playingRef={playingRef} assetsPeaks={assetsPeaks} />
    {exporting && <ExportDialog project={project} tier={tier} brand={activeKit?.data} onClose={() => setExporting(false)} onExported={refreshMe} />}
  </div>;
}
