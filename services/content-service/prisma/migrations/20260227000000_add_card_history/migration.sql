-- CreateTable: card_history (version history snapshots for cards)
CREATE TABLE "card_history" (
    "id" VARCHAR(50) NOT NULL,
    "card_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "version" INTEGER NOT NULL,
    "card_type" "card_type" NOT NULL,
    "state" "card_state" NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knowledge_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "change_type" VARCHAR(50) NOT NULL,
    "changed_by" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_history_card_id_idx" ON "card_history"("card_id");
CREATE INDEX "card_history_card_id_version_idx" ON "card_history"("card_id", "version");
CREATE INDEX "card_history_user_id_idx" ON "card_history"("user_id");
CREATE INDEX "card_history_created_at_idx" ON "card_history"("created_at");
