# Vivid AI Search

A Claude-style search box at **/ai-search** (also linked in the main menu and from a new homepage section).
People sign in, ask anything, and get an answer written by Claude from **live web search with sources**.
It also helps plan and build websites: site maps, page copy, SEO titles, competitor research, and working code.
On paid plans, **Perplexity, Gemini and ChatGPT** answer the same question first. Claude gets their answers as
"second opinions", checks them against its own search results, and says when the engines disagree.

Website build and care pricing (`/pricing`) is **unchanged**.

**Microsoft Copilot is not included:** Microsoft offers no public API for Copilot, and the Bing Search API was
retired in 2025. If Microsoft opens one, it can be added as a fourth engine in `backend/src/ai-search/contributors.ts`.

## Plans

| Plan | Price | Model | Other engines | Questions | Web searches per answer |
|---|---|---|---|---|---|
| Free | $0 | Claude Haiku 5.5 | none | 5/day, 60/month | 2 |
| Starter | $8/mo | Claude Haiku 5.5 | Perplexity | 25/day, 150/month | 3 |
| Plus | $20/mo | Claude Sonnet 5.5 | Perplexity, Gemini | 30/day, 120/month | 4 |
| Pro | $45/mo | Claude Sonnet 5.5 | Perplexity, Gemini, ChatGPT | 40/day, 200/month | 6 |
| Max | $129/mo | Claude Opus 5.5 | Perplexity, Gemini, ChatGPT | 60/day, 250/month | 8 |
| Business | $35/seat/mo (2+ seats) | Claude Sonnet 5.5 | Perplexity, Gemini, ChatGPT | 40/day per person; 150/month per seat, shared by the team | 6 |

**"Faster responses" on paid plans means:**
- Free answers share a limited lane: at most 4 run at once across the whole site, and people wait for their turn.
- Paid plans never wait in that lane, can run two answers at once, and have higher per-minute limits.
- Higher plans also answer with stronger models and longer responses.

**Why the limits are what they are:** each paid plan's monthly cap is sized so that a customer who uses every
single question still costs about 70% or less of what they pay. The cost math is at the top of
`backend/src/ai-search/plans.ts`. Typical customers use far less than their cap.

**Safety net:** `AI_SEARCH_DAILY_BUDGET_USD` (default $25) pauses all questions for the rest of the UTC day once
estimated spend reaches it. Each answer's estimated cost is stored in the `ai_usage` table.

To change a price or limit, edit `backend/src/ai-search/plans.ts` and redeploy. The pricing page and checkout both
read from that file. Existing subscribers keep their current Square price until you change it in Square.

## Perplexity Agent API (one key, three model families)

`backend/src/ai-search/perplexity-agent.ts` calls `POST https://api.perplexity.ai/v1/agent` with the `web_search` tool,
following docs.perplexity.ai/api-reference/agent-post. One `PERPLEXITY_API_KEY` covers:

| Use | Model (setting) | When |
|---|---|---|
| Perplexity second opinion | `perplexity/sonar` (`PERPLEXITY_SEARCH_MODEL`) | always, on plans that include Perplexity |
| Gemini second opinion | `google/gemini-3.8-flash` (`PPLX_GEMINI_MODEL`) | when `GEMINI_API_KEY` is empty |
| ChatGPT second opinion | `openai/gpt-6-luna` (`PPLX_OPENAI_MODEL`) | when `OPENAI_API_KEY` is empty |
| The main answer | `anthropic/<plan model>`, e.g. `anthropic/claude-sonnet-5-5` | when `ANTHROPIC_API_KEY` is empty, or Claude's API fails before writing anything (no credit, bad key, overloaded) |

Perplexity reports each request's real cost (`usage.cost.total_cost`), and that is what gets recorded in `ai_usage`.
Answers through Perplexity stream to the browser the same way; its citations and search results become the source cards.

Not used (and why): the Router API has no web search, which AI Search depends on; the Search API returns raw links,
which Claude and the Agent API already do; the Embeddings API has nothing to index here (site search is a short fixed list);
the Decisions API would only re-classify leads the chat assistant already classifies.

## Setup (on the server, after installing the package)

