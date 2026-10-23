// Vivid Video Studio project model. A project is plain JSON (saved to /api/video/projects):
//   tracks: visual tracks draw bottom to top, then caption tracks; audio tracks are heard only.
//   clips:  { id, type, start, duration, ... } with times in seconds on the timeline.
//   assets: metadata for media files, which stay in this browser (see media.js).
// Positions are fractions of the frame (x, y = 0..1, center of the clip) and sizes are in
// "design pixels" on a frame whose short side is 1080, so a project renders the same at any resolution.

export const ASPECTS = {
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9', hint: 'YouTube, websites' },
  '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16', hint: 'TikTok, Reels, Shorts' },
  '1:1': { w: 1080, h: 1080, label: 'Square 1:1', hint: 'Instagram, Facebook' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5', hint: 'Instagram feed' },
};

export const LEVELS = { basic: 0, standard: 1, pro: 2 };
export const LEVEL_LABEL = { basic: 'Free', standard: 'Creator', pro: 'Pro' };
export const allowed = (level, tierLevel) => (LEVELS[level] ?? 0) <= (LEVELS[tierLevel] ?? 0);

let counter = 0;
export const uid = (prefix = 'c') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const FONTS = ['Inter', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Anton', 'Playfair Display', 'DM Serif Display', 'Lora', 'Merriweather', 'Roboto Slab', 'Raleway', 'Space Grotesk', 'Pacifico', 'Caveat'];

export function emptyProject(aspect = '16:9', title = 'Untitled video') {
  return {
    v: 1, title, aspect, fps: 30, background: '#000000', brandKitId: null,
    captionStyle: { preset: 'classic', font: 'Montserrat', size: 64, color: '#ffffff', highlight: '#ffd400', position: 0.82, uppercase: false },
    assets: {},
    tracks: [
      { id: uid('t'), kind: 'visual', name: 'Main', clips: [] },
      { id: uid('t'), kind: 'visual', name: 'Overlay', clips: [] },
      { id: uid('t'), kind: 'visual', name: 'Text', clips: [] },
      { id: uid('t'), kind: 'caption', name: 'Captions', clips: [] },
      { id: uid('t'), kind: 'audio', name: 'Voice', clips: [] },
      { id: uid('t'), kind: 'audio', name: 'Music', clips: [] },
    ],
  };
}

export const frameSize = project => ASPECTS[project.aspect] ?? ASPECTS['16:9'];

export function projectDuration(project) {
  let end = 0;
  for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return end;
}

export const findClip = (project, id) => {
  for (const track of project.tracks) {
    const clip = track.clips.find(c => c.id === id);
    if (clip) return { track, clip };
  }
  return null;
};

const DEFAULT_TEXT = { content: 'Your text', font: 'Montserrat', size: 96, weight: 800, color: '#ffffff', align: 'center', bg: '', bgPad: 24, stroke: '', strokeWidth: 0, shadow: true, glow: '', lineHeight: 1.15, maxWidth: 0.86, uppercase: false, letterSpacing: 0 };
// kind: rect | circle | line. color2 set = linear gradient at `angle` degrees.
const DEFAULT_SHAPE = { kind: 'rect', color: '#1f6feb', color2: '', w: 0.5, h: 0.2, radius: 0, angle: 90 };

// Defaults for each clip type. Media clips reference an asset; text and shapes are drawn.
export function makeClip(type, props = {}) {
  const base = { id: uid(), type, start: 0, duration: 5, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, transition: null, anim: { in: 'none', out: 'none' }, effects: [] };
  if (type === 'video' || type === 'image') return { ...base, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, fit: 'cover', filter: 'none', adjust: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }, radius: 0, ...props };
  if (type === 'audio') return { id: base.id, type, start: 0, duration: 5, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, role: 'music', ...props };
  if (type === 'text') return { ...base, duration: 4, anim: { in: 'fade', out: 'fade' }, ...props, text: { ...DEFAULT_TEXT, ...props.text } };
  if (type === 'shape') return { ...base, anim: { in: 'fade', out: 'fade' }, ...props, shape: { ...DEFAULT_SHAPE, ...props.shape } };
  if (type === 'caption') return { id: base.id, type, start: 0, duration: 2, text: '', words: [], ...props };
  return { ...base, ...props };
}

