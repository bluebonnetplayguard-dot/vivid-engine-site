// Media library: uploaded, stock and voiceover files are kept in this browser (IndexedDB), never
// uploaded to our servers. Projects saved to the account reference them by id, so a project opened
// on another device asks for the files again ("relink").
import { uid } from './model';

const DB_NAME = 'vivid-video-studio';
const STORE = 'media';
let dbPromise = null;

function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage was blocked. Free up disk space and try again.'));
  });
}

const urls = new Map();
const blobs = new Map();

export async function getBlob(id) {
  if (blobs.has(id)) return blobs.get(id);
  const rec = await tx('readonly', s => s.get(id)).catch(() => null);
  if (rec?.blob) blobs.set(id, rec.blob);
  return rec?.blob ?? null;
}

export async function getUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function hasMedia(id) { return !!(await getBlob(id)); }

export async function deleteMedia(id) {
  await tx('readwrite', s => s.delete(id)).catch(() => {});
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id); blobs.delete(id);
}

const kindOf = type => (type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : null);

const once = (el, ok, fail = 'error', ms = 20000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out reading the file.')); }, ms);
  const onOk = () => { cleanup(); resolve(); };
  const onFail = () => { cleanup(); reject(new Error('This file could not be read. Try MP4, MOV, WebM, JPG, PNG, MP3 or WAV.')); };
  const cleanup = () => { clearTimeout(timer); el.removeEventListener(ok, onOk); el.removeEventListener(fail, onFail); };
  el.addEventListener(ok, onOk); el.addEventListener(fail, onFail);
});

function thumbFrom(img, w, h) {
  const c = document.createElement('canvas');
  const s = 200 / Math.max(w, h);
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

// Waveform peaks (0..1) for the timeline, from the file's audio. Skipped for very large files.
async function peaksOf(blob, count = 400) {
  if (blob.size > 200 * 1024 * 1024) return null;
  try {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(1, 2, 8000);
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / count));
    const peaks = [];
    for (let i = 0; i < count; i++) {
      let max = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 4) max = Math.max(max, Math.abs(data[j]));
      peaks.push(Math.round(max * 100) / 100);
    }
    return peaks;
  } catch { return null; }   // no audio track
}

async function probe(blob, kind) {
  const url = URL.createObjectURL(blob);
  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      await once(img, 'load');
      return { width: img.naturalWidth, height: img.naturalHeight, duration: 0, thumb: thumbFrom(img, img.naturalWidth, img.naturalHeight) };
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'auto'; el.muted = true; el.src = url;
    if (kind === 'video') el.playsInline = true;
    await once(el, 'loadedmetadata');
    let duration = el.duration;
    if (!Number.isFinite(duration)) {   // some WebM files report Infinity until read through
      el.currentTime = 1e7; await once(el, 'seeked').catch(() => {});
      duration = el.duration; el.currentTime = 0;
    }
    const out = { duration: Number.isFinite(duration) ? duration : 0, width: 0, height: 0, thumb: null };
    if (kind === 'video') {
      out.width = el.videoWidth; out.height = el.videoHeight;
      el.currentTime = Math.min(1, out.duration / 3);
      await once(el, 'seeked').catch(() => {});
      if (el.videoWidth) out.thumb = thumbFrom(el, el.videoWidth, el.videoHeight);
    }
    el.removeAttribute('src'); el.load();
    return out;
  } finally { URL.revokeObjectURL(url); }
}

// Adds a file to this browser's library and returns the asset entry for the project.
export async function importBlob(blob, { name, source = 'local', credit = null } = {}) {
  const kind = kindOf(blob.type);
  if (!kind) throw new Error('That file type is not supported. Use video, image or audio files.');
  const meta = await probe(blob, kind);
  const peaks = kind === 'image' ? null : await peaksOf(blob);
  const asset = { id: uid('m'), name: (name || 'media').slice(0, 120), kind, mime: blob.type, size: blob.size, source, credit, hasAudio: kind === 'audio' || !!peaks, ...meta, peaks };
  await tx('readwrite', s => s.put({ ...asset, blob, createdAt: Date.now() }));
  blobs.set(asset.id, blob);
  return asset;
}

export const importFile = file => importBlob(file, { name: file.name });

