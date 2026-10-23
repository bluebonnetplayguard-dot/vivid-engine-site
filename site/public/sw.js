/* Only public HTML and explicitly allowed static resources are cached.
   Account pages and any page opened with a query string (?thread=, ?aiq=, ?q=) are never cached,
   so saved conversations can't be read back from the browser cache on a shared device. */
const VERSION = 've-2026-10-23-home-v2-1';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/', '/offline.html', '/manifest.json', '/favicon-192.png', '/logo-160.webp'];
const PRIVATE = /^\/(?:api|functions|auth|login|register|reset-password|forgot-password|portal|admin|settings|start|oauth|delete-account|ai-search\/account|video\/account|video\/edit)(?:\/|$)|session-recordings/i;
const PUBLIC = /^\/(?:$|ai-search(?:\/pricing)?\/?$|video(?:\/pricing)?\/?$|services(?:\/custom-app-development)?\/?$|locations\/(?:beaumont-web-design|lake-charles-app-development)\/?$|pricing\/?$|about\/?$|contact\/?$|maintenance\/?$|domain-leasing\/?$|faq\/?$|support\/?$|privacy\/?$|vivid-estimator\/?$|service-areas(?:\/[^/]+)?\/?$)/;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('ve-') || /^shell-v1-2026-10-16$|^static-v1-2026-10-16$/.test(key)) && key !== SHELL && key !== STATIC).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const font = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.href);
  if (!sameOrigin && !font) return;
  if (req.mode === 'navigate') {
    const publicPage = PUBLIC.test(url.pathname) && !PRIVATE.test(url.pathname) && !url.search;
    event.respondWith(fetch(req).then(response => {
      if (response.ok && publicPage && !response.redirected) {
        const copy = response.clone();
        event.waitUntil(caches.open(SHELL).then(cache => cache.put(url.pathname, copy)));
      }
      return response;
    }).catch(async () => (publicPage && (await caches.match(url.pathname) || await caches.match('/'))) || await caches.match('/offline.html') || Response.error()));
    return;
  }
  if (sameOrigin && PRIVATE.test(url.pathname)) return;
  // Do not intercept unknown requests, tracking, JSON, user uploads or payment resources.
  const asset = sameOrigin && /^\/assets\/[^/]+\.(?:js|css|woff2?|png|jpe?g|webp|svg)$/.test(url.pathname);
  const staticFile = sameOrigin && (/^\/icons\/[^/]+\.png$/.test(url.pathname) || ['/manifest.json', '/offline.html', '/logo.png', '/logo-160.webp', '/logo-400.webp', '/hero-background.webp', '/logo-1024.png', '/favicon-32.png', '/favicon-192.png', '/apple-touch-icon.png', '/og-image.png'].includes(url.pathname));
  if (!asset && !staticFile && !font) return;
  event.respondWith(caches.open(STATIC).then(async cache => {
    const hit = await cache.match(req);
    if (asset && hit) return hit;
    const network = fetch(req).then(response => {
      if (response.ok || (font && response.type === 'opaque')) event.waitUntil(cache.put(req, response.clone()));
      return response;
    });
    if (hit) { event.waitUntil(network.catch(() => undefined)); return hit; }
    return network;
  }));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
