# SEO implementation log

## Step 1: each page's own tags and real status codes (done)

**Problem:** the site is a single-page React app, so every URL received the same `index.html`.
Before JavaScript ran, `/about`, `/pricing` and even made-up URLs all had the homepage's title,
description, social preview and a canonical tag pointing at the homepage. Search engines could
read that as "this page is a copy of the homepage", and link previews (Facebook, LinkedIn,
texts) always showed the homepage. Unknown URLs returned `200 OK` ("soft 404s").

**Fix (no change to the React app's architecture):**

| File | What it does |
|---|---|
| `site/src/components/seo/resolveMeta.js` | One function that turns a page's SEO props into final tag values. Used by the `<SEO />` component in the browser and by the build step, so both always agree |
| `site/src/seo/routeManifest.js` | Lists every URL with the same props its page uses, plus the private (signed-in) path patterns |
| `site/scripts/build-seo-manifest.mjs` | Runs after `vite build` (`npm run build`) and writes `dist/seo-routes.json`. **Fails the build** if a route in `App.jsx` isn't classified, so a new page can't ship with the homepage's tags |
| `site/src/data/seoSite.js` | `PAGE_SEO` (Pricing, Delete Account, Login tags moved here word for word from their pages) and `serviceAreaMeta()` (city pages and their thin-content noindex rule) |
| `backend/src/seo.ts` + `backend/src/main.ts` | The server fills in each page's title, description, canonical, robots and Open Graph/Twitter tags before sending the HTML |

What the server now returns:

| Request | Status | Tags |
|---|---|---|
| Public page (`/about`, `/pricing`, regional and city pages ...) | 200 | That page's own title, description, canonical and social tags |
| City page without real local content (`/service-areas/beaumont-tx`) | 200 | `noindex` (page and `X-Robots-Tag` header), same rule as before |
| Login, register, password pages | 200 | Own title, `noindex` |
| Portal, admin, settings, start | 200 | Generic title, `noindex`, no canonical |
| Unknown URL | **404** | `noindex`, no canonical. Visitors still see the friendly Not Found page |
| Trailing slash (`/about/`) | **301** to `/about` | Query strings are kept |

Page titles and descriptions were not changed in this step; they are exactly what React already set.

**Tested:**
- Site build, manifest build (33 URLs, 17 indexable, all 39 routes classified) and lint pass.
- Backend type-check and build pass.
- End-to-end test: 123 of 123 checks, including 18 new SEO checks.
- In a browser: client and server titles match on `/about` and `/pricing`; one canonical tag per page; the 404 page displays normally.

### Deploy

Upload the new package and run the installer as usual (see `UPLOAD.md`). No database, `.env` or data changes.

### Check after deploy (from any computer)

```bash
curl -s https://vividenginesolutions.com/about | grep -E "<title>|rel=\"canonical\""
curl -s -o /dev/null -w "%{http_code}\n" https://vividenginesolutions.com/this-page-does-not-exist
curl -sI https://vividenginesolutions.com/about/ | grep -i -E "^HTTP|^location"
curl -sI https://vividenginesolutions.com/portal | grep -i x-robots-tag
```

Expected:
- the About title, with canonical `https://vividenginesolutions.com/about`
- `404`
- `301` to `/about`
- `noindex, nofollow`

### Roll back

Reinstall the previous package (`bash install.sh` from the earlier upload). If `seo-routes.json` is ever missing,
the server falls back to the old behavior on its own instead of failing.

## Step 2: speed quick wins (done)

| Change | File(s) | Effect |
|---|---|---|
| Nginx now compresses `text/javascript` (the type the app sends for `.js`) | `infra/nginx/templates/default.conf.template` | Main script 625 KB → 200 KB over the wire |
| Backend compresses responses too (`compression` 1.8.2, live-update stream excluded) | `backend/src/main.ts` | Same savings on App Platform or without Nginx; Nginx passes it through |
| Logo: `logo-160.webp` (7.9 KB) for nav, footer and chat; `logo-400.webp` (27 KB) for the hero and login, replacing the 425 KB `logo.png` | 13 components | `logo.png` stays for the app manifest and Google's structured data |
| Background: `hero-background.webp` (26 KB) instead of the 104 KB PNG | Hero, login, work section, regional CSS | It is the homepage's largest element (LCP) |
| Homepage tells the browser to fetch the hero image immediately | `site/src/seo/routeManifest.js`, `backend/src/seo.ts` | Homepage only; other pages don't download it |
| Service worker precaches the 8 KB logo instead of the 425 KB one (cache version bumped) | `site/public/sw.js` | Lighter app install |

Lighthouse, mobile, homepage, middle of 3 runs each:

| | Before (live) | After (local build) |
|---|---|---|
| Performance | 57 | 62 |
| LCP (main content) | 8.5 s | 5.9 s |
| First content | 6.0 s | 3.5 s |
| Download | 1,186 KB | 714 KB |

The score is held back by the two placeholder trackers in `index.html` (Google Analytics and the Facebook Pixel, 265 KB together), which Step 3 handles.

Not changed (design decision for you): Lighthouse flags the homepage background as "displayed with incorrect aspect ratio". The square image is stretched to fill the hero. Adding `object-fit: cover` to `.engine-backdrop` would crop it instead of stretching it, which looks slightly different.

**Tested:** both builds pass, lint passes, backend audit shows 0 vulnerabilities, and the end-to-end test passes 126 of 126 (new checks: preload on the homepage only, compressed script, WebP logo, live updates still working).

**After deploy, check:**

```bash
curl -s -o /dev/null -H "Accept-Encoding: gzip" -w "%{size_download} bytes\n" https://vividenginesolutions.com$(curl -s https://vividenginesolutions.com/ | grep -o '/assets/index-[^"]*\.js' | head -1)
```

Expect roughly 200,000 bytes instead of 620,000.

**Roll back:** reinstall the previous package. The old PNG files are still in `site/public`, so nothing that links to them breaks.

## Step 3: clean page head, honest sitemap (done, ships with Steps 1 and 2)

| Change | File(s) | Why |
|---|---|---|
| Removed 5 `REPLACE_ME` verification tags, the placeholder Google Analytics (`G-XXXXXXXXXX`) and the placeholder Facebook Pixel (`000000000000000`) | `site/index.html` | They verified nothing and tracked nothing, but every visitor downloaded ~265 KB of tracker scripts. The Google verification tag is kept |
| `/delete-account` is now `noindex` | `site/src/data/seoSite.js` | Google Play needs the page reachable, not in search results. The server sends `noindex` in the page and the `X-Robots-Tag` header |
| Sitemap is written by the same build step as the server's page list (`dist/sitemap.xml`), indexable pages only | `site/scripts/build-seo-manifest.mjs`; removed `site/src/lib/sitemapPlugin.js` and its line in `site/vite.config.js` | One source of truth: a page can't be in the sitemap while marked `noindex`, and a new page can't be left out. `<lastmod>` is no longer sent: the old file had a hand-typed date on 4 of 17 URLs, and inaccurate dates make Google ignore them |

Bing: in Bing Webmaster Tools choose **Import from Google Search Console**. No tag needed. To add analytics later, put the real tag in `site/index.html`.

**Tested:** not built locally (no Node.js on the packaging PC). The server build runs it: if the manifest or sitemap step fails, `deploy.sh` stops before restarting and the current site stays up. The end-to-end test has 5 new checks (delete-account noindex, sitemap contents, every sitemap URL indexable and self-canonical, no placeholder tags).

**After deploy, check:**

```bash
curl -s https://vividenginesolutions.com/sitemap.xml | grep -c "<loc>"
curl -s https://vividenginesolutions.com/sitemap.xml | grep -E "delete-account|login|portal" || echo "clean"
curl -sI https://vividenginesolutions.com/delete-account | grep -i x-robots-tag
curl -s https://vividenginesolutions.com/ | grep -c -E "REPLACE_ME|G-XXXXXXXXXX|fbq"
```

Expected: `16`, `clean`, `noindex, nofollow`, `0`.

**Roll back:** same as Step 1 (the image tagged `before-seo`).

## Step 4: business details (done, ships with Steps 1 to 3)

Confirmed by the owner: 410 Chestnut Business Parkway Dr, Tomball, TX 77375; office phone 281-826-4068; WhatsApp https://wa.me/12818264068 ((281) 826-4068) (listed as WhatsApp only, not as a phone number); email info@vividenginesolutions.com.

| Change | File(s) |
|---|---|
| Street address and ZIP in the business data; the Beaumont map coordinates removed (Google places the business from the address); office phone, email and WhatsApp as contact points | `site/src/data/seoSite.js`, the copy in `site/index.html` |
| `geo.placename` now Tomball; the Beaumont `geo.position` / `ICBM` tags removed | `site/index.html` |
| Footer and Contact page show the full address and a "Message us on WhatsApp" link (clicks tracked as `click_to_whatsapp`) | `site/src/components/marketing/BusinessContact.jsx` |
| AI summary file: contact block, and the old prices ($149 / $399 / $899 plans) replaced with the current ones from `site/src/config/pricing.js` | `site/public/llms.txt` |
| Site assistant knows the address, office phone, email and WhatsApp link | `backend/src/shared/knowledge.ts` |
| Offline page has a WhatsApp link | `site/public/offline.html` |

**Location wording (owner confirmed Tomball is the only base; service area runs from the Houston area to Lafayette, LA):**
lines that said or implied the business is located in Beaumont now say Tomball, and Beaumont and Lake Charles stay as served cities with their own pages (unchanged URLs).

| Where | Before | After |
|---|---|---|
| `/about` title and H1 | Meet Your / Your Website Designer in Beaumont, TX | About Us / Your Web & App Team, Houston to Lafayette |
| `/contact` title and H1 | Contact a Website Designer in Beaumont, TX | Contact Vivid Engine (title adds "Houston to Lafayette") |
| Homepage description (`seoSite.js` and `index.html`) | for Beaumont, Lake Charles and all of SETX & SWLA | from Houston to Lafayette, including Beaumont and Lake Charles |
| `/service-areas` description and intro, Lake Charles city page description, FAQ "Do you only work with businesses in Beaumont?", homepage strip, `llms.txt`, assistant knowledge | Golden Triangle / "nearby Southeast Texas designer" / "based in Southeast Texas" | based in Tomball; Houston area to Lafayette |
| Structured data `areaServed` | 7 counties/parishes | adds Harris and Montgomery counties (TX) and Lafayette Parish (LA) |

Homepage title is unchanged ("Beaumont & Lake Charles"): it names cities served, not a location, and it's the page's established ranking.

Not added: a Facebook link. `https://www.facebook.com/` is Facebook's homepage, not the business page; add the page's own URL to `SITE.social` in `site/src/data/seoSite.js` when available.

**After deploy, check:** `curl -s https://vividenginesolutions.com/ | grep -o '"streetAddress":"[^"]*"'` should print the Tomball street address. Also paste the homepage into https://search.google.com/test/rich-results: it should find a LocalBusiness with no errors.

### Watch in Google Search Console (after deploy)
- The "Duplicate, Google chose different canonical" and "Soft 404" counts in the Page indexing report should go down over the following weeks.
- Request re-indexing of the main pages with URL Inspection.
