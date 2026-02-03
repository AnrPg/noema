// =============================================================================
// REVIEW PLANNER SERVICE
// =============================================================================
// Main service for policy-based review candidate ranking.
// This service integrates with the database, mode runtime, and policy composer
// to provide a complete review planning solution.
//
// IMPORTANT: This service does NOT modify FSRS/HLR scheduler data.
// It only influences the ORDER in which review candidates are presented.
// =============================================================================

import type {
  PrismaClient,
  Card,
  Category,
  CardCategoryParticipation,
} from "@prisma/client";
import type {
  CardId,
  CategoryId,
  LearningModeId,
  Timestamp,
  Duration,
  NormalizedValue,
  Confidence,
  ReviewPolicyId,
  ReviewPolicy,
  SchedulerCandidateOutput,
  PolicyRankedCandidate,
  PolicyExecutionContext,
  ReviewPlannerRequest,
  ReviewPlannerResponse,
  PolicyExecutionResult,
  SessionRecommendations,
  ModeRuntimeState,
  ModeDefinition,
  LkgcSignalType,
  LkgcSignalValue,
  LkgcSignalSnapshot,
  SystemModeType,
  CategoryMetadataForPolicy,
  PolicyChainId,
} from "@manthanein/shared";
import { createModeActivationId } from "@manthanein/shared";

import type { ReviewPlannerServiceConfig, CompositionResult } from "./types.js";

import { DEFAULT_REVIEW_PLANNER_CONFIG, now } from "./types.js";

import { PolicyComposer } from "./policy-composer.js";
import {
  BaseUrgencyPolicy,
  ModeModifierPolicy,
  CategoryHookPolicy,
  ExamCramPolicy,
  ExplorationPolicy,
  LkgcSignalPolicy,
  StructuralPolicy,
} from "./policies/index.js";

// =============================================================================
// TYPES
// =============================================================================

/** Card with category participation relations */
type CardWithRelations = Card & {
  categoryParticipations: (CardCategoryParticipation & {
    category: Category;
  })[];
};

/**
 * Type for category data with scheduling fields accessed safely.
 * Prisma's Category already has: depth, path, difficultyMultiplier, decayRateMultiplier, cardCount
 * We need to cast to this when accessing additional computed/optional fields.
 */
type CategorySchedulingFields = {
  depth: number;
  path: string[];
  difficultyMultiplier: number;
  decayRateMultiplier: number;
  cardCount: number;
  schedulingMetadata?: {
    examDeadline?: Date | null;
    examWeight?: number | null;
  } | null;
};

// =============================================================================
// SERVICE SINGLETON
// =============================================================================

let serviceInstance: ReviewPlannerService | null = null;

/**
 * Get the singleton instance of ReviewPlannerService.
 */
