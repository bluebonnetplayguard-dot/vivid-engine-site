// Renders every route to static HTML after the client and server builds,
// then writes sitemap.xml and robots.txt next to it.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const clientDir = join(root, 'client');
const serverEntry = join(root, 'server', 'entry-server.js');

const template = await readFile(join(clientDir, 'index.html'), 'utf8');
const { render, paths, sitemapPaths, siteUrl } = await import(pathToFileURL(serverEntry).href);

for (const path of paths) {
  const { html, head } = render(path);
  const page = template.replace('<!--head-->', head).replace('<!--app-->', html);
  const file = path === '/' ? 'index.html' : path === '/404' ? '404.html' : join(path.slice(1), 'index.html');
  await mkdir(dirname(join(clientDir, file)), { recursive: true });
  await writeFile(join(clientDir, file), page);
  console.log(`prerendered ${path} -> ${file}`);
}

const today = new Date().toISOString().slice(0, 10);
const urls = sitemapPaths
  .map((p) => `  <url><loc>${siteUrl}${p}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
await writeFile(
  join(clientDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
await writeFile(join(clientDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

// The server bundle is only needed at build time.
await rm(join(root, 'server'), { recursive: true });
