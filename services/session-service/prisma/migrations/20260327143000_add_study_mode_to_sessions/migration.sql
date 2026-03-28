DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_mode') THEN
    CREATE TYPE "study_mode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
  END IF;
END $$;

ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "study_mode" "study_mode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

CREATE INDEX IF NOT EXISTS "sessions_user_id_study_mode_idx"
ON "sessions"("user_id", "study_mode");
