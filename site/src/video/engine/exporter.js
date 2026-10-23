// Renders a project to an MP4 in the browser with WebCodecs (Chrome, Edge, Safari 17+, recent
// Firefox). Browsers without it fall back to real-time recording (WebM). Nothing is uploaded.
import { mixTimeline } from './audio';
import { MediaPool, seekVideo, waitReady } from './media';
import { projectDuration } from './model';
import { Mp4Writer } from './mp4';
import { drawFrame, mediaNeeds, outputSize } from './renderer';

const H264 = [
  // [max short side, max fps, codec]  High profile at a level that fits the size and frame rate.
  [720, 30, 'avc1.64001f'], [720, 60, 'avc1.640020'], [1080, 30, 'avc1.640028'], [1080, 60, 'avc1.64002a'], [2160, 60, 'avc1.640033'],
];
const FALLBACK_CODECS = ['avc1.4d0033', 'avc1.4d0028', 'avc1.42e01f'];

export const canExportMp4 = () => typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

function bitrateFor(W, H, fps) {
  const px = W * H;
  const base = px <= 1280 * 720 ? 5e6 : px <= 1920 * 1080 ? 10e6 : 35e6;
  return Math.round(base * (fps > 30 ? 1.5 : 1));
}

async function pickVideoConfig(W, H, fps) {
  const short = Math.min(W, H);
  const preferred = H264.find(([s, f]) => short <= s && fps <= f)?.[2] ?? 'avc1.640033';
  for (const codec of [preferred, ...FALLBACK_CODECS]) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const config = { codec, width: W, height: H, bitrate: bitrateFor(W, H, fps), framerate: fps, avc: { format: 'avc' }, hardwareAcceleration, latencyMode: 'quality' };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch { /* try next */ }
    }
  }
  return null;
}

async function pickAudioConfig(sampleRate, channels) {
  for (const [codec, kind] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const config = { codec, sampleRate, numberOfChannels: channels, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, kind }; } catch { /* next */ }
  }
  return null;
}

// Highest export size this browser can encode (for the resolution picker).
export async function supportsSize(project, short, fps) {
  if (!canExportMp4()) return short <= 1080;
  const { W, H } = outputSize(project, short);
  return !!(await pickVideoConfig(W, H, fps));
}

async function prepareFrame(pool, project, t) {
  const jobs = [];
  for (const { clip, sourceT } of mediaNeeds(project, t)) {
    if (clip.type === 'image') { if (!pool.images.has(clip.assetId)) jobs.push(pool.image(clip.assetId)); continue; }
    jobs.push((async () => {
      const el = await pool.video(clip);
      if (!el) return;
      await waitReady(el);
      await seekVideo(el, sourceT);
    })());
  }
  await Promise.all(jobs);
}

async function loadBrand(brand) {
  if (!brand?.logo) return null;
  const img = new Image();
  img.src = brand.logo;
  await img.decode().catch(() => {});
  return { logo: img, position: brand.logoPosition };
}

// options: { short: 720 | 1080 | 2160, fps, watermark, brand, signal, onProgress(fraction, label) }
export async function exportVideo(project, { short = 1080, fps = 30, watermark = false, brand = null, signal, onProgress = () => {} }) {
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add something to the timeline first.');
  const { W, H } = outputSize(project, short);
  if (!canExportMp4()) return recordRealtime(project, { W, H, fps, watermark, brand, signal, onProgress, duration });

  const videoConfig = await pickVideoConfig(W, H, fps);
  if (!videoConfig) throw new Error(`This browser cannot encode ${short === 2160 ? '4K' : `${short}p`} video. Try a lower resolution, or Chrome or Edge on a computer.`);

  onProgress(0, 'Mixing audio');
  const sampleRate = 48000, channels = 2;
  const mixed = await mixTimeline(project, duration, { sampleRate, channels });
  const audioChoice = mixed && 'AudioEncoder' in window ? await pickAudioConfig(sampleRate, channels) : null;
  const writer = new Mp4Writer({ video: { width: W, height: H, fps }, audio: audioChoice ? { codec: audioChoice.kind, sampleRate, channels } : null });

  let failure = null;
  if (audioChoice) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => writer.addAudio(chunk, meta), error: e => { failure = e; } });
    aenc.configure(audioChoice.config);
    const frames = 4800;   // 0.1 s per AudioData
    for (let i = 0; i < mixed.length; i += frames) {
      const n = Math.min(frames, mixed.length - i);
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) data.set(mixed.getChannelData(c).subarray(i, i + n), c * n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((i / sampleRate) * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
  }
  if (failure) throw failure;

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false });
  const pool = new MediaPool();
  const brandEnv = await loadBrand(brand);
  const env = { W, H, watermark, brand: brandEnv, source: clip => pool.drawable(clip), missingLabel: () => 'Media missing' };
  const venc = new VideoEncoder({ output: (chunk, meta) => writer.addVideo(chunk, meta), error: e => { failure = e; } });
  venc.configure(videoConfig);
  const total = Math.max(1, Math.round(duration * fps));
  const frameUs = 1e6 / fps;
  const started = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      if (failure) throw failure;
      const t = i / fps;
      await prepareFrame(pool, project, t);
      drawFrame(ctx, project, t, env);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (i % 5 === 0) {
        const elapsed = (performance.now() - started) / 1000;
        const left = ((total - i) * elapsed) / Math.max(1, i);
        onProgress(i / total, i > 10 ? `Rendering · about ${left > 90 ? `${Math.round(left / 60)} min` : `${Math.ceil(left)} s`} left` : 'Rendering');
      }
    }
    await venc.flush();
    if (failure) throw failure;
  } finally {
    if (venc.state !== 'closed') venc.close();
    pool.destroy();
  }
  onProgress(1, 'Saving file');
  return { blob: writer.finish(), ext: 'mp4', width: W, height: H };
}

// Fallback: plays the project in real time into a MediaRecorder (WebM).
async function recordRealtime(project, { W, H, fps, watermark, brand, signal, onProgress, duration }) {
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) throw new Error('This browser cannot export video. Use Chrome, Edge or Safari on a computer.');
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const pool = new MediaPool();
  const env = { W, H, watermark, brand: await loadBrand(brand), source: clip => pool.drawable(clip) };
  const stream = canvas.captureStream(fps);
  const mixed = await mixTimeline(project, duration);
  let audioCtx = null;
  if (mixed) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource(); src.buffer = mixed; src.connect(dest);
    dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    src.start();
  }
  const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrateFor(W, H, fps) });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start(1000);
  const start = performance.now();
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      const t = (performance.now() - start) / 1000;
      if (t >= duration) break;
      await prepareFrame(pool, project, t);
      drawFrame(ctx, project, t, env);
      onProgress(t / duration, 'Recording in real time');
      await new Promise(r => requestAnimationFrame(r));
    }
  } finally {
    rec.stop(); await stopped;
    audioCtx?.close(); pool.destroy();
  }
  return { blob: new Blob(chunks, { type: 'video/webm' }), ext: 'webm', width: W, height: H };
}
