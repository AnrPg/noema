-- AlterTable
ALTER TABLE "CardCategoryParticipation" ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "avgResponseTimeMs" INTEGER,
ADD COLUMN     "belongsBecause" TEXT,
ADD COLUMN     "confidenceRating" DOUBLE PRECISION,
ADD COLUMN     "contextLapseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "contextMasteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "contextSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "customPrompts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "intentOverride" TEXT,
ADD COLUMN     "positionInCategory" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priorityWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "provenanceRef" TEXT,
ADD COLUMN     "provenanceType" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "scaffoldingLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SynthesisPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "triggerType" TEXT NOT NULL,
    "triggerDetails" JSONB,
    "promptType" TEXT NOT NULL DEFAULT 'connection',
    "promptText" TEXT NOT NULL,
    "alternativePrompts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shownAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "deferredUntil" TIMESTAMP(3),
    "timesShown" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SynthesisPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SynthesisResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "participationId" TEXT,
    "responseText" TEXT NOT NULL,
    "responseData" JSONB,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "hasConnections" BOOLEAN NOT NULL DEFAULT false,
    "createdNoteId" TEXT,
    "createdBridgeCardDraftId" TEXT,
    "updatedParticipationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selfRating" INTEGER,
    "aiQualityScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SynthesisResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SynthesisNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "content" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'connection',
    "keyTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referencedCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceType" TEXT NOT NULL DEFAULT 'synthesis_prompt',
    "sourceId" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "showDuringReview" BOOLEAN NOT NULL DEFAULT true,
    "qualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SynthesisNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeType" TEXT NOT NULL,
    "sourceCardId" TEXT,
    "sourceCategoryId" TEXT,
    "targetCardId" TEXT,
    "targetCategoryId" TEXT,
    "cardId" TEXT NOT NULL,
    "bridgeQuestion" TEXT NOT NULL,
    "bridgeAnswer" TEXT NOT NULL,
    "isBidirectional" BOOLEAN NOT NULL DEFAULT true,
    "reverseQuestion" TEXT,
    "reverseAnswer" TEXT,
    "connectionType" TEXT NOT NULL DEFAULT 'relates_to',
    "connectionStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "connectionDescription" TEXT,
    "frequencyMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "surfaceTrigger" TEXT NOT NULL DEFAULT 'related_card_review',
    "minGapReviews" INTEGER NOT NULL DEFAULT 3,
    "createdFrom" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "isUserConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCardSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeType" TEXT NOT NULL,
    "sourceCardId" TEXT,
    "sourceCategoryId" TEXT,
    "targetCardId" TEXT,
    "targetCategoryId" TEXT,
    "suggestedQuestion" TEXT NOT NULL,
    "suggestedAnswer" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rationale" TEXT NOT NULL,
    "suggestionSource" TEXT NOT NULL,
    "suggestionDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdBridgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeCardSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossContextQuiz" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "quizType" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "answeredAt" TIMESTAMP(3),
    "responseTimeMs" INTEGER,
    "insightType" TEXT,
    "insightDetails" JSONB,
    "triggeredActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossContextQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceDivergence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "bestContextId" TEXT NOT NULL,
    "bestAccuracy" DOUBLE PRECISION NOT NULL,
    "worstContextId" TEXT NOT NULL,
    "worstAccuracy" DOUBLE PRECISION NOT NULL,
    "performanceSpread" DOUBLE PRECISION NOT NULL,
    "contextRankings" JSONB NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'mild',
    "possibleCauses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "actionsTaken" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PerformanceDivergence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcosystemLkgcMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ecosystem_to_lkgc',
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "sourceStateHash" TEXT,
    "targetStateHash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcosystemLkgcMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcosystemSyncEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "mappingId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcosystemSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SynthesisPrompt_userId_idx" ON "SynthesisPrompt"("userId");

-- CreateIndex
CREATE INDEX "SynthesisPrompt_cardId_idx" ON "SynthesisPrompt"("cardId");

-- CreateIndex
CREATE INDEX "SynthesisPrompt_status_idx" ON "SynthesisPrompt"("status");

