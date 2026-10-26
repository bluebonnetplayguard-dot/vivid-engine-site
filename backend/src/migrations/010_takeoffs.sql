-- Material takeoffs computed from studio designs. One row per run; results are cached by input hash
-- (model + settings + engine version), so recalculating an unchanged design is instant.
CREATE TABLE IF NOT EXISTS takeoffs (
  id              text PRIMARY KEY DEFAULT new_id(),
  project_id      text NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  design_id       text NOT NULL REFERENCES studio_designs(id) ON DELETE CASCADE,
  design_version  int  NOT NULL,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress        int  NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage           text,
  input_hash      text NOT NULL,
  settings        jsonb NOT NULL,
  result          jsonb,
  error           text,
  created_date    timestamptz NOT NULL DEFAULT now(),
  started_date    timestamptz,
  finished_date   timestamptz
);
CREATE INDEX IF NOT EXISTS takeoffs_project_idx ON takeoffs(project_id, created_date DESC);
CREATE INDEX IF NOT EXISTS takeoffs_design_idx ON takeoffs(design_id, design_version);
CREATE INDEX IF NOT EXISTS takeoffs_hash_idx ON takeoffs(user_id, input_hash) WHERE status = 'done';
CREATE INDEX IF NOT EXISTS takeoffs_pending_idx ON takeoffs(status) WHERE status IN ('queued', 'running');
