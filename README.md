# vivid-engine-site

Website for Vivid Engine Solutions, a web design and local SEO business serving Beaumont, TX and Lake Charles, LA. Built with a React frontend and NestJS backend, hosted on DigitalOcean. Focused on fast load times, search indexing, and local SEO.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | React + Vite site. Every page is prerendered to static HTML at build time, then hydrated, so search engines get full content without running JavaScript. |
| `apps/api` | NestJS API. `POST /api/contact` handles the contact form (validation, honeypot, rate limiting, email via SMTP). `GET /api/health` for health checks. |
| `.do/app.yaml` | DigitalOcean App Platform spec: static site for the web app, a small service for the API on `/api`. |

## Local development

Requires Node 20+.

```bash
npm install
npm run dev:api   # API on http://localhost:3000
npm run dev:web   # site on http://localhost:5173 (proxies /api to the API)
```

`npm run build` builds both apps and `npm test` runs the API tests.

## Editing content

- Business name, phone, email, address and hours: `apps/web/src/site.ts`. Empty fields are left out of the page and the schema markup, so fill them in before launch (Google needs a consistent name, address and phone).
- Services and service-area pages: `apps/web/src/content.ts`. Adding an entry there creates the page, its nav/footer links, sitemap entry and schema.
- Page titles and descriptions: `apps/web/src/routes.tsx`. About page copy: `apps/web/src/pages/About.tsx`.

## SEO built in

- Prerendered HTML for every route, with unique title, meta description, canonical URL and Open Graph tags.
- `ProfessionalService` (LocalBusiness) JSON-LD on the home and area pages, `Service` JSON-LD on service pages.
- `sitemap.xml` and `robots.txt` generated at build time from the route list.
- Set `VITE_SITE_URL` at build time to your real domain so canonicals and the sitemap point at it.

## Deploying to DigitalOcean

```bash
doctl apps create --spec .do/app.yaml
```

Then, in the app's settings, add your domain and fill in the API's email settings (`CONTACT_TO`, `CONTACT_FROM`, `SMTP_*`). Until SMTP is set, contact form messages are written to the API's runtime logs. See `apps/api/.env.example`.
