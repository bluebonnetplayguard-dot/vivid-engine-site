// Writes one static HTML file per indexable page (dist/<path>/index.html): the built index.html with that
// page's own title, description, canonical, social tags, robots rule and readable text. The server sends this
// file when it exists (backend/src/main.ts), so crawlers and link previews never see the homepage's tags.
// Same output as backend/src/seo.ts, which still covers pages that are not prerendered.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, (_m, t) => `<strong>${t}</strong>`).replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_m, t, href) => `<a href="${href}">${t}</a>`);
const shortTitle = t => t.replace(/\s*\|\s*Vivid Engine( Solutions)?\s*$/i, '').replace(/\s+\|\s+/g, ' – ');

export function renderPage(template, manifest, m) {
  let html = template;
  const setTag = (re, tag) => { html = re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `    ${tag}\n  </head>`); };
  const metaName = (name, value) => setTag(new RegExp(`<meta\\s+name="${name}"[^>]*>`), `<meta name="${name}" content="${esc(value)}" />`);
  const metaProp = (prop, value) => setTag(new RegExp(`<meta\\s+property="${prop}"[^>]*>`), `<meta property="${prop}" content="${esc(value)}" />`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(m.title)}</title>`);
  html = html.replace(/<html([^>]*)\slang="[^"]*"/, '<html$1').replace(/<html/, '<html lang="en"');
  metaName('description', m.description);
  metaName('robots', m.robots);
  metaProp('og:title', m.ogTitle);
  metaProp('og:description', m.ogDescription);
  metaProp('og:url', m.url);
  metaName('twitter:title', m.ogTitle);
  metaName('twitter:description', m.ogDescription);
  metaName('twitter:url', m.url);
  const preloads = (m.preload ?? []).filter(p => /^\/[\w./-]+\.(webp|png|jpe?g|avif)$/.test(p));
  if (preloads.length) html = html.replace('</head>', () => `    ${preloads.map((p, i) => `<link rel="preload" as="image" href="${esc(p)}"${i === 0 ? ' fetchpriority="high"' : ''} />`).join('\n    ')}\n  </head>`);
  setTag(/<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(m.url)}" />`);
  if (m.content) html = html.replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${body(manifest, m.content)}</div>`);
  return html;
}

function body(manifest, c) {
  const out = [`<h1 style="font-size:2rem;line-height:1.2;font-weight:700;margin:0 0 16px">${inline(c.h1)}</h1>`];
  for (const b of c.blocks ?? []) {
    out.push('<section style="margin:0 0 24px">');
    if (b.h2) out.push(`<h2 style="font-size:1.35rem;font-weight:700;margin:0 0 8px">${inline(b.h2)}</h2>`);
    for (const p of b.paragraphs ?? []) out.push(`<p style="margin:0 0 8px">${inline(p)}</p>`);
    if (b.items?.length) { out.push('<ul style="margin:0 0 8px;padding-left:20px">'); for (const i of b.items) out.push(`<li><strong>${inline(i.title)}</strong>${i.text ? ` – ${inline(i.text)}` : ''}</li>`); out.push('</ul>'); }
    out.push('</section>');
  }
  const s = manifest.site ?? {};
  const contact = [];
  if (s.displayPhone) contact.push(`Call <a href="tel:${esc((s.telephone || s.displayPhone).replace(/[^\d+]/g, ''))}">${esc(s.displayPhone)}</a>`);
  if (s.whatsapp && /^https:\/\/wa\.me\/\d+$/.test(s.whatsapp)) contact.push(`<a href="${esc(s.whatsapp)}">WhatsApp</a>`);
  if (s.email && /^[^\s@<>"]+@[^\s@<>"]+$/.test(s.email)) contact.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (contact.length) out.push(`<p style="margin:0 0 24px">${contact.join(' · ')}</p>`);
  const links = Object.values(manifest.pages).filter(p => !p.noindex).map(p => `<li><a href="${esc(p.path)}">${esc(shortTitle(p.title))}</a></li>`).join('');
  if (links) out.push(`<nav aria-label="Site pages"><ul style="margin:0;padding-left:20px">${links}</ul></nav>`);
  return `<div data-prerender style="max-width:1000px;margin:0 auto;padding:24px 16px;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${out.join('')}</div>`;
}

// dist/index.html stays the untouched app template (the server's fallback); "/" is written as dist/index.prerendered.html.
export function prerenderAll(distDir, manifest) {
  const template = readFileSync(join(distDir, 'index.html'), 'utf8');
  let n = 0;
  for (const m of Object.values(manifest.pages)) {
    if (m.noindex) continue;
    const html = renderPage(template, manifest, m);
    if (m.path === '/') { writeFileSync(join(distDir, 'index.prerendered.html'), html); n++; continue; }
    const dir = join(distDir, m.path.replace(/^\//, ''));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    n++;
  }
  return n;
}
