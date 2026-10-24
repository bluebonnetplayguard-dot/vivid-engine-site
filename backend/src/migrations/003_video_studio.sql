-- Vivid Video Studio: paid plans, business seats, saved projects, brand kits and AI usage.
-- Additive only: no existing table is changed. Media files never reach the server;
-- they stay in each customer's browser, and projects store only the edit decisions.

CREATE TABLE IF NOT EXISTS video_subscriptions (
  id                      text PRIMARY KEY DEFAULT new_id(),
  owner_user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                    text NOT NULL,
  status                  text NOT NULL DEFAULT 'active',
  seats                   int  NOT NULL DEFAULT 1 CHECK (seats >= 1 AND seats <= 500),
  company_name            text,
  current_period_end      timestamptz,
  created_date            timestamptz NOT NULL DEFAULT now(),
  updated_date            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_subscriptions_owner_idx ON video_subscriptions(owner_user_id);

CREATE TABLE IF NOT EXISTS video_seats (
  id               text PRIMARY KEY DEFAULT new_id(),
  subscription_id  text NOT NULL REFERENCES video_subscriptions(id) ON DELETE CASCADE,
  email            text NOT NULL,
  user_id          text REFERENCES users(id) ON DELETE SET NULL,
  role             text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_date     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, email)
);
CREATE INDEX IF NOT EXISTS video_seats_email_idx ON video_seats(lower(email));

-- The edit (tracks, clips, text, effects) as JSON. Media is referenced by id, not stored.
CREATE TABLE IF NOT EXISTS video_projects (
  id            text PRIMARY KEY DEFAULT new_id(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  aspect        text NOT NULL DEFAULT '16:9',
  duration_sec  numeric(9,2) NOT NULL DEFAULT 0,
  data          jsonb NOT NULL,
  thumbnail     text,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_projects_user_idx ON video_projects(user_id, updated_date DESC);

-- Brand kits: colors, fonts and a logo. subscription_id set = shared with that Business team.
CREATE TABLE IF NOT EXISTS video_brand_kits (
  id               text PRIMARY KEY DEFAULT new_id(),
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  text REFERENCES video_subscriptions(id) ON DELETE SET NULL,
  name             text NOT NULL,
  data             jsonb NOT NULL,
  created_date     timestamptz NOT NULL DEFAULT now(),
  updated_date     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_brand_kits_user_idx ON video_brand_kits(user_id);
CREATE INDEX IF NOT EXISTS video_brand_kits_sub_idx ON video_brand_kits(subscription_id);

-- One row per metered use. kind: export (amount = 1), transcribe (seconds), tts (characters), storyboard (1).
CREATE TABLE IF NOT EXISTS video_usage (
  id               bigserial PRIMARY KEY,
  user_id          text NOT NULL,
  subscription_id  text,
  tier             text NOT NULL,
  kind             text NOT NULL,
  amount           numeric(12,2) NOT NULL DEFAULT 0,
  cost_usd         numeric(10,5) NOT NULL DEFAULT 0,
  at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_usage_user_idx ON video_usage(user_id, kind, at DESC);
CREATE INDEX IF NOT EXISTS video_usage_sub_idx ON video_usage(subscription_id, kind, at DESC);
CREATE INDEX IF NOT EXISTS video_usage_at_idx ON video_usage(at DESC);
