// Minimal MP4 writer for WebCodecs output: one H.264 video track and an optional AAC or Opus
// audio track. Samples are collected as they are encoded, then written as ftyp + mdat + moov.
// Encoded data is kept in Blob pieces so long exports can be paged to disk by the browser.

const enc = new TextEncoder();

function box(type, ...parts) {
  const body = parts.flat(Infinity).filter(p => p != null);
  const size = 8 + body.reduce((n, p) => n + p.byteLength, 0);
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, size);
  head.set(enc.encode(type), 4);
  return [head, ...body];
}
const fullBox = (type, version, flags, ...parts) => box(type, u8(version), u24(flags), ...parts);
const u8 = v => Uint8Array.of(v & 0xff);
const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; };
const i16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v); return b; };
const u24 = v => Uint8Array.of((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
const u64 = v => { const b = new Uint8Array(8); const d = new DataView(b.buffer); d.setUint32(0, Math.floor(v / 2 ** 32)); d.setUint32(4, v >>> 0); return b; };
const zeros = n => new Uint8Array(n);
const fixed16 = v => u32(Math.round(v * 65536));
const MATRIX = [fixed16(1), u32(0), u32(0), u32(0), fixed16(1), u32(0), u32(0), u32(0), u32(0x40000000)];
const bytesOf = parts => parts.flat(Infinity).reduce((n, p) => n + p.byteLength, 0);
const toBytes = d => (d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength));

// Writes an MPEG-4 descriptor with a 4-byte length (always valid, simplest to compute).
const descriptor = (tag, ...parts) => { const len = bytesOf(parts); return [u8(tag), Uint8Array.of(0x80 | ((len >> 21) & 0x7f), 0x80 | ((len >> 14) & 0x7f), 0x80 | ((len >> 7) & 0x7f), len & 0x7f), ...parts]; };

// AudioSpecificConfig for AAC-LC when the encoder did not supply one.
function aacConfig(sampleRate, channels) {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const fi = Math.max(0, rates.indexOf(sampleRate));
  return Uint8Array.of((2 << 3) | (fi >> 1), ((fi & 1) << 7) | (channels << 3));
}

class Track {
  constructor(kind, timescale) {
    this.kind = kind; this.timescale = timescale;
    this.sizes = []; this.durations = []; this.keys = []; this.offsets = [];
    this.description = null;
  }
}

export class Mp4Writer {
  // video: { width, height, fps }  audio: { codec: 'aac' | 'opus', sampleRate, channels } | null
  constructor({ video, audio }) {
    this.video = Object.assign(new Track('video', 90000), video);
    this.audio = audio ? Object.assign(new Track('audio', audio.sampleRate), audio) : null;
    this.pieces = [];     // Blobs of sample data, in mdat order
    this.pending = [];
    this.pendingBytes = 0;
    this.dataBytes = 0;
  }

  #push(track, chunk, durationUs, meta) {
    if (meta?.decoderConfig?.description && !track.description) track.description = toBytes(meta.decoderConfig.description).slice();
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    track.offsets.push(this.dataBytes);
    track.sizes.push(data.byteLength);
    track.durations.push(Math.max(1, Math.round((durationUs / 1e6) * track.timescale)));
    if (track.kind === 'video' && chunk.type === 'key') track.keys.push(track.sizes.length);
    this.dataBytes += data.byteLength;
    this.pending.push(data);
    this.pendingBytes += data.byteLength;
    if (this.pendingBytes > 8 * 1024 * 1024) this.#flushPending();
  }

  #flushPending() {
    if (!this.pending.length) return;
    this.pieces.push(new Blob(this.pending));
    this.pending = []; this.pendingBytes = 0;
  }

  addVideo(chunk, meta) { this.#push(this.video, chunk, chunk.duration ?? 1e6 / this.video.fps, meta); }
  addAudio(chunk, meta) {
    const dur = chunk.duration ?? ((this.audio.codec === 'opus' ? 960 : 1024) / this.audio.sampleRate) * 1e6;
    this.#push(this.audio, chunk, dur, meta);
  }

  finish() {
    this.#flushPending();
    const ftyp = box('ftyp', enc.encode('isom'), u32(0x200), enc.encode('isom'), enc.encode('iso2'), enc.encode('avc1'), enc.encode('mp41'));
    const ftypBytes = bytesOf(ftyp);
    const large = this.dataBytes + 16 > 0xffffffff;
    const mdatHead = large ? [u32(1), enc.encode('mdat'), u64(this.dataBytes + 16)] : [u32(this.dataBytes + 8), enc.encode('mdat')];
    const base = ftypBytes + bytesOf(mdatHead);
    const tracks = [this.video, this.audio].filter(t => t && t.sizes.length);
    const movieDur = Math.max(...tracks.map(t => t.durations.reduce((a, b) => a + b, 0) / t.timescale));
    const moov = box('moov',
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(Math.round(movieDur * 1000)), fixed16(1), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1)),
      tracks.map((t, i) => this.#trak(t, i + 1, base, large)));
    return new Blob([...ftyp, ...mdatHead, ...this.pieces, ...moov], { type: 'video/mp4' });
  }

  #trak(t, id, base, large) {
    const total = t.durations.reduce((a, b) => a + b, 0);
    const isVideo = t.kind === 'video';
    const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(Math.round((total / t.timescale) * 1000)), zeros(8), u16(0), u16(isVideo ? 0 : 1),
      u16(isVideo ? 0 : 0x0100), u16(0), MATRIX, fixed16(isVideo ? t.width : 0), fixed16(isVideo ? t.height : 0));
    const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(total), u16(0x55c4), u16(0));
    const hdlr = fullBox('hdlr', 0, 0, u32(0), enc.encode(isVideo ? 'vide' : 'soun'), zeros(12), enc.encode(isVideo ? 'VideoHandler\0' : 'SoundHandler\0'));
    const header = isVideo ? fullBox('vmhd', 0, 1, zeros(8)) : fullBox('smhd', 0, 0, u16(0), u16(0));
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));

    // Durations run-length encoded.
    const stts = [];
    for (const d of t.durations) { const last = stts[stts.length - 1]; if (last && last[1] === d) last[0]++; else stts.push([1, d]); }
    const offsets = t.offsets.map(o => o + base);
    const useCo64 = large || offsets.some(o => o > 0xffffffff);
    const stbl = box('stbl',
      fullBox('stsd', 0, 0, u32(1), isVideo ? this.#avc1(t) : t.codec === 'opus' ? this.#opus(t) : this.#mp4a(t)),
      fullBox('stts', 0, 0, u32(stts.length), stts.map(([n, d]) => [u32(n), u32(d)])),
      isVideo && t.keys.length ? fullBox('stss', 0, 0, u32(t.keys.length), t.keys.map(u32)) : null,
      fullBox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      fullBox('stsz', 0, 0, u32(0), u32(t.sizes.length), t.sizes.map(u32)),
      useCo64 ? fullBox('co64', 0, 0, u32(offsets.length), offsets.map(u64)) : fullBox('stco', 0, 0, u32(offsets.length), offsets.map(u32)));
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', header, dinf, stbl)));
  }

  #avc1(t) {
    if (!t.description) throw new Error('The video encoder did not provide its configuration.');
    return box('avc1', zeros(6), u16(1), zeros(16), u16(t.width), u16(t.height), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
      zeros(32), u16(0x18), i16(-1), box('avcC', t.description));
  }

  #audioEntry(type, t, ...children) {
    return box(type, zeros(6), u16(1), zeros(8), u16(t.channels), u16(16), u16(0), u16(0), u32(t.sampleRate * 65536 >>> 0), ...children);
  }

  #mp4a(t) {
    const asc = t.description ?? aacConfig(t.sampleRate, t.channels);
    const esds = fullBox('esds', 0, 0, descriptor(3, u16(1), u8(0),
      descriptor(4, u8(0x40), u8(0x15), u24(0), u32(192000), u32(192000), descriptor(5, asc)),
      descriptor(6, u8(2))));
    return this.#audioEntry('mp4a', t, esds);
  }

  #opus(t) {
    // dOps from the encoder's OpusHead if present (little-endian there, big-endian here).
    let preSkip = 312, gain = 0;
    const d = t.description;
    if (d && d.byteLength >= 19 && new TextDecoder().decode(d.slice(0, 8)) === 'OpusHead') {
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      preSkip = v.getUint16(10, true); gain = v.getInt16(16, true);
    }
    const dOps = box('dOps', u8(0), u8(t.channels), u16(preSkip), u32(t.sampleRate), i16(gain), u8(0));
    return this.#audioEntry('Opus', { ...t, sampleRate: 48000 }, dOps);
  }
}
