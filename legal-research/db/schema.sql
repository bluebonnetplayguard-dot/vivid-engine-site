-- Vivid Engine Legal Research index. PostgreSQL 15+ with the pgvector extension.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS legal_passages (
  id            text PRIMARY KEY,                 -- source + document id + passage number
  source        text NOT NULL,                    -- id from config/legal-sources.ts
  license       text NOT NULL,
  url           text NOT NULL,
  retrieved_at  timestamptz NOT NULL,
  jurisdiction  text NOT NULL CHECK (jurisdiction IN ('TX','LA','US','5th-Cir')),
  court         text,
  decided_on    date,
  citation      text,
  doc_type      text NOT NULL CHECK (doc_type IN ('case','statute','rule','regulation')),
  title         text NOT NULL,
  section       text,
  body          text NOT NULL,
  content_hash  text NOT NULL,
  embedding     vector(1024),                     -- filled by the embedding job; dimension follows the chosen model
  search_tsv    tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(citation,'')), 'A') ||
                  setweight(to_tsvector('english', body), 'B')) STORED,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only allowlisted sources may be stored. Keep this list in step with config/legal-sources.ts
-- (sources with access 'full' and termsReviewed true). test/index-guard.test.ts checks it too.
ALTER TABLE legal_passages DROP CONSTRAINT IF EXISTS legal_passages_source_allowlisted;
ALTER TABLE legal_passages ADD CONSTRAINT legal_passages_source_allowlisted CHECK (source IN ('cap','courtlistener'));

CREATE INDEX IF NOT EXISTS legal_passages_tsv_idx ON legal_passages USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS legal_passages_filter_idx ON legal_passages (jurisdiction, doc_type, decided_on);
CREATE INDEX IF NOT EXISTS legal_passages_citation_idx ON legal_passages (citation);
CREATE INDEX IF NOT EXISTS legal_passages_hash_idx ON legal_passages (content_hash);
-- Build the vector index after the first large load:
-- CREATE INDEX legal_passages_embedding_idx ON legal_passages USING hnsw (embedding vector_cosine_ops);
