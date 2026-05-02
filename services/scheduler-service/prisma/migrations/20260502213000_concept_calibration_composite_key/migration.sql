ALTER TABLE "concept_calibration_data" DROP CONSTRAINT IF EXISTS "concept_calibration_data_pkey";
DROP INDEX IF EXISTS "concept_calibration_data_user_id_study_mode_algorithm_concept_id_key";

DELETE FROM "concept_calibration_data" WHERE "concept_id" IS NULL;

ALTER TABLE "concept_calibration_data" DROP COLUMN IF EXISTS "id";
ALTER TABLE "concept_calibration_data" ALTER COLUMN "concept_id" SET NOT NULL;
ALTER TABLE "concept_calibration_data"
  ADD CONSTRAINT "concept_calibration_data_pkey"
  PRIMARY KEY ("user_id", "study_mode", "algorithm", "concept_id");
