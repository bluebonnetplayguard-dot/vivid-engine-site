# Billing Monitor

Admin > **AI Billing** (`/admin/billing`) shows what every AI call cost, what each provider says you owe, your
budgets, and alerts. It is built into the existing NestJS API and PostgreSQL database. No new server, language,
Redis, or database.

Code: `backend/src/billing-monitor/`. Migration: `backend/src/migrations/008_billing_monitor.sql`.
Tests: `backend/test/billing-monitor.test.mjs` (49 tests: cost math, alert rules and dedupe, provider parsers,
budgets, scheduling, and the database jobs).

## What it does

| Piece | Where | Notes |
|---|---|---|
| Usage log | `usage.ts`, wired in `ai-router/ai-router.service.ts` | One row in `ai_usage_logs` per engine call, including retries, failures, the Combined merge step and follow-up suggestions. Written in batches every 2 seconds, never on the answer path. No question or answer text is stored, only counts, model, timing and a one-way hash of the question. |
| Prices | `model_prices` table, `prices.ts`, `cost.ts` | Costs come from the table, never from code. A model or token kind with no price is `pending` with no cost (never a silent $0) and is priced automatically once you add the price. DeepSeek peak/off-peak windows are supported. The router's own cost figures use the same table. |
| Billing errors | `billing-monitor.service.ts` | Out of credit, spend cap or bad key: the provider is marked `unavailable_billing` in `provider_state` (survives a restart), a CRITICAL alert goes out, the question goes to the next engine, and there is no retry. |
| Provider sync | `sync.ts`, `jobs.ts` | DigitalOcean balance every 6 h and invoice lines daily; Anthropic cost and usage reports hourly; DeepSeek balance every 15 min (only if a key is set); Gemini from our own log plus Google Cloud budget notices. |
| Budgets | `budget-guard.ts` | Checked before every AI call. Warnings at 50/80/100% raise one alert per threshold per day or month. A hard stop pauses a provider (calls go elsewhere) or pauses the question with a friendly message. Admins can lift a hard stop for 24 h. |
| Abuse guard | `jobs.ts` | An account spending more than `ABUSE_USER_HOURLY_USD` in an hour, or 5x its usual hourly spend, raises an alert and is slowed down for an hour. |
| Alert rules | `rules.ts`, every 15 min | Spike (3x the same hour over the last 7 days), month-end forecast over budget, low balance, Anthropic at 80% of its limit, DigitalOcean budget and fast-growing bandwidth/storage lines, calls still without a price after 24 h, and a nightly check of our log against Anthropic's bill (more than 10% apart). |
| Notifications | `alerts.ts` | Warnings and critical alerts go by email (`ALERT_EMAIL_TO`) and the optional webhook. Every alert shows in the dashboard bell. Critical alerts repeat every 6 h until acknowledged. A digest goes out at 8:00 a.m. Central. |
| Dashboard | `site/src/pages/admin/AdminBilling.jsx` | Cards, provider tiles, charts, cost by account/command/workflow/feature/model, an Optimize panel, alerts with Acknowledge, and budget and price editors. |

Days and months are America/Chicago everywhere in the monitor.

### Endpoints (admin only, under `/api`)

`GET /admin/billing/summary`, `/by-model`, `/by-user`, `/by-workflow`, `/by-feature`, `/by-command` (`?period=day|week|month`),
`/providers`, `/optimize`, `/alerts` (`?open=1`), `POST /admin/billing/alerts/:id/ack`, `GET|POST /admin/billing/budgets`,
`PATCH /admin/billing/budgets/:id`, `GET|POST /admin/billing/prices`, `PATCH /admin/billing/prices/:id` (confirm),
`DELETE /admin/billing/throttles/:userId`. Public: `POST /billing/webhooks/gcp-budget?token=...` (Pub/Sub push, token checked
in constant time).

### Differences from the setup PDF, and why

- **No Redis.** Counters, dedupe and the "unavailable" flag live in PostgreSQL (`alerts.dedupe_key` unique index,
  `provider_state`, `billing_throttles`, `billing_job_runs`). The app runs as one container, and the database already
  survives restarts.
- **No DeepSeek adapter.** The AI router uses Perplexity, Claude and Gemini. DeepSeek support is limited to reading the
  balance if you set `DEEPSEEK_API_KEY`, plus peak/off-peak pricing in the table, ready if a DeepSeek engine is added.
- **Dashboard is React (Vite), not Next.js**, in the existing admin area.
- **`model_prices.price_usd` + `unit`** instead of `price_per_mtok_usd`: one column holds both per-million-token
  prices (`mtok`) and per-search or per-call prices (`unit`).

## Part 1: provider settings to turn on yourself (about 30 minutes, no code)

These protect you even if the app is down. Do them before relying on the dashboard.

