CREATE TABLE "event_outbox" (
    "id" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "claim_owner" VARCHAR(100),
    "claim_until" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_outbox_published_at_created_at_idx" ON "event_outbox"("published_at", "created_at");
CREATE INDEX "event_outbox_attempts_idx" ON "event_outbox"("attempts");
CREATE INDEX "event_outbox_published_at_claim_until_next_attempt_at_creat_idx" ON "event_outbox"("published_at", "claim_until", "next_attempt_at", "created_at");
CREATE INDEX "event_outbox_claim_owner_claim_until_idx" ON "event_outbox"("claim_owner", "claim_until");
