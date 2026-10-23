// Timeline: tracks of clips you can drag, trim, split and snap. Top visual track draws on top.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Magnet, Plus, Scissors, Trash2, Volume2, VolumeX, ZoomIn } from 'lucide-react';
import { fmtTime, mediaMaxDuration, projectDuration, removeClip, rippleTrack, splitClip, uid } from '@/video/engine/model';
import { useTime } from './ui';

const HEAD = 116;
const ROW = { visual: 54, caption: 34, audio: 46 };
const TICKS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

function Waveform({ peaks, from, to, width, height }) {
  if (!peaks?.length || width < 4) return null;
  const bars = Math.max(1, Math.floor(width / 3));
  const span = Math.max(0.0001, to - from);
  const path = [];
  for (let i = 0; i < bars; i++) {
    const p = peaks[Math.min(peaks.length - 1, Math.floor((from + (span * i) / bars) * peaks.length))] ?? 0;
    const h = Math.max(1, p * (height - 6));
    path.push(`M${i * 3 + 1} ${(height - h) / 2}v${h}`);
  }
  return <svg className="vs-wave" width={width} height={height} aria-hidden="true"><path d={path.join('')} /></svg>;
}

function Playhead({ timeStore, pps, scrollRef, playingRef }) {
  const t = useTime(timeStore);
  const x = HEAD + t * pps;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playingRef.current) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEAD) el.scrollLeft = x - HEAD - 40;
  }, [x, scrollRef, playingRef]);
  return <div className="vs-playhead" style={{ transform: `translateX(${x}px)` }} aria-hidden="true"><i /></div>;
}

