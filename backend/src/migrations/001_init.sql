-- Core schema for the Vivid Engine API.
-- IDs are 24-character hex strings, the same format Base44 used, so imported
-- records keep their IDs and every cross-reference (clientUserId, project_id,
-- managedDomainLeaseId, ...) stays valid without remapping.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION new_id() RETURNS text LANGUAGE sql VOLATILE AS
$$ SELECT encode(gen_random_bytes(12), 'hex') $$;

CREATE TABLE IF NOT EXISTS users (
  id              text PRIMARY KEY DEFAULT new_id(),
  email           text NOT NULL UNIQUE,
  password_hash   text,
  full_name       text,
  role            text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified  boolean NOT NULL DEFAULT false,
  google_sub      text UNIQUE,
  created_date    timestamptz NOT NULL DEFAULT now(),
  updated_date    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          text PRIMARY KEY DEFAULT new_id(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

-- One-time codes: email verification (6 digits) and password reset (long token).
CREATE TABLE IF NOT EXISTS auth_codes (
  id          text PRIMARY KEY DEFAULT new_id(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_codes_user_idx ON auth_codes(user_id, purpose);

-- Business records: one row per record, fields in `data` (Base44 entity layout).
CREATE TABLE IF NOT EXISTS records (
  id            text PRIMARY KEY DEFAULT new_id(),
  entity        text NOT NULL,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    text,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS records_entity_created_idx ON records(entity, created_date DESC);
CREATE INDEX IF NOT EXISTS records_data_gin ON records USING gin (data jsonb_path_ops);

-- Fixed-window counters for the rate limits Base44 kept in its RateLimit entity.
CREATE TABLE IF NOT EXISTS rate_limits (
  key           text PRIMARY KEY,
  count         int NOT NULL,
  window_start  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          bigserial PRIMARY KEY,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id     text,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
