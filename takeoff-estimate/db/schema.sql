-- Vivid Takeoff & Estimate (Postgres). Every row belongs to one company; one company's data is never used for another.
CREATE TABLE te_company (id text PRIMARY KEY DEFAULT new_id(), name text NOT NULL, created_date timestamptz NOT NULL DEFAULT now());
CREATE TABLE te_member (
  company_id text REFERENCES te_company(id) ON DELETE CASCADE, user_id text REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','estimator','viewer')), PRIMARY KEY (company_id, user_id));
CREATE TABLE te_project (
  id text PRIMARY KEY DEFAULT new_id(), company_id text NOT NULL REFERENCES te_company(id) ON DELETE CASCADE,
  name text NOT NULL, client text, address text, bid_date date, status text NOT NULL DEFAULT 'open',
  provider text NOT NULL DEFAULT 'vivid', external_id text,            -- 'stack' + STACK id when imported
  created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now());
CREATE TABLE te_plan (                                                  -- one uploaded plan set (PDF)
  id text PRIMARY KEY DEFAULT new_id(), project_id text NOT NULL REFERENCES te_project(id) ON DELETE CASCADE,
  file_key text NOT NULL, file_name text NOT NULL, pages int NOT NULL, created_date timestamptz NOT NULL DEFAULT now());
CREATE TABLE te_sheet (
  id text PRIMARY KEY DEFAULT new_id(), plan_id text NOT NULL REFERENCES te_plan(id) ON DELETE CASCADE,
  page int NOT NULL, sheet_number text, sheet_title text,              -- read from the title block, user-editable
  width_pt numeric NOT NULL, height_pt numeric NOT NULL,
  printed_scale text,                                                   -- e.g. 1/8"=1'-0"
  printed_ft_per_pt numeric,                                            -- from the printed scale
  calibrated_ft_per_pt numeric,                                         -- from two clicks on a known dimension
  calibration jsonb,                                                    -- {a:[x,y], b:[x,y], known_ft, by, at}
  calibration_mismatch_pct numeric,                                     -- warn when > 1
  UNIQUE (plan_id, page));
CREATE TABLE te_item (                                                  -- library item
  id text PRIMARY KEY DEFAULT new_id(), company_id text NOT NULL REFERENCES te_company(id) ON DELETE CASCADE,
  owner_user_id text, name text NOT NULL, unit text NOT NULL CHECK (unit IN ('EA','LF','SF','SY','CY','BF','LB','HR')),
  material_cost numeric NOT NULL DEFAULT 0, labor_hours_per_unit numeric NOT NULL DEFAULT 0, labor_rate numeric NOT NULL DEFAULT 0,
  equipment_cost numeric NOT NULL DEFAULT 0, waste_pct numeric NOT NULL DEFAULT 0, supplier text, tags text[] DEFAULT '{}',
  version int NOT NULL DEFAULT 1, updated_date timestamptz NOT NULL DEFAULT now());
CREATE TABLE te_assembly (
  id text PRIMARY KEY DEFAULT new_id(), company_id text NOT NULL REFERENCES te_company(id) ON DELETE CASCADE,
  name text NOT NULL, measure text NOT NULL CHECK (measure IN ('linear','area','count','volume','roof','wall')),
  variables jsonb NOT NULL DEFAULT '{}',                                -- {spacing: 8, height: 6}
  lines jsonb NOT NULL,                                                 -- [{item_id, formula}]
  version int NOT NULL DEFAULT 1);
CREATE TABLE te_takeoff (                                               -- one colored layer, e.g. "Fence - 6 ft privacy"
  id text PRIMARY KEY DEFAULT new_id(), project_id text NOT NULL REFERENCES te_project(id) ON DELETE CASCADE,
  name text NOT NULL, kind text NOT NULL CHECK (kind IN ('linear','area','count','volume','roof','wall')),
  color text NOT NULL, assembly_id text REFERENCES te_assembly(id), variables jsonb NOT NULL DEFAULT '{}');
CREATE TABLE te_measurement (
  id text PRIMARY KEY DEFAULT new_id(), takeoff_id text NOT NULL REFERENCES te_takeoff(id) ON DELETE CASCADE,
  sheet_id text NOT NULL REFERENCES te_sheet(id) ON DELETE CASCADE,
  geometry jsonb NOT NULL,                                              -- points in PDF points; cut-outs for areas
  quantity numeric NOT NULL, unit text NOT NULL,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai')),
  confidence numeric, confirmed boolean NOT NULL DEFAULT true,          -- AI suggestions start unconfirmed and never count
  created_by text, created_date timestamptz NOT NULL DEFAULT now());
CREATE TABLE te_estimate (
  id text PRIMARY KEY DEFAULT new_id(), project_id text NOT NULL REFERENCES te_project(id) ON DELETE CASCADE,
  name text NOT NULL, version int NOT NULL DEFAULT 1, worksheet jsonb NOT NULL DEFAULT '{}', created_date timestamptz NOT NULL DEFAULT now());
-- Approval gate: every create/update/import is proposed first and applied only after the user approves it.
CREATE TABLE te_pending_change (
  id text PRIMARY KEY DEFAULT new_id(), company_id text NOT NULL REFERENCES te_company(id) ON DELETE CASCADE,
  requested_by text NOT NULL, provider text NOT NULL, action text NOT NULL, payload jsonb NOT NULL,
  summary text NOT NULL,                                                -- "Create 3 takeoffs, update 42 items"
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','failed')),
  created_date timestamptz NOT NULL DEFAULT now(), decided_by text, decided_date timestamptz);
CREATE TABLE te_audit (
  id bigserial PRIMARY KEY, company_id text NOT NULL, user_id text NOT NULL, action text NOT NULL,
  target text, detail jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX te_audit_company_at ON te_audit(company_id, at DESC);
