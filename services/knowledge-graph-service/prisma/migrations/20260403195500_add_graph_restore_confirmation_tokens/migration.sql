CREATE TABLE "graph_restore_confirmation_tokens" (
    "token_id" VARCHAR(100) NOT NULL,
    "snapshot_id" VARCHAR(50) NOT NULL,
    "actor_id" VARCHAR(50),
    "summary_hash" VARCHAR(128) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_restore_confirmation_tokens_pkey" PRIMARY KEY ("token_id")
);

CREATE INDEX "graph_restore_confirmation_tokens_snapshot_id_idx"
    ON "graph_restore_confirmation_tokens"("snapshot_id");

CREATE INDEX "graph_restore_confirmation_tokens_status_expires_at_idx"
    ON "graph_restore_confirmation_tokens"("status", "expires_at");
