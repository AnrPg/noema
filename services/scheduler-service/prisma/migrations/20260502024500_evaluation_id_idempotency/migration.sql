DROP INDEX IF EXISTS "concept_evaluation_log_evaluation_id_concept_id_study_mode_key";

DELETE FROM "concept_evaluation_log"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "evaluation_id"
        ORDER BY "created_at" ASC, "id" ASC
      ) AS row_number
    FROM "concept_evaluation_log"
  ) ranked
  WHERE ranked.row_number > 1
);

CREATE UNIQUE INDEX "concept_evaluation_log_evaluation_id_key"
  ON "concept_evaluation_log"("evaluation_id");
