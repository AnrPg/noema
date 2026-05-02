-- Realignment Batch 6: destructive concept-first scheduler cutover.
-- Drops card/cohort scheduler state and creates the canonical §4.10 concept tables.

DROP TABLE IF EXISTS "scheduler_event_inbox" CASCADE;
DROP TABLE IF EXISTS "scheduler_handshake_state" CASCADE;
DROP TABLE IF EXISTS "schedule_cohort_lineage" CASCADE;
DROP TABLE IF EXISTS "schedule_commits" CASCADE;
DROP TABLE IF EXISTS "schedule_proposals" CASCADE;
DROP TABLE IF EXISTS "calibration_data" CASCADE;
DROP TABLE IF EXISTS "reviews" CASCADE;
DROP TABLE IF EXISTS "scheduler_cards" CASCADE;

DROP TYPE IF EXISTS "scheduler_lane" CASCADE;
DROP TYPE IF EXISTS "scheduler_card_state" CASCADE;
DROP TYPE IF EXISTS "rating" CASCADE;
DROP TYPE IF EXISTS "StudyMode" CASCADE;
DROP TYPE IF EXISTS "study_mode" CASCADE;

CREATE TYPE "study_mode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
CREATE TYPE "scheduling_algorithm" AS ENUM ('FSRS', 'HLR', 'SM2', 'LEITNER');
CREATE TYPE "scheduler_queue" AS ENUM ('NEW_LEARNING', 'REINFORCEMENT', 'REPAIR');
CREATE TYPE "scheduler_rating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');
CREATE TYPE "transformation_type" AS ENUM (
  'recall',
  'explanation',
  'comparison',
  'application',
  'perturbation',
  'error_detection'
);

CREATE TABLE "concept_schedule_state" (
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "algorithm" "scheduling_algorithm" NOT NULL DEFAULT 'FSRS',
  "queue" "scheduler_queue" NOT NULL DEFAULT 'NEW_LEARNING',
  "due_at" TIMESTAMP(3) NOT NULL,
  "stability" DOUBLE PRECISION,
  "difficulty" DOUBLE PRECISION,
  "half_life" DOUBLE PRECISION,
  "interval_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "lapse_count" INTEGER NOT NULL DEFAULT 0,
  "consecutive_correct" INTEGER NOT NULL DEFAULT 0,
  "last_evaluation_id" VARCHAR(50),
  "last_step_id" VARCHAR(50),
  "suspended_until" TIMESTAMP(3),
  "suspended_reason" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "concept_schedule_state_pkey" PRIMARY KEY ("user_id", "concept_id", "study_mode")
);

CREATE INDEX "concept_schedule_state_user_id_due_at_idx"
  ON "concept_schedule_state"("user_id", "due_at");
CREATE INDEX "concept_schedule_state_user_id_study_mode_queue_due_at_idx"
  ON "concept_schedule_state"("user_id", "study_mode", "queue", "due_at");

CREATE TABLE "concept_evaluation_log" (
  "id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "evaluation_id" VARCHAR(50) NOT NULL,
  "step_id" VARCHAR(50) NOT NULL,
  "algorithm" "scheduling_algorithm" NOT NULL,
  "scheduler_rating" "scheduler_rating" NOT NULL,
  "combined_score" DOUBLE PRECISION NOT NULL,
  "prior_state" JSONB NOT NULL,
  "new_state" JSONB NOT NULL,
  "reviewed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concept_evaluation_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "concept_evaluation_log_evaluation_id_concept_id_study_mode_key"
  ON "concept_evaluation_log"("evaluation_id", "concept_id", "study_mode");
CREATE INDEX "concept_evaluation_log_user_id_concept_id_reviewed_at_idx"
  ON "concept_evaluation_log"("user_id", "concept_id", "reviewed_at");

CREATE TABLE "concept_calibration_data" (
  "id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "concept_id" VARCHAR(50),
  "algorithm" "scheduling_algorithm" NOT NULL,
  "parameters" JSONB NOT NULL,
  "sample_count" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "last_trained_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concept_calibration_data_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "concept_calibration_data_user_id_study_mode_algorithm_concept_id_key"
  ON "concept_calibration_data"("user_id", "study_mode", "algorithm", "concept_id");

CREATE TABLE "concept_transformation_history" (
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "transformation" "transformation_type" NOT NULL,
  "used_at" TIMESTAMP(3) NOT NULL,
  "evaluation_id" VARCHAR(50) NOT NULL,
  CONSTRAINT "concept_transformation_history_pkey"
    PRIMARY KEY ("user_id", "concept_id", "study_mode", "transformation", "used_at")
);

CREATE INDEX "concept_transformation_history_user_id_concept_id_study_mode_used_at_idx"
  ON "concept_transformation_history"("user_id", "concept_id", "study_mode", "used_at");
