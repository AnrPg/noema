DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudyMode') THEN
    CREATE TYPE "StudyMode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
  END IF;
END
$$;

ALTER TABLE "user_streaks"
ADD COLUMN IF NOT EXISTS "study_mode" "StudyMode" NOT NULL DEFAULT 'KNOWLEDGE_GAINING';

ALTER TABLE "user_streaks"
DROP CONSTRAINT IF EXISTS "user_streaks_pkey";

ALTER TABLE "user_streaks"
ADD CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id", "study_mode");

CREATE INDEX IF NOT EXISTS "user_streaks_user_id_idx"
ON "user_streaks" ("user_id");
