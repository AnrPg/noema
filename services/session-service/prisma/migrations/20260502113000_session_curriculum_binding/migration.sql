DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "lesson_plans" LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot add selected_node_ids without a closed-loop backfill for existing lesson plans';
  END IF;
END $$;

ALTER TABLE "sessions"
  ADD COLUMN "curriculum_id" VARCHAR(50) NOT NULL DEFAULT 'curr_maintenance_system',
  ADD COLUMN "curriculum_version_id" VARCHAR(50);

ALTER TABLE "lesson_plans"
  ADD COLUMN "curriculum_id" VARCHAR(50) NOT NULL DEFAULT 'curr_maintenance_system',
  ADD COLUMN "curriculum_version_id" VARCHAR(50) NOT NULL DEFAULT 'cver_maintenance_system',
  ADD COLUMN "selected_node_ids" TEXT[] NOT NULL,
  ADD CONSTRAINT "lesson_plans_selected_node_ids_non_empty"
    CHECK (cardinality("selected_node_ids") > 0);

CREATE INDEX "sessions_curriculum_id_idx" ON "sessions"("curriculum_id");
CREATE INDEX "lesson_plans_curriculum_id_curriculum_version_id_idx"
  ON "lesson_plans"("curriculum_id", "curriculum_version_id");
