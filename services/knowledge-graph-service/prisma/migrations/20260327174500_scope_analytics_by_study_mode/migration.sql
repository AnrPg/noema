DO $$
BEGIN
  CREATE TYPE "study_mode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "structural_metric_snapshots"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

CREATE INDEX IF NOT EXISTS "structural_metric_snapshots_user_id_domain_study_mode_idx"
  ON "structural_metric_snapshots"("user_id", "domain", "study_mode");

CREATE INDEX IF NOT EXISTS "structural_metric_snapshots_study_mode_idx"
  ON "structural_metric_snapshots"("study_mode");

ALTER TABLE "misconception_detections"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

DROP INDEX IF EXISTS "misconception_detections_uq_user_pattern_status_key";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_pattern_mode_status"
  ON "misconception_detections"("user_id", "misconception_pattern_id", "study_mode", "status");

CREATE INDEX IF NOT EXISTS "misconception_detections_user_id_study_mode_idx"
  ON "misconception_detections"("user_id", "study_mode");

CREATE INDEX IF NOT EXISTS "misconception_detections_study_mode_idx"
  ON "misconception_detections"("study_mode");

ALTER TABLE "metrics_staleness"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

DROP INDEX IF EXISTS "metrics_staleness_user_id_domain_key";

CREATE UNIQUE INDEX IF NOT EXISTS "metrics_staleness_user_id_domain_study_mode_key"
  ON "metrics_staleness"("user_id", "domain", "study_mode");

CREATE INDEX IF NOT EXISTS "metrics_staleness_user_id_domain_study_mode_idx"
  ON "metrics_staleness"("user_id", "domain", "study_mode");

CREATE INDEX IF NOT EXISTS "metrics_staleness_study_mode_idx"
  ON "metrics_staleness"("study_mode");
