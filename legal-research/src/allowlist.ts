import { createHash } from 'node:crypto';
import { LEGAL_SOURCES, BLOCKED_DOMAINS, BLOCKED_SOURCE_NAMES, type LegalSource } from '../config/legal-sources.ts';

export interface Passage {
  id: string;            // stable: source + document id + passage number
  source: string;        // LegalSource.id
  license: string;       // copied from the source at ingestion time
  url: string;           // where the text came from
  retrieved_at: string;  // ISO timestamp
  jurisdiction: string;  // TX | LA | US | 5th-Cir
  court?: string;
  date?: string;         // decision or effective date (YYYY-MM-DD when known)
  citation?: string;     // preferred citation, e.g. "123 S.W.3d 456"
  doc_type: string;      // case | statute | rule | regulation
  title: string;
  section?: string;      // opinion part or statute section
  text: string;
  content_hash: string;  // sha256 of text
}

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
};
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export const isBlockedUrl = (url: string) => BLOCKED_DOMAINS.some(d => matches(hostOf(url), d));

export function sourceForUrl(url: string): LegalSource | null {
  const host = hostOf(url);
  if (!host || isBlockedUrl(url)) return null;
  return LEGAL_SOURCES.find(s => s.domains.some(d => matches(host, d))) || null;
}

export const sourceById = (id: string) => LEGAL_SOURCES.find(s => s.id === id) || null;

export class SourceRejected extends Error {
  constructor(message: string) { super(message); this.name = 'SourceRejected'; }
}

const isProduction = () => process.env.NODE_ENV === 'production';

// Throws unless this passage may be stored, indexed and embedded.
export function assertIngestible(p: Pick<Passage, 'source' | 'url' | 'license' | 'retrieved_at' | 'text'>): LegalSource {
  if (BLOCKED_SOURCE_NAMES.test(p.source)) throw new SourceRejected(`Blocked research service: ${p.source}`);
  if (isBlockedUrl(p.url)) throw new SourceRejected(`Blocked domain: ${hostOf(p.url)}`);
  const byId = sourceById(p.source);
  if (!byId) throw new SourceRejected(`Source "${p.source}" is not on the allowlist`);
  const byUrl = sourceForUrl(p.url);
  if (!byUrl || byUrl.id !== byId.id) throw new SourceRejected(`URL ${p.url} does not belong to source "${p.source}"`);
  if (byId.access !== 'full' || !byId.termsReviewed) throw new SourceRejected(`Source "${p.source}" is link-only until its terms are reviewed and recorded`);
  if (isProduction() && !byId.productionAllowed()) throw new SourceRejected(`Source "${p.source}" is development-only (production flag not set)`);
  if (p.license !== byId.license) throw new SourceRejected(`License mismatch for "${p.source}": got "${p.license}"`);
  if (!p.retrieved_at || Number.isNaN(Date.parse(p.retrieved_at))) throw new SourceRejected('Missing retrieved_at');
  if (!p.text?.trim()) throw new SourceRejected('Empty text');
  return byId;
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
