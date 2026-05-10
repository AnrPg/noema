CREATE TABLE IF NOT EXISTS "learner_feedback_actions" (
  "id" VARCHAR(50) PRIMARY KEY,
  "user_id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50),
  "step_id" VARCHAR(50),
  "surface" VARCHAR(80) NOT NULL,
  "action_type" VARCHAR(100) NOT NULL,
  "note_text" VARCHAR(1000),
  "reason_text" VARCHAR(1000),
  "concept_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learner_feedback_actions_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "learner_feedback_actions_user_id_surface_created_at_idx"
  ON "learner_feedback_actions"("user_id", "surface", "created_at");

CREATE INDEX IF NOT EXISTS "learner_feedback_actions_session_id_created_at_idx"
  ON "learner_feedback_actions"("session_id", "created_at");

CREATE INDEX IF NOT EXISTS "learner_feedback_actions_step_id_idx"
  ON "learner_feedback_actions"("step_id");

CREATE TABLE IF NOT EXISTS "agent_surface_exposures" (
  "id" VARCHAR(50) PRIMARY KEY,
  "user_id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "step_id" VARCHAR(50),
  "surface" VARCHAR(80) NOT NULL,
  "shown_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "agent_surface_exposures_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_surface_exposures_user_id_session_id_surface_shown_at_idx"
  ON "agent_surface_exposures"("user_id", "session_id", "surface", "shown_at");

CREATE INDEX IF NOT EXISTS "agent_surface_exposures_step_id_idx"
  ON "agent_surface_exposures"("step_id");
