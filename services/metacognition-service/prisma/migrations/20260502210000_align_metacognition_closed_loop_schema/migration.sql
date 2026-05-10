-- Align metacognition persistence with the Step-first closed-loop spec.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_mode') THEN
    CREATE TYPE "study_mode" AS ENUM ('language_learning', 'knowledge_gaining');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'step_self_rating') THEN
    CREATE TYPE "step_self_rating" AS ENUM ('knew_it', 'hesitated', 'didnt_know');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheduler_rating') THEN
    CREATE TYPE "scheduler_rating" AS ENUM ('again', 'hard', 'good', 'easy');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trigger_type') THEN
    CREATE TYPE "trigger_type" AS ENUM (
      'failure',
      'confusion',
      'slow_thinking',
      'overconfidence',
      'boredom',
      'prerequisite_gap'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trigger_status') THEN
    CREATE TYPE "trigger_status" AS ENUM ('open', 'addressed', 'recurring');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'learning_intervention_type') THEN
    CREATE TYPE "learning_intervention_type" AS ENUM (
      'insert_repair_step',
      'insert_contrastive_step',
      'insert_calibration_step',
      'switch_epistemic_mode',
      'switch_transformation',
      'change_activity',
      'reduce_difficulty',
      'increase_difficulty',
      'transition_to_transfer',
      'branch_to_prerequisite'
    );
  END IF;
END
$$;

ALTER TABLE "evaluations" DROP CONSTRAINT IF EXISTS "evaluations_study_mode_check";

ALTER TABLE "evaluations"
  ADD COLUMN "correctness_score" DOUBLE PRECISION,
  ADD COLUMN "epistemic_mode" VARCHAR(100),
  ADD COLUMN "hint_request_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revision_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trigger_ids" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "evaluations"
SET
  "correctness_score" = CASE WHEN "correct" THEN 1.0 ELSE 0.0 END,
  "epistemic_mode" = COALESCE("transformation", 'generative_retrieval'),
  "response_time_ms" = COALESCE("response_time_ms", 0);

UPDATE "evaluations" e
SET "trigger_ids" = COALESCE(t.ids, '{}')
FROM (
  SELECT "evaluation_id", array_agg("id" ORDER BY "created_at") AS ids
  FROM "triggers"
  GROUP BY "evaluation_id"
) t
WHERE e."id" = t."evaluation_id";

ALTER TABLE "evaluations"
  ALTER COLUMN "correctness_score" SET NOT NULL,
  ALTER COLUMN "epistemic_mode" SET NOT NULL,
  ALTER COLUMN "response_time_ms" SET NOT NULL,
  ALTER COLUMN "recommended_action" DROP NOT NULL,
  ALTER COLUMN "study_mode" DROP DEFAULT,
  ALTER COLUMN "study_mode" TYPE "study_mode" USING "study_mode"::text::"study_mode",
  ALTER COLUMN "self_rating" TYPE "step_self_rating" USING "self_rating"::text::"step_self_rating",
  ALTER COLUMN "scheduler_rating" TYPE "scheduler_rating" USING "scheduler_rating"::text::"scheduler_rating";

DROP INDEX IF EXISTS "triggers_user_id_status_idx";
DROP INDEX IF EXISTS "triggers_session_id_idx";
DROP INDEX IF EXISTS "triggers_concept_refs_idx";
ALTER TABLE "triggers" DROP CONSTRAINT IF EXISTS "triggers_evaluation_id_fkey";

ALTER TABLE "triggers" RENAME TO "metacognitive_triggers";
ALTER TABLE "metacognitive_triggers" RENAME COLUMN "detected_from" TO "detected_from_frames";

ALTER TABLE "metacognitive_triggers"
  ADD COLUMN "misconception_ref" VARCHAR(100);

UPDATE "metacognitive_triggers"
SET "misconception_ref" = COALESCE("type", 'metacognitive_trigger');

ALTER TABLE "metacognitive_triggers"
  ALTER COLUMN "evaluation_id" DROP NOT NULL,
  ALTER COLUMN "step_id" DROP NOT NULL,
  ALTER COLUMN "session_id" DROP NOT NULL,
  ALTER COLUMN "misconception_ref" SET NOT NULL,
  ALTER COLUMN "type" TYPE "trigger_type" USING "type"::text::"trigger_type",
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "trigger_status" USING "status"::text::"trigger_status",
  ALTER COLUMN "status" SET DEFAULT 'open',
  ALTER COLUMN "recommended_intervention" TYPE "learning_intervention_type"
    USING "recommended_intervention"::text::"learning_intervention_type";

ALTER TABLE "metacognitive_triggers"
  ADD CONSTRAINT "metacognitive_triggers_evaluation_id_fkey"
  FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "metacognitive_triggers_user_id_status_idx" ON "metacognitive_triggers"("user_id", "status");
CREATE INDEX IF NOT EXISTS "metacognitive_triggers_session_id_idx" ON "metacognitive_triggers"("session_id");
CREATE INDEX IF NOT EXISTS "metacognitive_triggers_concept_refs_idx" ON "metacognitive_triggers" USING GIN ("concept_refs");
CREATE INDEX IF NOT EXISTS "evaluations_trigger_ids_idx" ON "evaluations" USING GIN ("trigger_ids");

CREATE TABLE IF NOT EXISTS "concept_reasoning_rollups" (
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "average_reasoning" DOUBLE PRECISION NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "window_size" INTEGER NOT NULL,
  "last_evaluation_at" TIMESTAMP(3) NOT NULL,
  "recent_evaluation_ids" TEXT[] NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concept_reasoning_rollups_pkey" PRIMARY KEY ("user_id", "concept_id", "study_mode")
);

INSERT INTO "concept_reasoning_rollups" (
  "user_id",
  "concept_id",
  "study_mode",
  "average_reasoning",
  "sample_count",
  "window_size",
  "last_evaluation_at",
  "recent_evaluation_ids",
  "updated_at"
)
SELECT
  a."user_id",
  a."concept_id",
  a."study_mode"::text::"study_mode",
  a."average",
  a."sample_count",
  a."window_size",
  COALESCE(e."created_at", CURRENT_TIMESTAMP),
  CASE WHEN a."latest_evaluation" IS NULL THEN '{}' ELSE ARRAY[a."latest_evaluation"] END,
  a."updated_at"
FROM "concept_reasoning_averages" a
LEFT JOIN "evaluations" e ON e."id" = a."latest_evaluation"
ON CONFLICT ("user_id", "concept_id", "study_mode") DO NOTHING;

DROP TABLE IF EXISTS "concept_reasoning_averages";
