-- Saved conversation history is a paid feature: pins, favorites, Spaces, auto-delete.
-- Additive only. Existing threads are kept untouched.
ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;
ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS space text;
ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS auto_delete_days int CHECK (auto_delete_days IS NULL OR auto_delete_days IN (30, 90, 365));
CREATE INDEX IF NOT EXISTS ai_threads_user_pinned_idx ON ai_threads(user_id, pinned DESC, updated_date DESC);

-- Build Studio: one row per AI planner step (free quick-parser turns are not recorded).
CREATE TABLE IF NOT EXISTS build_studio_usage (
  id       bigserial PRIMARY KEY,
  user_id  text NOT NULL,
  tier     text NOT NULL,
  chars    int NOT NULL DEFAULT 0,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS build_studio_usage_user_at_idx ON build_studio_usage(user_id, at DESC);
