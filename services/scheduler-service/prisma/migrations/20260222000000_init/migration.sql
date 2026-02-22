-- Scheduler Service Initial Migration
-- Date: 2026-02-22
-- Description: Creates tables for card scheduling state, review history, and calibration data

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "scheduler_lane" AS ENUM ('RETENTION', 'CALIBRATION');
CREATE TYPE "scheduler_card_state" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'SUSPENDED', 'GRADUATED');
CREATE TYPE "rating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- ============================================================================
-- scheduler_cards table
-- ============================================================================

CREATE TABLE "scheduler_cards" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "lane" "scheduler_lane" NOT NULL DEFAULT 'RETENTION',
    
    -- FSRS parameters (retention lane)
    "stability" DOUBLE PRECISION,
    "difficulty_parameter" DOUBLE PRECISION,
    
    -- HLR parameters (calibration lane)
    "half_life" DOUBLE PRECISION,
    
    -- Common scheduling state
    "interval" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "next_review_date" TIMESTAMP(3) NOT NULL,
    "last_reviewed_at" TIMESTAMP(3),
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "lapse_count" INTEGER NOT NULL DEFAULT 0,
    "consecutive_correct" INTEGER NOT NULL DEFAULT 0,
    
    -- Algorithm selection
    "scheduling_algorithm" VARCHAR(20) NOT NULL DEFAULT 'fsrs',
    
    -- Metadata
    "card_type" VARCHAR(50),
    "difficulty" VARCHAR(20),
    "knowledge_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- State tracking
    "state" "scheduler_card_state" NOT NULL DEFAULT 'NEW',
    "suspended_until" TIMESTAMP(3),
    "suspended_reason" VARCHAR(255),
    
    -- Audit fields
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "scheduler_cards_pkey" PRIMARY KEY ("id")
);

-- Indexes for scheduler_cards
CREATE INDEX "scheduler_cards_user_id_next_review_date_idx" ON "scheduler_cards"("user_id", "next_review_date");
CREATE INDEX "scheduler_cards_user_id_lane_idx" ON "scheduler_cards"("user_id", "lane");
CREATE INDEX "scheduler_cards_user_id_state_next_review_date_idx" ON "scheduler_cards"("user_id", "state", "next_review_date");
CREATE INDEX "scheduler_cards_next_review_date_idx" ON "scheduler_cards"("next_review_date");
CREATE INDEX "scheduler_cards_lane_state_idx" ON "scheduler_cards"("lane", "state");

-- ============================================================================
-- reviews table
-- ============================================================================

CREATE TABLE "reviews" (
    "id" VARCHAR(50) NOT NULL,
    
    -- References
    "card_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "session_id" VARCHAR(50) NOT NULL,
    "attempt_id" VARCHAR(50) NOT NULL,
    
    -- Review outcome
    "rating" "rating" NOT NULL,
    "rating_value" SMALLINT NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    
    -- Timing
    "delta_days" DOUBLE PRECISION NOT NULL,
    "response_time" DOUBLE PRECISION,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    
    -- State snapshots
    "prior_state" JSONB NOT NULL,
    "new_state" JSONB NOT NULL,
    
    -- Algorithm used
    "scheduling_algorithm" VARCHAR(20) NOT NULL,
    "lane" "scheduler_lane" NOT NULL,
    
    -- Metacognitive signals
    "confidence_before" DOUBLE PRECISION,
    "confidence_after" DOUBLE PRECISION,
    "hint_request_count" INTEGER,
    
    -- Audit
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- Foreign key constraint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "scheduler_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for reviews
CREATE INDEX "reviews_card_id_reviewed_at_idx" ON "reviews"("card_id", "reviewed_at");
CREATE INDEX "reviews_user_id_reviewed_at_idx" ON "reviews"("user_id", "reviewed_at");
CREATE INDEX "reviews_session_id_idx" ON "reviews"("session_id");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_attempt_id_key" UNIQUE ("attempt_id");
CREATE INDEX "reviews_rating_idx" ON "reviews"("rating");
CREATE INDEX "reviews_lane_rating_idx" ON "reviews"("lane", "rating");

-- ============================================================================
-- calibration_data table
-- ============================================================================

CREATE TABLE "calibration_data" (
    "id" VARCHAR(50) NOT NULL,
    
    -- Scope: per-user, per-card OR per-cardType
    "user_id" VARCHAR(50) NOT NULL,
    "card_id" VARCHAR(50),
    "card_type" VARCHAR(50),
    
    -- Parameter estimates
    "parameters" JSONB NOT NULL,
    
    -- Confidence metrics
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "last_trained_at" TIMESTAMP(3),
    
    -- Audit
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_data_pkey" PRIMARY KEY ("id")
);

-- Foreign key constraint (optional)
ALTER TABLE "calibration_data" ADD CONSTRAINT "calibration_data_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "scheduler_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique constraint
ALTER TABLE "calibration_data" ADD CONSTRAINT "calibration_data_user_id_card_id_key" UNIQUE ("user_id", "card_id");

-- Indexes for calibration_data
CREATE INDEX "calibration_data_user_id_card_type_idx" ON "calibration_data"("user_id", "card_type");
CREATE INDEX "calibration_data_user_id_last_trained_at_idx" ON "calibration_data"("user_id", "last_trained_at");
