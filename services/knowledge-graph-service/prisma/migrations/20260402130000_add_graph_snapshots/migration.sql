CREATE TABLE IF NOT EXISTS "graph_snapshots" (
  "id" VARCHAR(50) NOT NULL,
  "graph_type" VARCHAR(20) NOT NULL,
  "scope_user_id" VARCHAR(50),
  "scope_domain" VARCHAR(200),
  "node_count" INTEGER NOT NULL DEFAULT 0,
  "edge_count" INTEGER NOT NULL DEFAULT 0,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "snapshot_data" JSONB NOT NULL,
  "reason" VARCHAR(2000),
  "source_cursor" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" VARCHAR(50),
  CONSTRAINT "graph_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "graph_snapshots_graph_type_created_at_idx"
  ON "graph_snapshots"("graph_type", "created_at");

CREATE INDEX IF NOT EXISTS "graph_snapshots_scope_user_id_created_at_idx"
  ON "graph_snapshots"("scope_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "graph_snapshots_scope_domain_created_at_idx"
  ON "graph_snapshots"("scope_domain", "created_at");

CREATE INDEX IF NOT EXISTS "graph_snapshots_graph_type_scope_user_id_scope_domain_created_at_idx"
  ON "graph_snapshots"("graph_type", "scope_user_id", "scope_domain", "created_at");
