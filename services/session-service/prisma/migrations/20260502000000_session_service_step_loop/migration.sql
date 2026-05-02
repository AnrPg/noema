-- Batch 4 realignment: session-service moves from card attempts/queues to LessonPlan/Step.
-- Development data in the dropped legacy tables is intentionally discarded.

CREATE TYPE "rigor_level" AS ENUM ('MINIMAL', 'FULL');
CREATE TYPE "goal_type" AS ENUM ('DISCRIMINATION', 'REASONING', 'TRANSFER', 'ACQUISITION', 'REINFORCEMENT');
CREATE TYPE "goal_state" AS ENUM ('PENDING', 'ACTIVE', 'STABLE', 'UNSTABLE');
CREATE TYPE "goal_source" AS ENUM ('SYSTEM_PROPOSED', 'USER_ACCEPTED', 'USER_EDITED');
CREATE TYPE "lesson_plan_state" AS ENUM ('DRAFT', 'VALIDATED', 'ACTIVE', 'COMPLETED', 'ABANDONED');
CREATE TYPE "session_lifecycle_state" AS ENUM ('PLANNING', 'EXECUTION', 'DIAGNOSIS', 'ADAPTATION', 'EVALUATION', 'COMPLETION');
CREATE TYPE "transformation_type" AS ENUM ('RECALL', 'EXPLANATION', 'COMPARISON', 'APPLICATION', 'PERTURBATION', 'ERROR_DETECTION');
CREATE TYPE "step_status" AS ENUM ('PLANNED', 'QUEUED', 'PRESENTED', 'ANSWERED', 'EVALUATED', 'SUPERSEDED', 'SKIPPED');
CREATE TYPE "step_queue_status" AS ENUM ('PENDING', 'PRESENTED', 'COMPLETED', 'SKIPPED', 'INJECTED');
CREATE TYPE "activity_content_source_type" AS ENUM ('CARD', 'TEMPLATE', 'GENERATED');

ALTER TABLE "attempts" DROP CONSTRAINT IF EXISTS "attempts_session_id_fkey";
ALTER TABLE "session_queue_items" DROP CONSTRAINT IF EXISTS "session_queue_items_session_id_fkey";
ALTER TABLE "session_cohort_handshakes" DROP CONSTRAINT IF EXISTS "session_cohort_handshakes_session_id_fkey";

DROP TABLE IF EXISTS "attempts";
DROP TABLE IF EXISTS "session_queue_items";
DROP TABLE IF EXISTS "session_cohort_handshakes";
DROP TABLE IF EXISTS "user_streaks";

DROP INDEX IF EXISTS "sessions_user_id_idx";
DROP INDEX IF EXISTS "sessions_user_id_study_mode_idx";
DROP INDEX IF EXISTS "sessions_user_id_state_idx";
DROP INDEX IF EXISTS "sessions_state_idx";
DROP INDEX IF EXISTS "sessions_started_at_idx";
DROP INDEX IF EXISTS "sessions_last_activity_at_idx";
DROP INDEX IF EXISTS "sessions_user_id_completed_at_idx";

ALTER TABLE "sessions"
  ADD COLUMN "lifecycle_state" "session_lifecycle_state" NOT NULL DEFAULT 'PLANNING',
  ADD COLUMN "total_paused_ms" INTEGER NOT NULL DEFAULT 0;

UPDATE "sessions"
SET "lifecycle_state" =
  CASE
    WHEN "state"::text IN ('ACTIVE', 'PAUSED') THEN 'EXECUTION'::"session_lifecycle_state"
    WHEN "state"::text IN ('COMPLETED', 'ABANDONED', 'EXPIRED') THEN 'COMPLETION'::"session_lifecycle_state"
    ELSE 'PLANNING'::"session_lifecycle_state"
  END
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_name = 'sessions' AND column_name = 'state'
);

ALTER TABLE "sessions"
  DROP COLUMN IF EXISTS "deck_query_id",
  DROP COLUMN IF EXISTS "state",
  DROP COLUMN IF EXISTS "epistemic_mode",
  DROP COLUMN IF EXISTS "teaching_approach",
  DROP COLUMN IF EXISTS "scheduling_algorithm",
  DROP COLUMN IF EXISTS "loadout_id",
  DROP COLUMN IF EXISTS "loadout_archetype",
  DROP COLUMN IF EXISTS "force_level",
  DROP COLUMN IF EXISTS "initial_queue_size",
  DROP COLUMN IF EXISTS "total_paused_duration_ms",
  DROP COLUMN IF EXISTS "last_paused_at";

