// Draws one frame of a project at time t. The editor preview and the exporter both call
// drawFrame, so what people see while editing is exactly what they export.
//
// env: {
//   W, H            output size in pixels
//   source(clip, sourceTime) -> { img, w, h } | null   the media frame to draw (video element, image, bitmap)
//   watermark       draw the free-plan watermark
//   brand           { logo: HTMLImageElement, position } | null
//   bounds          optional Map, filled with each drawn clip's box (for selecting and dragging in the editor)
// }
import { EFFECTS, FILTERS, frameSize, keyframeValue } from './model';

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOut = p => 1 - (1 - p) ** 3;
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const rand = seed => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const effectOf = (clip, id) => clip.effects?.find(e => e.id === id);
const param = (clip, id, key) => effectOf(clip, id)?.params?.[key] ?? EFFECTS.find(e => e.id === id)?.params?.[key];

let grainCanvas = null;
function grainPattern(ctx) {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = grainCanvas.height = 256;
    const g = grainCanvas.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainCanvas, 'repeat');
}

let keyCanvas = null;
// Green screen: removes pixels near the key color. Runs on a copy capped at 1280 px wide.
function chromaKey(src, w, h, color, tolerance) {
  const scale = Math.min(1, 1280 / w);
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  keyCanvas ||= document.createElement('canvas');
  if (keyCanvas.width !== cw || keyCanvas.height !== ch) { keyCanvas.width = cw; keyCanvas.height = ch; }
  const g = keyCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, cw, ch);
  g.drawImage(src, 0, 0, cw, ch);
  const data = g.getImageData(0, 0, cw, ch);
  const kr = parseInt(color.slice(1, 3), 16), kg = parseInt(color.slice(3, 5), 16), kb = parseInt(color.slice(5, 7), 16);
  const tol = tolerance * 441, soft = tol * 0.6;
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
    if (dist < tol) {
      d[i + 3] = dist <= soft ? 0 : Math.round(255 * (dist - soft) / (tol - soft));
      if (kg > kr && kg > kb && d[i + 1] > Math.max(d[i], d[i + 2])) d[i + 1] = Math.max(d[i], d[i + 2]); // remove green spill
    }
  }
  g.putImageData(data, 0, 0);
  return keyCanvas;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Opacity, offset, scale and blur from a text/shape in or out animation.
function animState(clip, localT) {
  const s = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, reveal: 1, spread: 0, rotate: 0 };
  const inId = clip.anim?.in ?? 'none', outId = clip.anim?.out ?? 'none';
  const inDur = Math.min(0.6, clip.duration / 2), outDur = Math.min(0.45, clip.duration / 2);
  const apply = (id, p, dir) => {
    const e = easeOut(p);
    switch (id) {
      case 'fade': s.alpha *= p; break;
      case 'rise': s.alpha *= p; s.dy += (1 - e) * 60 * dir; break;
      case 'pop': s.alpha *= clamp01(p * 2); s.scale *= dir > 0 ? 0.6 + 0.4 * e + Math.sin(p * Math.PI) * 0.08 : 0.8 + 0.2 * e; break;
      case 'slide': s.alpha *= p; s.dx += (1 - e) * -220 * dir; break;
      case 'typewriter': case 'words': case 'wipe': s.reveal = Math.min(s.reveal, dir > 0 ? p : 1); if (dir < 0) s.alpha *= p; s.mode = id; break;
      case 'bounce': { const b = p < 1 ? Math.abs(Math.cos(p * Math.PI * 2.5)) * (1 - p) : 0; s.alpha *= clamp01(p * 3); s.dy -= b * 120 * dir; break; }
      case 'blur': s.alpha *= p; s.blur += (1 - e) * 24; break;
      case 'spread': s.alpha *= p; s.spread += (1 - e) * 0.6; break;
      default: break;
    }
  };
  if (inId !== 'none' && localT < inDur) apply(inId, clamp01(localT / inDur), 1);
  else if (['typewriter', 'words', 'wipe'].includes(inId)) s.mode = inId;
  const toEnd = clip.duration - localT;
  if (outId !== 'none' && toEnd < outDur) apply(outId === 'typewriter' || outId === 'words' || outId === 'wipe' ? 'fade' : outId, clamp01(toEnd / outDur), -1);
  return s;
}

