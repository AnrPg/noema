// =============================================================================
// COVERAGE FEED GENERATOR
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// The Coverage Feed Generator produces suggestions for filling coverage gaps
// based on:
// 1. Category scope (what areas to cover)
// 2. User's mastery levels across the scope
// 3. Mode-specific parameters (breadth vs depth, time window, etc.)
// 4. Critical content weighting
//
// This is particularly important for EXAM and GOAL modes where completeness
// matters. NOT about review scheduling - about what's been missed.
// =============================================================================

import { prisma } from "../config/database.js";
import type {
  CoverageFeed,
  CategoryCoverage,
  CoverageGap,
  CoverageSummary,
  CoverageSuggestion,
  NavigationFeedRequest,
  CoverageFeedOptions,
  NavigationFeedMetadata,
  NavigationTarget,
  CoverageGapType,
  NormalizedValue,
  Timestamp,
} from "@manthanein/shared";
import type {
  CategoryRecord,
  UserCategoryMasteryRecord,
  NavigationFeedServiceConfig,
} from "./types.js";
import {
  generateFeedId,
  generateSuggestionId,
  DEFAULT_FEED_SERVICE_CONFIG,
} from "./types.js";

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_COVERAGE_OPTIONS: Required<CoverageFeedOptions> = {
  targetCategoryIds: [],
  coverageGoal: 0.8,
  breadthVsDepthSlider: 0.5,
  coveredMasteryThreshold: 0.7,
  coverageWindowDays: 30,
  criticalContentWeight: 0.6,
};

// =============================================================================
// COVERAGE FEED GENERATOR CLASS
// =============================================================================

export class CoverageFeedGenerator {
  private config: NavigationFeedServiceConfig;

  constructor(config: Partial<NavigationFeedServiceConfig> = {}) {
    this.config = { ...DEFAULT_FEED_SERVICE_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN GENERATION METHOD
  // ===========================================================================

  /**
   * Generate a coverage feed for the given scope
   */
  async generate(
    request: NavigationFeedRequest,
    options?: CoverageFeedOptions,
  ): Promise<CoverageFeed> {
    const startTime = Date.now();
    const resolvedOptions = this.resolveOptions(request, options);

    // Determine scope categories
    const scopeCategoryIds = await this.determineScopeCategories(
      request.userId,
      resolvedOptions.targetCategoryIds,
      request.currentCategoryId,
    );

    if (scopeCategoryIds.length === 0) {
      return this.createEmptyFeed(request, startTime);
    }

    // Fetch categories and their hierarchies
    const categories =
      await this.fetchCategoriesWithHierarchy(scopeCategoryIds);

    // Fetch user mastery for all categories
    const mastery = await this.fetchUserMastery(
      request.userId,
      scopeCategoryIds,
    );

    // Compute coverage for each category
    const categoryCovarges = await this.computeCategoryCovarges(
      categories,
      mastery,
      resolvedOptions,
    );

    // Detect coverage gaps
    const gaps = this.detectGaps(categoryCovarges, resolvedOptions);

    // Compute overall summary
    const summary = this.computeSummary(
      categoryCovarges,
      gaps,
      resolvedOptions,
    );

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      categoryCovarges,
      gaps,
      resolvedOptions,
      request,
    );

    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "coverage",
      scopeCategoryIds,
      categoryCovarges,
      gaps,
      summary,
      suggestions: suggestions.slice(0, this.config.maxSuggestionsPerFeed),
      metadata: this.createMetadata(
        request,
        resolvedOptions,
        suggestions.length,
        generationTimeMs,
      ),
    };
  }

  // ===========================================================================
  // SCOPE DETERMINATION
  // ===========================================================================

  /**
   * Determine which categories are in scope for coverage analysis
   */
  private async determineScopeCategories(
    userId: string,
    explicitTargets: string[],
    currentCategoryId?: string,
  ): Promise<string[]> {
    // If explicit targets provided, use them plus descendants
    if (explicitTargets.length > 0) {
      const descendants = await this.fetchDescendants(explicitTargets);
      return [...new Set([...explicitTargets, ...descendants])];
    }

    // If current category provided, use its subtree
    if (currentCategoryId) {
      const descendants = await this.fetchDescendants([currentCategoryId]);
      return [currentCategoryId, ...descendants];
    }

    // Default: use user's active categories (recently studied)
    return this.fetchActiveCategories(userId);
  }

