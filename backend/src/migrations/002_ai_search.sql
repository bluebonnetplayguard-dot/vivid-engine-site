-- Vivid AI Search: paid plans, business seats, usage metering and saved conversations.
-- Additive only: no existing table is changed.

-- One row per paid subscription (individual tiers and Business). Free users have no row.
CREATE TABLE IF NOT EXISTS ai_subscriptions (
  id                      text PRIMARY KEY DEFAULT new_id(),
  owner_user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                    text NOT NULL,
  status                  text NOT NULL DEFAULT 'active',  -- active, trialing, past_due, canceled, ...
  seats                   int  NOT NULL DEFAULT 1 CHECK (seats >= 1 AND seats <= 500),
  company_name            text,
  stripe_customer_id      text,
  stripe_subscription_id  text UNIQUE,
  current_period_end      timestamptz,
  created_date            timestamptz NOT NULL DEFAULT now(),
  updated_date            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_subscriptions_owner_idx ON ai_subscriptions(owner_user_id);

-- Business seats. The owner holds a seat too. Invites are matched by email when the person signs in.
CREATE TABLE IF NOT EXISTS ai_seats (
  id               text PRIMARY KEY DEFAULT new_id(),
  subscription_id  text NOT NULL REFERENCES ai_subscriptions(id) ON DELETE CASCADE,
  email            text NOT NULL,
  user_id          text REFERENCES users(id) ON DELETE SET NULL,
  role             text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_date     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, email)
);
CREATE INDEX IF NOT EXISTS ai_seats_email_idx ON ai_seats(lower(email));

-- One row per answered question: what it used and what it cost us (estimated from token usage).
CREATE TABLE IF NOT EXISTS ai_usage (
  id               bigserial PRIMARY KEY,
  user_id          text NOT NULL,
  subscription_id  text,
  tier             text NOT NULL,
  model            text NOT NULL,
  input_tokens     int NOT NULL DEFAULT 0,
  output_tokens    int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  searches         int NOT NULL DEFAULT 0,
  contributors     jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_usd         numeric(10,5) NOT NULL DEFAULT 0,
  at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_at_idx ON ai_usage(user_id, at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_sub_at_idx ON ai_usage(subscription_id, at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON ai_usage(at DESC);

-- Saved conversations, visible only to their owner.
CREATE TABLE IF NOT EXISTS ai_threads (
  id            text PRIMARY KEY DEFAULT new_id(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_threads_user_idx ON ai_threads(user_id, updated_date DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id            bigserial PRIMARY KEY,
  thread_id     text NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text NOT NULL,
  sources       jsonb NOT NULL DEFAULT '[]'::jsonb,
  contributors  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_thread_idx ON ai_messages(thread_id, id);
