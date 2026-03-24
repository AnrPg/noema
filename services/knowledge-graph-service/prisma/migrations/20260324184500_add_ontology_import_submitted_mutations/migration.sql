ALTER TABLE "ontology_import_runs"
ADD COLUMN "submitted_mutation_ids" JSONB NOT NULL DEFAULT '[]';
