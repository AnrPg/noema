CREATE TABLE IF NOT EXISTS ingestion_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  mime_kind TEXT NOT NULL,
  source_uri TEXT,
  checksum TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  raw_content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_document_irs (
  document_id TEXT PRIMARY KEY REFERENCES ingestion_documents(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'und',
  title TEXT NOT NULL,
  outline JSONB NOT NULL,
  blocks JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ingestion_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  heading_path JSONB NOT NULL,
  page_ref TEXT,
  vector_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, ordinal)
);

CREATE TABLE IF NOT EXISTS ingestion_concept_candidates (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ingestion_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  definition TEXT,
  salience DOUBLE PRECISION NOT NULL,
  evidence_chunk_ids JSONB NOT NULL,
  state TEXT NOT NULL,
  ckg_node_id TEXT,
  proposed_node_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ingestion_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  stage TEXT NOT NULL,
  checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  curriculum_id TEXT,
  content_generation_job_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ingestion_documents_user_created_idx ON ingestion_documents(user_id, created_at);
CREATE INDEX IF NOT EXISTS ingestion_document_chunks_document_idx ON ingestion_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS ingestion_document_chunks_user_idx ON ingestion_document_chunks(user_id);
CREATE INDEX IF NOT EXISTS ingestion_concept_candidates_document_idx ON ingestion_concept_candidates(document_id);
CREATE INDEX IF NOT EXISTS ingestion_concept_candidates_user_label_idx ON ingestion_concept_candidates(user_id, label);
CREATE INDEX IF NOT EXISTS ingestion_jobs_document_idx ON ingestion_jobs(document_id);
CREATE INDEX IF NOT EXISTS ingestion_jobs_user_created_idx ON ingestion_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS ingestion_jobs_stage_idx ON ingestion_jobs(stage);
