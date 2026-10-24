# Deploying to DigitalOcean

Two supported options. The **Droplet** is what you have and is recommended; App Platform is the managed alternative.
Neither requires GitHub.

## Requirements

| | Droplet (recommended) | App Platform |
|---|---|---|
| Server | Ubuntu 24.04, **2 vCPU / 4 GB RAM** (your 2 vCPU / 80 GB plan is fine) | `apps-s-1vcpu-1gb` service, 1 instance |
| Database | PostgreSQL 16 in Docker, data on a named volume | Managed PostgreSQL 16 (smallest plan) |
| Runtime | Docker + Compose (installed by the setup script). Node 22 runs inside the container | Container image in DigitalOcean Container Registry |
| Rough cost | Droplet you already have + about 20% for weekly Droplet backups + Spaces ($5/mo) for off-site backups | App (~$12/mo) + Managed DB (~$15/mo) + registry |

For local development on your PC: Node.js 22+ (`site/` and `backend/` each have `npm install`), and PostgreSQL. See `backend/README.md`.

## Accounts and keys you need

| Service | Needed for | Where it goes |
|---|---|---|
| SMTP provider (Postmark, Resend, Amazon SES, or Google Workspace SMTP) | **Sign-up codes, password resets**, lead and deletion emails | `SMTP_*` |
| Square | All payments: checkout, subscriptions, invoices, POS, Afterpay | `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENVIRONMENT` |
| Anthropic (console.anthropic.com) | AI Search (Claude), website chat, estimator, outreach, marketing drafts, logos | `ANTHROPIC_API_KEY` (+ `ANTHROPIC_ADMIN_KEY` for the Billing Monitor) |
| Perplexity | AI Search default engine (web search with citations) | `PERPLEXITY_API_KEY` |
| Google AI (Gemini) | AI Search images, video and multimodal questions | `GEMINI_API_KEY` |
| DigitalOcean API token (read-only billing) | Billing Monitor balance and invoices | `DO_BILLING_TOKEN` |
| Google Cloud OAuth client | "Continue with Google" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Twilio (optional) | Text alerts to you for new leads | `TWILIO_*`, `OWNER_PHONE` |
| Tavily / Exa / Perplexity (optional) | Market Pricing research ([PRICING.md](PRICING.md)) | `TAVILY_API_KEY`, `EXA_API_KEY`, `PERPLEXITY_API_KEY` |
| DigitalOcean Spaces (optional, recommended) | Off-site database backups | `SPACES_*` |

