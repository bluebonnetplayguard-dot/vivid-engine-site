import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Server-side page tags for the single-page website.
// Every URL used to receive the same index.html, so before JavaScript ran, each page
// looked like the homepage (same title, description, social preview and a canonical
// pointing at "/"). This fills in each page's own tags from dist/seo-routes.json
// (built from the site's own SEO data) and returns proper status codes:
//   public page       -> 200, its own tags, indexable unless the page opts out
//   signed-in areas   -> 200, noindex (+ X-Robots-Tag header)
//   unknown URL       -> 404, noindex (React still shows the friendly Not Found page)
//
// Indexable public pages also get their readable text (heading, sections, links and
// contact details) inside <div id="root">, so crawlers and AI tools that don't run
// JavaScript can read the page. React's createRoot replaces it when the app loads.
// Emergency switch: set SEO_BODY_CONTENT=off for the app container to stop adding the text.

interface ContentBlock { h2?: string; paragraphs?: string[]; items?: { title: string; text?: string }[] }
interface PageContent { h1: string; blocks: ContentBlock[] }
interface PageMeta {
  path: string; url: string; title: string; description: string;
  ogTitle: string; ogDescription: string; image: string; robots: string; noindex: boolean;
  preload?: string[]; content?: PageContent;
}
interface SiteContact { name?: string; displayPhone?: string; telephone?: string; email?: string; whatsapp?: string }
interface Manifest { pages: Record<string, PageMeta>; privatePatterns: string[]; notFound: PageMeta; privatePage: PageMeta; site?: SiteContact }

export interface RenderedPage { status: number; html: string; noindex: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Escapes text, then allows only **bold** and [text](/local-path) from the site's data files.
const inline = (s: unknown) => esc(String(s ?? ''))
  .replace(/\*\*(.+?)\*\*/g, (_m, t) => `<strong>${t}</strong>`)
  .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_m, t, href) => `<a href="${href}">${t}</a>`);
const shortTitle = (t: string) => t.replace(/\s*\|\s*Vivid Engine( Solutions)?\s*$/i, '').replace(/\s+\|\s+/g, ' \u2013 ');
const BODY_CONTENT = process.env.SEO_BODY_CONTENT !== 'off';

export class SeoPages {
  private readonly template: string;
  private readonly manifest: Manifest | null;
  private readonly privateRes: RegExp[];
  private readonly cache = new Map<string, RenderedPage>();

