-- AI router: a ledger of what each answer cost us, once-a-month usage notices, margin flags,
-- and which engine answered. Additive only: nothing is dropped or renamed.

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id               bigserial PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  text,                              -- set for Business seats, which share one pool
  plan_id          text NOT NULL,
  period           text NOT NULL,                     -- UTC month, 'YYYY-MM'
  kind             text NOT NULL DEFAULT 'usage' CHECK (kind IN ('usage', 'grant')),
  provider         text NOT NULL,                     -- perplexity | claude | gemini | combined
  model            text NOT NULL DEFAULT '',
  cost_usd         numeric(10,5) NOT NULL DEFAULT 0,  -- what the engines charged us (or our estimate, see cost_status)
  credits          int NOT NULL DEFAULT 0,            -- 1 credit = $0.001 of cost_usd
  cost_status      text NOT NULL DEFAULT 'known' CHECK (cost_status IN ('known', 'estimated', 'pending')),
  request_id       text,
  note             text,
  created_date     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_credit_ledger_user_idx ON ai_credit_ledger(user_id, period);
CREATE INDEX IF NOT EXISTS ai_credit_ledger_sub_idx ON ai_credit_ledger(subscription_id, period) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_credit_ledger_period_idx ON ai_credit_ledger(period);

-- The 80% and 100% notices go out once per account per month.
CREATE TABLE IF NOT EXISTS ai_credit_notices (
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period        text NOT NULL,
  level         text NOT NULL CHECK (level IN ('warn80', 'limit100')),
  created_date  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period, level)
);

-- Accounts whose plan price fell below the margin multiplier times their cost this month (admin review).
CREATE TABLE IF NOT EXISTS ai_margin_flags (
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period        text NOT NULL,
  plan_id       text NOT NULL,
  price_usd     numeric(10,2) NOT NULL,
  cost_usd      numeric(10,5) NOT NULL,
  multiplier    numeric(4,2) NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS engine text;        -- what was asked for: auto | perplexity | claude | gemini | combined
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS depth text;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'known';
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS guest boolean NOT NULL DEFAULT false;
