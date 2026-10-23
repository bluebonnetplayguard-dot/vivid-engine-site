// Runs after `vite build`: writes dist/seo-routes.json for the server, and fails the
// build if any route in src/App.jsx is not classified (public page, private area,
// dynamic city page or the 404 fallback). That keeps new pages from silently
// shipping with the homepage's title and canonical.
import { build } from 'vite';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, '.seo-build');

await build({
  configFile: false,
  root,
  logLevel: 'warn',
  resolve: { alias: { '@': join(root, 'src') } },
  build: { ssr: 'src/seo/routeManifest.js', outDir, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'routeManifest.mjs' } } },
});
const { buildRouteManifest } = await import(pathToFileURL(join(outDir, 'routeManifest.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const manifest = buildRouteManifest();
const privateRes = manifest.privatePatterns.map(p => new RegExp(p));

// Every <Route path="..."> in App.jsx must be accounted for.
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const routes = [...app.matchAll(/<Route\s+path=['"]([^'"]+)['"]/g)].map(m => m[1]);
const unclassified = routes.filter(path => {
  if (path === '*' || manifest.pages[path]) return false;
  if (path === '/service-areas/:slug') return false;            // enumerated from SERVICE_AREAS
  const sample = path.replace(/:[^/]+/g, 'sample-id');
  return !privateRes.some(re => re.test(sample));
});
if (unclassified.length) {
  console.error(`\nSEO manifest: these routes in src/App.jsx have no SEO entry and are not marked private:\n  ${unclassified.join('\n  ')}`);
  console.error('Add them to src/seo/routeManifest.js (public pages) or PRIVATE_PATTERNS (signed-in areas).\n');
  process.exit(1);
}

writeFileSync(join(root, 'dist/seo-routes.json'), JSON.stringify(manifest, null, 2));
const pages = Object.values(manifest.pages);

// The sitemap lists exactly the indexable pages the server knows about, so it can't drift
// from the routes or include noindex pages. No <lastmod>: a build date on every URL would
// be inaccurate, and Google ignores dates it can't trust.
const xmlEscape = v => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const indexable = pages.filter(p => !p.noindex);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(p => `  <url><loc>${xmlEscape(p.url)}</loc></url>`).join('\n')}\n</urlset>\n`;
writeFileSync(join(root, 'dist/sitemap.xml'), sitemap);
writeFileSync(join(root, 'public/sitemap.xml'), sitemap); // so `npm run dev` serves the same file

console.log(`SEO manifest: ${pages.length} URLs (${indexable.length} indexable), ${routes.length} routes checked -> dist/seo-routes.json, dist/sitemap.xml`);
