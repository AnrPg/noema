-- Ensure misconception detections exists in environments that were provisioned
-- before the misconception detection rollout.
CREATE TABLE IF NOT EXISTS "misconception_detections" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "misconception_pattern_id" VARCHAR(50) NOT NULL,
    "misconception_type" VARCHAR(100) NOT NULL,
    "affected_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "severity" "misconception_severity" NOT NULL DEFAULT 'MODERATE',
    "severity_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "family" VARCHAR(100) NOT NULL DEFAULT 'uncategorized',
    "description" VARCHAR(2000),
    "detection_count" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(50) NOT NULL DEFAULT 'detected',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "misconception_detections_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'misconception_detections_misconception_pattern_id_fkey'
    ) THEN
        ALTER TABLE "misconception_detections"
        ADD CONSTRAINT "misconception_detections_misconception_pattern_id_fkey"
        FOREIGN KEY ("misconception_pattern_id")
        REFERENCES "misconception_patterns"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_pattern_status"
ON "misconception_detections"("user_id", "misconception_pattern_id", "status");

CREATE INDEX IF NOT EXISTS "misconception_detections_user_id_idx"
ON "misconception_detections"("user_id");

CREATE INDEX IF NOT EXISTS "misconception_detections_user_id_status_idx"
ON "misconception_detections"("user_id", "status");

CREATE INDEX IF NOT EXISTS "misconception_detections_misconception_type_idx"
ON "misconception_detections"("misconception_type");

CREATE INDEX IF NOT EXISTS "misconception_detections_misconception_pattern_id_idx"
ON "misconception_detections"("misconception_pattern_id");

CREATE INDEX IF NOT EXISTS "misconception_detections_status_idx"
ON "misconception_detections"("status");

CREATE INDEX IF NOT EXISTS "misconception_detections_severity_idx"
ON "misconception_detections"("severity");

CREATE INDEX IF NOT EXISTS "misconception_detections_family_idx"
ON "misconception_detections"("family");

CREATE INDEX IF NOT EXISTS "misconception_detections_detected_at_idx"
ON "misconception_detections"("detected_at");

CREATE INDEX IF NOT EXISTS "misconception_detections_last_detected_at_idx"
ON "misconception_detections"("last_detected_at");

CREATE INDEX IF NOT EXISTS "misconception_detections_affected_node_ids_idx"
ON "misconception_detections" USING GIN ("affected_node_ids");
