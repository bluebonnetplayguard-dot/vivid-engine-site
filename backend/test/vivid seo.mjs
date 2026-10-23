// End-to-end smoke test against a running API with an EMPTY test database.
//   BASE=http://localhost:8080 DATABASE_URL=postgres://... node test/smoke.mjs
// Never point this at production: it creates users and records.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const BASE = process.env.BASE || 'http://localhost:8080';
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function call(method, path, { body, token, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* html or empty */ }
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, data, cookie: (setCookie.match(/ve_refresh=[^;]*/) || [])[0], type: res.headers.get('content-type') || '' };
}

async function makeUser(email, password = 'correct-horse-battery') {
  const r = await call('POST', '/api/auth/register', { body: { email, password } });
  ok(r.status === 200, `register ${email}`, JSON.stringify(r.data));
  // Codes are emailed (hashed in the DB), so the test verifies the account directly.
  await db.query(`UPDATE users SET email_verified = true, role = CASE WHEN email = 'admin@test.local' THEN 'admin' ELSE role END WHERE email = $1`, [email]);
  const login = await call('POST', '/api/auth/login', { body: { email, password } });
  ok(login.status === 200 && login.data.access_token && login.cookie, `login ${email}`, JSON.stringify(login.data));
  return { token: login.data.access_token, cookie: login.cookie, user: login.data.user };
}

console.log('\n# Site and health');
let r = await call('GET', '/api/health'); ok(r.status === 200 && r.data.ok, 'GET /api/health');
r = await call('GET', '/'); ok(r.status === 200 && r.type.includes('html') && String(r.data).includes('<div id="root">'), 'GET / serves the site');
r = await call('GET', '/portal/projects/abc'); ok(r.status === 200 && r.type.includes('html'), 'deep link falls back to index.html');
r = await call('GET', '/.well-known/assetlinks.json'); ok(r.status === 200 && Array.isArray(r.data), 'assetlinks.json served');
r = await call('GET', '/.well-known/apple-app-site-association'); ok(r.status === 200 && r.type.includes('json') && r.data.applinks, 'AASA served as JSON');
r = await call('GET', '/api/nope'); ok(r.status === 404 && r.type.includes('json'), 'unknown API route is a JSON 404');

