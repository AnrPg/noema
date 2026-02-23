-- Phase 5 event handshake and consumer reliability
-- Date: 2026-02-24

CREATE TABLE IF NOT EXISTS scheduler_event_inbox (
  id VARCHAR(120) PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  stream_message_id VARCHAR(64),
  process_state VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  correlation_id VARCHAR(100),
  user_id VARCHAR(50),
  proposal_id VARCHAR(50),
  decision_id VARCHAR(50),
  session_id VARCHAR(50),
  session_revision INTEGER,
  payload JSONB NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 1,
  last_error VARCHAR(1000),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scheduler_event_inbox_event_type_process_state_idx
  ON scheduler_event_inbox(event_type, process_state);
CREATE INDEX IF NOT EXISTS scheduler_event_inbox_session_id_proposal_id_session_revision_idx
  ON scheduler_event_inbox(session_id, proposal_id, session_revision);
CREATE INDEX IF NOT EXISTS scheduler_event_inbox_last_seen_at_idx
  ON scheduler_event_inbox(last_seen_at);

CREATE TABLE IF NOT EXISTS scheduler_handshake_state (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(50),
  correlation_id VARCHAR(100),
  proposal_id VARCHAR(50) NOT NULL,
  decision_id VARCHAR(50),
  session_id VARCHAR(50) NOT NULL,
  session_revision INTEGER NOT NULL,
  state VARCHAR(20) NOT NULL,
  last_event_type VARCHAR(120) NOT NULL,
  last_stream_message_id VARCHAR(64),
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduler_handshake_state_session_id_proposal_id_key UNIQUE (session_id, proposal_id)
);

CREATE INDEX IF NOT EXISTS scheduler_handshake_state_decision_id_idx
  ON scheduler_handshake_state(decision_id);
CREATE INDEX IF NOT EXISTS scheduler_handshake_state_correlation_id_idx
  ON scheduler_handshake_state(correlation_id);
CREATE INDEX IF NOT EXISTS scheduler_handshake_state_session_id_session_revision_idx
  ON scheduler_handshake_state(session_id, session_revision);

CREATE OR REPLACE FUNCTION set_scheduler_handshake_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduler_handshake_state_set_updated_at ON scheduler_handshake_state;

CREATE TRIGGER scheduler_handshake_state_set_updated_at
BEFORE UPDATE ON scheduler_handshake_state
FOR EACH ROW
EXECUTE FUNCTION set_scheduler_handshake_state_updated_at();
