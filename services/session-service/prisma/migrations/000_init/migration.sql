-- CreateEnum
CREATE TYPE "session_state" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "learning_mode" AS ENUM ('EXPLORATION', 'GOAL_DRIVEN', 'EXAM_ORIENTED', 'SYNTHESIS');

-- CreateEnum
CREATE TYPE "attempt_outcome" AS ENUM ('CORRECT', 'INCORRECT', 'PARTIAL', 'SKIPPED');

-- CreateEnum
CREATE TYPE "rating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "hint_depth" AS ENUM ('NONE', 'CUE', 'PARTIAL', 'FULL_EXPLANATION');

-- CreateEnum
CREATE TYPE "card_queue_status" AS ENUM ('PENDING', 'PRESENTED', 'COMPLETED', 'SKIPPED', 'INJECTED');

-- CreateEnum
CREATE TYPE "session_cohort_handshake_status" AS ENUM ('PROPOSED', 'ACCEPTED', 'REVISED', 'COMMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "offline_intent_token_replay_guard_status" AS ENUM ('ISSUED', 'CONSUMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "deck_query_id" VARCHAR(50) NOT NULL,
    "state" "session_state" NOT NULL DEFAULT 'ACTIVE',
    "learningMode" "learning_mode" NOT NULL,
    "teaching_approach" VARCHAR(100) NOT NULL,
    "scheduling_algorithm" VARCHAR(50) NOT NULL,
    "loadout_id" VARCHAR(50),
    "loadout_archetype" VARCHAR(50),
    "force_level" VARCHAR(20),
    "config" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "initial_queue_size" INTEGER NOT NULL DEFAULT 0,
    "pause_count" INTEGER NOT NULL DEFAULT 0,
    "total_paused_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "last_paused_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "termination_reason" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" VARCHAR(50) NOT NULL,
    "session_id" VARCHAR(50) NOT NULL,
    "card_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "outcome" "attempt_outcome" NOT NULL,
    "rating" "rating" NOT NULL,
    "rating_value" SMALLINT NOT NULL,
    "response_time_ms" DOUBLE PRECISION NOT NULL,
    "dwell_time_ms" DOUBLE PRECISION NOT NULL,
    "time_to_first_interaction_ms" DOUBLE PRECISION,
    "confidence_before" DOUBLE PRECISION,
    "confidence_after" DOUBLE PRECISION,
    "calibration_delta" DOUBLE PRECISION,
    "was_revised_before_commit" BOOLEAN NOT NULL DEFAULT false,
    "revision_count" INTEGER NOT NULL DEFAULT 0,
    "hint_request_count" INTEGER NOT NULL DEFAULT 0,
    "hint_depth_reached" "hint_depth" NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "prior_scheduling_state" JSONB,
    "trace_id" VARCHAR(50),
    "diagnosis_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_queue_items" (
    "id" VARCHAR(50) NOT NULL,
    "session_id" VARCHAR(50) NOT NULL,
    "card_id" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "card_queue_status" NOT NULL DEFAULT 'PENDING',
    "injected_by" VARCHAR(100),
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_cohort_handshakes" (
    "id" VARCHAR(50) NOT NULL,
    "session_id" VARCHAR(50) NOT NULL,
    "proposal_id" VARCHAR(100) NOT NULL,
    "decision_id" VARCHAR(100) NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "session_cohort_handshake_status" NOT NULL,
    "candidate_card_ids" JSONB NOT NULL,
    "accepted_card_ids" JSONB,
    "rejected_card_ids" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_cohort_handshakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_outbox" (
    "id" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "claim_owner" VARCHAR(100),
    "claim_until" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_intent_token_replay_guard" (
    "jti" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "status" "offline_intent_token_replay_guard_status" NOT NULL DEFAULT 'ISSUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_intent_token_replay_guard_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "user_id" VARCHAR(50) NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_state_idx" ON "sessions"("user_id", "state");

-- CreateIndex
CREATE INDEX "sessions_state_idx" ON "sessions"("state");

-- CreateIndex
CREATE INDEX "sessions_started_at_idx" ON "sessions"("started_at");

-- CreateIndex
CREATE INDEX "sessions_last_activity_at_idx" ON "sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_completed_at_idx" ON "sessions"("user_id", "completed_at");

-- CreateIndex
CREATE INDEX "attempts_session_id_idx" ON "attempts"("session_id");

-- CreateIndex
CREATE INDEX "attempts_session_id_sequence_number_idx" ON "attempts"("session_id", "sequence_number");

-- CreateIndex
CREATE INDEX "attempts_user_id_idx" ON "attempts"("user_id");

-- CreateIndex
CREATE INDEX "attempts_card_id_idx" ON "attempts"("card_id");

-- CreateIndex
CREATE INDEX "attempts_user_id_card_id_idx" ON "attempts"("user_id", "card_id");

-- CreateIndex
CREATE INDEX "attempts_created_at_idx" ON "attempts"("created_at");

-- CreateIndex
CREATE INDEX "session_queue_items_session_id_position_idx" ON "session_queue_items"("session_id", "position");

-- CreateIndex
CREATE INDEX "session_queue_items_session_id_status_idx" ON "session_queue_items"("session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "session_queue_items_session_id_card_id_key" ON "session_queue_items"("session_id", "card_id");

-- CreateIndex
CREATE INDEX "session_cohort_handshakes_session_id_status_idx" ON "session_cohort_handshakes"("session_id", "status");

-- CreateIndex
CREATE INDEX "session_cohort_handshakes_session_id_proposal_id_revision_idx" ON "session_cohort_handshakes"("session_id", "proposal_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "session_cohort_handshakes_session_id_proposal_id_revision_key" ON "session_cohort_handshakes"("session_id", "proposal_id", "revision");

-- CreateIndex
CREATE INDEX "event_outbox_published_at_created_at_idx" ON "event_outbox"("published_at", "created_at");

-- CreateIndex
CREATE INDEX "event_outbox_attempts_idx" ON "event_outbox"("attempts");

-- CreateIndex
CREATE INDEX "event_outbox_published_at_claim_until_next_attempt_at_creat_idx" ON "event_outbox"("published_at", "claim_until", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "event_outbox_claim_owner_claim_until_idx" ON "event_outbox"("claim_owner", "claim_until");

-- CreateIndex
CREATE INDEX "offline_intent_token_replay_guard_user_id_status_idx" ON "offline_intent_token_replay_guard"("user_id", "status");

-- CreateIndex
CREATE INDEX "offline_intent_token_replay_guard_expires_at_status_idx" ON "offline_intent_token_replay_guard"("expires_at", "status");

-- CreateIndex
CREATE INDEX "offline_intent_token_replay_guard_consumed_at_idx" ON "offline_intent_token_replay_guard"("consumed_at");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_queue_items" ADD CONSTRAINT "session_queue_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_cohort_handshakes" ADD CONSTRAINT "session_cohort_handshakes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

