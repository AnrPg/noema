DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "evaluations" LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot add selected_node_ids without a closed-loop backfill for existing evaluations';
  END IF;
END $$;

ALTER TABLE "evaluations"
  ADD COLUMN "selected_node_ids" TEXT[] NOT NULL,
  ADD CONSTRAINT "evaluations_selected_node_ids_non_empty"
    CHECK (cardinality("selected_node_ids") > 0);

CREATE INDEX "evaluations_selected_node_ids_idx"
  ON "evaluations" USING GIN ("selected_node_ids");