export function getReviewPlannerService(
  prisma: PrismaClient,
  config?: Partial<ReviewPlannerServiceConfig>,
): ReviewPlannerService {
  if (!serviceInstance) {
    serviceInstance = new ReviewPlannerService(prisma, config);
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetReviewPlannerService(): void {
  serviceInstance = null;
}

// =============================================================================
// REVIEW PLANNER SERVICE
// =============================================================================

/**
 * ReviewPlannerService provides policy-based ranking of review candidates.
 *
 * Usage:
 * ```ts
 * const service = getReviewPlannerService(prisma);
 *
 * const response = await service.planReview({
 *   userId: "user_123",
 *   modeId: "system:goal_driven",
 *   maxCandidates: 50,
 *   requestedAt: Date.now() as Timestamp,
 * });
 *
 * const topCards = response.candidates.slice(0, 10);
 * ```
 */
export class ReviewPlannerService {
  private readonly prisma: PrismaClient;
  private readonly config: ReviewPlannerServiceConfig;
  private readonly composer: PolicyComposer;

  // Simple cache for ranking results
  private readonly cache = new Map<
    string,
    {
      response: ReviewPlannerResponse;
      expiresAt: number;
    }
  >();

  constructor(
    prisma: PrismaClient,
    config: Partial<ReviewPlannerServiceConfig> = {},
  ) {
    this.prisma = prisma;
    this.config = { ...DEFAULT_REVIEW_PLANNER_CONFIG, ...config };

    // Initialize policy composer
    this.composer = new PolicyComposer();

    // Register built-in policies
    this.registerBuiltInPolicies();
  }

  // ===========================================================================
  // POLICY REGISTRATION
  // ===========================================================================

  /**
   * Register built-in policies.
   */
  private registerBuiltInPolicies(): void {
    // Core policies (always active)
    this.composer.registerPolicy(new BaseUrgencyPolicy());
    this.composer.registerPolicy(new CategoryHookPolicy());
    this.composer.registerPolicy(new LkgcSignalPolicy());
    this.composer.registerPolicy(new StructuralPolicy());

    // Mode-specific policies
    this.composer.registerPolicy(new ExamCramPolicy());
    this.composer.registerPolicy(new ExplorationPolicy());

    // Mode modifier (requires mode ID, so we create a generic one)
    // Mode-specific modifiers will be applied via context
    this.composer.registerPolicy(
      new ModeModifierPolicy("system:default" as LearningModeId),
    );
  }

  /**
   * Register a custom policy.
   */
  registerPolicy(policy: ReviewPolicy): void {
    this.composer.registerPolicy(policy);
    this.clearCache();
  }

  /**
   * Get registered policy IDs.
   */
  getRegisteredPolicies(): ReviewPolicyId[] {
    return this.composer.getRegisteredPolicies();
  }

  // ===========================================================================
  // MAIN API
  // ===========================================================================

  /**
   * Plan a review session by ranking candidates.
   *
   * This is the main entry point for the review planner.
   * It fetches candidates from the database, applies policies,
   * and returns ranked candidates with recommendations.
   */
  async planReview(
    request: ReviewPlannerRequest,
  ): Promise<ReviewPlannerResponse> {
    const _startTime = Date.now(); // Kept for potential future timing use

    try {
      // 1. Check cache
      const cacheKey = this.buildCacheKey(request);
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }

      // 2. Fetch candidates from database
      const candidates = await this.fetchCandidates(request);

      if (candidates.length === 0) {
        return this.buildEmptyResponse(request);
      }

      // 3. Build execution context
      const context = await this.buildExecutionContext(request);

      // 4. Run policy composition
      const compositionResult = await this.composer.compose(
        candidates,
        context,
      );

      // 5. Build response
      const response = this.buildResponse(request, compositionResult);

      // 6. Cache response
      this.cacheResponse(cacheKey, response);

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        candidates: [],
        executionResult: this.buildEmptyExecutionResult(request),
        sessionRecommendations: this.buildEmptyRecommendations(),
        generatedAt: now(),
        ttlMs: 0 as Duration,
      };
    }
  }

  /**
   * Get the top N candidates for a review session.
   */
  async getTopCandidates(
    request: ReviewPlannerRequest,
    count: number = 10,
  ): Promise<PolicyRankedCandidate[]> {
    const response = await this.planReview(request);
    return response.candidates.slice(0, count);
  }

  /**
   * Explain why a specific card received its ranking.
   */
  async explainCardRanking(
    request: ReviewPlannerRequest,
    cardId: CardId,
  ): Promise<{
    card: PolicyRankedCandidate | null;
    rank: number;
    totalCandidates: number;
    explanation: string[];
  }> {
    const response = await this.planReview(request);

    const cardIndex = response.candidates.findIndex((c) => c.cardId === cardId);

    if (cardIndex === -1) {
      return {
        card: null,
        rank: -1,
        totalCandidates: response.candidates.length,
        explanation: ["Card not found in current ranking candidates."],
      };
    }

    const card = response.candidates[cardIndex];
    const explanation: string[] = [];

    // Build explanation from factors
    explanation.push(
      `Card ranked #${card.ranking.position} of ${response.candidates.length} candidates.`,
    );
    explanation.push(`Urgency level: ${card.ranking.urgencyLevel}`);
    explanation.push(`Recommendation: ${card.ranking.recommendation}`);

    // Add top contributing factors
    const sortedFactors = [...card.factors].sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
    );

    explanation.push("\nTop contributing factors:");
    for (const factor of sortedFactors.slice(0, 5)) {
      const direction = factor.contribution > 0 ? "+" : "";
      explanation.push(
        `  - ${factor.name}: ${direction}${factor.contribution.toFixed(3)} (${factor.impactDescription})`,
      );
    }

    // Add policy contributions
    explanation.push("\nPolicy contributions:");
    for (const contrib of card.policyContributions) {
      explanation.push(
        `  - ${contrib.policyName}: ${contrib.contribution.toFixed(3)} (weight: ${contrib.weight})`,
      );
    }

    return {
      card,
      rank: cardIndex + 1,
      totalCandidates: response.candidates.length,
      explanation,
    };
  }

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  /**
   * Fetch review candidates from the database.
   */
  private async fetchCandidates(
    request: ReviewPlannerRequest,
  ): Promise<SchedulerCandidateOutput[]> {
    const maxCandidates = request.maxCandidates ?? this.config.maxCandidates;

    // Fetch cards due for review
    const cards = await this.prisma.card.findMany({
      where: {
        deck: {
          userId: request.userId,
        },
        ...(request.categoryFilter && {
          categoryParticipations: {
            some: {
              categoryId: request.categoryFilter,
            },
          },
        }),
        OR: [
          { state: "new" },
          { state: "learning" },
          { state: "relearning" },
          {
            state: "review",
            nextReviewDate: { lte: new Date() },
          },
        ],
      },
      take: maxCandidates,
      include: {
        categoryParticipations: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        nextReviewDate: "asc",
      },
    });

    // Convert to SchedulerCandidateOutput
    return cards.map((card) => this.convertToSchedulerCandidate(card));
  }

  /**
   * Convert a database card to SchedulerCandidateOutput.
   */
  private convertToSchedulerCandidate(
    card: CardWithRelations,
  ): SchedulerCandidateOutput {
    // Get primary category
    const primaryCategory = card.categoryParticipations?.[0]?.category;

    // Build scheduler data
    const schedulerData = {
      dueDate: card.nextReviewDate ?? new Date(),
      stability: card.stability ?? 1.0,
      difficulty: card.difficulty ?? 5.0,
      retrievability: this.calculateRetrievability(
        card.nextReviewDate,
        card.stability ?? 1.0,
      ),
      elapsedDays: card.elapsedDays ?? 0,
      scheduledDays: card.scheduledDays ?? 1,
      state: (card.state ?? "new") as
        | "new"
        | "learning"
        | "review"
        | "relearning",
      halfLife: card.halfLife ?? undefined,
      lastRating: null as "again" | "hard" | "good" | "easy" | null,
      lastReviewDate: card.lastReviewDate ?? null,
    };

    // Build LKGC signals (placeholder - would come from LKGC service)
    const lkgcSignals: Partial<Record<LkgcSignalType, LkgcSignalValue>> = {};

    // Build category metadata if available
    let categoryMetadata: CategoryMetadataForPolicy | undefined;
    if (primaryCategory) {
      // Category from Prisma already has the scheduling fields we need
      const cat = primaryCategory as Category & CategorySchedulingFields;
      categoryMetadata = {
        categoryId: cat.id as CategoryId,
        name: cat.name,
        depth: cat.depth,
        path: cat.path,
        difficultyMultiplier: cat.difficultyMultiplier,
        decayMultiplier: cat.decayRateMultiplier, // Prisma uses decayRateMultiplier
        volatilityFactor: 1.0, // Not stored in DB, default to 1.0
        cardCount: cat.cardCount,
        prerequisiteCount: 0, // Would need to query CategoryRelation
        dependentCount: 0, // Would need to query CategoryRelation
        hasUnmetPrerequisites: false, // Would need to check prerequisites
        userMastery: 0.5 as NormalizedValue, // Would need to fetch from mastery service
        masteryConfidence: 0.5 as Confidence,
        lastActivityAt: undefined,
        // Exam data would come from schedulingMetadata relation
        examDeadline: cat.schedulingMetadata?.examDeadline
          ? (cat.schedulingMetadata.examDeadline.getTime() as Timestamp)
          : undefined,
        examWeight: (cat.schedulingMetadata?.examWeight ?? undefined) as
          | NormalizedValue
          | undefined,
      };
    }

    return {
      cardId: card.id as CardId,
      participationId: undefined,
      categoryId: primaryCategory?.id as CategoryId | undefined,
      schedulerData,
      lkgcSignals,
      categoryMetadata,
    };
  }

  /**
   * Calculate retrievability based on due date and stability.
   */
  private calculateRetrievability(
    dueDate: Date | null,
    stability: number,
  ): number {
    if (!dueDate) return 1.0;

    const now = Date.now();
    const dueDateMs = dueDate.getTime();
    const daysSinceDue = (now - dueDateMs) / (1000 * 60 * 60 * 24);

    if (daysSinceDue <= 0) {
      // Not yet due
      return Math.min(1.0, 0.9 + 0.1 * (1 - daysSinceDue / stability));
    }

    // Forgetting curve: R = e^(-t/S)
    return Math.exp(-daysSinceDue / stability);
  }

  // ===========================================================================
  // CONTEXT BUILDING
  // ===========================================================================

  /**
   * Build policy execution context from request.
   */
  private async buildExecutionContext(
    request: ReviewPlannerRequest,
  ): Promise<PolicyExecutionContext> {
    // Build a minimal mode runtime state
    // In production, this would come from the ModeService
    const modeRuntimeState = this.buildMockModeRuntimeState(request);

    // Build user LKGC snapshot (placeholder)
    const userLkgcSnapshot: Partial<Record<LkgcSignalType, LkgcSignalValue>> =
      {};

    return {
      userId: request.userId,
      modeRuntimeState,
      now: now(),
      timeBudget: request.timeBudget,
      targetCardCount: request.maxCandidates,
      categoryFilter: request.categoryFilter,
      reviewedThisSession: [],
      sessionStartedAt: now(),
      examDeadline: undefined, // Would come from category metadata
      modeParameters: request.modeParameterOverrides ?? {},
      userLkgcSnapshot,
    };
  }

  /**
   * Build a mock ModeRuntimeState for the execution context.
   * In production, this would come from the ModeService.
   */
  private buildMockModeRuntimeState(
    request: ReviewPlannerRequest,
  ): ModeRuntimeState {
    const currentTime = now();

    // Create a minimal ModeDefinition stub.
    // In production, this would be fetched from the ModeService.
    const systemType = this.getSystemModeType(request.modeId);
    const modeDefinition: ModeDefinition = {
      id: request.modeId,
      name: this.getModeDisplayName(request.modeId),
      description: `${request.modeId} learning mode`,
      tagline: "Learn effectively",
      icon: "📚",
      systemType: systemType || undefined,
      source: "system" as const,
      version: "1.0.0",
      parameterSchema: { parameters: [], uiGroups: [] },
      defaultParameters: {},
      // Policy-related fields - booleans indicating which policies are affected
      affectedPolicies: {
        navigation: false,
        reviewSelection: true,
        cardOrdering: true,
        newCardIntroduction: false,
        metacognitivePrompts: false,
        synthesisTriggers: false,
        schedulingParameters: false,
        uiEmphasis: false,
        categoryBehavior: false,
      },
      consumedLkgcSignals: [],
      amplifiedLkgcSignals: [],
      // UI hints
      uiEmphasis: {
        pressureLevel: 0.5 as NormalizedValue,
        showTimer: false,
        showProgress: true,
        showStreaks: false,
        showEstimates: true,
        showOverdueIndicators: true,
        showProgressMeters: true,
        showTimePressure: false,
        showDiscoveryPrompts: false,
        showSynthesisPrompts: false,
        showMetacognitiveSignals: false,
        coverageVsDepth: 0, // balanced
        cardDisplayDensity: "normal" as const,
        cardTransitionSpeed: "normal" as const,
        feedbackDetail: "standard" as const,
      },
      suggestedViewLens: "structure" as const,
      // Metadata
      enabledByDefault: true,
      supportsCategoryDefault: true,
      supportsSessionOverride: true,
      requiredCapabilities: [],
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    // Build the LKGC snapshot
    const lkgcSnapshot: LkgcSignalSnapshot = {
      timestamp: currentTime,
      snapshotAt: currentTime,
      signals: {},
      userContext: {
        userId: request.userId,
        overallMastery: 0.5 as NormalizedValue,
        activeStreakDays: 0,
        recentReviewCount: 0,
      },
    };

    // Build activation record
    const activation = {
      id: createModeActivationId(`activation_${currentTime}`),
      userId: request.userId,
      modeId: request.modeId,
      scope: "global" as const,
      activatedAt: currentTime,
      parameterOverrides: request.modeParameterOverrides ?? {},
      isActive: true,
      priority: 0,
    };

    // Build scope context
    const scopeContext = {
      scope: "global" as const,
      categoryId: request.categoryFilter,
      startedAt: currentTime,
    };

    return {
      // Required fields per ModeRuntimeState interface
      modeId: request.modeId,
      definition: modeDefinition,
      activation,
      scopeContext,
      lkgcSnapshot,
      // Convenience aliases
      activeModeDefinition: modeDefinition,
      resolvedParameters: request.modeParameterOverrides ?? {},
      // activeLkgcSignals is optional and expects a Map - we leave it undefined
    };
  }

  /**
   * Get display name for a mode ID.
   */
  private getModeDisplayName(modeId: LearningModeId): string {
    const names: Record<string, string> = {
      "system:exploration": "Exploration Mode",
      "system:goal_driven": "Goal-Driven Mode",
      "system:exam_oriented": "Exam Preparation Mode",
      "system:synthesis": "Synthesis Mode",
      "system:default": "Standard Mode",
    };
    return names[modeId] ?? "Learning Mode";
  }

  /**
   * Get system mode type from mode ID.
   */
  private getSystemModeType(modeId: LearningModeId): SystemModeType | null {
    const systemTypes: SystemModeType[] = [
      "exploration",
      "goal_driven",
      "exam_oriented",
      "synthesis",
    ];
    if (modeId.startsWith("system:")) {
      const type = modeId.replace("system:", "");
      if (systemTypes.includes(type as SystemModeType)) {
        return type as SystemModeType;
      }
    }
    return null;
  }

  // ===========================================================================
  // RESPONSE BUILDING
  // ===========================================================================

  /**
   * Build the full response from composition result.
   */
  private buildResponse(
    request: ReviewPlannerRequest,
    result: CompositionResult,
  ): ReviewPlannerResponse {
    // Build execution result
    const executionResult: PolicyExecutionResult = {
      rankedCandidates: result.rankedCandidates,
      metadata: result.metadata,
      explainability: result.explainability,
      warnings: result.warnings,
    };

    // Build session recommendations
    const sessionRecommendations = this.buildSessionRecommendations(
      result.rankedCandidates,
      request,
    );

    return {
      success: true,
      candidates: result.rankedCandidates,
      executionResult,
      sessionRecommendations,
      generatedAt: now(),
      ttlMs: this.config.cacheTtl,
    };
  }

  /**
   * Build session recommendations based on ranked candidates.
   */
  private buildSessionRecommendations(
    candidates: PolicyRankedCandidate[],
    request: ReviewPlannerRequest,
  ): SessionRecommendations {
    // Calculate recommended duration based on candidate count
    const criticalCount = candidates.filter(
      (c) => c.ranking.urgencyLevel === "critical",
    ).length;
    const highCount = candidates.filter(
      (c) => c.ranking.urgencyLevel === "high",
    ).length;

    const recommendedCardCount = Math.min(
      20,
      criticalCount + highCount + 5,
      candidates.length,
    );
    const recommendedDuration = (recommendedCardCount * 30 * 1000) as Duration; // 30s per card

    // Group candidates by category for focus areas
    const categoryGroups = new Map<
      string,
      { categoryId: CategoryId; name: string; cards: PolicyRankedCandidate[] }
    >();

    for (const candidate of candidates) {
      if (!candidate.categoryId) continue;
      const existing = categoryGroups.get(candidate.categoryId);
      if (existing) {
        existing.cards.push(candidate);
      } else {
        categoryGroups.set(candidate.categoryId, {
          categoryId: candidate.categoryId,
          name: candidate.schedulerData.state, // Placeholder - would use actual name
          cards: [candidate],
        });
      }
    }

    // Build focus areas
    const focusAreas = Array.from(categoryGroups.values())
      .filter((g) => g.cards.length >= 2)
      .sort((a, b) => b.cards.length - a.cards.length)
      .slice(0, 3)
      .map((g) => ({
        categoryId: g.categoryId,
        categoryName: g.name,
        reason: `${g.cards.length} cards due in this category`,
        cardCount: g.cards.length,
      }));

    // Build warnings
    const warnings: string[] = [];
    if (criticalCount > 10) {
      warnings.push(
        `You have ${criticalCount} cards at critical urgency. Consider reviewing more frequently.`,
      );
    }

    // Build mode tips
    const modeTips: string[] = [];
    if (request.modeId.includes("exploration")) {
      modeTips.push("Take your time to explore connections between concepts.");
    } else if (request.modeId.includes("exam")) {
      modeTips.push(
        "Focus on breadth - try to cover as many topics as possible.",
      );
    }

    return {
      recommendedDuration,
      recommendedCardCount,
      focusAreas,
      warnings,
      modeTips,
    };
  }

  /**
   * Build an empty response when no candidates are found.
   */
  private buildEmptyResponse(
    request: ReviewPlannerRequest,
  ): ReviewPlannerResponse {
    return {
      success: true,
      candidates: [],
      executionResult: this.buildEmptyExecutionResult(request),
      sessionRecommendations: this.buildEmptyRecommendations(),
      generatedAt: now(),
      ttlMs: this.config.cacheTtl,
    };
  }

  /**
   * Build empty execution result.
   */
  private buildEmptyExecutionResult(
    request: ReviewPlannerRequest,
  ): PolicyExecutionResult {
    return {
      rankedCandidates: [],
      metadata: {
        policyChainId: "chain_empty" as PolicyChainId,
        modeId: request.modeId,
        executedAt: now(),
        totalExecutionTimeMs: 0,
        policiesExecuted: 0,
        candidatesProcessed: 0,
        candidatesIncluded: 0,
        candidatesExcluded: 0,
        policyTimings: new Map(),
      },
      explainability: {
        strategyDescription: "No candidates to rank.",
        topFactors: [],
        modeInfluence: "",
        categoryHookInfluence: "",
        lkgcInfluence: "",
        userRecommendations: ["No cards are due for review."],
      },
      warnings: [],
    };
  }

  /**
   * Build empty recommendations.
   */
  private buildEmptyRecommendations(): SessionRecommendations {
    return {
      recommendedDuration: 0 as Duration,
      recommendedCardCount: 0,
      focusAreas: [],
      warnings: [],
      modeTips: ["No cards available - consider adding new content."],
    };
  }

  // ===========================================================================
  // CACHING
  // ===========================================================================

  /**
   * Build cache key from request.
   */
  private buildCacheKey(request: ReviewPlannerRequest): string {
    return [
      request.userId,
      request.modeId,
      request.categoryFilter ?? "all",
      request.maxCandidates ?? "default",
    ].join("::");
  }

  /**
   * Get cached response if valid.
   */
  private getCachedResponse(key: string): ReviewPlannerResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.response;
  }

  /**
   * Cache a response.
   */
  private cacheResponse(key: string, response: ReviewPlannerResponse): void {
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + this.config.cacheTtl,
    });

    // Simple cache eviction
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
