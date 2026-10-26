-- GC 3D Design Studio: projects, designs (variations) with version history, and presentation images.
-- Additive only: no existing table is changed.

CREATE TABLE IF NOT EXISTS studio_projects (
  id            text PRIMARY KEY DEFAULT new_id(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_projects_user_idx ON studio_projects(user_id, updated_date DESC);

-- One row per design (the base design and each variation). data = { model, view } as the studio saves it.
CREATE TABLE IF NOT EXISTS studio_designs (
  id            text PRIMARY KEY DEFAULT new_id(),
  project_id    text NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  version       int  NOT NULL DEFAULT 1,
  data          jsonb NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_designs_project_idx ON studio_designs(project_id, updated_date DESC);

-- Every save keeps the previous state, so any version can be restored.
CREATE TABLE IF NOT EXISTS studio_design_versions (
  id            bigserial PRIMARY KEY,
  design_id     text NOT NULL REFERENCES studio_designs(id) ON DELETE CASCADE,
  version       int  NOT NULL,
  data          jsonb NOT NULL,
  note          text,
  created_date  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, version)
);

-- Presentation images captured from the 3D viewport. Stored in Postgres for now (each under 1 MB);
-- move to DigitalOcean Spaces when volume grows (see docs/3D-STUDIO.md).
CREATE TABLE IF NOT EXISTS studio_images (
  id            text PRIMARY KEY DEFAULT new_id(),
  project_id    text NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  design_id     text REFERENCES studio_designs(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'viewport' CHECK (kind IN ('viewport', 'ai_concept')),
  label         text NOT NULL,
  mime          text NOT NULL,
  bytes         bytea NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_images_project_idx ON studio_images(project_id, created_date DESC);

-- AI interpreter calls, for the per-user daily limit. Costs go to the Billing Monitor's usage log.
CREATE TABLE IF NOT EXISTS studio_ai_usage (
  id       bigserial PRIMARY KEY,
  user_id  text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_ai_usage_user_idx ON studio_ai_usage(user_id, at);
