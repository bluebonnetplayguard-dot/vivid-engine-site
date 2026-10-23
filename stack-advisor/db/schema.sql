-- Stack Advisor schema (Postgres). Every fact has a trust tier and a date.
CREATE TABLE tool (
  id text PRIMARY KEY, name text NOT NULL, category text NOT NULL, description text,
  homepage text, repo text, packages jsonb DEFAULT '{}',          -- {npm:[],pypi:[],crates:[],docker:[]}
  license_spdx text, languages text[] DEFAULT '{}', runtimes jsonb DEFAULT '{}',
  pricing text, self_host boolean, cloud boolean, commercial_use_ok boolean DEFAULT true, copyleft boolean DEFAULT false,
  last_release date, release_freq_days int, open_issues int, contributors int, advisories jsonb DEFAULT '[]',
  source text NOT NULL, fetched_at timestamptz NOT NULL
);
CREATE TABLE tool_version (
  tool_id text REFERENCES tool(id), version text, released date, runtime_requirements jsonb, breaking_notes text,
  PRIMARY KEY (tool_id, version)
);
CREATE TABLE edge (
  id bigserial PRIMARY KEY, a text REFERENCES tool(id), b text REFERENCES tool(id),
  type text CHECK (type IN ('official-integration','plugin','adapter','protocol-compatible','community')),
  versions_tested jsonb, UNIQUE (a, b), CHECK (a < b)
);
CREATE TABLE evidence (
  id bigserial PRIMARY KEY, edge_id bigint REFERENCES edge(id),
  tier text CHECK (tier IN ('verified','checked','indexed')),   -- 'unknown' = no rows
  method text CHECK (method IN ('lab','cross-check','registry')),
  result text CHECK (result IN ('pass','fail','partial')),
  observed_at date NOT NULL, source_url text NOT NULL,          -- public log URL for lab runs
  notes text
);
CREATE INDEX evidence_edge ON evidence (edge_id, observed_at DESC);
-- Neutrality: there is intentionally no column for sponsorship, boost or paid placement.
