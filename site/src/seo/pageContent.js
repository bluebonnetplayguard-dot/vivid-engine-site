// Plain-HTML page text for search engines, AI tools and link previews.
// Built from the same data the React pages display, so the text always matches the page.
// The server (backend/src/seo.ts) puts it inside <div id="root">; React replaces it on load.

const BRAND = /\s*\|\s*Vivid Engine( Solutions)?\s*$/i;
const str = v => (v == null ? '' : String(v)).trim();

export const headingFromTitle = title => str(title).replace(BRAND, '').replace(/\s+\|\s+/g, ' \u2013 ');

// Pages built from src/data/regional/*.js (Beaumont, Lake Charles, app development).
export function regionalContent(d) {
  const blocks = [];
  if (d.lede) blocks.push({ paragraphs: [str(d.lede)] });
  if (d.local) {
    blocks.push({
      h2: str(d.local.title),
      paragraphs: [...(d.local.paragraphs || []), d.local.related].filter(Boolean).map(str),
      items: (d.local.coverage || []).map(([title, text]) => ({ title: str(title), text: str(text) })),
    });
  }
  for (const s of d.sections || []) {
    const b = { h2: str(s.title || s.label), paragraphs: s.description ? [str(s.description)] : [], items: [] };
    for (const c of s.cards || []) b.items.push({ title: str(c.title), text: (c.paragraphs || []).map(str).join(' ') });
    for (const st of s.steps || []) if (Array.isArray(st)) b.items.push({ title: str(st[0]), text: str(st[1]) });
    for (const p of s.prices || []) if (Array.isArray(p)) b.items.push({ title: `${str(p[0])}: ${str(p[1])} ${str(p[2])}`.trim(), text: str(p[3]) });
    if (s.paymentNote) b.paragraphs.push(str(s.paymentNote));
    if (b.paragraphs.length || b.items.length) blocks.push(b);
  }
  const h1 = [d.heading, d.highlight].map(str).filter(Boolean).join(' ') || headingFromTitle(d.title);
  return { h1, blocks };
}

// Every other public page: its own heading and description.
export const basicContent = meta => ({ h1: headingFromTitle(meta.title), blocks: meta.description ? [{ paragraphs: [str(meta.description)] }] : [] });

// Contact details from src/data/seoSite.js (the object that has displayPhone).
export function siteContact(seoSite) {
  const s = Object.values(seoSite).find(v => v && typeof v === 'object' && 'displayPhone' in v) || {};
  return { name: str(s.name) || 'Vivid Engine Solutions', displayPhone: str(s.displayPhone), telephone: str(s.telephone || s.phone), email: str(s.email), whatsapp: str(s.whatsapp) };
}
