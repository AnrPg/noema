-- Batch 3 realignment: cards become Step Activity payload sources.

CREATE TYPE "study_mode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');

CREATE TYPE "transformation_type" AS ENUM (
  'RECALL',
  'EXPLANATION',
  'COMPARISON',
  'APPLICATION',
  'PERTURBATION',
  'ERROR_DETECTION'
);

ALTER TABLE "cards"
  ADD COLUMN "compatible_transformations" "transformation_type"[] NOT NULL DEFAULT ARRAY[]::"transformation_type"[],
  ADD COLUMN "default_eligibility_groups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "supported_study_modes" "study_mode"[] NOT NULL DEFAULT ARRAY['KNOWLEDGE_GAINING']::"study_mode"[];

UPDATE "cards"
SET "compatible_transformations" = CASE
  WHEN "cardType"::TEXT IN (
    'ATOMIC', 'CLOZE', 'DEFINITION', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING',
    'ORDERING', 'DIAGRAM', 'IMAGE_OCCLUSION', 'AUDIO', 'MULTIMODAL'
  ) THEN ARRAY['RECALL']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'PROCESS', 'CASE_BASED', 'TRANSFER', 'PROGRESSIVE_DISCLOSURE'
  ) THEN ARRAY['APPLICATION']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'COMPARISON', 'CONTRASTIVE_PAIR', 'MINIMAL_PAIR', 'FALSE_FRIEND',
    'OLD_VS_NEW_DEFINITION', 'DISCRIMINANT_FEATURE', 'CONFUSABLE_SET_DRILL'
  ) THEN ARRAY['COMPARISON']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'EXCEPTION', 'BOUNDARY_CASE', 'RULE_SCOPE', 'COUNTEREXAMPLE', 'ASSUMPTION_CHECK'
  ) THEN ARRAY['PERTURBATION']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'ERROR_SPOTTING', 'AVAILABILITY_BIAS_DISCONFIRMATION', 'OVERWRITE_DRILL',
    'PARTIAL_KNOWLEDGE_DECOMPOSITION'
  ) THEN ARRAY['ERROR_DETECTION']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'CONFIDENCE_RATED', 'CALIBRATION_TRAINING', 'SELF_CHECK_RITUAL',
    'ATTRIBUTION_REFRAMING', 'STRATEGY_REMINDER', 'RETRIEVAL_CUE',
    'ENCODING_REPAIR', 'REPRESENTATION_SWITCH'
  ) THEN ARRAY['EXPLANATION']::"transformation_type"[]
  WHEN "cardType"::TEXT IN (
    'CAUSE_EFFECT', 'CONCEPT_GRAPH', 'TIMELINE'
  ) THEN ARRAY['EXPLANATION', 'COMPARISON']::"transformation_type"[]
  ELSE ARRAY['RECALL']::"transformation_type"[]
END
WHERE CARDINALITY("compatible_transformations") = 0
   OR "compatible_transformations" = ARRAY['RECALL']::"transformation_type"[];

CREATE TABLE "generated_activity_variants" (
  "id" VARCHAR(50) NOT NULL,
  "concept_id" VARCHAR(50) NOT NULL,
  "study_mode" "study_mode" NOT NULL,
  "transformation_type" "transformation_type" NOT NULL,
  "epistemic_mode" VARCHAR(100) NOT NULL,
  "difficulty_bucket" INTEGER NOT NULL,
  "source_card_ids" TEXT[] NOT NULL,
  "prompt" VARCHAR(8000) NOT NULL,
  "render_payload" JSONB NOT NULL,
  "expected_response_type" VARCHAR(100) NOT NULL,
  "response_schema" JSONB NOT NULL,
  "variant_seed" VARCHAR(100) NOT NULL,
  "generator_metadata" JSONB NOT NULL,
  "guardian_validation_id" VARCHAR(50) NOT NULL,
  "ttl_at" TIMESTAMP(3) NOT NULL,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_activity_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_activity_variants_concept_id_transformation_type_epist_key"
  ON "generated_activity_variants"("concept_id", "transformation_type", "epistemic_mode", "difficulty_bucket", "variant_seed");

CREATE INDEX "cards_compatible_transformations_idx" ON "cards" USING GIN ("compatible_transformations");
CREATE INDEX "cards_default_eligibility_groups_idx" ON "cards" USING GIN ("default_eligibility_groups");
CREATE INDEX "cards_supported_study_modes_idx" ON "cards" USING GIN ("supported_study_modes");
CREATE INDEX "generated_activity_variants_concept_id_transformation_type_ep_idx"
  ON "generated_activity_variants"("concept_id", "transformation_type", "epistemic_mode", "difficulty_bucket");
CREATE INDEX "generated_activity_variants_ttl_at_idx" ON "generated_activity_variants"("ttl_at");
