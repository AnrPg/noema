ALTER TABLE event_outbox
  ADD COLUMN IF NOT EXISTS claim_owner VARCHAR(100),
  ADD COLUMN IF NOT EXISTS claim_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending_claim
  ON event_outbox (published_at, claim_until, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_event_outbox_claim_recovery
  ON event_outbox (claim_owner, claim_until);
