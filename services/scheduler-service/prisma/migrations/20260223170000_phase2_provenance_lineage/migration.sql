-- Phase 2 provenance and cohort lineage persistence
-- Date: 2026-02-23

CREATE TABLE IF NOT EXISTS schedule_proposals (
  id VARCHAR(50) PRIMARY KEY,
  decision_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  policy_version VARCHAR(100) NOT NULL,
  correlation_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(50),
  session_revision INTEGER NOT NULL,
  kind VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS schedule_proposals_user_id_created_at_idx
  ON schedule_proposals(user_id, created_at);
CREATE INDEX IF NOT EXISTS schedule_proposals_decision_id_idx
  ON schedule_proposals(decision_id);
CREATE INDEX IF NOT EXISTS schedule_proposals_session_id_session_revision_idx
  ON schedule_proposals(session_id, session_revision);

CREATE TABLE IF NOT EXISTS schedule_commits (
  id VARCHAR(50) PRIMARY KEY,
  proposal_id VARCHAR(50),
  decision_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  policy_version VARCHAR(100) NOT NULL,
  correlation_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(50),
  session_revision INTEGER NOT NULL,
  kind VARCHAR(64) NOT NULL,
  accepted INTEGER NOT NULL,
  rejected INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS schedule_commits_user_id_created_at_idx
  ON schedule_commits(user_id, created_at);
CREATE INDEX IF NOT EXISTS schedule_commits_proposal_id_idx
  ON schedule_commits(proposal_id);
CREATE INDEX IF NOT EXISTS schedule_commits_decision_id_idx
  ON schedule_commits(decision_id);
CREATE INDEX IF NOT EXISTS schedule_commits_session_id_session_revision_idx
  ON schedule_commits(session_id, session_revision);

CREATE TABLE IF NOT EXISTS schedule_cohort_lineage (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  proposal_id VARCHAR(50),
  decision_id VARCHAR(50) NOT NULL,
  session_id VARCHAR(50),
  session_revision INTEGER NOT NULL,
  operation_kind VARCHAR(64) NOT NULL,
  selected_card_ids TEXT[] NOT NULL,
  excluded_card_ids TEXT[] NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS schedule_cohort_lineage_user_id_created_at_idx
  ON schedule_cohort_lineage(user_id, created_at);
CREATE INDEX IF NOT EXISTS schedule_cohort_lineage_proposal_id_idx
  ON schedule_cohort_lineage(proposal_id);
CREATE INDEX IF NOT EXISTS schedule_cohort_lineage_decision_id_idx
  ON schedule_cohort_lineage(decision_id);
CREATE INDEX IF NOT EXISTS schedule_cohort_lineage_session_id_session_revision_idx
  ON schedule_cohort_lineage(session_id, session_revision);