console.log('\n# SEO: tags and status codes in the raw HTML (what crawlers and link previews see)');
{
  const page = async (path) => {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    const html = await res.text();
    const tag = re => (html.match(re) || [])[1];
    return {
      status: res.status, location: res.headers.get('location'), xrobots: res.headers.get('x-robots-tag'),
      title: tag(/<title>([^<]*)<\/title>/), canonical: tag(/<link rel="canonical" href="([^"]*)"/),
      robots: tag(/<meta name="robots" content="([^"]*)"/), description: tag(/<meta name="description" content="([^"]*)"/),
      ogUrl: tag(/<meta property="og:url" content="([^"]*)"/), ogTitle: tag(/<meta property="og:title" content="([^"]*)"/),
      titles: (html.match(/<title>/g) || []).length, canonicals: (html.match(/rel="canonical"/g) || []).length,
    };
  };
  let p = await page('/');
  ok(p.status === 200 && p.canonical === 'https://vividenginesolutions.com/' && p.robots.startsWith('index'), 'home: 200, canonical to itself, indexable');
  p = await page('/about');
  ok(p.status === 200 && p.title === 'About Us | Web &amp; App Development, Houston to Lafayette' && p.canonical === 'https://vividenginesolutions.com/about', 'about: own title and canonical', JSON.stringify(p));
  ok(p.ogUrl === 'https://vividenginesolutions.com/about' && p.ogTitle === p.title && p.titles === 1 && p.canonicals === 1, 'about: social tags match, no duplicate tags');
  p = await page('/pricing');
  ok(p.title === 'Website Design &amp; Maintenance Pricing | Vivid Engine Solutions' && p.description.includes('$999') && p.description.includes('$49/mo'), 'pricing: own title; "$" prices kept intact', JSON.stringify(p));
  p = await page('/locations/beaumont-web-design');
  ok(p.ogTitle === 'Web Design &amp; App Development in Beaumont, TX | Vivid Engine Solutions' && p.canonical.endsWith('/locations/beaumont-web-design'), 'regional page: own tags');
  p = await page('/service-areas/lake-charles-la');
  ok(p.status === 200 && p.robots.startsWith('index') && !p.xrobots, 'city page with real content: indexable');
  p = await page('/service-areas/beaumont-tx');
  ok(p.status === 200 && p.robots === 'noindex, nofollow' && p.xrobots === 'noindex, nofollow', 'thin city page: noindex');
  p = await page('/service-areas/atlantis');
  ok(p.status === 404 && p.robots === 'noindex, nofollow', 'unknown city: 404');
  p = await page('/this-page-does-not-exist');
  ok(p.status === 404 && p.robots === 'noindex, nofollow' && p.canonicals === 0 && p.title === 'Page Not Found', 'unknown URL: real 404, noindex, no canonical', JSON.stringify(p));
  p = await page('/login');
  ok(p.status === 200 && p.title === 'Client Login — Vivid Engine Solutions' && p.robots === 'noindex, nofollow' && p.xrobots, 'login: own title, noindex (header too)', JSON.stringify(p));
  for (const path of ['/portal', '/portal/projects/abc123', '/admin/pricing', '/settings', '/start']) {
    p = await page(path);
    ok(p.status === 200 && p.xrobots === 'noindex, nofollow' && p.canonicals === 0 && !p.title.includes('Beaumont'), `private ${path}: noindex, no homepage tags`);
  }
  p = await page('/about/');
  ok(p.status === 301 && p.location === '/about', 'trailing slash: 301 to /about', JSON.stringify(p));
  p = await page('/pricing/?plan=starter');
  ok(p.status === 301 && p.location === '/pricing?plan=starter', 'trailing slash keeps query string');
  p = await page('/robots.txt');
  ok(p.status === 200, 'robots.txt still served as a file');
  p = await page('/delete-account');
  ok(p.status === 200 && p.robots === 'noindex, nofollow' && p.xrobots === 'noindex, nofollow', 'delete-account: reachable but noindex', JSON.stringify(p));

  // Sitemap: built from the same page list as the server, indexable pages only.
  const sm = await fetch(BASE + '/sitemap.xml');
  const smXml = await sm.text();
  const locs = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  ok(sm.status === 200 && locs.includes('https://vividenginesolutions.com/') && locs.includes('https://vividenginesolutions.com/about'), 'sitemap served with public pages', `${sm.status} ${locs.length}`);
  ok(!locs.some(u => /\/(delete-account|login|register|forgot-password|reset-password|portal|admin|settings|start)\b/.test(u)) && !locs.includes('https://vividenginesolutions.com/service-areas/beaumont-tx'), 'sitemap leaves out private and noindex pages', locs.join(' '));
  let sitemapPagesIndexable = true;
  for (const u of locs) {
    const sp = await page(new URL(u).pathname);
    if (sp.status !== 200 || !sp.robots?.startsWith('index') || sp.canonical !== u) { sitemapPagesIndexable = false; console.log(`        ${u}: ${sp.status} ${sp.robots} ${sp.canonical}`); }
  }
  ok(sitemapPagesIndexable, 'every sitemap URL is 200, indexable and canonical to itself');

  // No placeholder tracking or verification tags left in the page.
  const raw = await (await fetch(BASE + '/')).text();
  ok(!raw.includes('REPLACE_ME') && !raw.includes('G-XXXXXXXXXX') && !raw.includes('000000000000000'), 'no placeholder verification or tracker tags');
  const ld = JSON.parse((raw.match(/<script id="ld-site" type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || '{}');
  const biz = ld['@graph']?.[0] || {};
  ok(biz.address?.streetAddress === '410 Chestnut Business Parkway Dr' && biz.address?.postalCode === '77375' && biz.telephone === '+1-281-826-4068' && !biz.geo
    && biz.contactPoint?.some(c => c.url === 'https://wa.me/17138264068') && !raw.includes('30.0802'), 'business structured data: Tomball address, office phone, WhatsApp, no Beaumont coordinates', JSON.stringify(biz.address));

  // Speed: hero image preload on the homepage only, and compressed scripts.
  const home = await (await fetch(BASE + '/')).text();
  const about = await (await fetch(BASE + '/about')).text();
  ok(home.includes('<link rel="preload" as="image" href="/hero-background.webp" fetchpriority="high" />') && !about.includes('rel="preload" as="image"'), 'hero image preloaded on the homepage only');
  const mainJs = (home.match(/\/assets\/index-[^"]+\.js/) || [])[0];
  const jsRes = await fetch(BASE + mainJs, { headers: { 'Accept-Encoding': 'gzip' } });
  ok(jsRes.status === 200 && jsRes.headers.get('content-encoding') === 'gzip', 'main script is sent compressed', `${jsRes.status} ${jsRes.headers.get('content-encoding')}`);
  const img = await fetch(BASE + '/logo-160.webp');
  ok(img.status === 200 && img.headers.get('content-type') === 'image/webp', 'optimized logo served as WebP');
}

console.log('\n# Auth');
r = await call('POST', '/api/auth/register', { body: { email: 'bad', password: 'x' } }); ok(r.status === 400, 'invalid registration rejected');
const admin = await makeUser('admin@test.local');
ok(admin.user.role === 'admin', 'ADMIN_EMAILS user is admin');
const client = await makeUser('client@test.local');
const other = await makeUser('other@test.local');

console.log('\n# AI Search');
{
  r = await call('GET', '/api/ai-search/plans');
  ok(r.status === 200 && r.data.tiers.length === 6 && r.data.tiers.find(t => t.id === 'business')?.perSeat === true && !('model' in r.data.tiers[0]), 'plans: 6 tiers, Business per seat, no internal fields', JSON.stringify(r.data).slice(0, 300));
  r = await call('POST', '/api/ai-search/ask', { body: { question: 'hi' } });
  ok(r.status === 401, 'ask requires sign-in');
  r = await call('GET', '/api/ai-search/me', { token: client.token });
  ok(r.status === 200 && r.data.tier.id === 'free' && r.data.usage.dailyLimit === 5 && r.data.usage.today === 0, 'new account is on Free with 5 a day', JSON.stringify(r.data));
  r = await call('POST', '/api/ai-search/ask', { token: client.token, body: { question: '   ' } });
  ok(r.status === 400, 'empty question rejected');
  r = await call('POST', '/api/ai-search/ask', { token: client.token, body: { question: 'x'.repeat(4001) } });
  ok(r.status === 400, 'over-long question rejected');
  r = await call('POST', '/api/ai-search/ask', { token: client.token, body: { question: 'hi', threadId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
  ok(r.status === 404 || r.status === 503, "can't continue someone else's or a missing conversation");
  r = await call('POST', '/api/ai-search/checkout', { token: client.token, body: { tier: 'free' } });
  ok(r.status === 400 || r.status === 503, 'checkout refuses the free tier');
  r = await call('GET', '/api/ai-search/team', { token: client.token });
  ok(r.status === 403, 'team management is for Business owners only');
  r = await call('GET', '/api/ai-search/threads', { token: client.token });
  ok(r.status === 200 && Array.isArray(r.data), 'threads list');
  const page = await fetch(BASE + '/ai-search');
  const html = await page.text();
  ok(page.status === 200 && html.includes('<title>Vivid AI Search') && !page.headers.get('x-robots-tag'), 'AI Search page: indexable with its own title');
  const account = await fetch(BASE + '/ai-search/account');
  ok(account.headers.get('x-robots-tag') === 'noindex, nofollow', 'AI Search account page is noindex');
}

console.log('\n# Video Studio');
{
  r = await call('GET', '/api/video/plans');
  ok(r.status === 200 && r.data.tiers.length === 5 && r.data.tiers.find(t => t.id === 'business')?.perSeat === true && Array.isArray(r.data.voices), 'plans: 5 tiers, Business per seat, voices listed', JSON.stringify(r.data).slice(0, 300));
  r = await call('GET', '/api/video/me');
  ok(r.status === 401, 'plan status requires sign-in');
  r = await call('GET', '/api/video/me', { token: client.token });
  ok(r.status === 200 && r.data.tier.id === 'free' && r.data.tier.watermark === true && r.data.usage.exports.used === 0, 'new account is on Free with a watermark', JSON.stringify(r.data).slice(0, 300));
  r = await call('POST', '/api/video/projects', { token: client.token, body: { title: 'Smoke test', aspect: '9:16', data: { v: 1, tracks: [] } } });
  const projectId = r.data?.id;
  ok(r.status === 200 && projectId, 'create a project', JSON.stringify(r.data));
  r = await call('PUT', `/api/video/projects/${projectId}`, { token: client.token, body: { title: 'Smoke test 2', aspect: '9:16', duration: 3, data: { v: 1, tracks: [] } } });
  ok(r.status === 200 && r.data.title === 'Smoke test 2', 'save a project');
  r = await call('GET', `/api/video/projects/${projectId}`, { token: client.token });
  ok(r.status === 200 && r.data.aspect === '9:16', 'open a project');
  r = await call('POST', '/api/video/exports', { token: client.token, body: { width: 1080, height: 1080, fps: 30, duration: 10, level: 'basic' } });
  ok(r.status === 403, 'Free cannot export 1080p');
  r = await call('POST', '/api/video/exports', { token: client.token, body: { width: 720, height: 720, fps: 30, duration: 10, level: 'pro' } });
  ok(r.status === 403, 'Free cannot export Pro effects');
  r = await call('POST', '/api/video/exports', { token: client.token, body: { width: 720, height: 720, fps: 30, duration: 10, level: 'basic' } });
  ok(r.status === 200 && r.data.watermark === true, 'Free 720p export allowed, with watermark');
  r = await call('POST', '/api/video/brand-kits', { token: client.token, body: { name: 'x', data: {} } });
  ok(r.status === 403, 'brand kits need a paid plan');
  r = await call('POST', '/api/video/storyboard', { token: client.token, body: { text: 'short' } });
  ok(r.status === 400 || r.status === 503, 'storyboard rejects too-short text');
  r = await call('GET', '/api/video/stock/file?url=' + encodeURIComponent('https://example.com/a.mp4'), { token: client.token });
  ok(r.status === 400, 'stock relay refuses non-Pexels hosts');
  r = await call('POST', '/api/video/checkout', { token: client.token, body: { tier: 'free' } });
  ok(r.status === 400 || r.status === 503, 'checkout refuses the free tier');
  r = await call('DELETE', `/api/video/projects/${projectId}`, { token: client.token });
  ok(r.status === 200, 'delete a project');
  const page = await fetch(BASE + '/video');
  const html = await page.text();
  ok(page.status === 200 && html.includes('<title>Vivid Video Studio') && !page.headers.get('x-robots-tag'), 'Video Studio page: indexable with its own title');
  const editor = await fetch(BASE + '/video/edit/abc');
  ok(editor.headers.get('x-robots-tag') === 'noindex, nofollow', 'editor pages are noindex');
}
r = await call('GET', '/api/auth/me', { token: client.token }); ok(r.status === 200 && r.data.email === 'client@test.local', 'GET /auth/me');
r = await call('GET', '/api/auth/me'); ok(r.status === 401, '/auth/me without token is 401');
r = await call('POST', '/api/auth/login', { body: { email: 'client@test.local', password: 'wrong-password' } }); ok(r.status === 401, 'wrong password rejected');
const refreshed = await call('POST', '/api/auth/refresh', { cookie: client.cookie });
ok(refreshed.status === 200 && refreshed.cookie && refreshed.cookie !== client.cookie, 'refresh rotates the cookie');
const [tabA, tabB] = await Promise.all([1, 2].map(() => call('POST', '/api/auth/refresh', { cookie: refreshed.cookie })));
ok(tabA.status === 200 && tabB.status === 200, 'two tabs renewing at once both stay signed in', `${tabA.status}/${tabB.status}`);
r = await call('POST', '/api/auth/refresh', { cookie: client.cookie }); ok(r.status === 200, 'reuse within 60s grace is honored');
await db.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '2 minutes' WHERE revoked_at IS NOT NULL`);
r = await call('POST', '/api/auth/refresh', { cookie: client.cookie }); ok(r.status === 401, 'stale reused refresh token rejected');
r = await call('POST', '/api/auth/refresh', { cookie: tabA.cookie }); ok(r.status === 401, 'stale reuse revoked the whole session family');
client.token = (await call('POST', '/api/auth/login', { body: { email: 'client@test.local', password: 'correct-horse-battery' } })).data.access_token;
r = await call('POST', '/api/auth/reset-password-request', { body: { email: 'nobody@test.local' } }); ok(r.status === 200, 'reset request does not reveal unknown emails');

console.log('\n# Entities and access rules');
r = await call('POST', '/api/entities/Lead', { token: admin.token, body: { name: 'Jane Doe', email: 'jane@x.com', estimated_value: '2500', junk: 1 } });
ok(r.status === 201 && /^[a-f0-9]{24}$/.test(r.data.id) && r.data.status === 'new' && r.data.estimated_value === 2500 && r.data.junk === undefined, 'admin creates Lead (defaults, number coercion, unknown field dropped)', JSON.stringify(r.data));
const leadId = r.data.id;
r = await call('POST', '/api/entities/Lead', { token: admin.token, body: { email: 'missing-name@x.com' } }); ok(r.status === 400, 'required field enforced');
await call('POST', '/api/entities/Lead', { token: admin.token, body: { name: 'Bob', status: 'contacted' } });
r = await call('GET', '/api/entities/Lead?sort=-created_date&limit=10', { token: admin.token }); ok(Array.isArray(r.data) && r.data.length === 2, 'admin lists Leads');
r = await call('GET', `/api/entities/Lead?q=${encodeURIComponent(JSON.stringify({ status: { $in: ['contacted'] } }))}`, { token: admin.token }); ok(r.data.length === 1 && r.data[0].name === 'Bob', 'filter with $in');
r = await call('GET', '/api/entities/Lead?limit=1&page=1', { token: admin.token }); ok(r.data.items.length === 1 && r.data.has_more && r.data.next_cursor, 'cursor paging page 1');
r = await call('GET', `/api/entities/Lead?limit=1&page=1&cursor=${r.data.next_cursor}`, { token: admin.token }); ok(r.data.items.length === 1 && !r.data.has_more, 'cursor paging page 2');
r = await call('PATCH', `/api/entities/Lead/${leadId}`, { token: admin.token, body: { status: 'won' } }); ok(r.status === 200 && r.data.status === 'won' && r.data.name === 'Jane Doe', 'admin updates Lead');
r = await call('GET', '/api/entities/Lead', { token: client.token }); ok(Array.isArray(r.data) && r.data.length === 0, 'client sees no Leads');
r = await call('GET', '/api/entities/Lead'); ok(Array.isArray(r.data) && r.data.length === 0, 'visitor sees no Leads');
r = await call('POST', '/api/entities/Lead', { token: client.token, body: { name: 'x' } }); ok(r.status === 403, 'client cannot create Lead');
r = await call('PATCH', `/api/entities/Lead/${leadId}`, { token: client.token, body: { status: 'lost' } }); ok(r.status === 404, 'client cannot update Lead');
r = await call('DELETE', `/api/entities/Lead/${leadId}`, { token: client.token }); ok(r.status === 404, 'client cannot delete Lead');
r = await call('POST', '/api/entities/Lead/aggregate', { token: admin.token, body: { groupBy: 'status' } }); ok(r.data.rows.length === 2, 'aggregate groupBy');

await call('POST', '/api/entities/Testimonial', { token: admin.token, body: { client_name: 'A', quote: 'Great' } });
r = await call('GET', '/api/entities/Testimonial'); ok(r.data.length === 1, 'visitors can read Testimonials (public read)');
r = await call('POST', '/api/entities/ContactSubmission', { body: { name: 'V', email: 'v@x.com', message: 'hi' } }); ok(r.status === 201, 'visitors can create ContactSubmission (public create)');
r = await call('GET', '/api/entities/ContactSubmission'); ok(r.data.length === 0, 'visitors cannot read ContactSubmissions');
r = await call('POST', '/api/entities/ServiceInquiry', { body: { contactName: 'V', contactEmail: 'v@x.com' } }); ok(r.status === 403, 'ServiceInquiry needs sign-in');
r = await call('POST', '/api/entities/ServiceInquiry', { token: client.token, body: { contactName: 'C', contactEmail: 'client@test.local', requestedServices: ['starter'] } });
ok(r.status === 201 && r.data.status === 'New', 'client creates ServiceInquiry');
r = await call('GET', '/api/entities/ServiceInquiry', { token: client.token }); ok(r.data.length === 1, 'client reads own ServiceInquiry');
r = await call('GET', '/api/entities/ServiceInquiry', { token: other.token }); ok(r.data.length === 0, 'other client cannot read it');

console.log('\n# Client portal');
const proj = (await call('POST', '/api/entities/Project', { token: admin.token, body: { title: 'Client site', clientUserId: client.user.id } })).data;
const otherProj = (await call('POST', '/api/entities/Project', { token: admin.token, body: { title: 'Someone else' } })).data;
await call('POST', '/api/entities/Task', { token: admin.token, body: { project_id: proj.id, title: 'Design', status: 'done' } });
await call('POST', '/api/entities/Task', { token: admin.token, body: { project_id: otherProj.id, title: 'Secret' } });
r = await call('GET', '/api/entities/Project?sort=-updated_date&limit=5&page=1', { token: client.token }); ok(r.data.items.length === 1 && r.data.items[0].id === proj.id, 'client sees only assigned project');
r = await call('GET', `/api/entities/Project/${otherProj.id}`, { token: client.token }); ok(r.status === 404, 'client cannot open another project');
r = await call('GET', '/api/entities/Task', { token: client.token }); ok(r.data.length === 1 && r.data[0].title === 'Design', 'client sees only own project tasks');
r = await call('GET', '/api/entities/Task'); ok(r.data.length === 0, 'visitors cannot read tasks (tightened from Base44)');
r = await call('POST', '/api/entities/Task/aggregate', { token: client.token, body: { query: { project_id: { $in: [proj.id] } }, groupBy: ['project_id', 'status'] } }); ok(r.data.rows.length === 1 && r.data.rows[0].count === 1, 'client task aggregate');
r = await call('POST', '/api/functions/sendProjectMessage', { token: client.token, body: { project_id: proj.id, content: 'Hello!' } }); ok(r.status === 200 && r.data.message.is_from_client, 'client sends project message');
r = await call('POST', '/api/functions/sendProjectMessage', { token: client.token, body: { project_id: otherProj.id, content: 'x' } }); ok(r.status === 403, 'client cannot message another project');
r = await call('GET', `/api/entities/Message?q=${encodeURIComponent(JSON.stringify({ project_id: proj.id }))}`, { token: client.token }); ok(r.data.length === 1, 'client reads own project messages');

const lease = (await call('POST', '/api/entities/ManagedDomainLease', { token: admin.token, body: { domainName: 'client.com', clientUserId: client.user.id, serviceStatus: 'Active', internalOwnerNotes: 'secret' } })).data;
r = await call('POST', '/api/functions/getMyDomainLeaseStatus', { token: client.token, body: {} }); ok(r.data.lease?.domainName === 'client.com' && r.data.lease.internalOwnerNotes === undefined && r.data.cancellationRequestStatus === 'None', 'domain status hides internal notes');
r = await call('POST', '/api/functions/getMyDomainLeaseStatus', { token: other.token, body: {} }); ok(r.data.lease === null, 'other client has no lease');
r = await call('POST', '/api/functions/requestDomainLeaseCancellation', { token: client.token, body: { managedDomainLeaseId: lease.id, requestReason: 'Moving', clientAcknowledgment: true, agreementAcknowledgment: true } });
ok(r.status === 200 && r.data.success, 'cancellation request submitted');
const cancelId = r.data.cancellationRequestId;
r = await call('POST', '/api/functions/requestDomainLeaseCancellation', { token: client.token, body: { managedDomainLeaseId: lease.id, requestReason: 'Again', clientAcknowledgment: true, agreementAcknowledgment: true } }); ok(r.status === 409, 'duplicate cancellation blocked');
r = await call('POST', '/api/functions/requestDomainLeaseCancellation', { token: other.token, body: { managedDomainLeaseId: lease.id, requestReason: 'x', clientAcknowledgment: true, agreementAcknowledgment: true } }); ok(r.status === 403, 'other client cannot cancel the lease');
r = await call('POST', '/api/functions/getClientBillingSummary', { token: client.token, body: {} }); ok(r.data.billing?.cancellationRequestStatus === 'Submitted', 'billing summary shows open request');
r = await call('POST', '/api/functions/withdrawDomainLeaseCancellationRequest', { token: client.token, body: { requestId: cancelId } }); ok(r.data.success, 'client withdraws cancellation');
r = await call('POST', '/api/functions/requestAccountDeletion', { token: other.token, body: { confirm: true } }); ok(r.data.success && r.data.notification_pending === true, 'account deletion saved (email pending without SMTP)');
r = await call('POST', '/api/functions/requestAccountDeletion', { token: other.token, body: {} }); ok(r.status === 400, 'deletion needs confirmation');

console.log('\n# Billing');
r = await call('POST', '/api/functions/createInvoice', { token: client.token, body: { client_name: 'X' } }); ok(r.status === 403, 'client cannot create invoices');
r = await call('POST', '/api/functions/createInvoice', { token: admin.token, body: { plan_id: 'manual', client_name: 'Acme', tax_rate: 8.25, line_items: [{ description: 'Site', qty: 1, price: 1000 }] } });
ok(r.data.invoice?.total === 1082.5 && r.data.invoice.status === 'sent', 'manual invoice totals with 8.25% tax', JSON.stringify(r.data));
const inv = r.data.invoice;
r = await call('POST', '/api/functions/createCheckout', { token: admin.token, body: { invoice_id: inv.id, preview_only: true } });
ok(r.data.pricing?.mode === 'payment' && r.data.pricing.items[0].cents === 108250 && r.data.pricing.items[1].cents === 3789, 'checkout preview: invoice + 3.5% card fee', JSON.stringify(r.data));
r = await call('POST', '/api/functions/createCheckout', { token: admin.token, body: { plan_id: 'care', add_on_ids: ['domain', 'seo'], preview_only: true } });
ok(r.data.pricing?.mode === 'subscription' && r.data.pricing.items.map(i => i.cents).join(',') === '9900,24900,1218', 'Turnkey Care: domain included, SEO added, card fee', JSON.stringify(r.data.pricing?.items));
r = await call('POST', '/api/functions/createCheckout', { token: admin.token, body: { plan_id: 'starter', amount: 1 } }); ok(r.status === 400, 'browser-supplied amounts rejected');
r = await call('POST', '/api/functions/createCheckout', { token: admin.token, body: { plan_id: 'full' } }); ok(r.status === 400, 'Full Engine requires a quote');
r = await call('POST', '/api/functions/createCheckout', { token: admin.token, body: { plan_id: 'starter' } }); ok(r.status === 200 && /\/checkout\?/.test(r.body?.url || ''), 'checkout returns the in-site Square checkout link');

console.log('\n# Public visitor check, chat and inquiry');
r = await call('POST', '/api/functions/chatAssistant', { body: { sessionId: '11111111-1111-4111-8111-111111111111', message: 'hi' } });
ok(r.status === 428 && r.data.code === 'PUBLIC_CLIENT_CHALLENGE', 'first call gets a challenge');
const challenge = r.data.challenge;
let nonce = 0;
for (;; nonce++) { const h = createHash('sha256').update(`${challenge}:${nonce}`).digest(); if (h[0] === 0 && h[1] === 0 && h[2] < 64) break; }
r = await call('POST', '/api/functions/chatAssistant', { body: { sessionId: '11111111-1111-4111-8111-111111111111', message: 'hi', rateLimitProof: { challenge, nonce } } });
ok(r.status === 428 && r.data.code === 'PUBLIC_CLIENT_REQUIRED' && r.data.rateLimitToken, 'valid proof earns a visitor token');
const vt = r.data.rateLimitToken;
r = await call('POST', '/api/functions/chatAssistant', { body: { sessionId: '11111111-1111-4111-8111-111111111111', message: 'hi', rateLimitProof: { challenge, nonce: nonce + 1 } } });
ok(r.status === 403 && r.data.code === 'PUBLIC_CLIENT_INVALID', 'bad proof rejected');
r = await call('POST', '/api/functions/chatAssistant', { body: { sessionId: '11111111-1111-4111-8111-111111111111', message: 'How much is a website?', rateLimitToken: vt } });
ok(r.status === 200 && typeof r.data.reply === 'string' && r.data.escalated === false, 'chat answers (fallback reply without a Claude key)', JSON.stringify(r.data));
const convo = await db.query(`SELECT data FROM records WHERE entity = 'Conversation'`);
ok(convo.rows.length === 1 && convo.rows[0].data.messages.length === 2, 'conversation saved');
r = await call('POST', '/api/functions/chatAssistant', { body: { sessionId: 'x', message: 'hi', rateLimitToken: vt + 'x' } }); ok(r.status === 403, 'tampered token rejected');
r = await call('POST', '/api/functions/submitInquiry', { body: { name: 'Sam', phone: '(409) 555-0134', message: 'Need a site', rateLimitToken: vt } });
ok(r.status === 200 && r.data.ok, 'contact form inquiry saved');
const inq = await db.query(`SELECT data FROM records WHERE entity = 'Inquiry'`);
ok(inq.rows[0]?.data.phone === '4095550134' && inq.rows[0].data.status === 'NEW LEAD', 'inquiry stored with normalized phone');
await new Promise(res => setTimeout(res, 300));
const sms = await db.query(`SELECT data FROM records WHERE entity = 'SmsLog'`);
ok(sms.rows[0]?.data.status === 'skipped', 'SMS logged as skipped without Twilio');
r = await call('POST', '/api/functions/submitInquiry', { body: { name: 'NoContact', rateLimitToken: vt } }); ok(r.status === 400, 'inquiry needs phone or email');
r = await call('POST', '/api/functions/generateEstimate', { token: client.token, body: { service: 'x' } }); ok(r.status === 403, 'AI tools are admin-only');
r = await call('POST', '/api/functions/generateEstimate', { token: admin.token, body: { service: 'Website' } }); ok(r.status === 503, 'AI tools refuse cleanly without a Claude key');
r = await call('POST', '/api/functions/doesNotExist', { token: admin.token, body: {} }); ok(r.status === 404, 'unknown function 404');

console.log('\n# Market pricing (simulated data)');
{
  const fn = (name, body = {}, token = admin.token) => call('POST', `/api/functions/${name}`, { token, body });
  r = await fn('pricingOverview', {}, client.token); ok(r.status === 403, 'pricing is admin-only');
  r = await fn('pricingSettings'); ok(r.data.mode === 'manual' && r.data.auto_enabled === false, 'starts in manual mode with automatic pricing off');
  const item = (await call('POST', '/api/entities/PricingItem', { token: admin.token, body: { name: 'Test Widget', kind: 'product', current_price: 150, unit_cost: 90 } })).data;
  ok(/^[a-f0-9]{24}$/.test(item.id), 'pricing item created');
  r = await fn('pricingRecommend', { item_ids: [item.id] });
  ok(r.data.recommendations[0].status === 'info' && r.data.recommendations[0].status_color === 'gray', 'no market data -> no recommendation');
  r = await fn('pricingImportPrices', { rows: [130, 135, 140].map((price, i) => ({ pricing_item_id: item.id, price, competitor_name: `Shop ${i}`, source_url: `https://shop${i}.example/widget`, verified: true, confidence: 0.9 })) });
  ok(r.data.stored === 3, 'simulated competitor prices imported');
  await fn('pricingImportPrices', { rows: [{ pricing_item_id: item.id, price: 60, source_url: 'https://ai.example', price_type: 'ai_suggestion' }] });
  r = await fn('pricingRecommend', { item_ids: [item.id] });
  const rec = r.data.recommendations[0];
  ok(rec.recommended_price === 132 && rec.change_pct === -12 && rec.gross_margin_pct === 31.82 && rec.status === 'pending', 'recommendation: $150 -> $132, -12%, 31.82% margin', JSON.stringify(rec));
  ok(rec.market.average === 135 && rec.market.count === 3, 'AI-suggested price excluded from market average');
  r = await fn('pricingApply', { recommendation_ids: [rec.id] }); ok(r.data.applied.length === 0, 'cannot apply before approval');
  r = await fn('pricingDecide', { recommendation_id: rec.id, action: 'approve' }); ok(r.data.status === 'approved', 'admin approves');
  r = await fn('pricingApply', { recommendation_ids: [rec.id] }); ok(r.data.applied.length === 1, 'approved change applied');
  r = await call('GET', `/api/entities/PricingItem/${item.id}`, { token: admin.token }); ok(r.data.current_price === 132, 'item price updated in central database');
  const hist = (await call('GET', `/api/entities/PriceHistory?q=${encodeURIComponent(JSON.stringify({ pricing_item_id: item.id }))}`, { token: admin.token })).data;
  ok(hist.length === 1 && hist[0].old_price === 150 && hist[0].new_price === 132, 'history recorded');
  r = await fn('pricingRestore', { history_id: hist[0].id }); ok(r.data.current_price === 150, 'previous price restored');
  r = await fn('pricingSetPrice', { pricing_item_id: item.id, price: 100 }); ok(r.status === 409 && r.data.code === 'BELOW_MARGIN', 'manual price below margin needs confirmation');
  r = await fn('pricingSetPrice', { pricing_item_id: item.id, price: 100, allow_below_margin: true, reason: 'clearance' }); ok(r.data.current_price === 100, 'confirmed override allowed and logged');
  r = await fn('pricingUpdateSettings', { auto_enabled: true }); ok(r.status === 400, 'cannot enable automatic outside automatic mode');
  r = await fn('pricingUpdateSettings', { mode: 'automatic', auto_enabled: true, confirm_automatic: 'yes' }); ok(r.status === 400, 'automatic needs the exact confirmation phrase');
  r = await fn('pricingUpdateSettings', { mode: 'automatic', auto_enabled: true, confirm_automatic: 'ENABLE AUTOMATIC PRICING', rules: { max_auto_decrease_pct: 3 } });
  ok(r.data.auto_enabled === true && r.data.rules.max_auto_decrease_pct === 3, 'automatic enabled with explicit confirmation');
  r = await fn('pricingUpdateSettings', { mode: 'manual' }); ok(r.data.auto_enabled === false, 'switching to manual turns automatic off');
  r = await fn('pricingRefreshCompetitors', { item_ids: [item.id] }); ok(r.status === 200 && r.data.configured.tavily === false, 'research runs safely with no providers configured');
  r = await fn('pricingReport'); ok(r.data.csv.startsWith('Item,') && r.data.csv.includes('Test Widget'), 'CSV report exported');
  r = await fn('pricingOverview'); ok(r.data.totals.products === 1 && Array.isArray(r.data.items), 'overview totals');
}

console.log('\n# Live updates');
{
  const ctrl = new AbortController();
  const res = await fetch(BASE + '/api/events', { headers: { Authorization: `Bearer ${client.token}` }, signal: ctrl.signal });
  ok(res.status === 200 && (res.headers.get('content-type') || '').includes('text/event-stream'), 'SSE stream opens');
  const reader = res.body.getReader();
  const got = (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return buf;
      buf += new TextDecoder().decode(value);
      if (buf.includes('Launch prep')) return buf;
    }
  })();
  await new Promise(res2 => setTimeout(res2, 200));
  await call('POST', '/api/entities/Task', { token: admin.token, body: { project_id: otherProj.id, title: 'Hidden from client' } });
  await call('POST', '/api/entities/Task', { token: admin.token, body: { project_id: proj.id, title: 'Launch prep' } });
  const buf = await Promise.race([got, new Promise(res2 => setTimeout(() => res2('TIMEOUT'), 3000))]);
  ok(String(buf).includes('Launch prep'), 'client receives live update for own project');
  ok(!String(buf).includes('Hidden from client'), 'client does not receive other projects');
  ctrl.abort();
}

await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
