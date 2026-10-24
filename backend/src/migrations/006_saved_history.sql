-- Saved conversation history (paid plans only), encrypted at rest. Additive: no existing table loses data.
-- The earlier ai_threads / ai_messages tables stay in place (rolling back the app image keeps working);
-- the app copies them into the tables below the first time it starts (see HistoryService.importLegacy).

-- What a person's paid plans entitle them to. Recomputed from the subscription tables whenever a plan
-- starts, changes or ends, and nightly. The API reads only this table to decide who may save history.
CREATE TABLE IF NOT EXISTS entitlements (
  id                text PRIMARY KEY DEFAULT new_id(),
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature           text NOT NULL DEFAULT 'history',
  plan_id           text NOT NULL,                       -- pricing-catalog plan or bundle id (or an older tier id)
  source            text NOT NULL,                       -- ai_subscription | plan_subscription | admin
  source_id         text NOT NULL,
  retention_days    int,                                 -- null = kept until the person deletes it
  full_text_search  boolean NOT NULL DEFAULT false,
  bulk_export       boolean NOT NULL DEFAULT false,
  memory            boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_at          timestamptz,
  created_date      timestamptz NOT NULL DEFAULT now(),
  updated_date      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id, feature)
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id, feature, status);

-- Website, App Builder and bundle plans bought through Square (Search plans live in ai_subscriptions).
CREATE TABLE IF NOT EXISTS plan_subscriptions (
  id                        text PRIMARY KEY DEFAULT new_id(),
  owner_user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                   text NOT NULL,
  cycle                     text NOT NULL DEFAULT 'annual' CHECK (cycle IN ('monthly', 'annual')),
  status                    text NOT NULL DEFAULT 'active',
  provider                  text NOT NULL DEFAULT 'square',
  square_customer_id        text,
  square_subscription_id    text UNIQUE,
  card_id                   text,
  current_period_end        timestamptz,
  canceled_date             timestamptz,
  created_date              timestamptz NOT NULL DEFAULT now(),
  updated_date              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_subscriptions_owner_idx ON plan_subscriptions(owner_user_id);

-- Search plans can now be billed monthly or annually.
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'annual'));

-- Per-person history preferences.
CREATE TABLE IF NOT EXISTS history_settings (
  user_id                  text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled           boolean NOT NULL DEFAULT false,   -- Search Max and All-In-One: use earlier conversations as context
  default_auto_delete_days int CHECK (default_auto_delete_days IS NULL OR default_auto_delete_days IN (30, 90, 365)),
  updated_date             timestamptz NOT NULL DEFAULT now()
);

-- Spaces group conversations. The name is encrypted; name_hash (keyed hash of the lower-case name) keeps names unique per person.
CREATE TABLE IF NOT EXISTS spaces (
  id            text PRIMARY KEY DEFAULT new_id(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name_enc      text NOT NULL,
  name_hash     text NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_hash)
);

CREATE TABLE IF NOT EXISTS conversations (
  id                text PRIMARY KEY DEFAULT new_id(),
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_enc         text NOT NULL,
  space_id          text REFERENCES spaces(id) ON DELETE SET NULL,
  pinned            boolean NOT NULL DEFAULT false,
  auto_delete_days  int CHECK (auto_delete_days IS NULL OR auto_delete_days IN (30, 90, 365)),
  mode              text NOT NULL DEFAULT 'search',
  plan_id           text,                                     -- plan that saved it (for support)
  legacy_thread_id  text UNIQUE,                              -- set on rows copied from ai_threads
  created_date      timestamptz NOT NULL DEFAULT now(),
  updated_date      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations(user_id, pinned DESC, updated_date DESC);
CREATE INDEX IF NOT EXISTS conversations_expiry_idx ON conversations(updated_date);

CREATE TABLE IF NOT EXISTS messages (
  id               bigserial PRIMARY KEY,
  conversation_id  text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content_enc      text NOT NULL,
  engine           text,                                      -- perplexity | claude | gemini | combined
  terms            text[] NOT NULL DEFAULT '{}',              -- blind index of the words (keyed hashes, never the words)
  created_date     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS messages_terms_idx ON messages USING gin (terms);

CREATE TABLE IF NOT EXISTS conversation_sources (
  id               bigserial PRIMARY KEY,
  conversation_id  text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id       bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  position         int NOT NULL,                              -- the [n] number shown in the answer
  url_enc          text NOT NULL,
  title_enc        text NOT NULL,
  cited            boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS conversation_sources_message_idx ON conversation_sources(message_id, position);

-- A favorite is a whole conversation (message_id null) or one answer inside it.
CREATE TABLE IF NOT EXISTS favorites (
  id               bigserial PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id       bigint REFERENCES messages(id) ON DELETE CASCADE,
  created_date     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS favorites_unique_idx ON favorites(user_id, conversation_id, COALESCE(message_id, 0));

-- Entitlements for subscriptions that exist today (the app recomputes them on every plan change and nightly).
-- Older Search tiers keep 12 months (Max: until deleted); anything not listed here gets no saved history.
INSERT INTO entitlements(user_id, plan_id, source, source_id, retention_days, full_text_search, bulk_export, memory, status, ended_at)
SELECT s.owner_user_id, s.tier, 'ai_subscription', s.id,
       CASE WHEN s.tier = 'max' THEN NULL ELSE 365 END,
       s.tier = 'max', s.tier = 'max', s.tier = 'max',
       CASE WHEN s.status IN ('active', 'trialing', 'past_due') THEN 'active' ELSE 'ended' END,
       CASE WHEN s.status IN ('active', 'trialing', 'past_due') THEN NULL ELSE s.updated_date END
  FROM ai_subscriptions s
 WHERE s.tier IN ('starter', 'plus', 'pro', 'business', 'max')
ON CONFLICT (source, source_id, feature) DO NOTHING;