// ---------- catalogs (each item carries the plan level it needs) ----------

export const TRANSITIONS = [
  { id: 'fade', label: 'Crossfade', level: 'basic' },
  { id: 'fadeblack', label: 'Dip to black', level: 'basic' },
  { id: 'fadewhite', label: 'Dip to white', level: 'standard' },
  { id: 'slideleft', label: 'Slide left', level: 'standard' },
  { id: 'slideright', label: 'Slide right', level: 'standard' },
  { id: 'slideup', label: 'Slide up', level: 'standard' },
  { id: 'wipeleft', label: 'Wipe', level: 'standard' },
  { id: 'circle', label: 'Circle reveal', level: 'standard' },
  { id: 'zoom', label: 'Zoom in', level: 'standard' },
  { id: 'blur', label: 'Blur dissolve', level: 'pro' },
  { id: 'spin', label: 'Spin', level: 'pro' },
  { id: 'whip', label: 'Whip pan', level: 'pro' },
  { id: 'glitch', label: 'Glitch', level: 'pro' },
];

// Canvas filter strings. "overlay" adds a color wash (soft-light) for grades a filter cannot make.
export const FILTERS = [
  { id: 'none', label: 'Original', level: 'basic', css: '' },
  { id: 'vivid', label: 'Vivid', level: 'basic', css: 'saturate(1.4) contrast(1.08)' },
  { id: 'bw', label: 'Black & white', level: 'basic', css: 'grayscale(1) contrast(1.1)' },
  { id: 'warm', label: 'Warm', level: 'basic', css: 'sepia(.22) saturate(1.2) brightness(1.03)' },
  { id: 'cool', label: 'Cool', level: 'basic', css: 'hue-rotate(-12deg) saturate(1.1) brightness(1.02)' },
  { id: 'vintage', label: 'Vintage', level: 'standard', css: 'sepia(.5) contrast(.9) brightness(1.06) saturate(.85)' },
  { id: 'matte', label: 'Matte', level: 'standard', css: 'contrast(.85) brightness(1.08) saturate(.9)' },
  { id: 'dramatic', label: 'Dramatic', level: 'standard', css: 'contrast(1.35) saturate(1.15) brightness(.95)' },
  { id: 'fresh', label: 'Fresh', level: 'standard', css: 'saturate(1.25) brightness(1.06) hue-rotate(6deg)' },
  { id: 'noir', label: 'Noir', level: 'pro', css: 'grayscale(1) contrast(1.6) brightness(.9)' },
  { id: 'cinematic', label: 'Cinematic teal & orange', level: 'pro', css: 'contrast(1.15) saturate(.9)', overlay: ['#00707a', '#ff8a3d'] },
  { id: 'golden', label: 'Golden hour', level: 'pro', css: 'sepia(.3) saturate(1.35) brightness(1.05)', overlay: ['#ff9a3d', '#ffd27a'] },
  { id: 'neon', label: 'Neon night', level: 'pro', css: 'saturate(1.6) contrast(1.2) hue-rotate(-20deg)', overlay: ['#3a0ca3', '#f72585'] },
];

