-- AlterTable: Add content deduplication hash to cards
ALTER TABLE "cards" ADD COLUMN "content_hash" VARCHAR(64);

-- CreateIndex: Index for fast deduplication lookups
CREATE INDEX "cards_content_hash_idx" ON "cards"("content_hash");