1. **API keys.** Open `/opt/vivid/infra/.env` and add:
   - `ANTHROPIC_API_KEY`: already used by the site assistant. Required.
   - `PERPLEXITY_API_KEY`: perplexity.ai → API settings (may already be set for pricing research).
   - `GEMINI_API_KEY`: aistudio.google.com → Get API key. The API project needs billing turned on, because Google Search grounding is a paid feature.
   - `OPENAI_API_KEY`: platform.openai.com → API keys.

   Any engine without a key is skipped automatically, and the plans page stops advertising it.
   `GEMINI_SEARCH_MODEL` is a list, best first (default `gemini-4-argon,gemini-3.8-flash`). If a model is
   retired or over quota, the next one answers, then the Perplexity Agent API.
   The model names (`OPENAI_SEARCH_MODEL`, `GEMINI_SEARCH_MODEL`, `PERPLEXITY_SEARCH_MODEL`) have defaults;
   check them against each provider's current model list and change them if one is retired.
2. **Square webhook events.** Dashboard → Developers → Webhooks → your endpoint
   (`https://vividenginesolutions.com/api/webhooks/square`). Add `customer.subscription.updated` and
   `customer.subscription.deleted` next to the existing `checkout.session.completed`.
3. **Square customer portal.** Dashboard → Settings → Billing → Customer portal. Turn it on, and allow
   cancelling and updating quantities (so Business owners can add seats).
4. Restart the app: `cd /opt/vivid/infra && docker compose up -d app`.

## How it works

| Piece | File |
|---|---|
| Plans, limits, cost rates | `backend/src/ai-search/plans.ts` |
| Asking Perplexity, Gemini, ChatGPT (in parallel, 20 s limit each, failures skipped) | `backend/src/ai-search/contributors.ts` |
| Answer stream, limits, daily budget, conversations, team seats | `backend/src/ai-search/ai-search.service.ts` |
| Square checkout, billing portal, webhook sync | `backend/src/ai-search/ai-search.billing.ts` |
| Endpoints under `/api/ai-search/*` | `backend/src/ai-search/ai-search.controller.ts` |
| Database tables (new, additive) | `backend/src/migrations/002_ai_search.sql` |
| Pages | `site/src/pages/AiSearch.jsx`, `AiSearchPricing.jsx`, `AiSearchAccount.jsx` |
| Homepage section | `site/src/components/engine/EngineAiSearch.jsx` |
| Streaming without buffering | `infra/nginx/templates/default.conf.template` (`/api/ai-search/ask`), `backend/src/main.ts` |

Claude details:
- Sonnet and Opus use the `web_search_20260209` tool, which filters results.
- Haiku uses the standard `web_search_20250305` version.
- Effort is set per plan.
- Sonnet and Opus requests turn on server-side fallback (`fallbacks: "default"`), so if a model declines a question, another Claude model can continue the answer.
- The system prompt is cached.
- Answers stream to the browser as they are written. Long research turns that pause are resumed automatically (up to 3 times).

Privacy: questions and answers are stored per account, and people can delete any conversation. The privacy
policy has a new "Vivid AI Search" section listing which providers receive questions.

## Checks

Tested here:
- Backend type-check and site build pass.
- The page list and sitemap now include `/ai-search` and `/ai-search/pricing`; `/ai-search/account` is private and noindex.
- A local harness ran the real answer code against stand-in services, and all 20 checks passed.
- The pages were previewed in a browser, desktop and phone.

The end-to-end test (`backend/test/vivid seo.mjs`) has 11 new AI Search checks.

Not testable here (needs the live keys): real answers from each provider, and a real Square checkout. After deploying:
1. Sign up with a test email, ask a question at `/ai-search`, and confirm the answer streams in with sources.
2. In Square **test mode**, buy Starter with card `4242 4242 4242 4242`. `/ai-search/account` should show Starter within a few seconds, and the next answer should show a Perplexity badge.
3. Buy Business with 2 seats, add a teammate on the account page, sign in as the teammate, and confirm they get the Business plan.
4. Watch spend: `docker compose exec postgres psql -U vivid -d vivid -c "select date(at), count(*), sum(cost_usd) from ai_usage group by 1 order by 1 desc limit 7"`

## Roll back

Same as any update: tag the running image first, then restore it if needed:

```bash
docker tag vivid-app:latest vivid-app:before-ai-search
```

```bash
cd /opt/vivid/infra && docker tag vivid-app:before-ai-search vivid-app:latest && docker compose up -d app
```

The new database tables stay but are unused by the old version. No existing table or data is changed.
