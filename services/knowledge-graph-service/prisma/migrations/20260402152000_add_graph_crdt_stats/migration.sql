CREATE TABLE IF NOT EXISTS "graph_crdt_stats" (
  "id" VARCHAR(50) NOT NULL,
  "stat_key" VARCHAR(500) NOT NULL,
  "graph_type" VARCHAR(20) NOT NULL,
  "target_kind" VARCHAR(50) NOT NULL,
  "target_node_id" VARCHAR(200),
  "proposed_label" VARCHAR(500),
  "evidence_type" VARCHAR(100) NOT NULL,
  "support_counter" JSONB NOT NULL,
  "oppose_counter" JSONB NOT NULL,
  "neutral_counter" JSONB NOT NULL,
  "confidence_counter" JSONB NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graph_crdt_stats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graph_crdt_stats_stat_key_key" UNIQUE ("stat_key")
);

CREATE TABLE IF NOT EXISTS "graph_crdt_applied_signals" (
  "id" VARCHAR(50) NOT NULL,
  "stat_key" VARCHAR(500) NOT NULL,
  "evidence_id" VARCHAR(50) NOT NULL,
  "replica_id" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graph_crdt_applied_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graph_crdt_applied_signals_evidence_id_key" UNIQUE ("evidence_id"),
  CONSTRAINT "graph_crdt_applied_signals_stat_key_fkey"
    FOREIGN KEY ("stat_key") REFERENCES "graph_crdt_stats"("stat_key") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "graph_crdt_stats_graph_type_target_kind_idx"
  ON "graph_crdt_stats"("graph_type", "target_kind");

CREATE INDEX IF NOT EXISTS "graph_crdt_stats_target_node_id_idx"
  ON "graph_crdt_stats"("target_node_id");

CREATE INDEX IF NOT EXISTS "graph_crdt_stats_proposed_label_idx"
  ON "graph_crdt_stats"("proposed_label");

CREATE INDEX IF NOT EXISTS "graph_crdt_stats_evidence_type_idx"
  ON "graph_crdt_stats"("evidence_type");

CREATE INDEX IF NOT EXISTS "graph_crdt_applied_signals_stat_key_idx"
  ON "graph_crdt_applied_signals"("stat_key");

CREATE INDEX IF NOT EXISTS "graph_crdt_applied_signals_replica_id_idx"
  ON "graph_crdt_applied_signals"("replica_id");
