CREATE TYPE "card_origin_mode" AS ENUM ('AUTHORED', 'RAG_GROUNDED', 'AGENT_AUTONOMOUS');
CREATE TYPE "card_review_state" AS ENUM ('ACTIVE', 'METADATA_INCOMPLETE', 'PENDING_REVIEW', 'REJECTED');
CREATE TYPE "card_transform_kind" AS ENUM ('REPHRASE', 'SIMPLIFY', 'INCREASE_DIFFICULTY', 'CHANGE_CARD_TYPE', 'REMEDIATION', 'REANCHOR');
CREATE TYPE "content_generation_job_status" AS ENUM ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "cards"
  ADD COLUMN "anchored_ckg_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "anchored_pkg_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "origin_mode" "card_origin_mode" NOT NULL DEFAULT 'AUTHORED',
  ADD COLUMN "origin_agent_run_id" VARCHAR(100),
  ADD COLUMN "author_user_id" VARCHAR(50),
  ADD COLUMN "source_document_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sources" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "factuality_score" DOUBLE PRECISION,
  ADD COLUMN "review_state" "card_review_state" NOT NULL DEFAULT 'METADATA_INCOMPLETE',
  ADD COLUMN "parent_card_id" VARCHAR(50),
  ADD COLUMN "transformation_kind" "card_transform_kind",
  ADD COLUMN "transformation_agent_run_id" VARCHAR(100),
  ADD COLUMN "generation_job_id" VARCHAR(50),
  ADD COLUMN "guardian_validation_id" VARCHAR(50);

UPDATE "cards"
SET
  "anchored_pkg_node_ids" = COALESCE("knowledge_node_ids", ARRAY[]::TEXT[]),
  "author_user_id" = COALESCE("created_by", "user_id"),
  "review_state" = CASE
    WHEN cardinality(COALESCE("knowledge_node_ids", ARRAY[]::TEXT[])) > 0
      AND cardinality(COALESCE("tags", ARRAY[]::TEXT[])) > 0
      AND "state" = 'ACTIVE'
    THEN 'ACTIVE'::"card_review_state"
    ELSE 'METADATA_INCOMPLETE'::"card_review_state"
  END;

CREATE TABLE "content_generation_jobs" (
  "id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "status" "content_generation_job_status" NOT NULL DEFAULT 'REQUESTED',
  "mode" "card_origin_mode" NOT NULL,
  "concept_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "document_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requested_card_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "request_payload" JSONB NOT NULL DEFAULT '{}',
  "result_payload" JSONB NOT NULL DEFAULT '{}',
  "created_card_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rejected_drafts" JSONB NOT NULL DEFAULT '[]',
  "error_message" VARCHAR(4000),
  "agent_run_id" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concept_card_coverage" (
  "id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "active_card_count" INTEGER NOT NULL DEFAULT 0,
  "distinct_active_card_types" INTEGER NOT NULL DEFAULT 0,
  "pending_review_count" INTEGER NOT NULL DEFAULT 0,
  "metadata_incomplete_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concept_card_coverage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cards" ADD CONSTRAINT "cards_parent_card_id_fkey"
  FOREIGN KEY ("parent_card_id") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cards" ADD CONSTRAINT "cards_generation_job_id_fkey"
  FOREIGN KEY ("generation_job_id") REFERENCES "content_generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "cards_origin_mode_idx" ON "cards"("origin_mode");
CREATE INDEX "cards_review_state_idx" ON "cards"("review_state");
CREATE INDEX "cards_parent_card_id_idx" ON "cards"("parent_card_id");
CREATE INDEX "cards_generation_job_id_idx" ON "cards"("generation_job_id");
CREATE INDEX "cards_anchored_ckg_node_ids_idx" ON "cards" USING GIN ("anchored_ckg_node_ids");
CREATE INDEX "cards_anchored_pkg_node_ids_idx" ON "cards" USING GIN ("anchored_pkg_node_ids");
CREATE INDEX "cards_source_document_ids_idx" ON "cards" USING GIN ("source_document_ids");
CREATE INDEX "content_generation_jobs_user_id_idx" ON "content_generation_jobs"("user_id");
CREATE INDEX "content_generation_jobs_status_idx" ON "content_generation_jobs"("status");
CREATE INDEX "content_generation_jobs_mode_idx" ON "content_generation_jobs"("mode");
CREATE INDEX "content_generation_jobs_concept_ids_idx" ON "content_generation_jobs" USING GIN ("concept_ids");
CREATE INDEX "content_generation_jobs_document_ids_idx" ON "content_generation_jobs" USING GIN ("document_ids");
CREATE UNIQUE INDEX "concept_card_coverage_user_id_concept_id_key" ON "concept_card_coverage"("user_id", "concept_id");
CREATE INDEX "concept_card_coverage_concept_id_idx" ON "concept_card_coverage"("concept_id");