function cssFilter(clip, k, extraBlur = 0) {
  const parts = [];
  const preset = FILTERS.find(f => f.id === clip.filter);
  if (preset?.css) parts.push(preset.css);
  const a = clip.adjust ?? {};
  if (a.brightness) parts.push(`brightness(${1 + a.brightness})`);
  if (a.contrast) parts.push(`contrast(${1 + a.contrast})`);
  if (a.saturation) parts.push(`saturate(${1 + a.saturation})`);
  const blur = (a.blur || 0) * 20 * k + extraBlur;
  if (blur > 0.2) parts.push(`blur(${blur.toFixed(1)}px)`);
  return parts.join(' ') || 'none';
}

// ---------- clip drawing ----------

function drawMedia(ctx, clip, localT, env, mod) {
  const { W, H } = env;
  const k = Math.min(W, H) / 1080;
  const sourceT = (clip.in || 0) + localT * (clip.speed || 1);
  const src = env.source(clip, sourceT);
  const x = keyframeValue(clip, 'x', localT, clip.x) * W, y = keyframeValue(clip, 'y', localT, clip.y) * H;
  let scale = keyframeValue(clip, 'scale', localT, clip.scale);
  const rotation = keyframeValue(clip, 'rotation', localT, clip.rotation || 0);
  const alpha = keyframeValue(clip, 'opacity', localT, clip.opacity ?? 1) * mod.alpha;
  if (alpha <= 0.001) return;

  if (!src) {   // placeholder, media not on this device, or still loading: a labeled box in the clip's frame
    const bw = W * scale * mod.scale, bh = H * scale * mod.scale;
    ctx.save(); ctx.globalAlpha = alpha * 0.92;
    ctx.translate(x + mod.dx, y + mod.dy);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, (clip.radius || 0) * k); ctx.fillStyle = '#1b2330'; ctx.fill();
    ctx.setLineDash([14 * k, 10 * k]); ctx.lineWidth = 3 * k; ctx.strokeStyle = '#4b5d78'; ctx.stroke();
    ctx.fillStyle = '#9fb3cf'; ctx.font = `600 ${Math.round(Math.max(14, 34 * k * Math.min(1, scale * 1.6)))}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(env.missingLabel?.(clip) ?? 'Loading media…', 0, 0, bw * 0.9); ctx.restore();
    env.bounds?.set(clip.id, { cx: x, cy: y, w: bw, h: bh, rotation });
    return;
  }

  const kb = effectOf(clip, 'kenburns');
  if (kb) scale *= 1 + (param(clip, 'kenburns', 'amount') || 0.12) * clamp01(localT / Math.max(0.1, clip.duration));
  const fitScale = clip.fit === 'contain' ? Math.min(W / src.w, H / src.h) : Math.max(W / src.w, H / src.h);
  const s = fitScale * scale * mod.scale;
  const dw = src.w * s, dh = src.h * s;
  let sx = 0, sy = 0;
  if (effectOf(clip, 'shake')) { const a = (param(clip, 'shake', 'amount') || 10) * k; sx = (rand(Math.floor(localT * 24)) - 0.5) * a; sy = (rand(Math.floor(localT * 24) + 7) - 0.5) * a; }

  ctx.save();
  ctx.globalAlpha = alpha;
  if (effectOf(clip, 'blurfill') && clip.fit === 'contain') {
    const cs = Math.max(W / src.w, H / src.h) * 1.1;
    ctx.filter = `blur(${Math.round(40 * k)}px) brightness(.6)`;
    ctx.drawImage(src.img, W / 2 - (src.w * cs) / 2, H / 2 - (src.h * cs) / 2, src.w * cs, src.h * cs);
    ctx.filter = 'none';
  }
  ctx.translate(x + mod.dx + sx, y + mod.dy + sy);
  if (rotation || mod.rotate) ctx.rotate(((rotation || 0) * Math.PI) / 180 + (mod.rotate || 0));
  if (mod.clip) mod.clip(ctx, -x - mod.dx - sx, -y - mod.dy - sy);
  const rect = [-dw / 2, -dh / 2, dw, dh];
  if (clip.radius) { roundRectPath(ctx, ...rect, clip.radius * k); ctx.clip(); }
  if (effectOf(clip, 'shadow')) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 40 * k; ctx.shadowOffsetY = 12 * k; }

  let img = src.img;
  const chroma = effectOf(clip, 'chroma');
  if (chroma) img = chromaKey(src.img, src.w, src.h, param(clip, 'chroma', 'color') || '#00ff00', param(clip, 'chroma', 'tolerance') ?? 0.35);
  ctx.filter = cssFilter(clip, k, mod.blur);
  ctx.drawImage(img, ...rect);
  ctx.shadowColor = 'transparent';

  if (effectOf(clip, 'rgbsplit')) {
    const off = (param(clip, 'rgbsplit', 'amount') || 8) * k;
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = alpha * 0.45;
    ctx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)'; ctx.drawImage(img, rect[0] - off, rect[1], dw, dh);
    ctx.filter = 'sepia(1) saturate(6) hue-rotate(150deg)'; ctx.drawImage(img, rect[0] + off, rect[1], dw, dh);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
  }
  ctx.filter = 'none';
  const glitch = effectOf(clip, 'glitch') || mod.glitch;
  if (glitch) {
    const tick = Math.floor(localT * 12);
    const amount = mod.glitch ?? (param(clip, 'glitch', 'amount') || 0.5);
    if (rand(tick) < amount * 0.8) {
      for (let i = 0; i < 5; i++) {
        const bandY = rand(tick * 7 + i) * src.h, bandH = Math.max(2, rand(tick * 3 + i) * src.h * 0.08);
        const shift = (rand(tick * 11 + i) - 0.5) * dw * 0.12 * amount;
        ctx.drawImage(img, 0, bandY, src.w, Math.min(bandH, src.h - bandY), rect[0] + shift, rect[1] + bandY * s, dw, bandH * s);
      }
    }
  }
  const preset = FILTERS.find(f => f.id === clip.filter);
  if (preset?.overlay) {
    const g = ctx.createLinearGradient(rect[0], rect[1] + dh, rect[0] + dw, rect[1]);
    g.addColorStop(0, preset.overlay[0]); g.addColorStop(1, preset.overlay[1]);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = alpha * 0.4; ctx.fillStyle = g; ctx.fillRect(...rect);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
  }
  if (effectOf(clip, 'vignette')) {
    const r = Math.hypot(dw, dh) / 2;
    const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${param(clip, 'vignette', 'amount') ?? 0.55})`);
    ctx.fillStyle = g; ctx.fillRect(...rect);
  }
  if (effectOf(clip, 'grain')) {
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = alpha * (param(clip, 'grain', 'amount') ?? 0.12) * 2.5;
    ctx.translate(rand(Math.floor(localT * 24)) * 256, rand(Math.floor(localT * 24) + 3) * 256);
    ctx.fillStyle = grainPattern(ctx); ctx.fillRect(rect[0] - 256, rect[1] - 256, dw + 256, dh + 256);
  }
  ctx.restore();
  env.bounds?.set(clip.id, { cx: x, cy: y, w: dw, h: dh, rotation });
}

