// Preview canvas with click-to-select, drag-to-move and corner-drag-to-resize.
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { fmtTime, frameSize, projectDuration } from '@/video/engine/model';
import { Player } from '@/video/engine/player';
import { useTime } from './ui';

const PREVIEW_SHORT = 720;

function Selection({ player, selectedId, timeStore, scale, onScaleStart }) {
  useTime(timeStore);   // re-render as the playhead moves
  const b = selectedId && player?.bounds.get(selectedId);
  if (!b) return null;
  const style = { left: b.cx * scale, top: b.cy * scale, width: b.w * scale, height: b.h * scale, transform: `translate(-50%, -50%) rotate(${b.rotation || 0}deg)` };
  return <div className="vs-sel" style={style} aria-hidden="true"><i className="vs-sel-handle" onPointerDown={onScaleStart} /></div>;
}

function Timecode({ timeStore, duration }) {
  const t = useTime(timeStore);
  return <span className="vs-timecode">{fmtTime(t)} / {fmtTime(duration)}</span>;
}

export default function Stage({ project, setProject, selectedId, onSelect, timeStore, playerRef, playing, setPlaying, watermark }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef(null);
  const { w, h } = frameSize(project);
  const short = Math.min(w, h);
  const cw = Math.round((w / short) * PREVIEW_SHORT), ch = Math.round((h / short) * PREVIEW_SHORT);

  useEffect(() => {
    const p = new Player(canvasRef.current, { onTime: time => timeStore.set(time), onEnd: () => setPlaying(false) });
    p.time = timeStore.get();
    playerRef.current = p;
    setPlayer(p);
    return () => { p.destroy(); playerRef.current = null; };
  }, [playerRef, timeStore, setPlaying]);

  // Redraw on every change, then re-render so the selection box uses the new clip bounds.
  const [, setDrawn] = useState(0);
  useEffect(() => {
    if (!player) return;
    player.watermark = watermark;
    player.setProject(project);
    setDrawn(n => n + 1);
  }, [player, project, watermark]);

  // Fit the canvas inside the available space.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / cw, r.height / ch);
      setBox({ w: Math.floor(cw * s), h: Math.floor(ch * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cw, ch]);

  const scale = box.w / cw;   // display px per canvas px

  const hit = (x, y) => {
    const time = timeStore.get();
    const visual = project.tracks.filter(tr => tr.kind === 'visual' && !tr.hidden).reverse();
    for (const tr of visual) {
      for (const c of [...tr.clips].reverse()) {
        if (time < c.start || time >= c.start + c.duration) continue;
        const b = player.bounds.get(c.id);
        if (b && Math.abs(x - b.cx) <= b.w / 2 && Math.abs(y - b.cy) <= b.h / 2) return c;
      }
    }
    return null;
  };

  const toCanvas = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };

  const down = e => {
    if (!player || e.button !== 0) return;
    const [x, y] = toCanvas(e);
    const clip = hit(x, y);
    onSelect(clip?.id ?? null);
    if (!clip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode: 'move', id: clip.id, x: e.clientX, y: e.clientY, ox: clip.x, oy: clip.y };
  };

  const scaleStart = e => {
    e.stopPropagation();
    const b = player.bounds.get(selectedId);
    const clip = project.tracks.flatMap(tr => tr.clips).find(c => c.id === selectedId);
    if (!b || !clip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toCanvas(e);
    drag.current = { mode: 'scale', id: clip.id, cx: b.cx, cy: b.cy, d0: Math.hypot(x - b.cx, y - b.cy) || 1, os: clip.scale };
  };

  const move = e => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'move') {
      const dx = (e.clientX - d.x) / box.w, dy = (e.clientY - d.y) / box.h;
      let nx = d.ox + dx, ny = d.oy + dy;
      if (Math.abs(nx - 0.5) < 0.01) nx = 0.5;   // snap to center
      if (Math.abs(ny - 0.5) < 0.01) ny = 0.5;
      setProject(p => ({ ...p, tracks: p.tracks.map(tr => ({ ...tr, clips: tr.clips.map(c => (c.id === d.id ? { ...c, x: nx, y: ny } : c)) })) }), { key: `move:${d.id}` });
    } else {
      const [x, y] = toCanvas(e);
      const s = Math.max(0.05, Math.min(6, d.os * (Math.hypot(x - d.cx, y - d.cy) / d.d0)));
      setProject(p => ({ ...p, tracks: p.tracks.map(tr => ({ ...tr, clips: tr.clips.map(c => (c.id === d.id ? { ...c, scale: s } : c)) })) }), { key: `scale:${d.id}` });
    }
  };
  const up = () => { drag.current = null; };

  const duration = projectDuration(project);
  const toggle = () => { if (!player) return; if (playing) { player.pause(); setPlaying(false); } else { player.play(); setPlaying(true); } };
  const jump = time => { player?.pause(); setPlaying(false); player?.seek(time); timeStore.set(time); };

  return <div className="vs-stage">
    <div className="vs-stage-fit" ref={wrapRef}>
      <div className="vs-canvas-box" style={{ width: box.w, height: box.h }}>
        <canvas ref={canvasRef} width={cw} height={ch} style={{ width: box.w, height: box.h }} aria-label="Video preview" />
        <div className="vs-stage-hit" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onDoubleClick={() => document.getElementById('vs-text-content')?.focus()}>
          <Selection player={player} selectedId={selectedId} timeStore={timeStore} scale={scale} onScaleStart={scaleStart} />
        </div>
      </div>
    </div>
    <div className="vs-transport">
      <button type="button" onClick={() => jump(0)} aria-label="Go to start"><SkipBack size={16} /></button>
      <button type="button" className="vs-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <button type="button" onClick={() => jump(duration)} aria-label="Go to end"><SkipForward size={16} /></button>
      <Timecode timeStore={timeStore} duration={duration} />
    </div>
  </div>;
}
