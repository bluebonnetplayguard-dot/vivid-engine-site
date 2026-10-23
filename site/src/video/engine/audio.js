// Audio: mixes the timeline for export, prepares speech for captions, and finds silences.
import { getBlob } from './media';

const decoded = new Map();   // assetId -> Promise<AudioBuffer | null>

// Decodes an asset's audio once per page (null when the file has no audio track).
export function decodeAsset(assetId) {
  if (!decoded.has(assetId)) {
    decoded.set(assetId, (async () => {
      const blob = await getBlob(assetId);
      if (!blob) return null;
      try {
        const ctx = new OfflineAudioContext(2, 2, 48000);
        return await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch { return null; }
    })());
  }
  return decoded.get(assetId);
}

// Clips that make sound: audio clips, and video clips that are not muted.
export function audibleClips(project) {
  const out = [];
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const c of track.clips) {
      if (c.type === 'audio' || (c.type === 'video' && !c.muted && (c.volume ?? 1) > 0)) {
        const asset = project.assets[c.assetId];
        if (asset && (c.type === 'audio' || asset.hasAudio !== false)) out.push(c);
      }
    }
  }
  return out;
}

// Volume multiplier for music while someone is talking (auto-ducking), at timeline time t.
export function duckAt(project, t) {
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const c of track.clips) if (c.type === 'audio' && c.role === 'voice' && t >= c.start - 0.15 && t < c.start + c.duration + 0.15) return 0.25;
  }
  return 1;
}

const voiceRanges = project => project.tracks.filter(t => !t.muted).flatMap(t => t.clips.filter(c => c.type === 'audio' && c.role === 'voice').map(c => [c.start, c.start + c.duration]));

// Renders the whole timeline's sound to one AudioBuffer.
export async function mixTimeline(project, duration, { sampleRate = 48000, channels = 2, onlyClipIds = null } = {}) {
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OfflineAudioContext(channels, length, sampleRate);
  const voices = voiceRanges(project);
  let any = false;
  for (const clip of audibleClips(project)) {
    if (onlyClipIds && !onlyClipIds.has(clip.id)) continue;
    const buffer = await decodeAsset(clip.assetId);
    if (!buffer) continue;
    const speed = clip.speed || 1;
    const offset = clip.in || 0;
    if (offset >= buffer.duration) continue;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    const vol = clip.volume ?? 1;
    const start = clip.start, end = clip.start + clip.duration;
    const g = gain.gain;
    g.setValueAtTime(clip.fadeIn ? 0 : vol, start);
    if (clip.fadeIn) g.linearRampToValueAtTime(vol, start + Math.min(clip.fadeIn, clip.duration));
    if (clip.type === 'audio' && clip.duck) {
      // Lower this music under every voice clip, easing in and out over 0.3 s.
      for (const [a, b] of voices) {
        if (b <= start || a >= end) continue;
        g.setValueAtTime(vol, Math.max(start, a - 0.3));
        g.linearRampToValueAtTime(vol * 0.25, Math.max(start, a));
        g.setValueAtTime(vol * 0.25, Math.min(end, b));
        g.linearRampToValueAtTime(vol, Math.min(end, b + 0.3));
      }
    }
    if (clip.fadeOut) { g.setValueAtTime(vol, Math.max(start, end - clip.fadeOut)); g.linearRampToValueAtTime(0, end); }
    src.connect(gain).connect(ctx.destination);
    src.start(start, offset, clip.duration * speed);
    any = true;
  }
  if (!any) return null;
  return ctx.startRendering();
}

// ---------- captions ----------

