ALTER TABLE "sessions"
  ALTER COLUMN "curriculum_id" DROP DEFAULT;

ALTER TABLE "lesson_plans"
  ALTER COLUMN "curriculum_id" DROP DEFAULT,
  ALTER COLUMN "curriculum_version_id" DROP DEFAULT;