// Lays text out in lines no wider than maxW. Returns lines of words with measured widths.
function layoutWords(ctx, words, maxW, spaceW) {
  const lines = [];
  let line = { words: [], width: 0 };
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    const add = line.words.length ? spaceW + ww : ww;
    if (line.words.length && line.width + add > maxW) { lines.push(line); line = { words: [], width: 0 }; }
    line.words.push({ text: w, width: ww, x: line.width + (line.words.length ? spaceW : 0) });
    line.width += line.words.length > 1 ? spaceW + ww : ww;
  }
  if (line.words.length) lines.push(line);
  return lines;
}

function drawText(ctx, clip, localT, env, mod) {
  const { W, H } = env;
  const k = Math.min(W, H) / 1080;
  const t = clip.text;
  const a = animState(clip, localT);
  const alpha = keyframeValue(clip, 'opacity', localT, clip.opacity ?? 1) * a.alpha * mod.alpha;
  if (alpha <= 0.001) return;
  const x = keyframeValue(clip, 'x', localT, clip.x) * W + a.dx * k + mod.dx;
  const y = keyframeValue(clip, 'y', localT, clip.y) * H + a.dy * k + mod.dy;
  const scale = keyframeValue(clip, 'scale', localT, clip.scale) * a.scale * mod.scale;
  const rotation = keyframeValue(clip, 'rotation', localT, clip.rotation || 0);
  const size = t.size * k;
  const content = (t.uppercase ? t.content.toUpperCase() : t.content) || ' ';

  ctx.save();
  ctx.font = `${t.weight} ${size}px "${t.font}", Inter, sans-serif`;
  const spacing = (t.letterSpacing || 0) * k + a.spread * size;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const spaceW = ctx.measureText(' ').width;
  const paragraphs = content.split('\n');
  const lines = paragraphs.flatMap(p => layoutWords(ctx, p.split(/\s+/).filter(Boolean).length ? p.split(/\s+/).filter(Boolean) : [' '], t.maxWidth * W, spaceW));
  const lineH = size * t.lineHeight;
  const blockW = Math.max(...lines.map(l => l.width), 1);
  const blockH = lines.length * lineH;

  ctx.translate(x, y);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  if (scale !== 1) ctx.scale(scale, scale);
  if (mod.clip) mod.clip(ctx, -x, -y);
  ctx.globalAlpha = alpha;
  if (a.blur + (mod.blur || 0) > 0.3) ctx.filter = `blur(${(a.blur * k + (mod.blur || 0)).toFixed(1)}px)`;

  const pad = (t.bgPad ?? 24) * k;
  if (t.bg) {
    ctx.fillStyle = t.bg;
    roundRectPath(ctx, -blockW / 2 - pad, -blockH / 2 - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2, 14 * k);
    ctx.fill();
  }
  if (a.mode === 'wipe' && a.reveal < 1) { ctx.beginPath(); ctx.rect(-blockW / 2 - pad, -blockH / 2 - pad, (blockW + pad * 2) * a.reveal, blockH + pad * 2); ctx.clip(); }

  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (t.glow) { ctx.shadowColor = t.glow; ctx.shadowBlur = 28 * k; }
  else if (t.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 4 * k; }

  const totalChars = content.replace(/\s+/g, '').length;
  const totalWords = lines.reduce((n, l) => n + l.words.length, 0);
  let charBudget = a.mode === 'typewriter' ? Math.floor(totalChars * a.reveal) : Infinity;
  let wordBudget = a.mode === 'words' ? Math.ceil(totalWords * a.reveal) : Infinity;
  lines.forEach((line, i) => {
    const ly = -blockH / 2 + lineH * (i + 0.5);
    const startX = t.align === 'left' ? -blockW / 2 : t.align === 'right' ? blockW / 2 - line.width : -line.width / 2;
    for (const w of line.words) {
      if (wordBudget-- <= 0) return;
      let text = w.text;
      if (charBudget !== Infinity) { if (charBudget <= 0) return; text = text.slice(0, charBudget); charBudget -= w.text.length; }
      if (t.stroke && t.strokeWidth) { ctx.strokeStyle = t.stroke; ctx.lineWidth = t.strokeWidth * 2 * k; ctx.strokeText(text, startX + w.x, ly); }
      ctx.fillStyle = t.color; ctx.fillText(text, startX + w.x, ly);
    }
  });
  ctx.restore();
  env.bounds?.set(clip.id, { cx: x, cy: y, w: (blockW + (t.bg ? pad * 2 : 0)) * scale, h: (blockH + (t.bg ? pad * 1.2 : 0)) * scale, rotation });
}

