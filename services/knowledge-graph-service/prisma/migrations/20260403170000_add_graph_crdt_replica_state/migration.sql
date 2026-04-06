CREATE TABLE "graph_crdt_replica_states" (
    "id" VARCHAR(50) NOT NULL,
    "stat_key" VARCHAR(500) NOT NULL,
    "replica_id" VARCHAR(100) NOT NULL,
    "support_count" INTEGER NOT NULL DEFAULT 0,
    "oppose_count" INTEGER NOT NULL DEFAULT 0,
    "neutral_count" INTEGER NOT NULL DEFAULT 0,
    "confidence_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_crdt_replica_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "graph_crdt_replica_states_stat_key_replica_id_key"
ON "graph_crdt_replica_states"("stat_key", "replica_id");

CREATE INDEX "graph_crdt_replica_states_replica_id_idx"
ON "graph_crdt_replica_states"("replica_id");

ALTER TABLE "graph_crdt_replica_states"
ADD CONSTRAINT "graph_crdt_replica_states_stat_key_fkey"
FOREIGN KEY ("stat_key") REFERENCES "graph_crdt_stats"("stat_key")
ON DELETE CASCADE ON UPDATE CASCADE;
