-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "acceptedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "changesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "conflictsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "rejectedCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "deviceId" DROP NOT NULL,
ALTER COLUMN "entityType" DROP NOT NULL,
ALTER COLUMN "entityId" DROP NOT NULL,
ALTER COLUMN "operation" DROP NOT NULL,
ALTER COLUMN "data" DROP NOT NULL,
ALTER COLUMN "serverVersion" SET DEFAULT 0,
ALTER COLUMN "clientVersion" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "PendingConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "conflictData" JSONB NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "autoResolvable" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedClients" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "DeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingConflict_userId_idx" ON "PendingConflict"("userId");

-- CreateIndex
CREATE INDEX "PendingConflict_detectedAt_idx" ON "PendingConflict"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingConflict_userId_entityType_entityId_key" ON "PendingConflict"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "DeletionLog_userId_idx" ON "DeletionLog"("userId");

-- CreateIndex
CREATE INDEX "DeletionLog_deletedAt_idx" ON "DeletionLog"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionLog_entityType_entityId_key" ON "DeletionLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SyncLog_clientId_idx" ON "SyncLog"("clientId");

-- CreateIndex
CREATE INDEX "SyncLog_completedAt_idx" ON "SyncLog"("completedAt");