Without SMTP, nobody can finish signing up (the code can't be delivered). Set it up before launch.

---

## Release v2 (`release/v2-final`): server commands

Run these in the DigitalOcean console (Droplet 162.243.169.89) **after the pull request is merged into `main`**.
They replace only the app container; Postgres, nginx and certbot keep running, and `/opt/vivid/infra/.env` is never
touched. Keys stay in that file only: don't paste them into the console history, chat or a commit.

**Database migrations run automatically when the new app container starts.** This release adds
`005_square_payments`, `006_saved_history`, `007_ai_router` and `008_billing_monitor` (all additive: new tables,
views and columns, nothing dropped), so step 1 takes a database dump first.

```bash
# 1) Back up the database, the current code, and tag the running image for rollback
cd /opt/vivid/infra
bash scripts/backup.sh                       # dump to /opt/vivid/backups/vivid-<time>.sql.gz (+ Spaces if set)
cd /opt/vivid
mkdir -p /opt/vivid/backups
tar -czf /opt/vivid/backups/pre-v2-$(date +%F-%H%M).tar.gz --exclude=backups --exclude='*/node_modules' --exclude='*/dist' .
docker image tag "$(docker inspect vivid-app-1 --format '{{.Image}}')" vivid-app:rollback-before-v2

# 2) Pull the release (or upload the files with FileZilla to /opt/vivid, keeping infra/.env as it is)
git pull origin main
#    First time only, if /opt/vivid is not a git checkout yet ("fatal: not a git repository"):
#      git init && git remote add origin https://github.com/bluebonnetplayguard-dot/vivid-engine-site.git
#      git fetch origin main && git checkout -f -B main origin/main
#    infra/.env is ignored by git, so it is kept.

# 3) Build and replace only the app container (Postgres, nginx, and certbot keep running)
cd /opt/vivid/infra
docker compose config --quiet
docker compose build app
docker compose up -d --no-deps app
docker compose restart web    # only if the nginx template changed (it did in this release)

# 4) Check it
docker compose ps
curl -fsS https://vividenginesolutions.com/api/health
curl -fsS https://vividenginesolutions.com/areas/katy | grep -io "<h1[^>]*>[^<]*"
curl -sI https://vividenginesolutions.com/ai-search | grep -i "^location"     # expect /search (301)
curl -sI https://vividenginesolutions.com/ | grep -ci "strict-transport-security"   # expect 1
docker compose logs --tail=80 app        # look for "Applied migration 00x_..." and "Listening on 0.0.0.0:8080"
```

Rollback if needed (the app goes back to the previous image; migrations are additive, so the old code keeps working
on the upgraded database):

```bash
cd /opt/vivid/infra
docker image tag vivid-app:rollback-before-v2 vivid-app:latest
docker compose up -d --no-deps --no-build --force-recreate app
```

Only if the database itself must go back: `bash scripts/restore.sh /opt/vivid/backups/vivid-YYYYMMDD-HHMMSS.sql.gz`
(this replaces everything written since the dump).

### After the first v2 deploy

1. **New settings in `/opt/vivid/infra/.env`** (names are in `infra/.env.example`; leave a line empty to keep that
   feature off): `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, `HISTORY_ENCRYPTION_KEY` (`openssl rand -base64 32`),
   `GUEST_QUESTIONS_PER_DAY`, and the Billing Monitor values. Then `docker compose up -d --no-deps app`.
   `OPENAI_API_KEY` is only used by Video Studio captions now; AI Search no longer needs it.
2. **Billing Monitor setup** (provider tokens, budgets, the Google Cloud budget alert): Part 1 of
   [BILLING_MONITOR.md](BILLING_MONITOR.md). Check `/admin/billing` afterwards.
3. **Square** stays on `SQUARE_ENVIRONMENT=sandbox` until you switch it. The webhook URL is
   `https://vividenginesolutions.com/api/webhooks/square`.
4. **Secret scanning on your PC** (once per clone): `git config core.hooksPath scripts/git-hooks`, with
   [gitleaks](https://github.com/gitleaks/gitleaks) installed. CI runs the same scan on every pull request.

### Release checks before merging

`bash scripts/verify-release.sh` (any machine with Node 22 and Docker) runs every check from the release brief:
site lint/build/prerender, retired names, backend build and tests against a throwaway Postgres, the Docker build,
a smoke test of the container (health, `/areas/katy` H1, sitemap, a 301 and a 404), and the old-number/Stripe grep.
GitHub Actions runs it on every pull request (`.github/workflows/ci.yml`).

---

## Option A: Droplet

### 1. Point DNS at the Droplet

Follow [DNS.md](DNS.md). Wait until `nslookup vividenginesolutions.com` shows the Droplet's IP.

### 2. Upload and install (one command on the server)

Short version: [UPLOAD.md](../UPLOAD.md). On your PC:

```bash
scp vivid-engine-droplet.tar.gz root@YOUR_DROPLET_IP:/root/
```

On the Droplet (`ssh root@YOUR_DROPLET_IP`):

```bash
tar -xzf vivid-engine-droplet.tar.gz && cd vivid-engine && bash install.sh
```

`install.sh` copies the app to `/opt/vivid` and asks for your domain and admin email. It writes
`/opt/vivid/infra/.env` with freshly generated passwords and secrets (file permissions 600), checks
that DNS points at this server, then runs `infra/scripts/setup-droplet.sh`.

To fill in the remaining keys later: `nano /opt/vivid/infra/.env`, then `cd /opt/vivid/infra && docker compose up -d app`.

What the setup does:
- Firewall (only SSH, HTTP and HTTPS open) and fail2ban
- Automatic security updates
- Docker, plus 2 GB of swap so the site can build
- The HTTPS certificate
- Builds the app and starts everything
- Nightly database backup at 03:15

Check that it's running: `curl -s https://vividenginesolutions.com/api/health` should return `{"ok":true}`.

### 3. Connect outside services

| Service | Setting |
|---|---|
| Square webhook | Dashboard > Developers > Webhooks > endpoint `https://vividenginesolutions.com/api/webhooks/square`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Signing secret goes in `STRIPE_WEBHOOK_SECRET` |
| Google sign-in | Google Cloud Console > Credentials > OAuth client (Web). Redirect URI `https://vividenginesolutions.com/api/auth/google/callback` |
| Email | Add your SMTP provider's SPF and DKIM records ([DNS.md](DNS.md)) |

After editing `.env`: `docker compose up -d app`

### 4. Import your Base44 data

1. In Base44, export every collection (CSV or JSON), including **User**.
2. Name each file after its collection (`User.csv`, `Lead.csv`, `Project.csv`, `ManagedDomainLease.csv` ...) and copy them to the server:
   ```bash
   scp *.csv root@YOUR_DROPLET_IP:/opt/vivid/infra/import/
   ```
3. Check, then import:
   ```bash
   docker compose exec app node dist/scripts/import-base44.js /import --dry-run
   docker compose exec app node dist/scripts/import-base44.js /import
   ```
   IDs are kept, so project assignments (`clientUserId`), tasks, messages and domain leases stay linked. Safe to re-run.
4. Imported users have no password. They sign in once with **Forgot password** (or Google), which also verifies the email.

### Updates

Upload the new `vivid-engine-droplet.tar.gz` and run `bash install.sh` again (step 2). It keeps your settings and data, backs up the database, rebuilds, restarts and checks health. Database migrations run automatically at startup.

### Backups and restore

- Nightly at 03:15: a dump goes to `/opt/vivid/backups` (kept 14 days) and to Spaces. Log: `/var/log/vivid-backup.log`.
- Restore: `bash scripts/restore.sh /opt/vivid/backups/vivid-YYYYMMDD-HHMMSS.sql.gz`
- Test a restore once after launch.

### Useful commands (from /opt/vivid/infra)

```bash
docker compose ps
docker compose logs -f --tail=100 app
docker compose exec postgres psql -U vivid vivid
```

---

## Option B: App Platform

App Platform deploys either a container image (no GitHub needed) or a GitHub/GitLab/Bitbucket repository.

1. Create a **Container Registry** and a **Managed PostgreSQL 16** cluster named `vivid-db` in the DigitalOcean control panel.
2. On a computer with Docker and `doctl`:
   ```bash
   docker build -t registry.digitalocean.com/YOUR_REGISTRY/vivid-engine:latest .
   doctl registry login
   docker push registry.digitalocean.com/YOUR_REGISTRY/vivid-engine:latest
   doctl apps create --spec .do/app.yaml
   ```
   (Edit `repository:` in `.do/app.yaml` to match. The Droplet can do the build-and-push step, since it has Docker.)
3. In the app's Settings > Environment Variables, fill in every `SECRET` value.
4. Add the domain in the app's Settings; App Platform issues the certificate. Point DNS as it instructs.
5. Import data: run the importer from the app's Console tab, after uploading the files somewhere the container can read. The Droplet route is simpler for the one-time import.

Keep the app at **one instance**: live updates and the daily lead summary run inside the process.

---

## What was done, tested, and still open

### Changes completed
- All Base44 code removed from `site/`: 36 files rewired to the new client; Base44 SDK, Vite plugin, app-params, MCP consent page, canonical-host redirect, Base44 README/AGENTS files and Base44 media references removed. Originals are in `base44-backup/`.
- New backend implementing every Base44 service the site used, enforcing your original collection schemas and access rules.
- Two deliberate security tightenings: tasks and messages are visible only to the assigned client and admins (Base44 let anyone read tasks), and non-admins are sent from the admin screens to their portal.
- One bug in the old code fixed: the daily lead summary looked for `source: "inquiry_form"` while the contact form saved `"web_form"`, so it always reported zero leads.
- Docker image (site + API on port 8080, binds 0.0.0.0), Docker Compose with Nginx/HTTPS/backups, App Platform spec, and environment template.
- Dependencies upgraded to clear all known backend vulnerabilities (NestJS 11, nodemailer 10, google-auth-library 11).

### Tests actually run (on Windows, Node 24, PostgreSQL 17)
- Backend: TypeScript type-check and production build. **Passed.**
- Backend dependency audit: **0 vulnerabilities.**
- Site: `npm run build` **passed**; `npm run lint` **passed** (after removing 2 unused imports that were already in the original code).
- Backend started, ran its database migration and served the built site on port 8080.
- Pricing formula unit tests (`npm test` in `backend/`): **14 of 14 passed**.
- Server hardening found by testing: it no longer crashes when the database drops a connection, and the per-address function limit was raised from 30 to 120 a minute.
- `backend/test/vivid seo.mjs` (end-to-end test, formerly `smoke.mjs`): **105 of 105 checks passed** at migration time, 126 of 126 after the SEO and speed steps, including 22 Market Pricing workflow checks (simulated data). Covered: sign-up, login, session renewal, theft detection, two tabs at once, each collection's access rules, the client portal, domain cancellation and withdrawal, account deletion, invoice math, checkout pricing (card fee, included add-ons, refusing browser-sent amounts), the visitor proof-of-work, chat and contact form, and live updates scoped per client.
- Browser: signed in through the real login page as admin and as client. The dashboard, leads, invoices, POS, marketing drafts, live chat inbox, client portal and managed domain pages all loaded data. Rapid reloads kept the session (a bug found and fixed during testing). The portal was checked at phone width.

### Needs your configuration
SMTP, Square (plus webhook), Anthropic key, Google OAuth client, optional Twilio and Spaces, DNS. See the tables above.

### Could not be verified here
- **The Docker build itself.** This PC has no Docker; the first `docker compose up --build` on the Droplet is that test. The same build steps passed outside Docker.
- Live market research (Tavily, Exa, Perplexity) and Claude price extraction.
- Real email delivery, Square checkout, Claude replies, Google sign-in and Twilio texts. All need live keys. Without keys, each one refuses with a clear message, and that was tested.
- HTTPS and certificates (Nginx/Let's Encrypt run only on the server).
- Offline/service-worker registration. The test browser doesn't allow service workers; the `sw.js` file is served correctly.
- Your real Base44 data import (needs your exports). The importer was compiled, but not run on real files.

### Known remaining items
- Resolved (October 21, 2026): the unused Quill editor was removed, and the site was upgraded to React Router 7 and Tailwind CSS 4. `npm audit` reports 0 vulnerabilities for both the site and the backend. Pages were compared against before-upgrade screenshots, and four Tailwind 4 conversion issues were fixed: per-section theme colors, the font layer order, the contact-form card rule, and blur effects missing in Chrome. Builds now use the committed lock files for exact versions.
- The app links (`apple-app-site-association`, `assetlinks.json`) still use the bundle ID Base44 generated (`com.base6a9620cbd28f8dc991297e69.app`). That's fine if those store apps stay; changing it means new store listings.
- The Twilio SMS-reply webhook (`veAssistantSmsReply`) referenced in the old config had no code in the export, so it wasn't ported.
- The live-chat inbox (`ChatSession`) has no code that creates sessions, which was also true in the Base44 version. The website assistant saves to `Conversation` and creates an `Inquiry` when a visitor asks for follow-up.
