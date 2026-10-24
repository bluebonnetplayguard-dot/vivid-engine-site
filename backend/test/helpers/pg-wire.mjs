// A very small PostgreSQL client (extended query protocol, trust/password-less auth, text results) with the
// slice of the `pg` API the tests use: new Pool(opts).query / connect / end. The tests prefer the real `pg`
// package when it is installed (see db.mjs); this keeps them runnable with only Node and a Postgres server.
import net from 'node:net';

const int32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const int16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const cstr = s => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
const msg = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from(type), int32(body.length + 4), body]); };

function arrayLiteral(a) {
  return `{${a.map(v => (v === null ? 'NULL' : Array.isArray(v) ? arrayLiteral(v) : `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;
}
function encodeParam(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return arrayLiteral(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function parseArray(text) {
  let i = 0;
  const walk = () => {
    const out = [];
    i++; // {
    while (i < text.length && text[i] !== '}') {
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '{') { out.push(walk()); continue; }
      if (text[i] === '"') {
        let s = ''; i++;
        while (text[i] !== '"') { if (text[i] === '\\') i++; s += text[i++]; }
        i++; out.push(s);
      } else {
        let s = ''; while (i < text.length && text[i] !== ',' && text[i] !== '}') s += text[i++];
        out.push(s === 'NULL' ? null : s);
      }
    }
    i++; // }
    return out;
  };
  return walk();
}
function decode(oid, text) {
  if (text === null) return null;
  switch (oid) {
    case 16: return text === 't';
    case 21: case 23: case 26: return Number(text);
    case 700: case 701: return Number(text);
    case 114: case 3802: return JSON.parse(text);
    case 1114: return new Date(`${text.replace(' ', 'T')}Z`);
    case 1184: return new Date(text.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    case 1009: case 1015: return parseArray(text);
    case 1007: return parseArray(text).map(Number);
    default: return text; // text, int8 and numeric stay strings, as in `pg`
  }
}

class Connection {
  constructor(opts) { this.opts = opts; this.chain = Promise.resolve(); this.buf = Buffer.alloc(0); this.waiters = []; }
  async open() {
    this.sock = net.connect({ host: this.opts.host, port: this.opts.port });
    this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    this.sock.on('error', e => { this.error = e; this.pump(); });
    await new Promise((res, rej) => { this.sock.once('connect', res); this.sock.once('error', rej); });
    const startup = Buffer.concat([int32(196608), cstr('user'), cstr(this.opts.user), cstr('database'), cstr(this.opts.database), Buffer.from([0])]);
    this.sock.removeAllListeners('connect');
    this.sock.write(Buffer.concat([int32(startup.length + 4), startup]));
    for (;;) { const m = await this.next(); if (m.type === 'E') throw new Error(parseError(m.body)); if (m.type === 'Z') break; if (m.type === 'R' && m.body.readInt32BE(0) !== 0) throw new Error('This test client only supports trust authentication.'); }
    return this;
  }
  pump() {
    while (this.waiters.length) {
      if (this.error) { this.waiters.shift().reject(this.error); continue; }
      if (this.buf.length < 5) return;
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) return;
      const m = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      this.waiters.shift().resolve(m);
    }
  }
  next() { return new Promise((resolve, reject) => { this.waiters.push({ resolve, reject }); this.pump(); }); }
  query(text, params = []) {
    const run = async () => {
      const encoded = params.map(encodeParam);
      // Without parameters use the simple protocol, which also accepts several statements (migration files).
      this.sock.write(params.length === 0
        ? msg('Q', cstr(text))
        : Buffer.concat([
          msg('P', cstr(''), cstr(text), int16(0)),
          msg('B', cstr(''), cstr(''), int16(0), int16(encoded.length), ...encoded.map(p => (p === null ? int32(-1) : Buffer.concat([int32(Buffer.byteLength(p)), Buffer.from(p)]))), int16(0)),
          msg('D', Buffer.from('P'), cstr('')),
          msg('E', cstr(''), int32(0)),
          msg('S'),
        ]));
      let fields = []; const rows = []; let failure = null; let tag = '';
      for (;;) {
        const m = await this.next();
        if (m.type === 'T') {
          fields = []; rows.length = 0; let o = 2;
          for (let i = 0; i < m.body.readInt16BE(0); i++) {
            const end = m.body.indexOf(0, o); const name = m.body.toString('utf8', o, end); o = end + 1;
            fields.push({ name, oid: m.body.readInt32BE(o + 6) }); o += 18;
          }
        } else if (m.type === 'D') {
          const n = m.body.readInt16BE(0); let o = 2; const row = {};
          for (let i = 0; i < n; i++) {
            const l = m.body.readInt32BE(o); o += 4;
            const text = l === -1 ? null : m.body.toString('utf8', o, o + l); if (l > 0) o += l;
            row[fields[i].name] = decode(fields[i].oid, text);
          }
          rows.push(row);
        } else if (m.type === 'C') tag = m.body.toString('utf8', 0, m.body.length - 1);
        else if (m.type === 'E') failure = new Error(parseError(m.body));
        else if (m.type === 'Z') break;
      }
      if (failure) throw failure;
      const count = Number(tag.split(' ').pop());
      return { rows, rowCount: Number.isFinite(count) ? count : rows.length };
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => {});
    return result;
  }
  release() {}
  end() { this.sock.end(); }
}
function parseError(body) {
  const parts = {}; let o = 0;
  while (body[o]) { const code = String.fromCharCode(body[o]); const end = body.indexOf(0, o + 1); parts[code] = body.toString('utf8', o + 1, end); o = end + 1; }
  return `${parts.M || 'database error'}${parts.C ? ` (${parts.C})` : ''}`;
}

export class Pool {
  constructor(opts) {
    const u = new URL(opts.connectionString);
    this.opts = { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username || 'postgres'), database: u.pathname.slice(1) || 'postgres' };
    this.shared = null; this.all = [];
  }
  on() { return this; }
  async connect() { const c = await new Connection(this.opts).open(); this.all.push(c); return c; }
  async query(text, params) { this.shared ||= await this.connect(); return this.shared.query(text, params); }
  async end() { for (const c of this.all) c.end(); this.all = []; this.shared = null; }
}
