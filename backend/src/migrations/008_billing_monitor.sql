-- Billing Monitor: what every AI call cost, what each provider says we owe, budgets, and alerts.
-- Additive only. No prompt text is ever stored here: only counts, model names, timings and an optional
-- one-way hash of the question (so repeated identical questions can be spotted without keeping them).
-- Days and months in the dashboard are America/Chicago.

-- Prices live here, not in code. Prices are per 1,000,000 tokens (unit 'mtok') or per single unit
-- ('unit': one web search, or one call). A model with no row here gives cost_status 'pending', never a silent zero.
CREATE TABLE IF NOT EXISTS model_prices (
  id              bigserial PRIMARY KEY,
  provider        text NOT NULL,                       -- claude | gemini | perplexity | deepseek | ...
  model           text NOT NULL,                       -- exact model id, or '*' for every model of the provider
  token_type      text NOT NULL CHECK (token_type IN ('input', 'output', 'cache_read', 'cache_write', 'thinking', 'search', 'call')),
  price_usd       numeric(12,6) NOT NULL CHECK (price_usd >= 0),
  unit            text NOT NULL DEFAULT 'mtok' CHECK (unit IN ('mtok', 'unit')),
  price_window    text NOT NULL DEFAULT 'any' CHECK (price_window IN ('any', 'peak', 'offpeak')),   -- DeepSeek has peak and off-peak rates
  effective_from  timestamptz NOT NULL DEFAULT '2000-01-01',
  effective_to    timestamptz,
  source_url      text,                                -- the official page the number came from
  confirmed       boolean NOT NULL DEFAULT false,      -- an admin has checked it against the source
  note            text,
  created_date    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, token_type, price_window, effective_from)
);
CREATE INDEX IF NOT EXISTS model_prices_lookup_idx ON model_prices(provider, model, token_type);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                  bigserial PRIMARY KEY,
  ts                  timestamptz NOT NULL DEFAULT now(),
  provider            text NOT NULL,
  model               text NOT NULL DEFAULT '',
  user_id             text,                            -- 'guest:...' for visitors who are not signed in
  org_id              text,                            -- Business subscription id
  command             text,                            -- search | build | create | business
  workflow            text,                            -- ai_search | video_studio | ...
  feature             text,                            -- answer | merge | followups | ...
  request_id          text,                            -- groups the calls that made up one question
  attempt             smallint NOT NULL DEFAULT 1,     -- 2 = the automatic retry
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,
  cache_write_tokens  integer,
  other_units         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- searches, thinking tokens, anything else billed
  cost_usd            numeric(12,6),                   -- NULL while cost_status is 'pending'
  cost_status         text NOT NULL DEFAULT 'final' CHECK (cost_status IN ('final', 'pending')),
  cost_source         text,                            -- computed | reported (the provider told us) | failed (nothing billed)
  latency_ms          integer,
  http_status         integer,
  error_code          text,
  query_hash          text                             -- HMAC of the normalised question, never the question
);
CREATE INDEX IF NOT EXISTS ai_usage_logs_ts_idx ON ai_usage_logs(ts);
CREATE INDEX IF NOT EXISTS ai_usage_logs_provider_ts_idx ON ai_usage_logs(provider, ts);
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_ts_idx ON ai_usage_logs(user_id, ts);
CREATE INDEX IF NOT EXISTS ai_usage_logs_command_ts_idx ON ai_usage_logs(command, ts);
CREATE INDEX IF NOT EXISTS ai_usage_logs_pending_idx ON ai_usage_logs(ts) WHERE cost_status = 'pending';
CREATE INDEX IF NOT EXISTS ai_usage_logs_hash_idx ON ai_usage_logs(query_hash, ts) WHERE query_hash IS NOT NULL;