  /**
   * Fetch descendant categories (using path array containment)
   * Note: path is string[] so we check if parent path is a prefix of child path
   */
  private async fetchDescendants(categoryIds: string[]): Promise<string[]> {
    const parents = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { path: true, id: true },
    });

    // For each parent, find categories whose path array contains all elements of parent path
    // This requires checking hasEvery for each parent
    const descendantIds = new Set<string>();

    for (const parent of parents) {
      if (parent.path.length === 0) continue;

      const children = await prisma.category.findMany({
        where: {
          path: { hasEvery: parent.path },
          id: { notIn: categoryIds },
        },
        select: { id: true },
      });

      children.forEach((c) => descendantIds.add(c.id));
    }

    return Array.from(descendantIds);
  }

  /**
   * Fetch user's recently active categories
   */
  private async fetchActiveCategories(userId: string): Promise<string[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReviews = await prisma.reviewRecord.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
      include: {
        card: {
          include: {
            categoryParticipations: {
              select: { categoryId: true },
            },
          },
        },
      },
      take: 500,
    });

    const categoryIds = new Set<string>();
    for (const review of recentReviews) {
      for (const cp of review.card.categoryParticipations) {
        categoryIds.add(cp.categoryId);
      }
    }

    return Array.from(categoryIds);
  }

  // ===========================================================================
  // COVERAGE COMPUTATION
  // ===========================================================================

  /**
   * Compute coverage for each category
   */
  private async computeCategoryCovarges(
    categories: CategoryRecord[],
    mastery: Map<string, UserCategoryMasteryRecord>,
    options: Required<CoverageFeedOptions>,
  ): Promise<CategoryCoverage[]> {
    const coverages: CategoryCoverage[] = [];

    for (const category of categories) {
      const categoryMastery = mastery.get(category.id);
      const totalCards = category.cardCount || 0;
      const studiedCards = categoryMastery?.studiedCardCount || 0;
      const masteryLevel = categoryMastery?.masteryLevel || 0;

      // Cards at target mastery (rough estimate)
      const masteredCards = Math.floor(studiedCards * masteryLevel);

      // Coverage level combines breadth (studied/total) and depth (mastery)
      const breadthCoverage = totalCards > 0 ? studiedCards / totalCards : 0;
      const depthCoverage = masteryLevel;

      // Blend based on breadth vs depth slider
      const coverageLevel = (breadthCoverage * options.breadthVsDepthSlider +
        depthCoverage * (1 - options.breadthVsDepthSlider)) as NormalizedValue;

      // Determine if critical (top-level categories or user-specified)
      const isCritical = category.depth <= 1;

      // Weight based on criticality and card count
      const weight = isCritical
        ? options.criticalContentWeight
        : (1 - options.criticalContentWeight) * (totalCards / 100);

      coverages.push({
        categoryId: category.id,
        categoryName: category.name,
        totalCards,
        studiedCards,
        masteredCards,
        coverageLevel,
        averageMastery: masteryLevel as NormalizedValue,
        isCritical,
        weight: Math.min(1, weight),
        lastActivityAt: categoryMastery?.lastActivityAt
          ? (categoryMastery.lastActivityAt.getTime() as Timestamp)
          : undefined,
        depth: category.depth,
      });
    }

    return coverages;
  }

  // ===========================================================================
  // GAP DETECTION
  // ===========================================================================

  /**
   * Detect coverage gaps
   */
  private detectGaps(
    coverages: CategoryCoverage[],
    options: Required<CoverageFeedOptions>,
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const coverage of coverages) {
      // Skip if at or above target coverage
      if (coverage.coverageLevel >= options.coverageGoal) continue;

      const gapType = this.determineGapType(coverage, options);
      const priority = this.computeGapPriority(coverage, gapType, options);

      gaps.push({
        id: `coverage_gap_${coverage.categoryId}`,
        categoryId: coverage.categoryId,
        categoryName: coverage.categoryName,
        currentCoverage: coverage.coverageLevel,
        targetCoverage: options.coverageGoal as NormalizedValue,
        remainingCards: coverage.totalCards - coverage.studiedCards,
        estimatedTimeMinutes: this.estimateTimeToClose(coverage, options),
        priority: priority as NormalizedValue,
        gapType,
        reason: this.generateGapReason(coverage, gapType, options),
        isCritical: coverage.isCritical,
      });
    }

    // Sort by priority
    return gaps.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Determine the type of coverage gap
   */
  private determineGapType(
    coverage: CategoryCoverage,
    options: Required<CoverageFeedOptions>,
  ): CoverageGapType {
    // Never studied
    if (coverage.studiedCards === 0) {
      return "never_studied";
    }

    // Studied but mastery is low (unstable)
    if (
      coverage.averageMastery < options.coveredMasteryThreshold &&
      coverage.studiedCards === coverage.totalCards
    ) {
      return "unstable";
    }

    // Depth insufficient (studied all but mastery below threshold)
    if (
      coverage.studiedCards >= coverage.totalCards * 0.8 &&
      coverage.averageMastery < options.coveredMasteryThreshold
    ) {
      return "depth_insufficient";
    }

    // Breadth insufficient (haven't studied enough cards)
    if (coverage.studiedCards < coverage.totalCards * 0.5) {
      return "breadth_insufficient";
    }

    // Partial coverage (some studied, some not)
    return "partial";
  }

  /**
   * Compute priority for a gap
   */
  private computeGapPriority(
    coverage: CategoryCoverage,
    gapType: CoverageGapType,
    options: Required<CoverageFeedOptions>,
  ): number {
    let priority = 0;

    // Base priority from coverage deficit
    const coverageDeficit = options.coverageGoal - coverage.coverageLevel;
    priority += coverageDeficit * 0.4;

    // Critical content bonus
    if (coverage.isCritical) {
      priority += 0.3;
    }

    // Gap type modifiers
    switch (gapType) {
      case "never_studied":
        priority += 0.2; // High priority for completely missed content
        break;
      case "unstable":
        priority += 0.15; // Need to stabilize
        break;
      case "depth_insufficient":
        priority += 0.1;
        break;
      case "breadth_insufficient":
        priority += 0.15;
        break;
      case "partial":
        priority += 0.05;
        break;
    }

    // Freshness penalty (old gaps more urgent)
    if (coverage.lastActivityAt) {
      const daysSinceActivity =
        (Date.now() - coverage.lastActivityAt) / (1000 * 60 * 60 * 24);
      if (daysSinceActivity > options.coverageWindowDays) {
        priority += 0.1;
      }
    } else {
      priority += 0.1; // Never studied
    }

    return Math.min(1, priority);
  }

  /**
   * Estimate time to close a gap
   */
  private estimateTimeToClose(
    coverage: CategoryCoverage,
    options: Required<CoverageFeedOptions>,
  ): number {
    const remainingCards = coverage.totalCards - coverage.studiedCards;
    const masteryDeficit =
      options.coveredMasteryThreshold - coverage.averageMastery;

    // Time for new cards (~2 min each)
    const newCardTime = remainingCards * 2;

    // Time for review/strengthening (~1 min per card per 0.1 mastery deficit)
    const reviewTime = coverage.studiedCards * Math.max(0, masteryDeficit) * 10;

    return Math.ceil(newCardTime + reviewTime);
  }

  /**
   * Generate human-readable gap reason
   */
  private generateGapReason(
    coverage: CategoryCoverage,
    gapType: CoverageGapType,
    options: Required<CoverageFeedOptions>,
  ): string {
    const coveragePercent = Math.round(coverage.coverageLevel * 100);
    const targetPercent = Math.round(options.coverageGoal * 100);

    switch (gapType) {
      case "never_studied":
        return `"${coverage.categoryName}" hasn't been studied yet (${coverage.totalCards} cards)`;
      case "unstable":
        return `"${coverage.categoryName}" needs reinforcement - knowledge is unstable`;
      case "depth_insufficient":
        return `"${coverage.categoryName}" needs deeper study (${coveragePercent}% vs ${targetPercent}% target)`;
      case "breadth_insufficient":
        return `"${coverage.categoryName}" needs more exploration (${coverage.studiedCards}/${coverage.totalCards} cards studied)`;
      case "partial":
        return `"${coverage.categoryName}" has gaps (${coveragePercent}% coverage)`;
      default:
        return `"${coverage.categoryName}" needs attention`;
    }
  }

  // ===========================================================================
  // SUMMARY COMPUTATION
  // ===========================================================================

  /**
   * Compute overall coverage summary
   */
  private computeSummary(
    coverages: CategoryCoverage[],
    gaps: CoverageGap[],
    options: Required<CoverageFeedOptions>,
  ): CoverageSummary {
    const totalCategories = coverages.length;
    const coveredCategories = coverages.filter(
      (c) => c.coverageLevel >= options.coverageGoal,
    ).length;

    // Simple average coverage
    const overallCoverage =
      coverages.length > 0
        ? coverages.reduce((sum, c) => sum + c.coverageLevel, 0) /
          coverages.length
        : 0;

    // Weighted coverage (by importance)
    const totalWeight = coverages.reduce((sum, c) => sum + c.weight, 0);
    const weightedCoverage =
      totalWeight > 0
        ? coverages.reduce((sum, c) => sum + c.coverageLevel * c.weight, 0) /
          totalWeight
        : 0;

    // Total cards
    const totalCards = coverages.reduce((sum, c) => sum + c.totalCards, 0);
    const masteredCards = coverages.reduce(
      (sum, c) => sum + c.masteredCards,
      0,
    );

    // Estimated time to full coverage
    const estimatedRemainingTimeMinutes = gaps.reduce(
      (sum, g) => sum + (g.estimatedTimeMinutes || 0),
      0,
    );

    // Trend detection (would need historical data - placeholder)
    const trend = this.detectTrend(coverages);

    // Critical gaps
    const criticalGapCount = gaps.filter((g) => g.isCritical).length;

    return {
      totalCategories,
      coveredCategories,
      overallCoverage: overallCoverage as NormalizedValue,
      weightedCoverage: weightedCoverage as NormalizedValue,
      totalCards,
      masteredCards,
      estimatedRemainingTimeMinutes,
      trend,
      criticalGapCount,
    };
  }

  /**
   * Detect coverage trend (placeholder - would need historical data)
   */
  private detectTrend(
    coverages: CategoryCoverage[],
  ): "improving" | "stable" | "declining" {
    // Placeholder: check recent activity
    const recentActivity = coverages.filter((c) => {
      if (!c.lastActivityAt) return false;
      const daysSince = (Date.now() - c.lastActivityAt) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    });

    if (recentActivity.length > coverages.length * 0.3) {
      return "improving";
    }
    if (recentActivity.length < coverages.length * 0.1) {
      return "declining";
    }
    return "stable";
  }

  // ===========================================================================
  // SUGGESTION GENERATION
  // ===========================================================================

  /**
   * Generate suggestions from coverage analysis
   */
  private generateSuggestions(
    coverages: CategoryCoverage[],
    gaps: CoverageGap[],
    options: Required<CoverageFeedOptions>,
    request: NavigationFeedRequest,
  ): CoverageSuggestion[] {
    const suggestions: CoverageSuggestion[] = [];

    // Suggest based on gaps
    for (const gap of gaps) {
      const coverage = coverages.find((c) => c.categoryId === gap.categoryId);
      if (!coverage) continue;

      // Get recommended cards (placeholder - would need card selection logic)
      const recommendedCardIds = undefined; // Would fetch unstudied/weak cards

      // Calculate expected improvement
      const potentialImprovement = Math.min(
        options.coverageGoal - gap.currentCoverage,
        0.2, // Cap per suggestion
      );

      suggestions.push({
        id: generateSuggestionId(),
        type: gap.isCritical ? "exam_coverage" : "goal_progress",
        target: {
          type: "category",
          categoryId: gap.categoryId,
        } as NavigationTarget,
        coverage,
        gap,
        priority: gap.priority,
        reason: gap.reason,
        recommendedCardIds,
        expectedCoverageImprovement: potentialImprovement,
        explainabilityTraceId: request.includeExplainability
          ? `trace_coverage_${gap.categoryId}`
          : undefined,
      });
    }

    // Sort by priority
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  // ===========================================================================
  // DATABASE QUERIES
  // ===========================================================================

  /**
   * Fetch categories with hierarchy info
   */
  private async fetchCategoriesWithHierarchy(
    categoryIds: string[],
  ): Promise<CategoryRecord[]> {
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      framingQuestion: c.framingQuestion,
      depth: c.depth,
      path: c.path,
      cardCount: c.cardCount, // Use the direct cardCount field
    }));
  }

  /**
   * Fetch user mastery for categories
   * Note: Since there's no dedicated userCategoryProgress model, we calculate
   * mastery from CardCategoryParticipation records and Category.masteryScore
   */
  private async fetchUserMastery(
    userId: string,
    categoryIds: string[],
  ): Promise<Map<string, UserCategoryMasteryRecord>> {
    // Get categories with their stats
    const categories = await prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        userId, // User's categories
      },
      select: {
        id: true,
        cardCount: true,
        masteryScore: true,
        lastStudiedAt: true,
      },
    });

    // Get participation counts for studied cards
    const participationCounts = await prisma.cardCategoryParticipation.groupBy({
      by: ["categoryId"],
      where: {
        categoryId: { in: categoryIds },
        card: { userId }, // Filter by card's userId
        contextMastery: { gt: 0 }, // At least some mastery indicates studying
      },
      _count: { _all: true },
      _avg: { contextMastery: true },
    });

    const participationMap = new Map(
      participationCounts.map((p) => [
        p.categoryId,
        { count: p._count._all, avgMastery: p._avg?.contextMastery || 0 },
      ]),
    );

    const map = new Map<string, UserCategoryMasteryRecord>();
    for (const category of categories) {
      const participation = participationMap.get(category.id);
      map.set(category.id, {
        userId,
        categoryId: category.id,
        masteryLevel: participation?.avgMastery || category.masteryScore,
        cardCount: category.cardCount,
        studiedCardCount: participation?.count || 0,
        lastActivityAt: category.lastStudiedAt,
      });
    }

    return map;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Resolve options with defaults and mode parameters
   */
  private resolveOptions(
    request: NavigationFeedRequest,
    options?: CoverageFeedOptions,
  ): Required<CoverageFeedOptions> {
    const modeParams = request.modeParameters || {};
    return {
      targetCategoryIds: options?.targetCategoryIds ?? [],
      coverageGoal:
        options?.coverageGoal ??
        (modeParams.coverage_goal as number) ??
        DEFAULT_COVERAGE_OPTIONS.coverageGoal,
      breadthVsDepthSlider:
        options?.breadthVsDepthSlider ??
        (modeParams.breadth_vs_depth_slider as number) ??
        DEFAULT_COVERAGE_OPTIONS.breadthVsDepthSlider,
      coveredMasteryThreshold:
        options?.coveredMasteryThreshold ??
        DEFAULT_COVERAGE_OPTIONS.coveredMasteryThreshold,
      coverageWindowDays:
        options?.coverageWindowDays ??
        (modeParams.coverage_window_days as number) ??
        DEFAULT_COVERAGE_OPTIONS.coverageWindowDays,
      criticalContentWeight:
        options?.criticalContentWeight ??
        DEFAULT_COVERAGE_OPTIONS.criticalContentWeight,
    };
  }

  /**
   * Create empty feed
   */
  private createEmptyFeed(
    request: NavigationFeedRequest,
    startTime: number,
  ): CoverageFeed {
    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "coverage",
      scopeCategoryIds: [],
      categoryCovarges: [],
      gaps: [],
      summary: {
        totalCategories: 0,
        coveredCategories: 0,
        overallCoverage: 0 as NormalizedValue,
        weightedCoverage: 0 as NormalizedValue,
        totalCards: 0,
        masteredCards: 0,
        trend: "stable",
        criticalGapCount: 0,
      },
      suggestions: [],
      metadata: this.createMetadata(
        request,
        DEFAULT_COVERAGE_OPTIONS,
        0,
        generationTimeMs,
      ),
    };
  }

  /**
   * Create feed metadata
   */
  private createMetadata(
    request: NavigationFeedRequest,
    options: Required<CoverageFeedOptions>,
    suggestionCount: number,
    generationTimeMs: number,
  ): NavigationFeedMetadata {
    return {
      modeId: request.modeId,
      parametersUsed: options as Record<string, unknown>,
      generatedAt: Date.now() as Timestamp,
      ttlMs: this.config.cacheTtlMs,
      suggestionCount,
      generationTimeMs,
    };
  }
}
