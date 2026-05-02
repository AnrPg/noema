CREATE TYPE "guardian_artifact_type" AS ENUM (
  'LESSON_PLAN',
  'STEP',
  'ACTIVITY',
  'REPLAN',
  'GENERATED_VARIANT'
);

CREATE TYPE "guardian_result" AS ENUM (
  'ACCEPTED',
  'WARNING',
  'REJECTED'
);

CREATE TABLE "guardian_validations" (
  "id" VARCHAR(50) NOT NULL,
  "artifact_type" "guardian_artifact_type" NOT NULL,
  "artifact_id" VARCHAR(100) NOT NULL,
  "artifact_hash" VARCHAR(128) NOT NULL,
  "result" "guardian_result" NOT NULL,
  "reason_codes" TEXT[] NOT NULL,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "evaluated_rules" JSONB NOT NULL,
  "triggered_by" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "guardian_validations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guardian_validations_artifact_type_artifact_id_created_at_idx"
ON "guardian_validations"("artifact_type", "artifact_id", "created_at");

CREATE INDEX "guardian_validations_result_created_at_idx"
ON "guardian_validations"("result", "created_at");
