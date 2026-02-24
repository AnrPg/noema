DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'session_cohort_handshake_status'
  ) THEN
    CREATE TYPE session_cohort_handshake_status AS ENUM (
      'PROPOSED',
      'ACCEPTED',
      'REVISED',
      'COMMITTED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS session_cohort_handshakes (
  id VARCHAR(50) PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  proposal_id VARCHAR(100) NOT NULL,
  decision_id VARCHAR(100) NOT NULL,
  revision INTEGER NOT NULL,
  status session_cohort_handshake_status NOT NULL,
  candidate_card_ids JSONB NOT NULL,
  accepted_card_ids JSONB,
  rejected_card_ids JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, proposal_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_session_cohort_handshakes_session_status
  ON session_cohort_handshakes (session_id, status);

CREATE INDEX IF NOT EXISTS idx_session_cohort_handshakes_session_proposal_revision
  ON session_cohort_handshakes (session_id, proposal_id, revision);
