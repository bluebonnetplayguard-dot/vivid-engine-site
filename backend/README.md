# Vivid Engine API

NestJS 11 + PostgreSQL. Replaces the Base44 backend and, in production, also serves the built website.
Production runs from the root `Dockerfile` (see `../docs/DEPLOY.md`).

## Local development

Needs Node.js 20+ and PostgreSQL 16 (for example `docker run -d -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=vivid -p 5432:5432 postgres:16`).

Create `backend/.env`:

```
NODE_ENV=development
DATABASE_URL=postgres://postgres:dev@localhost:5432/vivid
PUBLIC_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=<32+ random characters>
JWT_REFRESH_SECRET=<32+ random characters>
PUBLIC_CLIENT_SECRET=<32+ random characters>
ADMIN_EMAILS=you@example.com
```

```bash
npm install
npm run build
node --env-file=.env dist/main.js
```

The API listens on port 8080. Run the site with `npm run dev` in `../site`; Vite proxies `/api` to it.
Without SMTP settings emails are not sent (a warning is logged), so verify test accounts directly in the `users` table.

## Tests

`test/vivid seo.mjs` is the end-to-end test (126 checks, including SEO and speed) against a running API and an **empty test database** (it creates users and records):

```bash
BASE=http://localhost:8080 DATABASE_URL=postgres://... node "test/vivid seo.mjs"
```

## Layout

```
src/main.ts               boot: migrations, security headers, static site, SPA fallback
src/config.ts             environment validation (fails fast on missing/invalid values)
src/db.ts                 Postgres pool (TLS for Managed PostgreSQL) + migration runner
src/auth/                 sign-up, email codes, login, refresh rotation, Google, password reset, guard
src/entities/             collections from schemas/*.json (Base44 format), filters, access rules, live events
src/functions/            the 17 former Base44 functions (billing, AI, portal, inquiries, daily summary, IndexNow)
src/notify.ts             admin emails + Twilio owner texts
src/shared/               pricing (authoritative cents), assistant knowledge, input guards
src/scripts/              migrate, import-base44
```

## Access rules

Each collection's `rls` block in `src/entities/schemas/*.json` decides who may read, create, update and delete,
exactly as in Base44. Exceptions are listed at the top of `definitions.ts` (tasks and messages are limited to the
assigned client). Functions declare `public`, `user` or `admin` in `functions.controller.ts`.
