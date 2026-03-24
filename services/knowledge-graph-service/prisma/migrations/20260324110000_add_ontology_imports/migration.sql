-- Ontology source registry
CREATE TABLE IF NOT EXISTS "ontology_import_sources" (
    "id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "access_mode" VARCHAR(50) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "homepage_url" VARCHAR(500),
    "documentation_url" VARCHAR(500),
    "supported_languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supports_incremental" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "latest_release_version" VARCHAR(200),
    "latest_release_published_at" TIMESTAMP(3),
    "latest_release_checksum" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ontology_import_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ontology_import_sources_role_idx"
ON "ontology_import_sources"("role");

CREATE INDEX IF NOT EXISTS "ontology_import_sources_access_mode_idx"
ON "ontology_import_sources"("access_mode");

CREATE INDEX IF NOT EXISTS "ontology_import_sources_enabled_idx"
ON "ontology_import_sources"("enabled");

-- Ontology import runs
CREATE TABLE IF NOT EXISTS "ontology_import_runs" (
    "id" VARCHAR(50) NOT NULL,
    "source_id" VARCHAR(50) NOT NULL,
    "source_version" VARCHAR(200),
    "status" VARCHAR(50) NOT NULL,
    "trigger" VARCHAR(50) NOT NULL,
    "initiated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(2000),
    CONSTRAINT "ontology_import_runs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ontology_import_runs_source_id_fkey'
    ) THEN
        ALTER TABLE "ontology_import_runs"
        ADD CONSTRAINT "ontology_import_runs_source_id_fkey"
        FOREIGN KEY ("source_id")
        REFERENCES "ontology_import_sources"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ontology_import_runs_source_id_idx"
ON "ontology_import_runs"("source_id");

CREATE INDEX IF NOT EXISTS "ontology_import_runs_status_idx"
ON "ontology_import_runs"("status");

CREATE INDEX IF NOT EXISTS "ontology_import_runs_trigger_idx"
ON "ontology_import_runs"("trigger");

CREATE INDEX IF NOT EXISTS "ontology_import_runs_created_at_idx"
ON "ontology_import_runs"("created_at");

CREATE INDEX IF NOT EXISTS "ontology_import_runs_source_id_status_idx"
ON "ontology_import_runs"("source_id", "status");

-- Immutable raw and derived artifacts
CREATE TABLE IF NOT EXISTS "ontology_import_artifacts" (
    "id" VARCHAR(50) NOT NULL,
    "run_id" VARCHAR(50) NOT NULL,
    "source_id" VARCHAR(50) NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(200),
    "checksum" VARCHAR(200),
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ontology_import_artifacts_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ontology_import_artifacts_run_id_fkey'
    ) THEN
        ALTER TABLE "ontology_import_artifacts"
        ADD CONSTRAINT "ontology_import_artifacts_run_id_fkey"
        FOREIGN KEY ("run_id")
        REFERENCES "ontology_import_runs"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ontology_import_artifacts_run_id_idx"
ON "ontology_import_artifacts"("run_id");

CREATE INDEX IF NOT EXISTS "ontology_import_artifacts_source_id_idx"
ON "ontology_import_artifacts"("source_id");

CREATE INDEX IF NOT EXISTS "ontology_import_artifacts_kind_idx"
ON "ontology_import_artifacts"("kind");

-- Run checkpoints
CREATE TABLE IF NOT EXISTS "ontology_import_checkpoints" (
    "id" VARCHAR(50) NOT NULL,
    "run_id" VARCHAR(50) NOT NULL,
    "step" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "detail" VARCHAR(2000),
    CONSTRAINT "ontology_import_checkpoints_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ontology_import_checkpoints_run_id_fkey'
    ) THEN
        ALTER TABLE "ontology_import_checkpoints"
        ADD CONSTRAINT "ontology_import_checkpoints_run_id_fkey"
        FOREIGN KEY ("run_id")
        REFERENCES "ontology_import_runs"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ontology_import_checkpoints_run_id_idx"
ON "ontology_import_checkpoints"("run_id");

CREATE INDEX IF NOT EXISTS "ontology_import_checkpoints_step_idx"
ON "ontology_import_checkpoints"("step");

CREATE INDEX IF NOT EXISTS "ontology_import_checkpoints_status_idx"
ON "ontology_import_checkpoints"("status");

-- Parsed staging batches
CREATE TABLE IF NOT EXISTS "ontology_parsed_batches" (
    "run_id" VARCHAR(50) NOT NULL,
    "source_id" VARCHAR(50) NOT NULL,
    "source_version" VARCHAR(200),
    "record_count" INTEGER NOT NULL,
    "artifact_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ontology_parsed_batches_pkey" PRIMARY KEY ("run_id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ontology_parsed_batches_run_id_fkey'
    ) THEN
        ALTER TABLE "ontology_parsed_batches"
        ADD CONSTRAINT "ontology_parsed_batches_run_id_fkey"
        FOREIGN KEY ("run_id")
        REFERENCES "ontology_import_runs"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ontology_parsed_batches_source_id_idx"
ON "ontology_parsed_batches"("source_id");