CREATE TABLE "lesson_plans" (
  "id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "study_mode" "StudyMode" NOT NULL,
  "learning_mode" "learning_mode" NOT NULL,
  "rigor_level" "rigor_level" NOT NULL,
  "topic" VARCHAR(500) NOT NULL,
  "prerequisites" JSONB NOT NULL DEFAULT '[]',
  "source_decks" JSONB NOT NULL DEFAULT '[]',
  "source_categories" JSONB NOT NULL DEFAULT '[]',
  "assessment_strategy" VARCHAR(2000),
  "adaptation_rules" VARCHAR(2000),
  "guardian_validation_id" VARCHAR(50),
  "state" "lesson_plan_state" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_plan_goals" (
  "id" VARCHAR(50) NOT NULL,
  "lesson_plan_id" VARCHAR(50) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "type" "goal_type" NOT NULL,
  "parent_goal_id" VARCHAR(50),
  "state" "goal_state" NOT NULL DEFAULT 'PENDING',
  "source" "goal_source" NOT NULL DEFAULT 'SYSTEM_PROPOSED',
  "concept_refs" TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lesson_plan_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "steps" (
  "id" VARCHAR(50) NOT NULL,
  "lesson_plan_id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "study_mode" "StudyMode" NOT NULL,
  "position" INTEGER NOT NULL,
  "objective" VARCHAR(1000) NOT NULL,
  "serves_goal_ids" TEXT[],
  "eligible_modes" TEXT[],
  "selected_mode" VARCHAR(100) NOT NULL,
  "transformation_type" "transformation_type" NOT NULL,
  "expected_outcome" VARCHAR(2000) NOT NULL,
  "evaluation_type" VARCHAR(100) NOT NULL,
  "difficulty" DOUBLE PRECISION NOT NULL,
  "is_repair" BOOLEAN NOT NULL DEFAULT false,
  "concept_refs" TEXT[],
  "variant_seed" VARCHAR(100) NOT NULL,
  "status" "step_status" NOT NULL DEFAULT 'PLANNED',
  "evaluation_id" VARCHAR(50),
  "guardian_validation_id" VARCHAR(50),
  "presented_at" TIMESTAMP(3),
  "answered_at" TIMESTAMP(3),
  "evaluated_at" TIMESTAMP(3),
  "superseded_by_step_id" VARCHAR(50),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "step_queue_items" (
  "id" VARCHAR(50) NOT NULL,
  "session_id" VARCHAR(50) NOT NULL,
  "step_id" VARCHAR(50) NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "step_queue_status" NOT NULL DEFAULT 'PENDING',
  "injected_by" VARCHAR(100),
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "step_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activities" (
  "id" VARCHAR(50) NOT NULL,
  "step_id" VARCHAR(50) NOT NULL,
  "position" INTEGER NOT NULL,
  "content_source_type" "activity_content_source_type" NOT NULL,
  "card_id" VARCHAR(50),
  "template_id" VARCHAR(50),
  "generated_variant_id" VARCHAR(50),
  "prompt" VARCHAR(8000) NOT NULL,
  "render_payload" JSONB NOT NULL DEFAULT '{}',
  "expected_response_type" VARCHAR(100) NOT NULL,
  "response_schema" JSONB NOT NULL DEFAULT '{}',
  "variant_seed" VARCHAR(100) NOT NULL,
  "generation_fallback_reason" VARCHAR(500),
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_plans_session_id_key" ON "lesson_plans"("session_id");
CREATE INDEX "lesson_plans_user_id_state_idx" ON "lesson_plans"("user_id", "state");
CREATE INDEX "lesson_plan_goals_lesson_plan_id_state_idx" ON "lesson_plan_goals"("lesson_plan_id", "state");
CREATE INDEX "steps_session_id_position_idx" ON "steps"("session_id", "position");
CREATE INDEX "steps_user_id_evaluated_at_idx" ON "steps"("user_id", "evaluated_at");
CREATE INDEX "steps_concept_refs_idx" ON "steps" USING GIN ("concept_refs");
CREATE UNIQUE INDEX "steps_evaluation_id_key" ON "steps"("evaluation_id");
CREATE UNIQUE INDEX "step_queue_items_step_id_key" ON "step_queue_items"("step_id");
CREATE INDEX "step_queue_items_session_id_position_idx" ON "step_queue_items"("session_id", "position");
CREATE INDEX "step_queue_items_session_id_status_idx" ON "step_queue_items"("session_id", "status");
CREATE INDEX "activities_step_id_position_idx" ON "activities"("step_id", "position");
CREATE INDEX "sessions_user_id_lifecycle_state_idx" ON "sessions"("user_id", "lifecycle_state");
CREATE INDEX "sessions_user_id_study_mode_completed_at_idx" ON "sessions"("user_id", "study_mode", "completed_at");

ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_plan_goals" ADD CONSTRAINT "lesson_plan_goals_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "steps" ADD CONSTRAINT "steps_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "steps" ADD CONSTRAINT "steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "step_queue_items" ADD CONSTRAINT "step_queue_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "step_queue_items" ADD CONSTRAINT "step_queue_items_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TYPE IF EXISTS "session_state";
DROP TYPE IF EXISTS "attempt_outcome";
DROP TYPE IF EXISTS "rating";
DROP TYPE IF EXISTS "hint_depth";
DROP TYPE IF EXISTS "card_queue_status";
DROP TYPE IF EXISTS "session_scheduler_lane";
DROP TYPE IF EXISTS "session_cohort_handshake_status";
