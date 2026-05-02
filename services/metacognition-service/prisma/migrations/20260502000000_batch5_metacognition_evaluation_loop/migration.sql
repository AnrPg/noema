CREATE TABLE "evaluations" (
  "id" VARCHAR(50) NOT NULL,
  "step_id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "concept_refs" TEXT[],
  "correct" BOOLEAN NOT NULL,
  "self_rating" VARCHAR(50) NOT NULL,
  "reasoning_quality" DOUBLE PRECISION NOT NULL,
  "confidence_signal" DOUBLE PRECISION NOT NULL,
  "combined_score" DOUBLE PRECISION NOT NULL,
  "scheduler_rating" VARCHAR(50) NOT NULL,
  "trace" JSONB NOT NULL,
  "error_type" VARCHAR(100),
  "misconception_ref" VARCHAR(100),
  "recommended_action" VARCHAR(500) NOT NULL,
  "response_time_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "triggers" (
  "id" VARCHAR(50) NOT NULL,
  "evaluation_id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "severity" DOUBLE PRECISION NOT NULL,
  "detected_from" TEXT[],
  "concept_refs" TEXT[],
  "step_id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "recommended_intervention" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concept_reasoning_averages" (
  "id" VARCHAR(120) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "average" DOUBLE PRECISION NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "window_size" INTEGER NOT NULL,
  "latest_evaluation" VARCHAR(50),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concept_reasoning_averages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluations_step_id_key" ON "evaluations"("step_id");
CREATE INDEX "evaluations_user_id_created_at_idx" ON "evaluations"("user_id", "created_at");
CREATE INDEX "evaluations_session_id_idx" ON "evaluations"("session_id");
CREATE INDEX "evaluations_concept_refs_idx" ON "evaluations" USING GIN ("concept_refs");

CREATE INDEX "triggers_user_id_status_idx" ON "triggers"("user_id", "status");
CREATE INDEX "triggers_session_id_idx" ON "triggers"("session_id");
CREATE INDEX "triggers_concept_refs_idx" ON "triggers" USING GIN ("concept_refs");
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "concept_reasoning_averages_user_id_concept_id_key" ON "concept_reasoning_averages"("user_id", "concept_id");
