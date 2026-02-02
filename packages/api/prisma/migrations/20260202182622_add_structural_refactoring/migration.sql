-- CreateTable
CREATE TABLE "StructuralRefactorEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "primaryCategoryId" TEXT NOT NULL,
    "affectedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "operationInput" JSONB NOT NULL,
    "operationResult" JSONB,
    "userReason" TEXT,
    "aiSummary" TEXT,
    "beforeSnapshotId" TEXT,
    "afterSnapshotId" TEXT,
    "isRollbackable" BOOLEAN NOT NULL DEFAULT true,
    "wasRolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rollbackEventId" TEXT,
    "originalEventId" TEXT,
    "conflictInfo" JSONB,
    "conflictResolution" JSONB,
    "clientId" TEXT,
    "clientTimestamp" TIMESTAMP(3),
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructuralRefactorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructuralSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "refactorEventId" TEXT,
    "categoryTree" JSONB NOT NULL,
    "relations" JSONB NOT NULL,
    "participations" JSONB NOT NULL,
    "totalCategories" INTEGER NOT NULL DEFAULT 0,
    "totalCards" INTEGER NOT NULL DEFAULT 0,
    "totalRelations" INTEGER NOT NULL DEFAULT 0,
    "maxDepth" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StructuralSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISplitSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "suggestedChildren" JSONB NOT NULL,
    "overallRationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "refactorEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISplitSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMergeSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceCategoryIds" TEXT[],
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "suggestedName" TEXT NOT NULL,
    "suggestedFramingQuestion" TEXT,
    "rationale" TEXT NOT NULL,
    "overlapAnalysis" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "refactorEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMergeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_userId_idx" ON "StructuralRefactorEvent"("userId");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_operationType_idx" ON "StructuralRefactorEvent"("operationType");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_status_idx" ON "StructuralRefactorEvent"("status");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_primaryCategoryId_idx" ON "StructuralRefactorEvent"("primaryCategoryId");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_clientId_idx" ON "StructuralRefactorEvent"("clientId");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_serverTimestamp_idx" ON "StructuralRefactorEvent"("serverTimestamp");

-- CreateIndex
CREATE INDEX "StructuralRefactorEvent_createdAt_idx" ON "StructuralRefactorEvent"("createdAt");

-- CreateIndex
CREATE INDEX "StructuralSnapshot_userId_idx" ON "StructuralSnapshot"("userId");

-- CreateIndex
CREATE INDEX "StructuralSnapshot_isAutomatic_idx" ON "StructuralSnapshot"("isAutomatic");

-- CreateIndex
CREATE INDEX "StructuralSnapshot_refactorEventId_idx" ON "StructuralSnapshot"("refactorEventId");

-- CreateIndex
CREATE INDEX "StructuralSnapshot_createdAt_idx" ON "StructuralSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "StructuralSnapshot_expiresAt_idx" ON "StructuralSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "AISplitSuggestion_userId_idx" ON "AISplitSuggestion"("userId");

-- CreateIndex
CREATE INDEX "AISplitSuggestion_categoryId_idx" ON "AISplitSuggestion"("categoryId");

-- CreateIndex
CREATE INDEX "AISplitSuggestion_status_idx" ON "AISplitSuggestion"("status");

-- CreateIndex
CREATE INDEX "AISplitSuggestion_confidence_idx" ON "AISplitSuggestion"("confidence");

-- CreateIndex
CREATE INDEX "AISplitSuggestion_createdAt_idx" ON "AISplitSuggestion"("createdAt");

-- CreateIndex
CREATE INDEX "AIMergeSuggestion_userId_idx" ON "AIMergeSuggestion"("userId");

-- CreateIndex
CREATE INDEX "AIMergeSuggestion_status_idx" ON "AIMergeSuggestion"("status");

-- CreateIndex
CREATE INDEX "AIMergeSuggestion_confidence_idx" ON "AIMergeSuggestion"("confidence");

-- CreateIndex
CREATE INDEX "AIMergeSuggestion_createdAt_idx" ON "AIMergeSuggestion"("createdAt");

-- AddForeignKey
ALTER TABLE "StructuralRefactorEvent" ADD CONSTRAINT "StructuralRefactorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructuralRefactorEvent" ADD CONSTRAINT "StructuralRefactorEvent_beforeSnapshotId_fkey" FOREIGN KEY ("beforeSnapshotId") REFERENCES "StructuralSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructuralRefactorEvent" ADD CONSTRAINT "StructuralRefactorEvent_afterSnapshotId_fkey" FOREIGN KEY ("afterSnapshotId") REFERENCES "StructuralSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructuralRefactorEvent" ADD CONSTRAINT "StructuralRefactorEvent_originalEventId_fkey" FOREIGN KEY ("originalEventId") REFERENCES "StructuralRefactorEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructuralSnapshot" ADD CONSTRAINT "StructuralSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISplitSuggestion" ADD CONSTRAINT "AISplitSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMergeSuggestion" ADD CONSTRAINT "AIMergeSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
