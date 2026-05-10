ALTER TABLE "templates"
  ADD COLUMN "anchored_ckg_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "templates_anchored_ckg_node_ids_idx"
  ON "templates" USING GIN ("anchored_ckg_node_ids");
