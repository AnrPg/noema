-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framingQuestion" TEXT,
    "iconEmoji" TEXT,
    "color" TEXT,
    "coverImageUrl" TEXT,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learningIntent" TEXT NOT NULL DEFAULT 'foundational',
    "depthGoal" TEXT NOT NULL DEFAULT 'recall',
    "difficultyMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "decayRateMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maturityStage" TEXT NOT NULL DEFAULT 'acquisition',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastStudiedAt" TIMESTAMP(3),
    "totalStudyTime" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRelation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceCategoryId" TEXT NOT NULL,
    "targetCategoryId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isDirectional" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "isAutoSuggested" BOOLEAN NOT NULL DEFAULT false,
    "isUserConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardCategoryParticipation" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "semanticRole" TEXT NOT NULL DEFAULT 'concept',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "contextDifficulty" DOUBLE PRECISION,
    "contextMastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCountInContext" INTEGER NOT NULL DEFAULT 0,
    "contextNotes" TEXT,
    "contextTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learningGoal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardCategoryParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardContextFace" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "frontOverride" JSONB,
    "backOverride" JSONB,
    "promptOverride" TEXT,
    "timesShown" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardContextFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryLearningMode" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "modeName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "questionStyle" TEXT NOT NULL DEFAULT 'standard',
    "difficultyBias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryLearningMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryEvolutionEvent" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "relatedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryEvolutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLearningFlow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentMode" TEXT NOT NULL DEFAULT 'exploration',
    "goalCategoryId" TEXT,
    "goalDeadline" TIMESTAMP(3),
    "goalProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "examCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examDate" TIMESTAMP(3),
    "examPriority" TEXT NOT NULL DEFAULT 'breadth',
    "synthesisCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeLens" TEXT NOT NULL DEFAULT 'structure',
    "complexityLevel" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLearningFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconEmoji" TEXT,
    "color" TEXT,
    "queryType" TEXT NOT NULL DEFAULT 'category',
    "includeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeSubcategories" BOOLEAN NOT NULL DEFAULT true,
    "stateFilter" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagFilter" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficultyRange" JSONB,
    "sortBy" TEXT NOT NULL DEFAULT 'due_date',
    "sortOrder" TEXT NOT NULL DEFAULT 'asc',
    "maxCards" INTEGER,
    "cachedCardCount" INTEGER NOT NULL DEFAULT 0,
    "cacheUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suggestedName" TEXT NOT NULL,
    "suggestedDescription" TEXT,
    "detectedTheme" TEXT,
    "cardIds" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategorySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_path_idx" ON "Category"("path");

-- CreateIndex
CREATE INDEX "Category_maturityStage_idx" ON "Category"("maturityStage");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_parentId_key" ON "Category"("userId", "name", "parentId");

-- CreateIndex
CREATE INDEX "CategoryRelation_sourceCategoryId_idx" ON "CategoryRelation"("sourceCategoryId");

-- CreateIndex
CREATE INDEX "CategoryRelation_targetCategoryId_idx" ON "CategoryRelation"("targetCategoryId");

-- CreateIndex
CREATE INDEX "CategoryRelation_relationType_idx" ON "CategoryRelation"("relationType");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRelation_sourceCategoryId_targetCategoryId_relation_key" ON "CategoryRelation"("sourceCategoryId", "targetCategoryId", "relationType");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_cardId_idx" ON "CardCategoryParticipation"("cardId");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_categoryId_idx" ON "CardCategoryParticipation"("categoryId");

-- CreateIndex
CREATE INDEX "CardCategoryParticipation_isPrimary_idx" ON "CardCategoryParticipation"("isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "CardCategoryParticipation_cardId_categoryId_key" ON "CardCategoryParticipation"("cardId", "categoryId");

-- CreateIndex
CREATE INDEX "CardContextFace_cardId_idx" ON "CardContextFace"("cardId");

-- CreateIndex
CREATE INDEX "CardContextFace_categoryId_idx" ON "CardContextFace"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CardContextFace_cardId_categoryId_key" ON "CardContextFace"("cardId", "categoryId");

-- CreateIndex
CREATE INDEX "CategoryLearningMode_categoryId_idx" ON "CategoryLearningMode"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLearningMode_categoryId_modeName_key" ON "CategoryLearningMode"("categoryId", "modeName");

-- CreateIndex
CREATE INDEX "CategoryEvolutionEvent_categoryId_idx" ON "CategoryEvolutionEvent"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryEvolutionEvent_userId_idx" ON "CategoryEvolutionEvent"("userId");

-- CreateIndex
CREATE INDEX "CategoryEvolutionEvent_eventType_idx" ON "CategoryEvolutionEvent"("eventType");

-- CreateIndex
CREATE INDEX "CategoryEvolutionEvent_createdAt_idx" ON "CategoryEvolutionEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserLearningFlow_userId_key" ON "UserLearningFlow"("userId");

-- CreateIndex
CREATE INDEX "UserLearningFlow_userId_idx" ON "UserLearningFlow"("userId");

-- CreateIndex
CREATE INDEX "DynamicDeck_userId_idx" ON "DynamicDeck"("userId");

-- CreateIndex
CREATE INDEX "CategorySuggestion_userId_idx" ON "CategorySuggestion"("userId");

-- CreateIndex
CREATE INDEX "CategorySuggestion_status_idx" ON "CategorySuggestion"("status");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRelation" ADD CONSTRAINT "CategoryRelation_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRelation" ADD CONSTRAINT "CategoryRelation_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCategoryParticipation" ADD CONSTRAINT "CardCategoryParticipation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCategoryParticipation" ADD CONSTRAINT "CardCategoryParticipation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardContextFace" ADD CONSTRAINT "CardContextFace_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardContextFace" ADD CONSTRAINT "CardContextFace_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryLearningMode" ADD CONSTRAINT "CategoryLearningMode_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvolutionEvent" ADD CONSTRAINT "CategoryEvolutionEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLearningFlow" ADD CONSTRAINT "UserLearningFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicDeck" ADD CONSTRAINT "DynamicDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySuggestion" ADD CONSTRAINT "CategorySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