function wavBytes(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

// Mono 16 kHz pieces of at most 30 s, each cut at the quietest moment near its end so
// words are not split. Silent pieces are skipped (no point paying to transcribe them).
export async function speechPieces(project, duration, onlyClipIds) {
  const rate = 16000;
  const mixed = await mixTimeline(project, duration, { sampleRate: rate, channels: 1, onlyClipIds });
  if (!mixed) return [];
  const data = mixed.getChannelData(0);
  const win = rate / 20;   // 50 ms
  const rms = i => { let s = 0; const end = Math.min(data.length, i + win); for (let j = i; j < end; j += 2) s += data[j] * data[j]; return Math.sqrt(s / (win / 2)); };
  const pieces = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(data.length, start + rate * 30);
    if (end < data.length) {
      let best = end, bestV = Infinity;
      for (let i = start + rate * 20; i < end - win; i += win) { const v = rms(i); if (v < bestV) { bestV = v; best = i; } }
      end = best;
    }
    const slice = data.subarray(start, end);
    let loud = 0;
    for (let i = 0; i < slice.length; i += win) if (rms(start + i) > 0.01) loud++;
    if (loud > 2) pieces.push({ offset: start / rate, seconds: (end - start) / rate, wav: wavBytes(slice, rate) });
    start = end;
  }
  return pieces;
}

// Groups transcribed words into caption lines (a few words, under ~3 s each).
export function wordsToCaptionClips(words, makeClip, { maxChars = 32, maxSeconds = 3 } = {}) {
  const clips = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const start = group[0].start, end = Math.max(group[group.length - 1].end, start + 0.4);
    clips.push(makeClip('caption', { start, duration: end - start, text: group.map(w => w.word).join(' '), words: group.map(w => ({ word: w.word, start: w.start - start, end: w.end - start })) }));
    group = [];
  };
  for (const w of words) {
    const text = group.map(g => g.word).join(' ');
    const gap = group.length ? w.start - group[group.length - 1].end : 0;
    if (group.length && (text.length + 1 + w.word.length > maxChars || w.end - group[0].start > maxSeconds || gap > 0.7)) flush();
    group.push(w);
    if (/[.!?]$/.test(w.word)) flush();
  }
  flush();
  // Lines should not overlap.
  for (let i = 0; i < clips.length - 1; i++) clips[i].duration = Math.min(clips[i].duration, clips[i + 1].start - clips[i].start);
  return clips;
}

// ---------- silence removal ----------

// Ranges of a clip's source (in seconds) that contain sound. thresholdDb: below this is silence.
export async function soundRanges(clip, { thresholdDb = -38, minSilence = 0.5, pad = 0.12 } = {}) {
  const buffer = await decodeAsset(clip.assetId);
  if (!buffer) return null;
  const rate = buffer.sampleRate, data = buffer.getChannelData(0);
  const from = Math.floor((clip.in || 0) * rate);
  const to = Math.min(data.length, Math.floor(((clip.in || 0) + clip.duration * (clip.speed || 1)) * rate));
  const win = Math.floor(rate * 0.02);
  const limit = 10 ** (thresholdDb / 20);
  const loud = [];
  for (let i = from; i < to; i += win) {
    let s = 0; const end = Math.min(to, i + win);
    for (let j = i; j < end; j++) s += data[j] * data[j];
    loud.push(Math.sqrt(s / Math.max(1, end - i)) > limit);
  }
  const ranges = [];
  let runStart = null, quiet = 0;
  const minQuiet = Math.ceil(minSilence / 0.02);
  loud.forEach((isLoud, i) => {
    if (isLoud) { if (runStart === null) runStart = i; quiet = 0; }
    else if (runStart !== null && ++quiet >= minQuiet) { ranges.push([runStart, i - quiet + 1]); runStart = null; quiet = 0; }
  });
  if (runStart !== null) ranges.push([runStart, loud.length]);
  const base = clip.in || 0;
  return ranges.map(([a, b]) => [Math.max(base, base + a * 0.02 - pad), Math.min(base + loud.length * 0.02, base + b * 0.02 + pad)])
    .reduce((acc, r) => { const last = acc[acc.length - 1]; if (last && r[0] <= last[1]) last[1] = r[1]; else acc.push(r); return acc; }, []);
}
