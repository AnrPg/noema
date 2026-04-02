DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudyMode') THEN
    CREATE TYPE "StudyMode" AS ENUM ('LANGUAGE_LEARNING', 'KNOWLEDGE_GAINING');
  END IF;
END $$;

ALTER TABLE "sessions"
ALTER COLUMN "study_mode" DROP DEFAULT,
ALTER COLUMN "study_mode" TYPE "StudyMode"
USING ("study_mode"::text::"StudyMode"),
ALTER COLUMN "study_mode" SET DEFAULT 'KNOWLEDGE_GAINING'::"StudyMode";

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