-- CreateIndex
CREATE INDEX "SynthesisPrompt_triggerType_idx" ON "SynthesisPrompt"("triggerType");

-- CreateIndex
CREATE INDEX "SynthesisPrompt_promptType_idx" ON "SynthesisPrompt"("promptType");

-- CreateIndex
CREATE INDEX "SynthesisPrompt_createdAt_idx" ON "SynthesisPrompt"("createdAt");

-- CreateIndex
CREATE INDEX "SynthesisResponse_userId_idx" ON "SynthesisResponse"("userId");

-- CreateIndex
CREATE INDEX "SynthesisResponse_promptId_idx" ON "SynthesisResponse"("promptId");

-- CreateIndex
CREATE INDEX "SynthesisResponse_participationId_idx" ON "SynthesisResponse"("participationId");

-- CreateIndex
CREATE INDEX "SynthesisResponse_createdAt_idx" ON "SynthesisResponse"("createdAt");

-- CreateIndex
CREATE INDEX "SynthesisNote_userId_idx" ON "SynthesisNote"("userId");

-- CreateIndex
CREATE INDEX "SynthesisNote_cardId_idx" ON "SynthesisNote"("cardId");

-- CreateIndex
CREATE INDEX "SynthesisNote_noteType_idx" ON "SynthesisNote"("noteType");

-- CreateIndex
CREATE INDEX "SynthesisNote_createdAt_idx" ON "SynthesisNote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCard_cardId_key" ON "BridgeCard"("cardId");

-- CreateIndex
CREATE INDEX "BridgeCard_userId_idx" ON "BridgeCard"("userId");

-- CreateIndex
CREATE INDEX "BridgeCard_cardId_idx" ON "BridgeCard"("cardId");

-- CreateIndex
CREATE INDEX "BridgeCard_sourceCardId_idx" ON "BridgeCard"("sourceCardId");

-- CreateIndex
CREATE INDEX "BridgeCard_targetCardId_idx" ON "BridgeCard"("targetCardId");

-- CreateIndex
CREATE INDEX "BridgeCard_sourceCategoryId_idx" ON "BridgeCard"("sourceCategoryId");

-- CreateIndex
CREATE INDEX "BridgeCard_targetCategoryId_idx" ON "BridgeCard"("targetCategoryId");

-- CreateIndex
CREATE INDEX "BridgeCard_bridgeType_idx" ON "BridgeCard"("bridgeType");

-- CreateIndex
CREATE INDEX "BridgeCard_status_idx" ON "BridgeCard"("status");

-- CreateIndex
CREATE INDEX "BridgeCard_createdAt_idx" ON "BridgeCard"("createdAt");

-- CreateIndex
CREATE INDEX "BridgeCardSuggestion_userId_idx" ON "BridgeCardSuggestion"("userId");

-- CreateIndex
CREATE INDEX "BridgeCardSuggestion_status_idx" ON "BridgeCardSuggestion"("status");

-- CreateIndex
CREATE INDEX "BridgeCardSuggestion_confidence_idx" ON "BridgeCardSuggestion"("confidence");

-- CreateIndex
CREATE INDEX "BridgeCardSuggestion_createdAt_idx" ON "BridgeCardSuggestion"("createdAt");

-- CreateIndex
CREATE INDEX "CrossContextQuiz_userId_idx" ON "CrossContextQuiz"("userId");

-- CreateIndex
CREATE INDEX "CrossContextQuiz_cardId_idx" ON "CrossContextQuiz"("cardId");

-- CreateIndex
CREATE INDEX "CrossContextQuiz_quizType_idx" ON "CrossContextQuiz"("quizType");

-- CreateIndex
CREATE INDEX "CrossContextQuiz_isCorrect_idx" ON "CrossContextQuiz"("isCorrect");

-- CreateIndex
CREATE INDEX "CrossContextQuiz_createdAt_idx" ON "CrossContextQuiz"("createdAt");

-- CreateIndex
CREATE INDEX "PerformanceDivergence_userId_idx" ON "PerformanceDivergence"("userId");

