# Vivid Engine Solutions: website, client portal and Business OS

Independent of Base44. Runs on a DigitalOcean Droplet (Docker Compose) or DigitalOcean App Platform.

**To update the live Droplet, see [DEPLOY-QUICK.md](DEPLOY-QUICK.md)**: one PowerShell command on your PC uploads, installs and checks the site.
First-time setup on a new Droplet: [UPLOAD.md](UPLOAD.md) (upload one file, run `bash install.sh`).

```
site/            React + Vite website, client portal and admin (your existing app, Base44 removed)
backend/         NestJS + PostgreSQL API that replaces every Base44 service
  src/entities/schemas/   your 23 Base44 collection schemas (fields + access rules), used as-is, plus 6 pricing collections
  src/pricing/            AI market pricing engine (formula, research providers, approvals, scheduler)
  test/                   end-to-end test (105 checks) and pricing formula unit tests (14)
Dockerfile       one image: builds the site and the API; the API serves both on port 8080
infra/           Droplet setup: docker-compose.yml, Nginx (HTTPS), Let's Encrypt, backup/restore/deploy scripts, .env.example
.do/app.yaml     App Platform spec (alternative to the Droplet)
docs/DEPLOY.md   step-by-step deployment
docs/DNS.md      moving DNS and email records to DigitalOcean
docs/PRICING.md  the Market Pricing system: how to use it, the formula, safeguards, provider setup
docs/AI_SEARCH.md     Vivid AI Search: plans, engines, setup, rollback
docs/VIDEO_STUDIO.md  Vivid Video Studio (browser video editor): plans, AI features, setup, rollback
base44-backup/   the removed Base44 files, kept for reference only (not deployed; delete when you're comfortable)
```

## How it fits together

```
Phone / tablet / desktop browser, installed app (PWA / store wrapper)
        │ HTTPS
        ▼
Nginx (Droplet) or App Platform load balancer      TLS, HTTP→HTTPS, rate limits
        ▼
app container (Node 20, port 8080)                 serves the website + /api
        ▼
PostgreSQL 16                                      Docker volume (Droplet) or Managed PostgreSQL (App Platform)
```

All devices read and write the same database through the API, and admin/portal screens update live
through `/api/events` (server-sent events), so phones and computers stay in sync without extra services.

## What replaced Base44

| Base44 piece | Replacement |
|---|---|
| `@base44/sdk`, `base44Client.js`, `app-params.js` | `site/src/api/client.js`: the same `auth` / `entities` / `functions` / `analytics` methods, so pages kept their logic (only the import line changed in 36 files) |
| Base44 auth (email + code, password reset, Google) | `/api/auth`: argon2id passwords, 6-digit email codes, 15-minute access tokens, rotating httpOnly refresh cookie with theft detection, Google OAuth |
| Base44 database + row-level security | PostgreSQL. Each collection's original schema file (fields, required, defaults, `rls`) is loaded and enforced unchanged. Record IDs keep Base44's 24-character format so imported data and links still match |
| `entities.X.subscribe` | Server-sent events, filtered by the same access rules |
| 17 backend functions (`base44/functions/*`) | Ported one-for-one in `backend/src/functions/`, same names, inputs, outputs and limits |
| `InvokeLLM`, AI gateway, `GenerateImage` | Claude API (`claude-opus-5-5`). Logos are drawn by Claude as SVG |
| `SendEmail` + email templates | Any SMTP provider |
| Twilio owner texts, `SmsLog`, `NotificationSetting` | Ported as-is |
| `RateLimit` entity | Postgres counters with the same budgets |
| Visitor proof-of-work check (`publicClient.ts`) | Ported as-is |
| Daily Lead Summary workflow (8:00 a.m. Central) | Built-in scheduler |
| Base44 hosting, Vite plugin, `VITE_BASE44_*`, `*.base44.app` redirect | Docker + Nginx/App Platform; plain Vite config; no Base44 variables |
| MCP OAuth consent page | Removed (it only served Base44's built-in MCP server; nothing linked to it) |
| Facebook Pages / Google Calendar connectors | Declared in Base44 but **not used by any code**; not carried over |

## Status

See the bottom of [docs/DEPLOY.md](docs/DEPLOY.md) for exactly what was tested, what needs your keys, and what can only be checked after deployment.