// Puts a file back under an existing asset id (relinking media on a new device).
export async function relink(asset, file) {
  if (kindOf(file.type) !== asset.kind) throw new Error(`Choose a ${asset.kind} file.`);
  await tx('readwrite', s => s.put({ ...asset, blob: file, createdAt: Date.now() }));
  blobs.set(asset.id, file);
  if (urls.has(asset.id)) { URL.revokeObjectURL(urls.get(asset.id)); urls.delete(asset.id); }
}

// Every file in this browser's library (for the Media panel), newest first.
export async function listLibrary() {
  const all = await tx('readonly', s => s.getAll()).catch(() => []);
  return (all || []).map(({ blob: _blob, ...meta }) => meta).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// ---------- elements for drawing ----------

// Keeps one <video> per clip (so two clips of the same file can show different moments)
// and one decoded image per asset. Each preview and export uses its own pool.
export class MediaPool {
  constructor() { this.videos = new Map(); this.images = new Map(); this.audios = new Map(); this.pending = new Set(); }

  async video(clip) {
    let el = this.videos.get(clip.id);
    if (el && el.dataset.asset === clip.assetId) return el;
    const url = await getUrl(clip.assetId);
    if (!url) return null;
    el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    el.dataset.asset = clip.assetId;
    el.src = url;
    this.videos.set(clip.id, el);
    return el;
  }

  async image(assetId) {
    if (this.images.has(assetId)) return this.images.get(assetId);
    const blob = await getBlob(assetId);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (bmp) this.images.set(assetId, bmp);
    return bmp;
  }

  async audio(clip) {
    let el = this.audios.get(clip.id);
    if (el && el.dataset.asset === clip.assetId) return el;
    const url = await getUrl(clip.assetId);
    if (!url) return null;
    el = new Audio(); el.preload = 'auto'; el.dataset.asset = clip.assetId; el.src = url;
    this.audios.set(clip.id, el);
    return el;
  }

  // What the renderer draws for a clip, if it is ready.
  drawable(clip) {
    if (clip.type === 'image') {
      const bmp = this.images.get(clip.assetId);
      if (!bmp) { this.warm(clip); return null; }
      return { img: bmp, w: bmp.width, h: bmp.height };
    }
    const el = this.videos.get(clip.id);
    if (!el || el.dataset.asset !== clip.assetId) { this.warm(clip); return null; }
    if (el.readyState < 2 || !el.videoWidth) return null;
    return { img: el, w: el.videoWidth, h: el.videoHeight };
  }

  warm(clip) {
    const key = `${clip.id}:${clip.assetId}`;
    if (this.pending.has(key)) return;
    this.pending.add(key);
    (clip.type === 'image' ? this.image(clip.assetId) : clip.type === 'audio' ? this.audio(clip) : this.video(clip)).finally(() => this.pending.delete(key));
  }

  // Drops elements for clips that no longer exist.
  prune(project) {
    const ids = new Set(project.tracks.flatMap(t => t.clips.map(c => c.id)));
    for (const [id, el] of [...this.videos, ...this.audios]) if (!ids.has(id)) { el.pause(); el.removeAttribute('src'); el.load(); this.videos.delete(id); this.audios.delete(id); }
  }

  destroy() {
    for (const el of [...this.videos.values(), ...this.audios.values()]) { el.pause(); el.removeAttribute('src'); el.load(); }
    for (const b of this.images.values()) b.close?.();
    this.videos.clear(); this.audios.clear(); this.images.clear();
  }
}

// Seeks a video element and waits until that frame can be drawn.
// The first call always seeks: a freshly loaded element at 0 s may not have a drawable frame yet.
export function seekVideo(el, time) {
  const target = Math.max(0, Math.min(time, (el.duration || time) - 0.001));
  if (el.dataset.primed && Math.abs(el.currentTime - target) < 0.001 && el.readyState >= 2) return Promise.resolve();
  el.dataset.primed = '1';
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); el.removeEventListener('seeked', done); resolve(); };
    const timer = setTimeout(done, 3000);
    el.addEventListener('seeked', done);
    el.currentTime = target;
  });
}

export async function waitReady(el, ms = 8000) {
  if (el.readyState >= 2) return;
  await once(el, 'loadeddata', 'error', ms).catch(() => {});
}
