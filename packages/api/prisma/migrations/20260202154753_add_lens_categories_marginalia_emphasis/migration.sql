-- AlterTable
ALTER TABLE "CardCategoryParticipation" ADD COLUMN     "emphasisLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isContextHighlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReviewedInContext" TIMESTAMP(3),
ADD COLUMN     "targetMastery" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "enabledPlugins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "interpretationPriority" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "learningGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pluginData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "semanticIntent" TEXT,
ADD COLUMN     "visualIdentityLayer" JSONB;

-- AlterTable
ALTER TABLE "CategoryRelation" ADD COLUMN     "epistemicBridge" TEXT;

-- CreateTable
CREATE TABLE "ContextualAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "participationId" TEXT,
    "annotationType" TEXT NOT NULL DEFAULT 'note',
    "content" TEXT NOT NULL,
    "targetSelector" JSONB,
    "style" JSONB,
    "linkedCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalUrl" TEXT,
    "citationText" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "showDuringStudy" BOOLEAN NOT NULL DEFAULT true,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "cardContentHash" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "aiSource" TEXT,
    "isUserApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextualAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmphasisRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" TEXT NOT NULL,
    "targetCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetSemanticRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentSelector" JSONB,
    "emphasisLevel" INTEGER NOT NULL DEFAULT 0,
    "style" JSONB,
    "injectedPrompt" TEXT,
    "promptPosition" TEXT NOT NULL DEFAULT 'after',
    "minReviewCount" INTEGER,
    "minMastery" DOUBLE PRECISION,
    "maxMastery" DOUBLE PRECISION,
    "activeLearningModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmphasisRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextPerformanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "correctReviews" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minResponseTime" DOUBLE PRECISION,
    "maxResponseTime" DOUBLE PRECISION,
    "perceivedDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastReviewedAt" TIMESTAMP(3),
    "daysSinceAnyReview" INTEGER,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "recentAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyTrend" TEXT NOT NULL DEFAULT 'stable',
    "performanceDeviation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasDriftWarning" BOOLEAN NOT NULL DEFAULT false,
    "driftDetectedAt" TIMESTAMP(3),
    "driftSeverity" TEXT,
    "avgConfidence" DOUBLE PRECISION,
    "confidenceAccuracyCorrelation" DOUBLE PRECISION,
    "hasOverconfidenceFlag" BOOLEAN NOT NULL DEFAULT false,
    "hasUnderconfidenceFlag" BOOLEAN NOT NULL DEFAULT false,
    "multiContextReviewCount" INTEGER NOT NULL DEFAULT 0,
    "contextSwitchAccuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextPerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiContextReviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL DEFAULT 'drift_remediation',
    "categoryIds" TEXT[],
    "cardsReviewed" INTEGER NOT NULL DEFAULT 0,
    "overallAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contextSwitchAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driftResolved" INTEGER NOT NULL DEFAULT 0,
    "newDriftDetected" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MultiContextReviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContextualAnnotation_cardId_idx" ON "ContextualAnnotation"("cardId");

-- CreateIndex
CREATE INDEX "ContextualAnnotation_categoryId_idx" ON "ContextualAnnotation"("categoryId");

-- CreateIndex
CREATE INDEX "ContextualAnnotation_participationId_idx" ON "ContextualAnnotation"("participationId");

-- CreateIndex
CREATE INDEX "ContextualAnnotation_annotationType_idx" ON "ContextualAnnotation"("annotationType");

-- CreateIndex
CREATE INDEX "ContextualAnnotation_isVisible_idx" ON "ContextualAnnotation"("isVisible");

-- CreateIndex
CREATE INDEX "ContextualAnnotation_importance_idx" ON "ContextualAnnotation"("importance");

-- CreateIndex
CREATE UNIQUE INDEX "ContextualAnnotation_cardId_categoryId_version_key" ON "ContextualAnnotation"("cardId", "categoryId", "version");

-- CreateIndex
CREATE INDEX "EmphasisRule_categoryId_idx" ON "EmphasisRule"("categoryId");

-- CreateIndex
CREATE INDEX "EmphasisRule_ruleType_idx" ON "EmphasisRule"("ruleType");

-- CreateIndex
CREATE INDEX "EmphasisRule_isEnabled_idx" ON "EmphasisRule"("isEnabled");

-- CreateIndex
CREATE INDEX "EmphasisRule_priority_idx" ON "EmphasisRule"("priority");

-- CreateIndex
CREATE INDEX "ContextPerformanceRecord_userId_idx" ON "ContextPerformanceRecord"("userId");

-- CreateIndex
CREATE INDEX "ContextPerformanceRecord_cardId_idx" ON "ContextPerformanceRecord"("cardId");

-- CreateIndex
CREATE INDEX "ContextPerformanceRecord_categoryId_idx" ON "ContextPerformanceRecord"("categoryId");

-- CreateIndex
CREATE INDEX "ContextPerformanceRecord_hasDriftWarning_idx" ON "ContextPerformanceRecord"("hasDriftWarning");

-- CreateIndex
CREATE INDEX "ContextPerformanceRecord_accuracyTrend_idx" ON "ContextPerformanceRecord"("accuracyTrend");

-- CreateIndex
CREATE UNIQUE INDEX "ContextPerformanceRecord_cardId_categoryId_key" ON "ContextPerformanceRecord"("cardId", "categoryId");

-- CreateIndex
CREATE INDEX "MultiContextReviewSession_userId_idx" ON "MultiContextReviewSession"("userId");

-- CreateIndex
CREATE INDEX "MultiContextReviewSession_sessionType_idx" ON "MultiContextReviewSession"("sessionType");

-- CreateIndex
CREATE INDEX "MultiContextReviewSession_startedAt_idx" ON "MultiContextReviewSession"("startedAt");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_emphasisLevel_idx" ON "CardCategoryParticipation"("emphasisLevel");

-- CreateIndex
CREATE INDEX "Category_interpretationPriority_idx" ON "Category"("interpretationPriority");

-- AddForeignKey
ALTER TABLE "ContextualAnnotation" ADD CONSTRAINT "ContextualAnnotation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextualAnnotation" ADD CONSTRAINT "ContextualAnnotation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextualAnnotation" ADD CONSTRAINT "ContextualAnnotation_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "CardCategoryParticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmphasisRule" ADD CONSTRAINT "EmphasisRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextPerformanceRecord" ADD CONSTRAINT "ContextPerformanceRecord_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextPerformanceRecord" ADD CONSTRAINT "ContextPerformanceRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiContextReviewSession" ADD CONSTRAINT "MultiContextReviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
