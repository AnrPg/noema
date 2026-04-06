ALTER TABLE "aggregation_evidence"
ADD COLUMN IF NOT EXISTS "dedupe_key" VARCHAR(700);

ALTER TABLE "aggregation_evidence"
ADD COLUMN IF NOT EXISTS "ordering_seq" BIGSERIAL;

ALTER TABLE "aggregation_evidence"
ADD COLUMN IF NOT EXISTS "source_event_id" VARCHAR(200);

ALTER TABLE "aggregation_evidence"
ADD COLUMN IF NOT EXISTS "source_observed_at" TIMESTAMP(3);

UPDATE "aggregation_evidence"
SET "dedupe_key" = concat_ws(
  ':',
  "source_user_id",
  "source_pkg_node_id",
  COALESCE("ckg_target_node_id", 'no-target'),
  COALESCE(lower(trim("proposed_label")), 'no-label'),
  "evidence_type",
  "direction"
)
WHERE "dedupe_key" IS NULL;

UPDATE "aggregation_evidence"
SET "source_observed_at" = COALESCE("source_observed_at", "created_at")
WHERE "source_observed_at" IS NULL;

ALTER TABLE "aggregation_evidence"
ALTER COLUMN "dedupe_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "aggregation_evidence_dedupe_key_key"
ON "aggregation_evidence" ("dedupe_key");

CREATE UNIQUE INDEX IF NOT EXISTS "aggregation_evidence_ordering_seq_key"
ON "aggregation_evidence" ("ordering_seq");

CREATE INDEX IF NOT EXISTS "aggregation_evidence_source_user_id_source_pkg_node_id_evidence_type_source_observed_at_idx"
ON "aggregation_evidence" ("source_user_id", "source_pkg_node_id", "evidence_type", "source_observed_at");

CREATE TABLE IF NOT EXISTS "pkg_post_write_tasks" (
  "id" VARCHAR(50) PRIMARY KEY,
  "task_type" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "user_id" VARCHAR(50),
  "dedupe_key" VARCHAR(300),
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "pkg_post_write_tasks_dedupe_key_key"
ON "pkg_post_write_tasks" ("dedupe_key");

CREATE INDEX IF NOT EXISTS "pkg_post_write_tasks_status_next_attempt_at_idx"
ON "pkg_post_write_tasks" ("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "ckg_mutation_audit_log_to_state_created_at_idx"
ON "ckg_mutation_audit_log" ("to_state", "created_at" DESC);
