ALTER TABLE "concept_reasoning_averages"
  ADD COLUMN IF NOT EXISTS "study_mode" VARCHAR(50) NOT NULL DEFAULT 'knowledge_gaining';

DROP INDEX IF EXISTS "concept_reasoning_averages_user_id_concept_id_key";

CREATE UNIQUE INDEX "concept_reasoning_averages_user_id_concept_id_study_mode_key"
  ON "concept_reasoning_averages"("user_id", "concept_id", "study_mode");
