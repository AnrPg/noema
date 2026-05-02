ALTER TABLE "evaluations"
  ADD COLUMN "lesson_plan_id" VARCHAR(50);

UPDATE "evaluations"
SET "lesson_plan_id" = 'lesson_unknown'
WHERE "lesson_plan_id" IS NULL;

UPDATE "evaluations"
SET "study_mode" = 'knowledge_gaining'
WHERE "study_mode" IS NULL;

ALTER TABLE "evaluations"
  ALTER COLUMN "lesson_plan_id" SET NOT NULL,
  ALTER COLUMN "study_mode" SET DEFAULT 'knowledge_gaining',
  ALTER COLUMN "study_mode" SET NOT NULL;

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_study_mode_check"
  CHECK ("study_mode" IN ('language_learning', 'knowledge_gaining'));

CREATE INDEX "evaluations_lesson_plan_id_idx" ON "evaluations"("lesson_plan_id");