-- CreateIndex
CREATE INDEX "PerformanceDivergence_cardId_idx" ON "PerformanceDivergence"("cardId");

-- CreateIndex
CREATE INDEX "PerformanceDivergence_severity_idx" ON "PerformanceDivergence"("severity");

-- CreateIndex
CREATE INDEX "PerformanceDivergence_status_idx" ON "PerformanceDivergence"("status");

-- CreateIndex
CREATE INDEX "PerformanceDivergence_detectedAt_idx" ON "PerformanceDivergence"("detectedAt");

-- CreateIndex
CREATE INDEX "EcosystemLkgcMapping_userId_idx" ON "EcosystemLkgcMapping"("userId");

-- CreateIndex
CREATE INDEX "EcosystemLkgcMapping_sourceType_sourceId_idx" ON "EcosystemLkgcMapping"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "EcosystemLkgcMapping_targetType_targetId_idx" ON "EcosystemLkgcMapping"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "EcosystemLkgcMapping_status_idx" ON "EcosystemLkgcMapping"("status");

-- CreateIndex
CREATE INDEX "EcosystemLkgcMapping_direction_idx" ON "EcosystemLkgcMapping"("direction");

-- CreateIndex
CREATE UNIQUE INDEX "EcosystemLkgcMapping_userId_sourceType_sourceId_targetType_key" ON "EcosystemLkgcMapping"("userId", "sourceType", "sourceId", "targetType");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_userId_idx" ON "EcosystemSyncEvent"("userId");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_eventType_idx" ON "EcosystemSyncEvent"("eventType");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_sourceType_sourceId_idx" ON "EcosystemSyncEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_targetType_targetId_idx" ON "EcosystemSyncEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_mappingId_idx" ON "EcosystemSyncEvent"("mappingId");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_timestamp_idx" ON "EcosystemSyncEvent"("timestamp");

-- CreateIndex
CREATE INDEX "EcosystemSyncEvent_success_idx" ON "EcosystemSyncEvent"("success");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_semanticRole_idx" ON "CardCategoryParticipation"("semanticRole");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_contextMasteryScore_idx" ON "CardCategoryParticipation"("contextMasteryScore");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_provenanceType_idx" ON "CardCategoryParticipation"("provenanceType");

-- AddForeignKey
ALTER TABLE "SynthesisPrompt" ADD CONSTRAINT "SynthesisPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisPrompt" ADD CONSTRAINT "SynthesisPrompt_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisResponse" ADD CONSTRAINT "SynthesisResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisResponse" ADD CONSTRAINT "SynthesisResponse_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "SynthesisPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisResponse" ADD CONSTRAINT "SynthesisResponse_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "CardCategoryParticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisNote" ADD CONSTRAINT "SynthesisNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisNote" ADD CONSTRAINT "SynthesisNote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_sourceCardId_fkey" FOREIGN KEY ("sourceCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_targetCardId_fkey" FOREIGN KEY ("targetCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCard" ADD CONSTRAINT "BridgeCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCardSuggestion" ADD CONSTRAINT "BridgeCardSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCardSuggestion" ADD CONSTRAINT "BridgeCardSuggestion_sourceCardId_fkey" FOREIGN KEY ("sourceCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCardSuggestion" ADD CONSTRAINT "BridgeCardSuggestion_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCardSuggestion" ADD CONSTRAINT "BridgeCardSuggestion_targetCardId_fkey" FOREIGN KEY ("targetCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCardSuggestion" ADD CONSTRAINT "BridgeCardSuggestion_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossContextQuiz" ADD CONSTRAINT "CrossContextQuiz_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossContextQuiz" ADD CONSTRAINT "CrossContextQuiz_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDivergence" ADD CONSTRAINT "PerformanceDivergence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDivergence" ADD CONSTRAINT "PerformanceDivergence_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDivergence" ADD CONSTRAINT "PerformanceDivergence_bestContextId_fkey" FOREIGN KEY ("bestContextId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDivergence" ADD CONSTRAINT "PerformanceDivergence_worstContextId_fkey" FOREIGN KEY ("worstContextId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