-- What the providers themselves report (balances, month-to-date, invoice lines, budget notices).
CREATE TABLE IF NOT EXISTS provider_snapshots (
  id        bigserial PRIMARY KEY,
  ts        timestamptz NOT NULL DEFAULT now(),
  provider  text NOT NULL,
  metric    text NOT NULL,
  value     numeric,
  raw       jsonb
);
CREATE INDEX IF NOT EXISTS provider_snapshots_lookup_idx ON provider_snapshots(provider, metric, ts DESC);

CREATE TABLE IF NOT EXISTS budgets (
  id             bigserial PRIMARY KEY,
  scope          text NOT NULL CHECK (scope IN ('global', 'provider', 'user', 'workflow')),
  scope_ref      text NOT NULL DEFAULT '',             -- provider id, user id or workflow name; '' for global
  period         text NOT NULL CHECK (period IN ('day', 'month')),
  amount_usd     numeric(12,2) NOT NULL CHECK (amount_usd > 0),
  warn_pcts      integer[] NOT NULL DEFAULT '{50,80,100}',
  hard_stop      boolean NOT NULL DEFAULT false,       -- at 100%: block the call, or fall back to another provider
  override_until timestamptz,                          -- an admin can lift a hard stop for a while
  enabled        boolean NOT NULL DEFAULT true,
  note           text,
  created_date   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_ref, period)
);