function drawShape(ctx, clip, localT, env, mod) {
  const { W, H } = env;
  const k = Math.min(W, H) / 1080;
  const sh = clip.shape;
  const a = animState(clip, localT);
  const alpha = keyframeValue(clip, 'opacity', localT, clip.opacity ?? 1) * a.alpha * mod.alpha;
  if (alpha <= 0.001) return;
  const x = keyframeValue(clip, 'x', localT, clip.x) * W + a.dx * k + mod.dx;
  const y = keyframeValue(clip, 'y', localT, clip.y) * H + a.dy * k + mod.dy;
  const scale = keyframeValue(clip, 'scale', localT, clip.scale) * a.scale * mod.scale;
  const rotation = keyframeValue(clip, 'rotation', localT, clip.rotation || 0);
  let w = sh.w * W, h = sh.kind === 'line' ? Math.max(2, sh.h * H) : sh.h * H;
  if (sh.kind === 'circle') h = w = Math.min(w, h) || w;
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  if (mod.clip) mod.clip(ctx, -x, -y);
  if (a.mode === 'wipe' && a.reveal < 1) { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w * a.reveal, h); ctx.clip(); }
  ctx.globalAlpha = alpha;
  if (a.blur > 0.3) ctx.filter = `blur(${(a.blur * k).toFixed(1)}px)`;
  if (sh.color2) {
    const ang = ((sh.angle ?? 90) * Math.PI) / 180;
    const dx = (Math.cos(ang) * w) / 2, dy = (Math.sin(ang) * h) / 2;
    const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
    g.addColorStop(0, sh.color); g.addColorStop(1, sh.color2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = sh.color;
  if (sh.kind === 'circle') { ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); }
  else { roundRectPath(ctx, -w / 2, -h / 2, w, h, (sh.radius || 0) * k); ctx.fill(); }
  ctx.restore();
  env.bounds?.set(clip.id, { cx: x, cy: y, w: w * scale, h: h * scale, rotation });
}

