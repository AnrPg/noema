DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudyMode') THEN
    CREATE TYPE "StudyMode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
  END IF;
END $$;

ALTER TABLE "reviews"
DROP CONSTRAINT IF EXISTS "reviews_user_id_card_id_study_mode_fkey";

ALTER TABLE "calibration_data"
DROP CONSTRAINT IF EXISTS "calibration_data_user_id_card_id_study_mode_fkey";

ALTER TABLE "scheduler_cards"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "reviews"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "calibration_data"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "schedule_proposals"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "schedule_commits"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "schedule_cohort_lineage"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

ALTER TABLE "scheduler_event_inbox"
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode");

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_user_id_card_id_study_mode_fkey"
FOREIGN KEY ("user_id", "card_id", "study_mode")
REFERENCES "scheduler_cards"("user_id", "card_id", "study_mode")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "calibration_data"
ADD CONSTRAINT "calibration_data_user_id_card_id_study_mode_fkey"
FOREIGN KEY ("user_id", "card_id", "study_mode")
REFERENCES "scheduler_cards"("user_id", "card_id", "study_mode")
ON DELETE SET NULL
ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_mode')
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND udt_name = 'study_mode'
    ) THEN
    DROP TYPE "study_mode";
  END IF;
END $$;
