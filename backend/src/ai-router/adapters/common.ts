import { AdapterRequest, Citation, Focus } from '../types';

const FOCUS_HINT: Record<Focus, string> = {
  web: '',
  local: 'The person wants local businesses and places. Prefer local sources and give names, areas and how to contact them when the sources show it.',
  news: 'The person wants recent news. Prefer sources from the last few days and say how recent each is.',
  shopping: 'The person is shopping. Compare options with prices and sellers when the sources show them.',
  images: 'The person is looking for images. Describe what to look for and where to find it; do not invent image links.',
  videos: 'The person is looking for videos. Name the channels or videos the sources show; do not invent links.',
  academic: 'The person wants scholarly sources. Prefer papers, universities and journals, and say what kind of source each is.',
  business: 'The person is asking about running a business. Prefer practical, current, sourced guidance.',
};

// The question as the engine sees it: today's date, any focus, notes that came from the person's own saved
// conversations (as data), then the question itself.
export function userTurn(req: Pick<AdapterRequest, 'question' | 'focus' | 'extraContext' | 'preferences'>, now = new Date()): string {
  const hint = req.focus ? FOCUS_HINT[req.focus] : '';
  const prefs = (req.preferences ?? []).filter(Boolean);
  return `Today's date: ${now.toISOString().slice(0, 10)}${hint ? `\n${hint}` : ''}${prefs.length ? `\n${prefs.join('\n')}` : ''}\n\n${req.question}`
    + (req.extraContext ? `\n\n<earlier_conversations>\n${req.extraContext}\n</earlier_conversations>` : '');
}

// Sources keep the order they were first cited in; sources that were only searched follow, uncited.
export class SourceList {
  readonly cited: Citation[] = [];
  private readonly other: Citation[] = [];
  private static key = (u: string) => u.replace(/#.*$/, '').replace(/\/$/, '');
  /** Marks a source as cited and returns its number. */
  cite(url: string, title: string): number | null {
    if (!/^https?:\/\//i.test(url)) return null;
    const k = SourceList.key(url);
    let found = this.cited.find(c => SourceList.key(c.url) === k);
    if (found) return found.n;
    const i = this.other.findIndex(c => SourceList.key(c.url) === k);
    if (i >= 0) this.other.splice(i, 1);
    found = { n: this.cited.length + 1, url: url.slice(0, 500), title: (title || url).slice(0, 200), cited: true };
    this.cited.push(found);
    return found.n;
  }
  seen(url: string, title: string) {
    if (!/^https?:\/\//i.test(url)) return;
    const k = SourceList.key(url);
    if (this.cited.some(c => SourceList.key(c.url) === k) || this.other.some(c => SourceList.key(c.url) === k)) return;
    if (this.other.length < 30) this.other.push({ n: 0, url: url.slice(0, 500), title: (title || url).slice(0, 200), cited: false });
  }
  all(limit = 16): Citation[] {
    const rest = this.other.map((c, i) => ({ ...c, n: this.cited.length + i + 1 }));
    return [...this.cited, ...rest].slice(0, limit);
  }
}


// Gemini reports where each supported claim ends as a byte offset into the answer; markers go there.
export function insertMarkers(text: string, supports: { segment?: { endIndex?: number }; groundingChunkIndices?: number[] }[], numberOf: (chunk: number) => number | null): string {
  const bytes = Buffer.from(text, 'utf8');
  const inserts = new Map<number, number[]>();
  for (const s of supports) {
    const end = s.segment?.endIndex;
    if (typeof end !== 'number' || end < 0 || end > bytes.length) continue;
    for (const chunk of s.groundingChunkIndices ?? []) {
      const n = numberOf(chunk);
      if (n) { const list = inserts.get(end) ?? []; if (!list.includes(n)) list.push(n); inserts.set(end, list); }
    }
  }
  if (!inserts.size) return text;
  const parts: Buffer[] = []; let last = 0;
  for (const end of [...inserts.keys()].sort((a, b) => a - b)) {
    parts.push(bytes.subarray(last, end), Buffer.from(inserts.get(end)!.sort((a, b) => a - b).map(n => `[${n}]`).join(''), 'utf8'));
    last = end;
  }
  parts.push(bytes.subarray(last));
  return Buffer.concat(parts).toString('utf8');
}

