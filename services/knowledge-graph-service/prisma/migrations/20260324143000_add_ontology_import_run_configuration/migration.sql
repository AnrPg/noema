ALTER TABLE "ontology_import_runs"
ADD COLUMN "configuration" JSONB NOT NULL DEFAULT '{}';