CREATE TABLE IF NOT EXISTS alerts (
  id                bigserial PRIMARY KEY,
  ts                timestamptz NOT NULL DEFAULT now(),
  severity          text NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  kind              text NOT NULL,                     -- spike | forecast | low_balance | budget | billing_error | reconcile | pending_prices | ...
  scope             text NOT NULL DEFAULT 'global',
  scope_ref         text NOT NULL DEFAULT '',
  message           text NOT NULL,
  value             numeric,
  threshold         numeric,
  dedupe_key        text,                              -- the same condition in the same period raises one alert
  acknowledged_at   timestamptz,
  acknowledged_by   text,
  notified_channels text[] NOT NULL DEFAULT '{}',
  last_notified_at  timestamptz,
  notify_count      integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_dedupe_idx ON alerts(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts(ts DESC) WHERE acknowledged_at IS NULL;

-- A provider that reported a billing problem (out of credit, spend cap hit) stays marked until 'until' passes.
CREATE TABLE IF NOT EXISTS provider_state (
  provider  text PRIMARY KEY,
  status    text NOT NULL CHECK (status IN ('ok', 'unavailable_billing')),
  reason    text,
  since     timestamptz NOT NULL DEFAULT now(),
  until     timestamptz
);

-- Accounts whose hourly spend looks abusive are slowed down until 'until'.
CREATE TABLE IF NOT EXISTS billing_throttles (
  user_id  text PRIMARY KEY,
  reason   text NOT NULL,
  since    timestamptz NOT NULL DEFAULT now(),
  until    timestamptz NOT NULL
);

-- When each background job last ran, so a restart does not repeat or skip work.
CREATE TABLE IF NOT EXISTS billing_job_runs (
  job         text PRIMARY KEY,
  last_run    timestamptz,
  last_ok     timestamptz,
  last_error  text,
  runs        integer NOT NULL DEFAULT 0
);

-- Daily cost by provider and model (America/Chicago days). Refreshed every 15 minutes.
CREATE MATERIALIZED VIEW IF NOT EXISTS billing_summary AS
SELECT (ts AT TIME ZONE 'America/Chicago')::date AS day,
       provider,
       model,
       count(*)::int                                  AS requests,
       COALESCE(sum(input_tokens), 0)::bigint         AS input_tokens,
       COALESCE(sum(output_tokens), 0)::bigint        AS output_tokens,
       COALESCE(sum(cache_read_tokens), 0)::bigint    AS cache_read_tokens,
       COALESCE(sum(cost_usd), 0)::numeric(14,6)      AS cost_usd,
       count(*) FILTER (WHERE cost_status = 'pending')::int AS pending_requests,
       count(*) FILTER (WHERE http_status >= 400)::int      AS failed_requests
  FROM ai_usage_logs
 GROUP BY 1, 2, 3
WITH DATA;
CREATE UNIQUE INDEX IF NOT EXISTS billing_summary_key_idx ON billing_summary(day, provider, model);

CREATE OR REPLACE VIEW user_usage AS
SELECT user_id,
       (ts AT TIME ZONE 'America/Chicago')::date AS day,
       count(*)::int                             AS requests,
       COALESCE(sum(input_tokens + output_tokens), 0)::bigint AS tokens,
       COALESCE(sum(cost_usd), 0)::numeric(14,6) AS cost_usd
  FROM ai_usage_logs
 WHERE user_id IS NOT NULL
 GROUP BY 1, 2;

CREATE OR REPLACE VIEW workflow_costs AS
SELECT COALESCE(workflow, 'unknown') AS workflow,
       COALESCE(feature, 'unknown')  AS feature,
       COALESCE(command, 'unknown')  AS command,
       (ts AT TIME ZONE 'America/Chicago')::date AS day,
       count(*)::int                             AS requests,
       COALESCE(sum(cost_usd), 0)::numeric(14,6) AS cost_usd
  FROM ai_usage_logs
 GROUP BY 1, 2, 3, 4;

-- Starting prices. EVERY ROW IS UNCONFIRMED: check each number against its source page, then press Confirm in
-- Admin > Billing > Prices. Rows can be edited there at any time; a changed price starts a new row (history is kept).
-- Sources:
--   Claude  https://docs.claude.com/en/docs/about-claude/pricing   (tokens; web search is billed per search)
--   Gemini  https://ai.google.dev/gemini-api/docs/pricing           (tokens; Search grounding is billed per grounded prompt)
--   Perplexity  https://docs.perplexity.ai/docs/getting-started/pricing  (the Agent API reports its own cost per call)
INSERT INTO model_prices(provider, model, token_type, price_usd, unit, source_url, note) VALUES
  ('claude', 'claude-haiku-5-5',  'input',      0.10, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', 'Starting value from the October 2026 plan sheet; confirm.'),
  ('claude', 'claude-haiku-5-5',  'output',     0.50, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-haiku-5-5',  'cache_read', 0.01, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-haiku-5-5',  'search',     0.01, 'unit', 'https://docs.claude.com/en/docs/about-claude/pricing', 'Web search tool: $10 per 1,000 searches.'),
  ('claude', 'claude-sonnet-5-5', 'input',      2.00, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', 'Starting value from the October 2026 plan sheet; confirm.'),
  ('claude', 'claude-sonnet-5-5', 'output',    10.00, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-sonnet-5-5', 'cache_read', 0.20, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-sonnet-5-5', 'search',     0.01, 'unit', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-opus-5-5',   'input',      4.00, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', 'Starting value from the October 2026 plan sheet; confirm.'),
  ('claude', 'claude-opus-5-5',   'output',    20.00, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-opus-5-5',   'cache_read', 0.20, 'mtok', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('claude', 'claude-opus-5-5',   'search',     0.01, 'unit', 'https://docs.claude.com/en/docs/about-claude/pricing', NULL),
  ('gemini', '*',                 'call',       0.04, 'unit', 'https://ai.google.dev/gemini-api/docs/pricing', 'Rough per-answer figure for a Search-grounded answer. Replace with real per-token and grounding prices.'),
  ('perplexity', '*',             'call',       0.01, 'unit', 'https://docs.perplexity.ai/docs/getting-started/pricing', 'Used only when Perplexity does not report its own cost for the call.')
ON CONFLICT DO NOTHING;

-- Spend limits to start with (edit in Admin > Billing > Budgets). Alerts only; nothing is blocked until hard stop is switched on.
INSERT INTO budgets(scope, scope_ref, period, amount_usd, hard_stop, note) VALUES
  ('global', '', 'month', 200, false, 'Everything we spend on AI APIs in a month.'),
  ('global', '', 'day', 25, false, 'Everything we spend on AI APIs in a day.')
ON CONFLICT DO NOTHING;
