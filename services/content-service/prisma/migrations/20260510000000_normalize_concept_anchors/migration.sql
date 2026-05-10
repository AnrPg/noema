ALTER TABLE "cards"
ADD COLUMN "primary_concept_id" VARCHAR(50),
ADD COLUMN "related_concept_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "cards"
SET
  "primary_concept_id" = COALESCE(
    NULLIF("anchored_ckg_node_ids"[1], ''),
    NULLIF("anchored_pkg_node_ids"[1], ''),
    NULLIF("knowledge_node_ids"[1], '')
  ),
  "related_concept_ids" = COALESCE(
    ARRAY(
      SELECT DISTINCT concept_id
      FROM unnest(
        COALESCE("anchored_ckg_node_ids", ARRAY[]::TEXT[]) ||
        COALESCE("anchored_pkg_node_ids", ARRAY[]::TEXT[]) ||
        COALESCE("knowledge_node_ids", ARRAY[]::TEXT[])
      ) AS concept_id
      WHERE concept_id IS NOT NULL
        AND concept_id <> COALESCE(
          NULLIF("anchored_ckg_node_ids"[1], ''),
          NULLIF("anchored_pkg_node_ids"[1], ''),
          NULLIF("knowledge_node_ids"[1], '')
        )
    ),
    ARRAY[]::TEXT[]
  );

CREATE INDEX "cards_primary_concept_id_idx" ON "cards"("primary_concept_id");
CREATE INDEX "cards_related_concept_ids_idx" ON "cards" USING GIN ("related_concept_ids");
