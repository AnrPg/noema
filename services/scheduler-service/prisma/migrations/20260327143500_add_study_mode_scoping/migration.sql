DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_mode') THEN
    CREATE TYPE "study_mode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
  END IF;
END $$;

ALTER TABLE "scheduler_cards"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "reviews"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "calibration_data"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "schedule_proposals"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "schedule_commits"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "schedule_cohort_lineage"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "scheduler_event_inbox"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode";

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_user_id_card_id_fkey";
ALTER TABLE "calibration_data" DROP CONSTRAINT IF EXISTS "calibration_data_user_id_card_id_fkey";

ALTER TABLE "scheduler_cards" DROP CONSTRAINT IF EXISTS "scheduler_cards_user_id_card_id_key";
DROP INDEX IF EXISTS "scheduler_cards_user_id_card_id_key";
DROP INDEX IF EXISTS "calibration_data_user_id_card_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "scheduler_cards_user_id_card_id_study_mode_key"
ON "scheduler_cards"("user_id", "card_id", "study_mode");

CREATE UNIQUE INDEX IF NOT EXISTS "calibration_data_user_id_card_id_study_mode_key"
ON "calibration_data"("user_id", "card_id", "study_mode");

CREATE INDEX IF NOT EXISTS "scheduler_cards_user_id_study_mode_next_review_date_idx"
ON "scheduler_cards"("user_id", "study_mode", "next_review_date");

CREATE INDEX IF NOT EXISTS "scheduler_cards_user_id_study_mode_lane_idx"
ON "scheduler_cards"("user_id", "study_mode", "lane");

CREATE INDEX IF NOT EXISTS "scheduler_cards_user_id_study_mode_state_next_review_date_idx"
ON "scheduler_cards"("user_id", "study_mode", "state", "next_review_date");

CREATE INDEX IF NOT EXISTS "reviews_user_id_study_mode_reviewed_at_idx"
ON "reviews"("user_id", "study_mode", "reviewed_at");

CREATE INDEX IF NOT EXISTS "calibration_data_user_id_study_mode_card_type_idx"
ON "calibration_data"("user_id", "study_mode", "card_type");

CREATE INDEX IF NOT EXISTS "calibration_data_user_id_study_mode_last_trained_at_idx"
ON "calibration_data"("user_id", "study_mode", "last_trained_at");

CREATE INDEX IF NOT EXISTS "schedule_proposals_user_id_study_mode_created_at_idx"
ON "schedule_proposals"("user_id", "study_mode", "created_at");

CREATE INDEX IF NOT EXISTS "schedule_commits_user_id_study_mode_created_at_idx"
ON "schedule_commits"("user_id", "study_mode", "created_at");

CREATE INDEX IF NOT EXISTS "schedule_cohort_lineage_user_id_study_mode_created_at_idx"
ON "schedule_cohort_lineage"("user_id", "study_mode", "created_at");

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
