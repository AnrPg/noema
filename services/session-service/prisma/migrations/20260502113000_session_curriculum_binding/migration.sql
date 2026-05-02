ALTER TABLE "sessions"
  ADD COLUMN "curriculum_id" VARCHAR(50) NOT NULL DEFAULT 'curr_maintenance_system',
  ADD COLUMN "curriculum_version_id" VARCHAR(50);

ALTER TABLE "lesson_plans"
  ADD COLUMN "curriculum_id" VARCHAR(50) NOT NULL DEFAULT 'curr_maintenance_system',
  ADD COLUMN "curriculum_version_id" VARCHAR(50) NOT NULL DEFAULT 'cver_maintenance_system',
  ADD COLUMN "selected_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "sessions_curriculum_id_idx" ON "sessions"("curriculum_id");
CREATE INDEX "lesson_plans_curriculum_id_curriculum_version_id_idx"
  ON "lesson_plans"("curriculum_id", "curriculum_version_id");