export const EFFECTS = [
  { id: 'kenburns', label: 'Slow zoom (Ken Burns)', level: 'basic', params: { amount: 0.12 } },
  { id: 'blurfill', label: 'Blurred background fill', level: 'standard', params: {} },
  { id: 'vignette', label: 'Vignette', level: 'standard', params: { amount: 0.55 } },
  { id: 'shadow', label: 'Drop shadow', level: 'standard', params: {} },
  { id: 'grain', label: 'Film grain', level: 'pro', params: { amount: 0.12 } },
  { id: 'glitch', label: 'Glitch', level: 'pro', params: { amount: 0.5 } },
  { id: 'rgbsplit', label: 'RGB split', level: 'pro', params: { amount: 8 } },
  { id: 'shake', label: 'Camera shake', level: 'pro', params: { amount: 10 } },
  { id: 'chroma', label: 'Green screen (chroma key)', level: 'pro', params: { color: '#00ff00', tolerance: 0.35 } },
];

export const TEXT_ANIMS = [
  { id: 'none', label: 'None', level: 'basic' },
  { id: 'fade', label: 'Fade', level: 'basic' },
  { id: 'rise', label: 'Rise', level: 'basic' },
  { id: 'pop', label: 'Pop', level: 'standard' },
  { id: 'slide', label: 'Slide in', level: 'standard' },
  { id: 'typewriter', label: 'Typewriter', level: 'standard' },
  { id: 'wipe', label: 'Wipe', level: 'standard' },
  { id: 'bounce', label: 'Bounce', level: 'pro' },
  { id: 'blur', label: 'Blur in', level: 'pro' },
  { id: 'words', label: 'Word by word', level: 'pro' },
  { id: 'spread', label: 'Letter spread', level: 'pro' },
];

export const CAPTION_PRESETS = [
  { id: 'classic', label: 'Classic', level: 'basic' },
  { id: 'boxed', label: 'Boxed', level: 'basic' },
  { id: 'highlight', label: 'Word highlight', level: 'standard' },
  { id: 'pop', label: 'Big word pop', level: 'pro' },
];

export const TEXT_PRESETS = [
  { id: 'title', label: 'Title', level: 'basic', text: { size: 120, weight: 800, font: 'Montserrat' } },
  { id: 'subtitle', label: 'Subtitle', level: 'basic', text: { size: 64, weight: 600, font: 'Inter' }, y: 0.62 },
  { id: 'body', label: 'Body text', level: 'basic', text: { size: 48, weight: 500, font: 'Inter', shadow: false, bg: '#000000aa' } },
  { id: 'lower', label: 'Lower third', level: 'basic', text: { size: 52, weight: 700, font: 'Inter', align: 'left', bg: '#1f6febee', maxWidth: 0.6 }, x: 0.32, y: 0.84, anim: { in: 'slide', out: 'fade' } },
  { id: 'quote', label: 'Quote', level: 'standard', text: { size: 76, weight: 400, font: 'Playfair Display', content: '“Your quote here”' } },
  { id: 'impact', label: 'Impact', level: 'standard', text: { size: 150, weight: 400, font: 'Anton', uppercase: true, stroke: '#000000', strokeWidth: 6 }, anim: { in: 'pop', out: 'fade' } },
  { id: 'neon', label: 'Neon', level: 'pro', text: { size: 110, weight: 400, font: 'Pacifico', color: '#ff4fd8', shadow: true, glow: '#ff4fd8' }, anim: { in: 'blur', out: 'fade' } },
  { id: 'handwritten', label: 'Handwritten', level: 'standard', text: { size: 100, weight: 700, font: 'Caveat' } },
];

const levelOf = (list, id) => list.find(x => x.id === id)?.level ?? 'basic';

// The highest plan level this project uses (checked again by the server before export).
export function projectLevel(project) {
  let max = 0;
  const bump = level => { max = Math.max(max, LEVELS[level] ?? 0); };
  bump(levelOf(CAPTION_PRESETS, project.captionStyle?.preset));
  for (const track of project.tracks) for (const c of track.clips) {
    if (c.transition?.type) bump(levelOf(TRANSITIONS, c.transition.type));
    if (c.filter) bump(levelOf(FILTERS, c.filter));
    for (const e of c.effects ?? []) bump(levelOf(EFFECTS, e.id));
    if (c.anim) { bump(levelOf(TEXT_ANIMS, c.anim.in)); bump(levelOf(TEXT_ANIMS, c.anim.out)); }
    if (c.keyframes && Object.values(c.keyframes).some(k => k?.length)) bump('pro');
    if (c.speed && c.speed !== 1) bump('standard');
    if (c.type === 'audio' && c.duck) bump('standard');
    if (c.text?.glow) bump('pro');
  }
  return Object.keys(LEVELS).find(k => LEVELS[k] === max);
}

