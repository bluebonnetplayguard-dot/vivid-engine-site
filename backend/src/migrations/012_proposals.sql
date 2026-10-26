-- Proposal exports: each generated proposal is kept with the estimate version it came from.
CREATE TABLE IF NOT EXISTS proposal_exports (
  id                text PRIMARY KEY DEFAULT new_id(),
  project_id        text NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  estimate_id       text NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  estimate_version  int  NOT NULL,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wording           text NOT NULL CHECK (wording IN ('claude', 'template')),
  total             numeric(14,2) NOT NULL,
  options           jsonb NOT NULL,
  proposal          jsonb NOT NULL,
  created_date      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_exports_project_idx ON proposal_exports(project_id, created_date DESC);