  constructor(staticDir: string) {
    this.template = readFileSync(join(staticDir, 'index.html'), 'utf8');
    const file = join(staticDir, 'seo-routes.json');
    this.manifest = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest) : null;
    this.privateRes = (this.manifest?.privatePatterns ?? []).map(p => new RegExp(p));
  }

  get enabled() { return !!this.manifest; }

  render(pathname: string): RenderedPage {
    const cached = this.cache.get(pathname);
    if (cached) return cached;
    let result: RenderedPage;
    if (!this.manifest) {
      result = { status: 200, html: this.template, noindex: false }; // older build without a manifest: previous behavior
    } else if (this.manifest.pages[pathname]) {
      const meta = this.manifest.pages[pathname];
      result = { status: 200, html: this.apply(meta, true), noindex: meta.noindex };
    } else if (this.privateRes.some(re => re.test(pathname))) {
      result = { status: 200, html: this.apply(this.manifest.privatePage, false), noindex: true };
    } else {
      result = { status: 404, html: this.apply(this.manifest.notFound, false), noindex: true };
    }
    // Only cache known routes; unknown URLs are unbounded.
    if (result.status === 200) this.cache.set(pathname, result);
    return result;
  }

  // Replaces the homepage defaults in index.html with this page's values.
  private apply(m: PageMeta, withCanonical: boolean): string {
    let html = this.template;
    // Function replacements: prices like "$999" in descriptions must not be read as "$n" patterns.
    const setTag = (re: RegExp, tag: string) => { html = re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `    ${tag}\n  </head>`); };
    const metaName = (name: string, value: string) => setTag(new RegExp(`<meta\\s+name="${name}"[^>]*>`), `<meta name="${name}" content="${esc(value)}" />`);
    const metaProp = (prop: string, value: string) => setTag(new RegExp(`<meta\\s+property="${prop}"[^>]*>`), `<meta property="${prop}" content="${esc(value)}" />`);

    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(m.title)}</title>`);
    metaName('description', m.description);
    metaName('robots', m.robots);
    metaProp('og:title', m.ogTitle);
    metaProp('og:description', m.ogDescription);
    metaProp('og:url', m.url);
    metaName('twitter:title', m.ogTitle);
    metaName('twitter:description', m.ogDescription);
    metaName('twitter:url', m.url);
    // Only local paths, so a bad manifest entry can't point the browser elsewhere.
    const preloads = (m.preload ?? []).filter(p => /^\/[\w./-]+\.(webp|png|jpe?g|avif)$/.test(p));
    if (preloads.length) {
      const links = preloads.map((p, i) => `<link rel="preload" as="image" href="${esc(p)}"${i === 0 ? ' fetchpriority="high"' : ''} />`).join('\n    ');
      html = html.replace('</head>', () => `    ${links}\n  </head>`);
    }
    if (withCanonical) setTag(/<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(m.url)}" />`);
    else html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/, ''); // no canonical on 404 or private pages
    // Readable text only for indexable public pages; private, account and 404 pages stay empty.
    if (BODY_CONTENT && withCanonical && !m.noindex && m.content) {
      const body = this.body(m.content);
      html = html.replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${body}</div>`);
    }
    return html;
  }

  private body(c: PageContent): string {
    const out: string[] = [`<h1 style="font-size:2rem;line-height:1.2;font-weight:700;margin:0 0 16px">${inline(c.h1)}</h1>`];
    for (const b of c.blocks ?? []) {
      out.push('<section style="margin:0 0 24px">');
      if (b.h2) out.push(`<h2 style="font-size:1.35rem;font-weight:700;margin:0 0 8px">${inline(b.h2)}</h2>`);
      for (const p of b.paragraphs ?? []) out.push(`<p style="margin:0 0 8px">${inline(p)}</p>`);
      if (b.items?.length) {
        out.push('<ul style="margin:0 0 8px;padding-left:20px">');
        for (const i of b.items) out.push(`<li><strong>${inline(i.title)}</strong>${i.text ? ` \u2013 ${inline(i.text)}` : ''}</li>`);
        out.push('</ul>');
      }
      out.push('</section>');
    }
    const s = this.manifest?.site ?? {};
    const contact: string[] = [];
    if (s.displayPhone) contact.push(`Call <a href="tel:${esc((s.telephone || s.displayPhone).replace(/[^\d+]/g, ''))}">${esc(s.displayPhone)}</a>`);
    if (s.whatsapp && /^https:\/\/wa\.me\/\d+$/.test(s.whatsapp)) contact.push(`<a href="${esc(s.whatsapp)}">WhatsApp</a>`);
    if (s.email && /^[^\s@<>"]+@[^\s@<>"]+$/.test(s.email)) contact.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
    if (contact.length) out.push(`<p style="margin:0 0 24px">${contact.join(" \u00b7 ")}</p>`);
    const links = Object.values(this.manifest?.pages ?? {}).filter(p => !p.noindex)
      .map(p => `<li><a href="${esc(p.path)}">${esc(shortTitle(p.title))}</a></li>`).join('');
    if (links) out.push(`<nav aria-label="Site pages"><ul style="margin:0;padding-left:20px">${links}</ul></nav>`);
    return `<div data-prerender style="max-width:1000px;margin:0 auto;padding:24px 16px;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${out.join('')}</div>`;
  }
}