export default function Timeline({ project, setProject, selectedId, onSelect, timeStore, onSeek, playingRef, assetsPeaks }) {
  const [pps, setPps] = useState(60);
  const [snap, setSnap] = useState(true);
  const scrollRef = useRef(null);
  const drag = useRef(null);

  const duration = projectDuration(project);
  const totalW = Math.max(duration + 30, 60) * pps;
  const order = useMemo(() => [
    ...project.tracks.filter(t => t.kind === 'visual').reverse(),
    ...project.tracks.filter(t => t.kind === 'caption'),
    ...project.tracks.filter(t => t.kind === 'audio'),
  ], [project.tracks]);
  const step = TICKS.find(s => s * pps >= 70) ?? 120;
  const ticks = [];
  for (let s = 0; s * pps < totalW; s += step) ticks.push(s);

  const timeAt = clientX => {
    const el = scrollRef.current;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEAD) / pps);
  };

  // Ruler scrubbing.
  const scrub = e => {
    e.preventDefault();
    onSeek(timeAt(e.clientX));
    const move = ev => onSeek(timeAt(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const snapTo = (value, exceptId) => {
    if (!snap) return value;
    const limit = 8 / pps;
    let best = value, dist = limit;
    const cands = [0, timeStore.get()];
    for (const tr of project.tracks) for (const c of tr.clips) if (c.id !== exceptId) cands.push(c.start, c.start + c.duration);
    for (const c of cands) if (Math.abs(c - value) < dist) { dist = Math.abs(c - value); best = c; }
    return best;
  };

  const startDrag = (e, track, clip, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(clip.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, orig: clip, trackId: track.id, kind: track.kind, moved: false };
  };

  const onMove = e => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / pps;
    if (!d.moved && Math.abs(e.clientX - d.x) < 3) return;
    d.moved = true;
    const o = d.orig;
    const asset = project.assets[o.assetId];
    const key = `drag:${o.id}`;
    if (d.mode === 'move') {
      let start = Math.max(0, o.start + dx);
      const snappedStart = snapTo(start, o.id);
      const snappedEnd = snapTo(start + o.duration, o.id) - o.duration;
      start = Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start) ? snappedStart : Math.max(0, snappedEnd);
      // Moving onto another track of the same kind.
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-track-id]');
      const target = under && project.tracks.find(t => t.id === under.dataset.trackId);
      const toTrack = target && target.kind === d.kind ? target.id : d.trackId;
      d.trackId = toTrack;
      setProject(p => {
        const without = removeClip(p, o.id);
        return { ...without, tracks: without.tracks.map(t => (t.id === toTrack ? { ...t, clips: [...t.clips, { ...o, start }].sort((a, b) => a.start - b.start) } : t)) };
      }, { key });
    } else if (d.mode === 'left') {
      let start = snapTo(Math.max(0, o.start + dx), o.id);
      start = Math.min(start, o.start + o.duration - 0.1);
      let delta = start - o.start;
      if ('in' in o) delta = Math.max(delta, -(o.in || 0) / (o.speed || 1));
      setProject(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t, clips: t.clips.map(c => {
        if (c.id !== o.id) return c;
        const next = { ...c, start: o.start + delta, duration: o.duration - delta };
        if ('in' in o) next.in = (o.in || 0) + delta * (o.speed || 1);
        if (o.type === 'caption') next.words = o.words.map(w => ({ ...w, start: w.start - delta, end: w.end - delta }));
        return next;
      }) })) }), { key });
    } else {
      let end = snapTo(o.start + o.duration + dx, o.id);
      const max = mediaMaxDuration(o, asset);
      const dur = Math.max(0.1, Math.min(end - o.start, max));
      setProject(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t, clips: t.clips.map(c => (c.id === o.id ? { ...c, duration: dur } : c)) })) }), { key });
    }
  };

  const onUp = () => { drag.current = null; };

  const selectedTrack = project.tracks.find(t => t.clips.some(c => c.id === selectedId));
  const act = {
    split: () => selectedId && setProject(p => splitClip(p, selectedId, timeStore.get())),
    remove: () => { if (!selectedId) return; setProject(p => removeClip(p, selectedId)); onSelect(null); },
    ripple: () => { if (!selectedId || !selectedTrack) return; const id = selectedTrack.id; setProject(p => rippleTrack(removeClip(p, selectedId), id)); onSelect(null); },
    duplicate: () => {
      if (!selectedId || !selectedTrack) return;
      const c = selectedTrack.clips.find(x => x.id === selectedId);
      const copy = { ...structuredClone(c), id: uid(), start: c.start + c.duration };
      setProject(p => ({ ...p, tracks: p.tracks.map(t => (t.id === selectedTrack.id ? { ...t, clips: [...t.clips, copy].sort((a, b) => a.start - b.start) } : t)) }));
      onSelect(copy.id);
    },
    addTrack: kind => setProject(p => {
      const n = p.tracks.filter(t => t.kind === kind).length + 1;
      const track = { id: uid('t'), kind, name: kind === 'visual' ? `Layer ${n}` : kind === 'audio' ? `Audio ${n}` : `Captions ${n}`, clips: [] };
      // New visual tracks go on top of the other visual tracks.
      const lastVisual = p.tracks.map(t => t.kind).lastIndexOf('visual');
      const tracks = [...p.tracks];
      tracks.splice(kind === 'visual' ? lastVisual + 1 : tracks.length, 0, track);
      return { ...p, tracks };
    }),
    toggle: (trackId, prop) => setProject(p => ({ ...p, tracks: p.tracks.map(t => (t.id === trackId ? { ...t, [prop]: !t[prop] } : t)) })),
    deleteTrack: trackId => setProject(p => ({ ...p, tracks: p.tracks.filter(t => t.id !== trackId) })),
  };

  // Clicking an empty lane at a time adds nothing; it just moves the playhead and clears selection.
  const laneClick = e => { if (e.target === e.currentTarget) { onSelect(null); onSeek(timeAt(e.clientX)); } };

  return <div className="vs-timeline">
    <div className="vs-tl-toolbar" role="toolbar" aria-label="Timeline tools">
      <button type="button" onClick={act.split} disabled={!selectedId} title="Split at playhead (S)"><Scissors size={16} /> Split</button>
      <button type="button" onClick={act.duplicate} disabled={!selectedId} title="Duplicate (Ctrl+D)"><Copy size={16} /> Duplicate</button>
      <button type="button" onClick={act.remove} disabled={!selectedId} title="Delete (Del)"><Trash2 size={16} /> Delete</button>
      <button type="button" onClick={act.ripple} disabled={!selectedId} title="Delete and close the gap">Ripple delete</button>
      <span className="vs-tl-spacer" />
      <button type="button" className={snap ? 'is-on' : ''} aria-pressed={snap} onClick={() => setSnap(s => !s)} title="Snap to clips and playhead"><Magnet size={16} /> Snap</button>
      <label className="vs-tl-zoom"><ZoomIn size={16} aria-hidden="true" /><span className="sr-only">Zoom</span>
        <input type="range" min={8} max={300} value={pps} onChange={e => setPps(Number(e.target.value))} /></label>
      <button type="button" onClick={() => act.addTrack('visual')} title="Add a video/text layer"><Plus size={16} /> Layer</button>
      <button type="button" onClick={() => act.addTrack('audio')} title="Add an audio track"><Plus size={16} /> Audio</button>
    </div>
    <div className="vs-tl-body" ref={scrollRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="vs-tl-grid" style={{ width: HEAD + totalW }}>
        <div className="vs-tl-ruler" onPointerDown={scrub}>
          <div className="vs-tl-corner">{fmtTime(duration)}</div>
          {ticks.map(s => <span key={s} style={{ left: HEAD + s * pps }}>{fmtTime(s).replace(/\.\d$/, '')}</span>)}
        </div>
        {order.map(track => {
          const h = ROW[track.kind];
          const siblings = project.tracks.filter(t => t.kind === track.kind).length;
          return <div key={track.id} className={`vs-tl-track kind-${track.kind}${track.hidden ? ' is-hidden' : ''}`} style={{ height: h }} data-track-id={track.id}>
            <div className="vs-tl-head">
              <span title={track.name}>{track.name}</span>
              <span className="vs-tl-head-tools">
                {track.kind !== 'caption' && <button type="button" onClick={() => act.toggle(track.id, 'muted')} aria-label={track.muted ? 'Unmute track' : 'Mute track'} title={track.muted ? 'Unmute' : 'Mute'}>{track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>}
                {track.kind !== 'audio' && <button type="button" onClick={() => act.toggle(track.id, 'hidden')} aria-label={track.hidden ? 'Show track' : 'Hide track'} title={track.hidden ? 'Show' : 'Hide'}>{track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
                {!track.clips.length && siblings > 1 && <button type="button" onClick={() => act.deleteTrack(track.id)} aria-label="Delete empty track" title="Delete track"><Trash2 size={13} /></button>}
              </span>
            </div>
            <div className="vs-tl-lane" onPointerDown={laneClick}>
              {track.clips.map(clip => {
                const asset = project.assets[clip.assetId];
                const w = Math.max(6, clip.duration * pps);
                const label = clip.type === 'text' ? clip.text.content : clip.type === 'caption' ? clip.text : clip.type === 'shape' ? `${clip.shape.kind === 'circle' ? 'Circle' : clip.shape.w >= 1 && clip.shape.h >= 1 ? 'Background' : 'Shape'}` : clip.placeholder && !asset ? 'Add media' : asset?.name ?? 'Missing media';
                const peaks = asset && (assetsPeaks.get(asset.id) ?? asset.peaks);
                const from = asset?.duration ? (clip.in || 0) / asset.duration : 0;
                const to = asset?.duration ? ((clip.in || 0) + clip.duration * (clip.speed || 1)) / asset.duration : 1;
                return <div key={clip.id} className={`vs-clip type-${clip.type}${clip.id === selectedId ? ' is-selected' : ''}${clip.placeholder && !asset ? ' is-placeholder' : ''}`}
                  style={{ left: clip.start * pps, width: w, ...(clip.type === 'video' && asset?.thumb ? { backgroundImage: `url(${asset.thumb})` } : {}), ...(clip.type === 'shape' ? { '--swatch': clip.shape.color } : {}) }}
                  onPointerDown={e => startDrag(e, track, clip, 'move')} role="button" tabIndex={0} aria-label={`${clip.type} clip: ${label}`}
                  onKeyDown={e => { if (e.key === 'Enter') onSelect(clip.id); }}>
                  {(clip.type === 'audio' || clip.type === 'video') && <Waveform peaks={peaks} from={from} to={to} width={w} height={h - 8} />}
                  <span className="vs-clip-label">{clip.transition?.type ? '◇ ' : ''}{label}</span>
                  <i className="vs-trim left" onPointerDown={e => startDrag(e, track, clip, 'left')} aria-hidden="true" />
                  <i className="vs-trim right" onPointerDown={e => startDrag(e, track, clip, 'right')} aria-hidden="true" />
                </div>;
              })}
            </div>
          </div>;
        })}
        <Playhead timeStore={timeStore} pps={pps} scrollRef={scrollRef} playingRef={playingRef} />
      </div>
    </div>
  </div>;
}
