DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'learningMode'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'learning_mode'
  ) THEN
    ALTER TABLE "sessions" RENAME COLUMN "learningMode" TO "learning_mode";
  END IF;
END $$;
