CREATE TABLE "curriculum_progress_evaluation_events" (
  "id" VARCHAR(50) PRIMARY KEY,
  "curriculum_id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "stable_node_key" VARCHAR(200) NOT NULL,
  "evaluation_id" VARCHAR(50) NOT NULL,
  "source_event_id" VARCHAR(50),
  "session_id" VARCHAR(50) NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "curriculum_progress_evaluation_events_curriculum_id_fkey"
    FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "curriculum_progress_evaluation_events_once_idx"
  ON "curriculum_progress_evaluation_events" ("curriculum_id", "user_id", "stable_node_key", "evaluation_id");

CREATE INDEX "curriculum_progress_evaluation_events_source_event_idx"
  ON "curriculum_progress_evaluation_events" ("source_event_id");