1. **DigitalOcean** (billed after use). Billing > Spend alerts > Create alert: "Vivid total spend", your monthly target
   (for example $60), thresholds 50/80/100%, Total spend. Add a second alert for Droplets, Volumes and Spaces. Confirm the
   payment method. Then create a **read-only** API token for `DO_BILLING_TOKEN`.
2. **Claude API / Anthropic** (prepaid credits). In the Claude Console: Settings > Billing > set a **spend limit** first,
   then buy credits. Create a workspace for the app (for example `vivid-production`) and set a monthly limit with an
   email notification at a lower amount (for example email at $25, stop at $50). Leave auto-reload off for the first month.
   Make sure no other tool on the server uses the app's key. For the dashboard, create an **Admin API key**
   (`sk-ant-admin...`, needs an organization) for `ANTHROPIC_ADMIN_KEY`. In Admin > AI Billing > Budgets, add a
   provider budget `claude` / month equal to your Console limit so the 80% warning works.
3. **DeepSeek** (prepaid, optional). Only if you use DeepSeek elsewhere: top up a small amount and set `DEEPSEEK_API_KEY`
   so the monitor can warn on a low balance. DeepSeek has no email alerts of its own.
4. **Gemini / Google Cloud** (billed after use). Billing > Budgets & alerts > Create budget > **Spend cap budget**, scoped
   to the project and the Gemini API: usage pauses at 100%, emails at 50/80/100%. Optional: connect a Pub/Sub topic with a
   **push** subscription to `https://vividenginesolutions.com/api/billing/webhooks/gcp-budget?token=<GCP_BUDGET_PUSH_TOKEN>`.
5. **Perplexity** (prepaid credits). In the Perplexity API settings, keep auto top-up off or capped. The Agent API reports
   each call's cost, which the monitor records exactly.

## Setup in the app

1. Add the variables (names in `infra/.env.example`) to `/opt/vivid/infra/.env` on the server. All are optional.
2. Deploy. Migration `008_billing_monitor.sql` runs at start-up like the others. It only adds tables and views, and seeds
   starting prices (every row **unconfirmed**) and two alert-only budgets ($200 a month, $25 a day).
3. Open Admin > AI Billing > Prices. Check each seeded price against its source link and press **Confirm**, or save the
   correct price. Gemini and Perplexity start with rough per-answer figures; replace them with real ones when you can.
4. Adjust the budgets. Turn on **hard stop** only for limits you never want crossed.

## Test plan (staging first)

Run the automated tests: `npm --prefix backend run build && TEST_DATABASE_URL=postgres://...empty-db... npm --prefix backend test`.

Then, on staging with real keys, trigger one alert of each kind and check it reaches email, the webhook and the bell:

| Alert | How to trigger it on staging |
|---|---|
| Budget warning | Set the global daily budget to $0.05 and ask two questions. Expect one 50%/80%/100% alert each, never repeated the same day. |
| Hard stop | Turn hard stop on for that budget, ask again: a friendly "paused" message. "Lift for 24h" lets questions through. |
| Provider hard stop | Add a provider budget `claude` / day $0.01 with hard stop. Ask a question in Claude mode: another engine answers and says why. |
| Billing error (critical) | Put an invalid `ANTHROPIC_API_KEY` in staging and ask a Claude question. Expect a critical alert, the answer from another engine, and a reminder 6 h later unless acknowledged. |
| Pending price | On staging, delete one model's price rows and ask a question with that model: the call shows "no price yet", an info alert appears after 24 h, and the call is priced automatically when you add the price back. |
| Spike | On staging, insert a few large `ai_usage_logs` rows in the last hour (or ask many Deep Research questions), then wait for the 15-minute rules run. |
| Forecast | Lower the global monthly budget below the month-to-date pace. |
| Low balance | DeepSeek: set `LOW_BALANCE_USD` above the balance. |
| Anthropic limit | Set the `claude` monthly budget to just above the month-to-date cost from Anthropic. |
| DigitalOcean | Set a `digitalocean` monthly budget below the month-to-date usage. |
| Reconcile | Use the Anthropic key from another tool for a few calls; the next 3 a.m. run flags the day. |
| Google budget | Send a test message through the Pub/Sub push subscription (or `curl` the webhook with a base64 budget body and the token). A wrong token returns 403. |
| Abuse guard | Set `ABUSE_USER_HOURLY_USD=0.05` on staging and ask a few Pro questions from one account: alert, then "asking very quickly" until the hour passes or an admin removes the throttle. |
| Digest | Wait for 8:00 a.m. Central, or set `billing_job_runs.last_run` for `digest` to yesterday. |

Things that could not be checked from the build environment and need this staging run: the live response shapes of the
DigitalOcean, Anthropic Admin and DeepSeek APIs (written from their public references; Anthropic's cost report is read as
cents), and real email/webhook delivery.
