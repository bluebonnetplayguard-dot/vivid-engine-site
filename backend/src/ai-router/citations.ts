import { Citation } from './types';

// Engines mark sources in different ways ([web:3], [3], 【3】, [source 3]). The site shows one style: [3].
export function normalizeCitations(text: string, count: number): { text: string; used: number[] } {
  const used = new Set<number>();
  const out = text
    .replace(/\[(?:web|source|src|ref|cite)\s*[:#]?\s*(\d{1,3})(?:\s*[,;]\s*(?:web|source|src|ref|cite)?\s*[:#]?\s*\d{1,3})*\]/gi, m => {
      const nums = [...m.matchAll(/\d{1,3}/g)].map(x => Number(x[0]));
      return nums.map(n => `[${n}]`).join('');
    })
    .replace(/【(\d{1,3})(?:[†:][^】]*)?】/g, '[$1]')
    .replace(/\[(\d{1,3})(?:\s*[,;]\s*(\d{1,3}))+\]/g, m => [...m.matchAll(/\d{1,3}/g)].map(x => `[${x[0]}]`).join(''))
    .replace(/\[(\d{1,3})\]/g, (m, d) => {
      const n = Number(d);
      if (n < 1 || n > count) return '';        // a marker pointing at a source that does not exist is dropped
      used.add(n);
      return m;
    })
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/ {2,}/g, ' ');
  return { text: out, used: [...used].sort((a, b) => a - b) };
}

// Merges several engines' source lists into one numbered list; returns how each engine's numbers map to the new ones.
export function mergeCitations(lists: Citation[][]): { citations: Citation[]; maps: Map<number, number>[] } {
  const byUrl = new Map<string, Citation>();
  const maps = lists.map(() => new Map<number, number>());
  lists.forEach((list, i) => {
    for (const c of list) {
      const key = c.url.replace(/#.*$/, '').replace(/\/$/, '');
      let found = byUrl.get(key);
      if (!found) { found = { n: byUrl.size + 1, url: c.url, title: c.title, cited: c.cited }; byUrl.set(key, found); }
      else found.cited ||= c.cited;
      maps[i].set(c.n, found.n);
    }
  });
  return { citations: [...byUrl.values()], maps };
}

// Rewrites [n] markers in one engine's answer to the merged numbering.
export const remapMarkers = (text: string, map: Map<number, number>) => text.replace(/\[(\d{1,3})\]/g, (m, d) => (map.has(Number(d)) ? `[${map.get(Number(d))}]` : ''));

// Marks sources as cited/uncited from the markers left in the final text, and renumbers so the first marker is [1].
export function renumberByUse(text: string, citations: Citation[]): { text: string; citations: Citation[] } {
  const order: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,3})\]/g)) { const n = Number(m[1]); if (!order.includes(n) && citations[n - 1]) order.push(n); }
  const map = new Map(order.map((old, i) => [old, i + 1]));
  const cited = order.map((old, i) => ({ ...citations[old - 1], n: i + 1, cited: true }));
  const rest = citations.filter(c => !map.has(c.n)).map((c, i) => ({ ...c, n: cited.length + i + 1, cited: false }));
  return { text: text.replace(/\[(\d{1,3})\]/g, (m, d) => (map.has(Number(d)) ? `[${map.get(Number(d))}]` : '')), citations: [...cited, ...rest] };
}
