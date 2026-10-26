-- Estimating engine: contractor cost tables and versioned estimates per 3D Studio project.
CREATE TABLE IF NOT EXISTS cost_tables (
  id            text PRIMARY KEY DEFAULT new_id(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  data          jsonb NOT NULL,          -- CostTable (items, labor rate)
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_tables_user_idx ON cost_tables(user_id, updated_date DESC);

-- version numbers count up per project: /api/projects/:id/estimates/:version
CREATE TABLE IF NOT EXISTS estimates (
  id              text PRIMARY KEY DEFAULT new_id(),
  project_id      text NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version         int  NOT NULL,
  design_id       text NOT NULL REFERENCES studio_designs(id) ON DELETE CASCADE,
  design_version  int  NOT NULL,
  takeoff_id      text REFERENCES takeoffs(id) ON DELETE SET NULL,
  takeoff_hash    text NOT NULL,
  cost_table_id   text NOT NULL,
  settings        jsonb NOT NULL,
  result          jsonb NOT NULL,
  price           numeric(14,2) NOT NULL,
  note            text,
  created_date    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS estimates_design_idx ON estimates(design_id, design_version);
