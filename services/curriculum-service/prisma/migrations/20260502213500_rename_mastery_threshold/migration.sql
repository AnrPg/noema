DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'curriculum_nodes'
      AND column_name = 'mastery_threshold'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'curriculum_nodes'
      AND column_name = 'stability_threshold'
  ) THEN
    ALTER TABLE "curriculum_nodes"
      RENAME COLUMN "mastery_threshold" TO "stability_threshold";
  END IF;
END
$$;
