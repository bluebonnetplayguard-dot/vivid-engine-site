// Live preview: plays the project on a canvas with sound, keeping each clip's <video>/<audio>
// element in step with the timeline clock. Exports do not use this (they render frame by frame).
import { duckAt } from './audio';
import { MediaPool, seekVideo } from './media';
import { projectDuration } from './model';
import { drawFrame, mediaNeeds } from './renderer';

export class Player {
  constructor(canvas, { onTime, onEnd } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pool = new MediaPool();
    this.project = null;
    this.time = 0;
    this.playing = false;
    this.onTime = onTime;
    this.onEnd = onEnd;
    this.bounds = new Map();
    this.brand = null;
    this.watermark = false;
    this.raf = 0;
    this.redrawSoon = this.redrawSoon.bind(this);
    this.tick = this.tick.bind(this);
  }

  setProject(project) {
    this.project = project;
    this.pool.prune(project);
    if (!this.playing) this.seek(this.time);
  }

  setBrand(brand) {
    if (!brand?.logo) { this.brand = null; this.redraw(); return; }
    const img = new Image();
    img.onload = () => this.redraw();
    img.src = brand.logo;
    this.brand = { logo: img, position: brand.logoPosition };
  }

  env() {
    const { width: W, height: H } = this.canvas;
    return { W, H, watermark: this.watermark, brand: this.brand, bounds: this.bounds, source: clip => this.pool.drawable(clip), missingLabel: clip => (this.project?.assets?.[clip.assetId] ? 'Loading media…' : clip.placeholder ? 'Select, then pick a photo or video in Media' : 'Media missing') };
  }

  redraw() {
    if (!this.project) return;
    drawFrame(this.ctx, this.project, this.time, this.env());
  }

  // Redraw once more media has loaded or a seek has landed.
  redrawSoon() {
    clearTimeout(this.soon);
    this.soon = setTimeout(() => { if (!this.playing) this.redraw(); }, 60);
  }

  async seek(t) {
    this.time = Math.max(0, t);
    if (!this.project) return;
    this.redraw();
    const jobs = mediaNeeds(this.project, this.time).map(async ({ clip, sourceT }) => {
      if (clip.type === 'image') { await this.pool.image(clip.assetId); return; }
      const el = await this.pool.video(clip);
      if (!el) return;
      if (!el.dataset.hooked) { el.dataset.hooked = '1'; el.addEventListener('loadeddata', this.redrawSoon); }
      if (!this.playing) await seekVideo(el, sourceT);
    });
    await Promise.all(jobs);
    if (!this.playing) this.redraw();
  }

  play() {
    if (!this.project || this.playing) return;
    const duration = projectDuration(this.project);
    if (this.time >= duration - 0.05) this.time = 0;
    this.playing = true;
    this.clockStart = performance.now() - this.time * 1000;
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const el of [...this.pool.videos.values(), ...this.pool.audios.values()]) el.pause();
    this.seek(this.time);
  }

  // Keeps media elements playing at the right spot; nudges any that drift more than 0.25 s.
  syncMedia() {
    const p = this.project;
    const t = this.time;
    const visible = new Set();
    const duck = duckAt(p, t);
    for (const track of p.tracks) {
      for (const clip of track.clips) {
        const isVideo = clip.type === 'video', isAudio = clip.type === 'audio';
        if (!isVideo && !isAudio) continue;
        const local = t - clip.start;
        const active = local >= 0 && local < clip.duration;
        const needed = active || (isVideo && mediaNeeds(p, t).some(n => n.clip.id === clip.id));
        if (!needed) continue;
        visible.add(clip.id);
        const el = isVideo ? this.pool.videos.get(clip.id) : this.pool.audios.get(clip.id);
        if (!el) { this.pool.warm(clip); continue; }
        const target = (clip.in || 0) + local * (clip.speed || 1);
        el.playbackRate = clip.speed || 1;
        let vol = clip.volume ?? 1;
        if (clip.fadeIn && local < clip.fadeIn) vol *= Math.max(0, local / clip.fadeIn);
        if (clip.fadeOut && clip.duration - local < clip.fadeOut) vol *= Math.max(0, (clip.duration - local) / clip.fadeOut);
        if (isAudio && clip.duck) vol *= duck;
        const silent = track.muted || clip.muted || !active || (isVideo && track.kind !== 'visual');
        el.muted = silent;
        el.volume = Math.max(0, Math.min(1, vol));
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = Math.max(0, target);
        if (el.paused && target < (el.duration || Infinity)) el.play().catch(() => {});
      }
    }
    for (const [id, el] of [...this.pool.videos, ...this.pool.audios]) if (!visible.has(id) && !el.paused) el.pause();
  }

  tick() {
    if (!this.playing) return;
    const duration = projectDuration(this.project);
    this.time = (performance.now() - this.clockStart) / 1000;
    if (this.time >= duration) {
      this.time = duration;
      this.pause();
      this.onTime?.(this.time);
      this.onEnd?.();
      return;
    }
    this.syncMedia();
    this.redraw();
    this.onTime?.(this.time);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.soon);
    this.pool.destroy();
  }
}