function drawClip(ctx, clip, localT, env, mod = {}) {
  const m = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, rotate: 0, ...mod };
  if (clip.type === 'video' || clip.type === 'image') drawMedia(ctx, clip, localT, env, m);
  else if (clip.type === 'text') drawText(ctx, clip, localT, env, m);
  else if (clip.type === 'shape') drawShape(ctx, clip, localT, env, m);
}

// Draws `clip` entering over `prev` (the clip before it on the same track, if they touch).
function drawTransition(ctx, clip, prev, t, env) {
  const { W, H } = env;
  const tr = clip.transition;
  const p = clamp01((t - clip.start) / tr.duration);
  const e = easeInOut(p);
  const local = t - clip.start;
  // The outgoing clip keeps playing past its end point while the new one comes in.
  const prevLocal = prev ? t - prev.start : 0;
  const drawPrev = mod => prev && drawClip(ctx, prev, prevLocal, env, mod);
  switch (tr.type) {
    case 'fade': drawPrev(); drawClip(ctx, clip, local, env, { alpha: e }); break;
    case 'fadeblack': case 'fadewhite': {
      const color = tr.type === 'fadeblack' ? '#000' : '#fff';
      if (prev && p < 0.5) { drawPrev(); ctx.save(); ctx.globalAlpha = p * 2; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      else { drawClip(ctx, clip, local, env); ctx.save(); ctx.globalAlpha = prev ? (1 - p) * 2 : 1 - p; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      break;
    }
    case 'slideleft': drawPrev({ dx: -e * W }); drawClip(ctx, clip, local, env, { dx: (1 - e) * W }); break;
    case 'slideright': drawPrev({ dx: e * W }); drawClip(ctx, clip, local, env, { dx: -(1 - e) * W }); break;
    case 'slideup': drawPrev({ dy: -e * H }); drawClip(ctx, clip, local, env, { dy: (1 - e) * H }); break;
    case 'wipeleft': drawPrev(); drawClip(ctx, clip, local, env, { clip: (c, ox, oy) => { c.beginPath(); c.rect(ox, oy, W * e, H); c.clip(); } }); break;
    case 'circle': drawPrev(); drawClip(ctx, clip, local, env, { clip: (c, ox, oy) => { c.beginPath(); c.arc(ox + W / 2, oy + H / 2, (Math.hypot(W, H) / 2) * e, 0, Math.PI * 2); c.clip(); } }); break;
    case 'zoom': drawPrev({ scale: 1 + e * 0.35, alpha: 1 - e }); drawClip(ctx, clip, local, env, { scale: 1.35 - 0.35 * e, alpha: e }); break;
    case 'blur': drawPrev({ blur: e * 30 }); drawClip(ctx, clip, local, env, { alpha: e, blur: (1 - e) * 30 }); break;
    case 'spin': drawPrev({ rotate: e * Math.PI * 0.5, scale: 1 - e * 0.9, alpha: 1 - e }); drawClip(ctx, clip, local, env, { rotate: -(1 - e) * Math.PI * 0.5, scale: 0.1 + 0.9 * e, alpha: e }); break;
    case 'whip': { const q = p * p * (3 - 2 * p); drawPrev({ dx: -q * W, blur: Math.sin(p * Math.PI) * 40 }); drawClip(ctx, clip, local, env, { dx: (1 - q) * W, blur: Math.sin(p * Math.PI) * 40 }); break; }
    case 'glitch': if (p < 0.5) drawPrev({ glitch: 1 }); else drawClip(ctx, clip, local, env, { glitch: 1 }); break;
    default: drawClip(ctx, clip, local, env);
  }
}

// ---------- captions ----------

function drawCaption(ctx, clip, t, project, env) {
  const { W, H } = env;
  const k = Math.min(W, H) / 1080;
  const st = project.captionStyle;
  const local = t - clip.start;
  const size = st.size * k;
  const words = clip.words?.length ? clip.words : clip.text.split(/\s+/).filter(Boolean).map((w, i, all) => ({ word: w, start: (i / all.length) * clip.duration, end: ((i + 1) / all.length) * clip.duration }));
  const fmt = w => (st.uppercase ? w.toUpperCase() : w);
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const y = st.position * H;
  const current = words.findIndex(w => local >= w.start && local < w.end + 0.05);

  if (st.preset === 'pop') {
    const w = words[Math.max(0, current)];
    if (!w) { ctx.restore(); return; }
    const p = clamp01((local - w.start) / 0.15);
    const bigSize = size * 1.6;
    ctx.font = `900 ${bigSize}px "${st.font}", Inter, sans-serif`;
    ctx.translate(W / 2, y);
    ctx.scale(0.7 + 0.3 * easeOut(p) + Math.sin(p * Math.PI) * 0.1, 0.7 + 0.3 * easeOut(p) + Math.sin(p * Math.PI) * 0.1);
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 12 * k; ctx.strokeText(fmt(w.word), 0, 0);
    ctx.fillStyle = current % 2 ? st.highlight : st.color; ctx.fillText(fmt(w.word), 0, 0);
    ctx.restore();
    return;
  }

  ctx.font = `800 ${size}px "${st.font}", Inter, sans-serif`;
  const spaceW = ctx.measureText(' ').width;
  const lines = layoutWords(ctx, words.map(w => fmt(w.word)), W * 0.84, spaceW);
  const lineH = size * 1.25;
  const blockH = lines.length * lineH;
  const top = y - blockH / 2;
  if (st.preset === 'boxed') {
    const bw = Math.max(...lines.map(l => l.width));
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    roundRectPath(ctx, W / 2 - bw / 2 - 22 * k, top - 12 * k, bw + 44 * k, blockH + 24 * k, 12 * k); ctx.fill();
  }
  let index = 0;
  lines.forEach((line, li) => {
    const ly = top + lineH * (li + 0.5);
    const startX = W / 2 - line.width / 2;
    for (const w of line.words) {
      const active = index === current;
      if (st.preset !== 'boxed') { ctx.strokeStyle = '#000'; ctx.lineWidth = 8 * k; ctx.strokeText(w.text, startX + w.x, ly); }
      ctx.fillStyle = st.preset === 'highlight' && active ? st.highlight : st.color;
      ctx.fillText(w.text, startX + w.x, ly);
      index++;
    }
  });
  ctx.restore();
}

// ---------- frame ----------

export function drawFrame(ctx, project, t, env) {
  const { W, H } = env;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = project.background || '#000';
  ctx.fillRect(0, 0, W, H);
  env.bounds?.clear();

  for (const track of project.tracks) {
    if (track.kind !== 'visual' || track.hidden) continue;
    const clips = track.clips;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (t < clip.start || t >= clip.start + clip.duration) continue;
      const tr = clip.transition;
      if (tr?.type && tr.duration > 0 && t < clip.start + tr.duration) {
        const prev = clips.find(c => c !== clip && Math.abs(c.start + c.duration - clip.start) < 0.05);
        drawTransition(ctx, clip, prev, t, env);
      } else drawClip(ctx, clip, t - clip.start, env);
    }
  }
  for (const track of project.tracks) {
    if (track.kind !== 'caption' || track.hidden) continue;
    const clip = track.clips.find(c => t >= c.start && t < c.start + c.duration);
    if (clip) drawCaption(ctx, clip, t, project, env);
  }

  const k = Math.min(W, H) / 1080;
  if (env.brand?.logo?.naturalWidth) {
    const lw = 150 * k, lh = (env.brand.logo.naturalHeight / env.brand.logo.naturalWidth) * lw, m = 36 * k;
    const pos = env.brand.position || 'bottom-right';
    const lx = pos.endsWith('left') ? m : W - lw - m, ly = pos.startsWith('top') ? m : H - lh - m - (env.watermark ? 50 * k : 0);
    ctx.globalAlpha = 0.92; ctx.drawImage(env.brand.logo, lx, ly, lw, lh); ctx.globalAlpha = 1;
  }
  if (env.watermark) {
    const size = Math.round(26 * k);
    ctx.font = `700 ${size}px Inter, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const label = 'Made with Vivid Video Studio';
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    const tw = ctx.measureText(label).width;
    roundRectPath(ctx, W - tw - 40 * k, H - size - 34 * k, tw + 24 * k, size + 16 * k, 10 * k); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText(label, W - 28 * k, H - 24 * k);
  }
  ctx.restore();
}

// The media clips drawn at time t, with the source time each one shows. Includes the outgoing
// clip during a transition. The preview and exporter use this to have video frames ready.
export function mediaNeeds(project, t) {
  const out = [];
  for (const track of project.tracks) {
    if (track.kind !== 'visual' || track.hidden) continue;
    for (const clip of track.clips) {
      if (clip.type !== 'video' && clip.type !== 'image') continue;
      const local = t - clip.start;
      if (local >= 0 && local < clip.duration) { out.push({ clip, sourceT: (clip.in || 0) + local * (clip.speed || 1) }); continue; }
      // Outgoing side of the next clip's transition.
      const next = track.clips.find(c => c.transition?.type && Math.abs(clip.start + clip.duration - c.start) < 0.05);
      if (next && local >= clip.duration && t < next.start + next.transition.duration) out.push({ clip, sourceT: (clip.in || 0) + local * (clip.speed || 1) });
    }
  }
  return out;
}

// Output size for an export at a given short-side height (720 / 1080 / 2160), kept even for the encoder.
export function outputSize(project, short) {
  const { w, h } = frameSize(project);
  const s = short / Math.min(w, h);
  return { W: Math.round((w * s) / 2) * 2, H: Math.round((h * s) / 2) * 2 };
}