// ---------- timeline edits (pure: they return a new project) ----------

export const mapClips = (project, fn) => ({ ...project, tracks: project.tracks.map(t => ({ ...t, clips: t.clips.map(c => fn(c, t)) })) });

export const updateClip = (project, id, patch) => mapClips(project, c => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c));

export function removeClip(project, id) {
  return { ...project, tracks: project.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== id) })) };
}

export function addClip(project, trackId, clip) {
  return { ...project, tracks: project.tracks.map(t => (t.id === trackId ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t)) };
}

export function moveClip(project, id, toTrackId, start) {
  const found = findClip(project, id);
  if (!found) return project;
  const clip = { ...found.clip, start: Math.max(0, start) };
  const without = removeClip(project, id);
  return addClip(without, toTrackId ?? found.track.id, clip);
}

// Split a clip at timeline time t into two clips.
export function splitClip(project, id, t) {
  const found = findClip(project, id);
  if (!found) return project;
  const { clip } = found;
  const cut = t - clip.start;
  if (cut <= 0.05 || cut >= clip.duration - 0.05) return project;
  const left = { ...clip, duration: cut, anim: clip.anim ? { ...clip.anim, out: 'none' } : clip.anim, fadeOut: 0 };
  const right = { ...clip, id: uid(), start: t, duration: clip.duration - cut, transition: null, anim: clip.anim ? { ...clip.anim, in: 'none' } : clip.anim, fadeIn: 0 };
  if ('in' in clip) right.in = clip.in + cut * (clip.speed || 1);
  if (clip.type === 'caption') {
    left.words = clip.words.filter(w => w.start < cut);
    right.words = clip.words.filter(w => w.start >= cut).map(w => ({ ...w, start: w.start - cut, end: w.end - cut }));
  }
  const tracks = project.tracks.map(tr => (tr.id === found.track.id ? { ...tr, clips: tr.clips.flatMap(c => (c.id === id ? [left, right] : [c])) } : tr));
  return { ...project, tracks };
}

// Closes the gap a deleted or shortened clip leaves on its track ("ripple").
export function rippleTrack(project, trackId) {
  return {
    ...project,
    tracks: project.tracks.map(t => {
      if (t.id !== trackId) return t;
      let cursor = 0;
      return { ...t, clips: [...t.clips].sort((a, b) => a.start - b.start).map(c => { const n = { ...c, start: cursor }; cursor += c.duration; return n; }) };
    }),
  };
}

// End of the last clip on a track (where new clips are appended).
export const trackEnd = track => track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);

export const mediaMaxDuration = (clip, asset) =>
  clip.type === 'image' || !asset?.duration ? Infinity : Math.max(0.1, (asset.duration - (clip.in || 0)) / (clip.speed || 1));

// Linear keyframe value at clip-local time (Pro). keyframes: { prop: [{ t, v }] }
export function keyframeValue(clip, prop, localT, fallback) {
  const list = clip.keyframes?.[prop];
  if (!list?.length) return fallback;
  if (localT <= list[0].t) return list[0].v;
  for (let i = 1; i < list.length; i++) {
    if (localT <= list[i].t) {
      const a = list[i - 1], b = list[i];
      const p = (localT - a.t) / Math.max(0.0001, b.t - a.t);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      return a.v + (b.v - a.v) * e;
    }
  }
  return list[list.length - 1].v;
}

export const fmtTime = s => {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60), sec = Math.floor(v % 60), f = Math.floor((v % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${f}`;
};
