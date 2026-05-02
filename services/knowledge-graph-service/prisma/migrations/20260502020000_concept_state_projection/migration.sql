-- Realignment Batch 7: binary concept stability projection owned by knowledge-graph-service.

CREATE TYPE "concept_state" AS ENUM ('STABLE', 'UNSTABLE');

CREATE TABLE "concept_state_projections" (
    "user_id" VARCHAR(50) NOT NULL,
    "concept_id" VARCHAR(50) NOT NULL,
    "study_mode" "study_mode" NOT NULL,
    "state" "concept_state" NOT NULL DEFAULT 'UNSTABLE',
    "fsrs_stability" DOUBLE PRECISION,
    "reasoning_average" DOUBLE PRECISION,
    "evidence_window" INTEGER NOT NULL DEFAULT 10,
    "last_evaluation_id" VARCHAR(50),
    "last_changed_at" TIMESTAMP(3),
    "attempts_since_stable" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_state_projections_pkey" PRIMARY KEY ("user_id", "concept_id", "study_mode")
);

CREATE TABLE "concept_state_history" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "concept_id" VARCHAR(50) NOT NULL,
    "study_mode" "study_mode" NOT NULL,
    "previous_state" "concept_state" NOT NULL,
    "new_state" "concept_state" NOT NULL,
    "fsrs_stability" DOUBLE PRECISION,
    "reasoning_average" DOUBLE PRECISION,
    "evaluation_id" VARCHAR(50),
    "changed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_state_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concept_reasoning_evidence" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "concept_id" VARCHAR(50) NOT NULL,
    "study_mode" "study_mode" NOT NULL,
    "evaluation_id" VARCHAR(50) NOT NULL,
    "step_id" VARCHAR(50) NOT NULL,
    "reasoning_quality" DOUBLE PRECISION NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_reasoning_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concept_state_event_inbox" (
    "event_id" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(50),
    "concept_id" VARCHAR(50),
    "study_mode" "study_mode",
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" VARCHAR(100),

    CONSTRAINT "concept_state_event_inbox_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "concept_state_projections_user_id_study_mode_state_idx" ON "concept_state_projections"("user_id", "study_mode", "state");
CREATE INDEX "concept_state_projections_concept_id_idx" ON "concept_state_projections"("concept_id");
CREATE INDEX "concept_state_projections_last_evaluation_id_idx" ON "concept_state_projections"("last_evaluation_id");

CREATE INDEX "concept_state_history_user_id_concept_id_study_mode_changed_at_idx" ON "concept_state_history"("user_id", "concept_id", "study_mode", "changed_at");
CREATE INDEX "concept_state_history_user_id_study_mode_new_state_idx" ON "concept_state_history"("user_id", "study_mode", "new_state");
CREATE INDEX "concept_state_history_evaluation_id_idx" ON "concept_state_history"("evaluation_id");

CREATE UNIQUE INDEX "concept_reasoning_evidence_user_id_concept_id_study_mode_evaluation_id_key" ON "concept_reasoning_evidence"("user_id", "concept_id", "study_mode", "evaluation_id");
CREATE INDEX "concept_reasoning_evidence_user_id_concept_id_study_mode_evaluated_at_idx" ON "concept_reasoning_evidence"("user_id", "concept_id", "study_mode", "evaluated_at");

CREATE INDEX "concept_state_event_inbox_event_type_processed_at_idx" ON "concept_state_event_inbox"("event_type", "processed_at");
CREATE INDEX "concept_state_event_inbox_user_id_concept_id_study_mode_idx" ON "concept_state_event_inbox"("user_id", "concept_id", "study_mode");
