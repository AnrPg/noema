CREATE TYPE IF NOT EXISTS "offline_intent_token_replay_guard_status" AS ENUM (
  'ISSUED',
  'CONSUMED',
  'EXPIRED'
);

CREATE TABLE IF NOT EXISTS "offline_intent_token_replay_guard" (
  "jti" VARCHAR(100) PRIMARY KEY,
  "user_id" VARCHAR(50) NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "status" "offline_intent_token_replay_guard_status" NOT NULL DEFAULT 'ISSUED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "offline_intent_token_replay_guard_user_id_status_idx"
  ON "offline_intent_token_replay_guard" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "offline_intent_token_replay_guard_expires_at_status_idx"
  ON "offline_intent_token_replay_guard" ("expires_at", "status");

CREATE INDEX IF NOT EXISTS "offline_intent_token_replay_guard_consumed_at_idx"
  ON "offline_intent_token_replay_guard" ("consumed_at");
