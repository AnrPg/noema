-- CreateEnum
CREATE TYPE "card_type" AS ENUM (
  'ATOMIC', 'CLOZE', 'IMAGE_OCCLUSION', 'AUDIO', 'PROCESS', 'COMPARISON',
  'EXCEPTION', 'ERROR_SPOTTING', 'CONFIDENCE_RATED', 'CONCEPT_GRAPH',
  'CASE_BASED', 'MULTIMODAL', 'TRANSFER', 'PROGRESSIVE_DISCLOSURE',
  'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'ORDERING', 'DEFINITION',
  'CAUSE_EFFECT', 'TIMELINE', 'DIAGRAM',
  -- Remediation card types
  'CONTRASTIVE_PAIR', 'MINIMAL_PAIR', 'FALSE_FRIEND', 'OLD_VS_NEW_DEFINITION',
  'BOUNDARY_CASE', 'RULE_SCOPE', 'DISCRIMINANT_FEATURE', 'ASSUMPTION_CHECK',
  'COUNTEREXAMPLE', 'REPRESENTATION_SWITCH', 'RETRIEVAL_CUE', 'ENCODING_REPAIR',
  'OVERWRITE_DRILL', 'AVAILABILITY_BIAS_DISCONFIRMATION', 'SELF_CHECK_RITUAL',
  'CALIBRATION_TRAINING', 'ATTRIBUTION_REFRAMING', 'STRATEGY_REMINDER',
  'CONFUSABLE_SET_DRILL', 'PARTIAL_KNOWLEDGE_DECOMPOSITION'
);

-- CreateEnum
CREATE TYPE "card_state" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('BEGINNER', 'ELEMENTARY', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "event_source" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'IMPORT');

-- CreateEnum
CREATE TYPE "template_visibility" AS ENUM ('PRIVATE', 'PUBLIC', 'SHARED');

-- CreateTable: cards
CREATE TABLE "cards" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "cardType" "card_type" NOT NULL,
    "state" "card_state" NOT NULL DEFAULT 'DRAFT',
    "difficulty" "difficulty_level" NOT NULL DEFAULT 'INTERMEDIATE',
    "content" JSONB NOT NULL DEFAULT '{}',
    "knowledge_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "event_source" NOT NULL DEFAULT 'USER',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" VARCHAR(50),
    "updated_by" VARCHAR(50),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable: templates
CREATE TABLE "templates" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "card_type" "card_type" NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "difficulty" "difficulty_level" NOT NULL DEFAULT 'INTERMEDIATE',
    "knowledge_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "visibility" "template_visibility" NOT NULL DEFAULT 'PRIVATE',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" VARCHAR(50),
    "updated_by" VARCHAR(50),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: media_files
CREATE TABLE "media_files" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(200) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "bucket" VARCHAR(100) NOT NULL DEFAULT 'content',
    "object_key" VARCHAR(1000) NOT NULL,
    "alt" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" VARCHAR(50),
    "updated_by" VARCHAR(50),

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: cards
CREATE INDEX "cards_user_id_idx" ON "cards"("user_id");
CREATE INDEX "cards_cardType_idx" ON "cards"("cardType");
CREATE INDEX "cards_state_idx" ON "cards"("state");
CREATE INDEX "cards_difficulty_idx" ON "cards"("difficulty");
CREATE INDEX "cards_source_idx" ON "cards"("source");
CREATE INDEX "cards_created_at_idx" ON "cards"("created_at");
CREATE INDEX "cards_deleted_at_idx" ON "cards"("deleted_at");
CREATE INDEX "cards_knowledge_node_ids_idx" ON "cards" USING GIN ("knowledge_node_ids");
CREATE INDEX "cards_tags_idx" ON "cards" USING GIN ("tags");

-- CreateIndex: templates
CREATE INDEX "templates_user_id_idx" ON "templates"("user_id");
CREATE INDEX "templates_card_type_idx" ON "templates"("card_type");
CREATE INDEX "templates_visibility_idx" ON "templates"("visibility");
CREATE INDEX "templates_deleted_at_idx" ON "templates"("deleted_at");
CREATE INDEX "templates_tags_idx" ON "templates" USING GIN ("tags");
CREATE INDEX "templates_name_idx" ON "templates"("name");

-- CreateIndex: media_files
CREATE INDEX "media_files_user_id_idx" ON "media_files"("user_id");
CREATE INDEX "media_files_mime_type_idx" ON "media_files"("mime_type");
CREATE INDEX "media_files_bucket_idx" ON "media_files"("bucket");
CREATE INDEX "media_files_deleted_at_idx" ON "media_files"("deleted_at");
