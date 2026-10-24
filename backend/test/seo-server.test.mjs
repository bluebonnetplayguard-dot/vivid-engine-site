// Server page tags: prerendered files are preferred for known pages, moved URLs redirect, and a request can
// never read a file outside the manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SeoPages } = require('../dist/seo.js');

const meta = (path, extra = {}) => ({ path, url: `https://vividenginesolutions.com${path}`, title: `T ${path}`, description: 'd', ogTitle: 'o', ogDescription: 'o', image: '', robots: 'index, follow', noindex: false, ...extra });
function site() {
  const dir = mkdtempSync(join(tmpdir(), 'seo-'));
  writeFileSync(join(dir, 'index.html'), '<html><head><title>Home</title></head><body><div id="root"></div></body></html>');
  writeFileSync(join(dir, 'seo-routes.json'), JSON.stringify({
    pages: { '/': meta('/'), '/pricing': meta('/pricing'), '/about': meta('/about'), '/login': meta('/login', { noindex: true, robots: 'noindex' }) },
    privatePatterns: ['^/portal'], notFound: meta('/404', { noindex: true }), privatePage: meta('/portal', { noindex: true }),
    redirects: { '/ai-search': '/search', '/bad': '//evil.example', '/loop': '/loop' },
  }));
  writeFileSync(join(dir, 'index.prerendered.html'), 'PRERENDERED HOME');
  mkdirSync(join(dir, 'pricing'));
  writeFileSync(join(dir, 'pricing', 'index.html'), 'PRERENDERED PRICING');
  mkdirSync(join(dir, 'secret'));
  writeFileSync(join(dir, 'secret', 'index.html'), 'SECRET');
  return new SeoPages(dir);
}

test('prerendered file is served for known indexable pages, generated tags otherwise', () => {
  const seo = site();
  assert.equal(seo.render('/').html, 'PRERENDERED HOME');
  assert.equal(seo.render('/pricing').html, 'PRERENDERED PRICING');
  assert.match(seo.render('/about').html, /<title>T \/about<\/title>/);
  assert.equal(seo.render('/login').noindex, true);
});
test('a file on disk that is not in the manifest is never served', () => {
  const page = site().render('/secret');
  assert.equal(page.status, 404);
  assert.doesNotMatch(page.html, /SECRET/);
});
test('redirects: local targets only, no self-loops', () => {
  const seo = site();
  assert.equal(seo.redirectFor('/ai-search'), '/search');
  assert.equal(seo.redirectFor('/bad'), null);
  assert.equal(seo.redirectFor('/loop'), null);
  assert.equal(seo.redirectFor('/pricing'), null);
});
