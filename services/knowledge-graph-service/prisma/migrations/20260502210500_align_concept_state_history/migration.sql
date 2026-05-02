-- Align concept-state history with the closed-loop audit vocabulary.

DROP INDEX IF EXISTS "concept_state_history_user_id_study_mode_new_state_idx";

ALTER TABLE "concept_state_history"
  RENAME COLUMN "previous_state" TO "from_state";

ALTER TABLE "concept_state_history"
  RENAME COLUMN "new_state" TO "to_state";

ALTER TABLE "concept_state_history"
  ADD COLUMN "triggered_by" VARCHAR(50) NOT NULL DEFAULT 'recompute';

UPDATE "concept_state_history"
SET "triggered_by" = CASE
  WHEN "evaluation_id" IS NOT NULL THEN 'evaluation'
  ELSE 'recompute'
END;

CREATE INDEX "concept_state_history_user_id_study_mode_to_state_idx"
  ON "concept_state_history"("user_id", "study_mode", "to_state");
CREATE INDEX "concept_state_history_triggered_by_idx"
  ON "concept_state_history"("triggered_by");
