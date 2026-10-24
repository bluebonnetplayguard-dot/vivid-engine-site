import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Field-level encryption for saved conversations (encrypted at rest).
//
// What is encrypted: conversation titles, message text, source titles and links, Space names.
// What stays readable by the database: ids, timestamps, flags (pinned, favorite), which plan saved it.
// Cipher: AES-256-GCM, a fresh random 96-bit IV per value, and the owner + field name bound in as
// additional authenticated data, so a value copied onto another row or another person fails to decrypt.
// Format:  v1.<keyId>.<iv>.<tag>.<ciphertext>   (base64url parts)
//
// Keys come from the environment (HISTORY_ENCRYPTION_KEY = 32 random bytes, base64; generate with
// `openssl rand -base64 32`). To rotate: put the new key in HISTORY_ENCRYPTION_KEY and move the old one to
// HISTORY_ENCRYPTION_KEY_PREVIOUS (comma-separated). New values use the new key; old values still open.
//
// Full-text search over encrypted text uses a blind index: for each message we store keyed hashes of its
// words (HMAC with a key derived from the master key and the owner's id), never the words themselves.
// A search hashes the query words the same way and matches whole words only.

const b64u = (b: Buffer) => b.toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

export class HistoryCipherError extends Error {}

export interface CipherKeys { current: Buffer; previous: Buffer[] }

export function parseKey(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== 32) throw new HistoryCipherError('History encryption key must be 32 bytes, base64 encoded (openssl rand -base64 32).');
  return key;
}
export const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 8);

export class FieldCipher {
  private readonly byId = new Map<string, Buffer>();
  private readonly currentId: string;
  private readonly termKey: Buffer;

  constructor(private readonly keys: CipherKeys) {
    this.currentId = keyId(keys.current);
    for (const k of [keys.current, ...keys.previous]) this.byId.set(keyId(k), k);
    this.termKey = Buffer.from(hkdfSync('sha256', keys.current, Buffer.alloc(0), 'vivid-history-terms-v1', 32));
  }

  get activeKeyId() { return this.currentId; }

  // aad: who and what this value belongs to, e.g. `${userId}:message`.
  encrypt(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.current, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', this.currentId, b64u(iv), b64u(cipher.getAuthTag()), b64u(ct)].join('.');
  }

  decrypt(token: string, aad: string): string {
    const [version, id, iv, tag, ct] = String(token).split('.');
    if (version !== 'v1' || !id || !iv || !tag || ct === undefined) throw new HistoryCipherError('Unreadable saved value.');
    const key = this.byId.get(id);
    if (!key) throw new HistoryCipherError('This value was saved with a key that is no longer configured.');
    try {
      const d = createDecipheriv('aes-256-gcm', key, fromB64u(iv));
      d.setAAD(Buffer.from(aad, 'utf8'));
      d.setAuthTag(fromB64u(tag));
      return Buffer.concat([d.update(fromB64u(ct)), d.final()]).toString('utf8');
    } catch {
      throw new HistoryCipherError('Saved value failed its integrity check.');
    }
  }

  // Safe wrapper for listings: one damaged row must not hide the rest.
  tryDecrypt(token: string, aad: string, fallback = ''): string {
    try { return this.decrypt(token, aad); } catch { return fallback; }
  }

  // Blind index token for one word, scoped to one person.
  blind(userId: string, term: string): string {
    return createHmac('sha256', this.termKey).update(`${userId}\0${term}`).digest('base64url').slice(0, 16);
  }
  blindTerms(userId: string, text: string): string[] { return termsOf(text).map(t => this.blind(userId, t)); }
}

// Words worth indexing: letters/numbers, accents folded, 3-40 characters, common filler dropped.
const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'had', 'his', 'how', 'its', 'may', 'new', 'now', 'who', 'did', 'does', 'this', 'that', 'with', 'from', 'what', 'when', 'where', 'which', 'will', 'your', 'about', 'there', 'their', 'them', 'then', 'than', 'they', 'been', 'were', 'into', 'also', 'any', 'more', 'some', 'such', 'only', 'other', 'would', 'could', 'should', 'these', 'those']);
export function termsOf(text: string, max = 400): string[] {
  const words = String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]{3,40}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    if (STOP.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

// Builds the cipher from environment values. Outside production a missing key gives a throwaway key
// (saved history will not survive a restart); in production it throws, so history is never stored unencrypted.
export function cipherFromEnv(env: { HISTORY_ENCRYPTION_KEY?: string; HISTORY_ENCRYPTION_KEY_PREVIOUS?: string }, production: boolean): FieldCipher | null {
  if (!env.HISTORY_ENCRYPTION_KEY) {
    if (production) return null;
    return new FieldCipher({ current: randomBytes(32), previous: [] });
  }
  const previous = (env.HISTORY_ENCRYPTION_KEY_PREVIOUS ?? '').split(',').map(s => s.trim()).filter(Boolean).map(parseKey);
  return new FieldCipher({ current: parseKey(env.HISTORY_ENCRYPTION_KEY), previous });
}
