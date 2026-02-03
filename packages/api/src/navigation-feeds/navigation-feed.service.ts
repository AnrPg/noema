// =============================================================================
// UNIFIED NAVIGATION FEED SERVICE
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// The NavigationFeedService orchestrates all feed generators and produces
// unified navigation feeds based on the active learning mode.
//
// Responsibilities:
// 1. Route requests to appropriate generators based on mode configuration
// 2. Merge and re-rank suggestions from multiple generators
// 3. Apply mode-specific weights and filtering
// 4. Manage caching for feed results
// 5. Provide single entry point for all navigation feed operations
// =============================================================================

import type {
  NavigationFeedRequest,
  UnifiedNavigationFeed,
  NeighborhoodFeed,
  PrerequisitePathFeed,
  CoverageFeed,
  ConstellationChallengeFeed,
  NeighborhoodFeedOptions,
  PrerequisitePathOptions,
  CoverageFeedOptions,
  ConstellationChallengeOptions,
  NavigationFeedMetadata,
  NavigationFeedContext,
  NavigationSuggestionUnion,
  NeighborhoodSuggestion,
  PrerequisiteSuggestion,
  CoverageSuggestion,
  ConstellationSuggestion,
  ModeFeedConfiguration,
  NavigationFeedType,
  NormalizedValue,
  CategoryId,
  LearningModeId,
  Timestamp,
} from "@manthanein/shared";
import { MODE_FEED_CONFIGS, EXPLORATION_FEED_CONFIG } from "@manthanein/shared";
import { NeighborhoodFeedGenerator } from "./neighborhood-feed.generator.js";
import { PrerequisitePathFeedGenerator } from "./prerequisite-path-feed.generator.js";
import { CoverageFeedGenerator } from "./coverage-feed.generator.js";
import { ConstellationChallengeFeedGenerator } from "./constellation-challenge-feed.generator.js";
import type {
  NavigationFeedServiceConfig,
  NavigationFeedHooks,
  FeedCacheEntry,
  FeedCacheKey as _FeedCacheKey, // Reserved for cache implementation
  UnifiedFeedResult,
} from "./types.js";
import {
  generateFeedId,
  hashParameters,
  DEFAULT_FEED_SERVICE_CONFIG,
} from "./types.js";
import { prisma } from "../config/database.js";

// =============================================================================
// NAVIGATION FEED SERVICE CLASS
// =============================================================================

export class NavigationFeedService {
  private config: NavigationFeedServiceConfig;
  private hooks: NavigationFeedHooks;

  // Generators
  private neighborhoodGenerator: NeighborhoodFeedGenerator;
  private prerequisitePathGenerator: PrerequisitePathFeedGenerator;
  private coverageGenerator: CoverageFeedGenerator;
  private constellationGenerator: ConstellationChallengeFeedGenerator;

  // Cache
  private cache: Map<string, FeedCacheEntry<unknown>>;

  constructor(
    config: Partial<NavigationFeedServiceConfig> = {},
    hooks: NavigationFeedHooks = {},
  ) {
    this.config = { ...DEFAULT_FEED_SERVICE_CONFIG, ...config };
    this.hooks = hooks;

    // Initialize generators
    this.neighborhoodGenerator = new NeighborhoodFeedGenerator(this.config);
    this.prerequisitePathGenerator = new PrerequisitePathFeedGenerator(
      this.config,
    );
    this.coverageGenerator = new CoverageFeedGenerator(this.config);
    this.constellationGenerator = new ConstellationChallengeFeedGenerator(
      this.config,
    );

    // Initialize cache
    this.cache = new Map();
  }

  // ===========================================================================
  // UNIFIED FEED GENERATION
  // ===========================================================================

  /**
   * Generate a unified navigation feed based on the active mode
   */
  async generateUnifiedFeed(
    request: NavigationFeedRequest,
  ): Promise<UnifiedFeedResult> {
    const startTime = Date.now();

    try {
      // Call beforeFeedGeneration hook
      if (this.hooks.beforeFeedGeneration) {
        await this.hooks.beforeFeedGeneration(request);
      }

      // Check cache
      const cacheKey = this.buildCacheKey(request, "unified");
      const cached = this.getFromCache<UnifiedNavigationFeed>(cacheKey);
      if (cached) {
        return {
          success: true,
          feed: cached,
          generationTimeMs: Date.now() - startTime,
        };
      }

      // Get mode configuration
      const modeConfig = this.getModeConfiguration(request.modeId);

      // Generate individual feeds in parallel based on enabled types
      const feedPromises: Promise<{
        type: NavigationFeedType;
        feed:
          | NeighborhoodFeed
          | PrerequisitePathFeed
          | CoverageFeed
          | ConstellationChallengeFeed
          | null;
      }>[] = [];

      if (
        modeConfig.enabledFeeds.includes("neighborhood") &&
        this.config.enableNeighborhoodFeed
      ) {
        feedPromises.push(
          this.generateNeighborhoodFeed(
            request,
            modeConfig.defaultOptions.neighborhood,
          )
            .then((feed) => ({ type: "neighborhood" as const, feed }))
            .catch(() => ({ type: "neighborhood" as const, feed: null })),
        );
      }

      if (
        modeConfig.enabledFeeds.includes("prerequisite_path") &&
        this.config.enablePrerequisitePathFeed
      ) {
        const targetCategoryId =
          request.currentCategoryId ||
          (await this.getDefaultTargetCategory(request.userId));
        if (targetCategoryId) {
          feedPromises.push(
            this.generatePrerequisitePathFeed(
              request,
              targetCategoryId,
              modeConfig.defaultOptions.prerequisitePath,
            )
              .then((feed) => ({ type: "prerequisite_path" as const, feed }))
              .catch(() => ({
                type: "prerequisite_path" as const,
                feed: null,
              })),
          );
        }
      }

      if (
        modeConfig.enabledFeeds.includes("coverage") &&
        this.config.enableCoverageFeed
      ) {
        feedPromises.push(
          this.generateCoverageFeed(request, modeConfig.defaultOptions.coverage)
            .then((feed) => ({ type: "coverage" as const, feed }))
            .catch(() => ({ type: "coverage" as const, feed: null })),
        );
      }

      if (
        modeConfig.enabledFeeds.includes("constellation_challenge") &&
        this.config.enableConstellationChallengeFeed
      ) {
        feedPromises.push(
          this.generateConstellationChallengeFeed(
            request,
            modeConfig.defaultOptions.constellationChallenge,
          )
            .then((feed) => ({
              type: "constellation_challenge" as const,
              feed,
            }))
            .catch(() => ({
              type: "constellation_challenge" as const,
              feed: null,
            })),
        );
      }

      // Wait for all feeds
      const feedResults = await Promise.all(feedPromises);

      // Extract individual feeds
      const neighborhoodFeed = feedResults.find(
        (r) => r.type === "neighborhood",
      )?.feed as NeighborhoodFeed | undefined;
      const prerequisitePathFeed = feedResults.find(
        (r) => r.type === "prerequisite_path",
      )?.feed as PrerequisitePathFeed | undefined;
      const coverageFeed = feedResults.find((r) => r.type === "coverage")
        ?.feed as CoverageFeed | undefined;
      const constellationChallengeFeed = feedResults.find(
        (r) => r.type === "constellation_challenge",
      )?.feed as ConstellationChallengeFeed | undefined;

      // Merge and rank all suggestions
      const rankedSuggestions = this.mergeAndRankSuggestions(
        modeConfig,
        neighborhoodFeed,
        prerequisitePathFeed,
        coverageFeed,
        constellationChallengeFeed,
      );

      // Build top by type
      const topByType = this.buildTopByType(
        modeConfig.maxSuggestionsPerType,
        neighborhoodFeed,
        prerequisitePathFeed,
        coverageFeed,
        constellationChallengeFeed,
      );

      // Build context
      const context = await this.buildFeedContext(request);

      // Create unified feed
      const generationTimeMs = Date.now() - startTime;
      const unifiedFeed: UnifiedNavigationFeed = {
        id: generateFeedId(),
        modeId: request.modeId,
        neighborhoodFeed,
        prerequisitePathFeed,
        coverageFeed,
        constellationChallengeFeed,
        rankedSuggestions: rankedSuggestions.slice(
          0,
          modeConfig.maxTotalSuggestions,
        ),
        topByType,
        context,
        metadata: this.createMetadata(
          request,
          modeConfig,
          rankedSuggestions.length,
          generationTimeMs,
        ),
      };

      // Cache the result
      this.setCache(cacheKey, unifiedFeed, this.config.cacheTtlMs);

      // Call afterFeedGeneration hook
      if (this.hooks.afterFeedGeneration) {
        await this.hooks.afterFeedGeneration(request, {
          success: true,
          feed: unifiedFeed,
        });
      }

      return { success: true, feed: unifiedFeed, generationTimeMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to generate unified feed: ${message}`,
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  // ===========================================================================
  // INDIVIDUAL FEED GENERATION
  // ===========================================================================

  /**
   * Generate only a neighborhood feed
   */
  async generateNeighborhoodFeed(
    request: NavigationFeedRequest,
    options?: NeighborhoodFeedOptions,
  ): Promise<NeighborhoodFeed> {
    const cacheKey = this.buildCacheKey(request, "neighborhood");
    const cached = this.getFromCache<NeighborhoodFeed>(cacheKey);
    if (cached) return cached;

    const feed = await this.neighborhoodGenerator.generate(request, options);
    this.setCache(cacheKey, feed, this.config.cacheTtlMs);
    return feed;
  }

  /**
   * Generate only a prerequisite path feed
   */
  async generatePrerequisitePathFeed(
    request: NavigationFeedRequest,
    targetCategoryId: CategoryId,
    options?: PrerequisitePathOptions,
  ): Promise<PrerequisitePathFeed> {
    const cacheKey = this.buildCacheKey(
      request,
      "prerequisite_path",
      targetCategoryId,
    );
    const cached = this.getFromCache<PrerequisitePathFeed>(cacheKey);
    if (cached) return cached;

    const feed = await this.prerequisitePathGenerator.generate(
      request,
      targetCategoryId,
      options,
    );
    this.setCache(cacheKey, feed, this.config.cacheTtlMs);
    return feed;
  }

  /**
   * Generate only a coverage feed
   */
  async generateCoverageFeed(
    request: NavigationFeedRequest,
    options?: CoverageFeedOptions,
  ): Promise<CoverageFeed> {
    const cacheKey = this.buildCacheKey(request, "coverage");
    const cached = this.getFromCache<CoverageFeed>(cacheKey);
    if (cached) return cached;

    const feed = await this.coverageGenerator.generate(request, options);
    this.setCache(cacheKey, feed, this.config.cacheTtlMs);
    return feed;
  }

  /**
   * Generate only a constellation challenge feed
   */
  async generateConstellationChallengeFeed(
    request: NavigationFeedRequest,
    options?: ConstellationChallengeOptions,
  ): Promise<ConstellationChallengeFeed> {
    const cacheKey = this.buildCacheKey(request, "constellation_challenge");
    const cached = this.getFromCache<ConstellationChallengeFeed>(cacheKey);
    if (cached) return cached;

    const feed = await this.constellationGenerator.generate(request, options);
    this.setCache(cacheKey, feed, this.config.cacheTtlMs);
    return feed;
  }

  // ===========================================================================
  // SUGGESTION MERGING AND RANKING
  // ===========================================================================

  /**
   * Merge suggestions from all feeds and apply mode-specific weights
   */
  private mergeAndRankSuggestions(
    modeConfig: ModeFeedConfiguration,
    neighborhoodFeed?: NeighborhoodFeed,
    prerequisitePathFeed?: PrerequisitePathFeed,
    coverageFeed?: CoverageFeed,
    constellationChallengeFeed?: ConstellationChallengeFeed,
  ): NavigationSuggestionUnion[] {
    const suggestions: {
      suggestion: NavigationSuggestionUnion;
      adjustedPriority: number;
    }[] = [];

    // Add neighborhood suggestions with weight
    if (neighborhoodFeed) {
      const weight = modeConfig.feedWeights.neighborhood;
      for (const s of neighborhoodFeed.suggestions) {
        suggestions.push({
          suggestion: s,
          adjustedPriority: s.priority * weight,
        });
      }
    }

    // Add prerequisite suggestions with weight
    if (prerequisitePathFeed) {
      const weight = modeConfig.feedWeights.prerequisite_path;
      for (const s of prerequisitePathFeed.suggestions) {
        suggestions.push({
          suggestion: s,
          adjustedPriority: s.priority * weight,
        });
      }
    }

    // Add coverage suggestions with weight
    if (coverageFeed) {
      const weight = modeConfig.feedWeights.coverage;
      for (const s of coverageFeed.suggestions) {
        suggestions.push({
          suggestion: s,
          adjustedPriority: s.priority * weight,
        });
      }
    }

    // Add constellation suggestions with weight
    if (constellationChallengeFeed) {
      const weight = modeConfig.feedWeights.constellation_challenge;
      for (const s of constellationChallengeFeed.suggestions) {
        suggestions.push({
          suggestion: s,
          adjustedPriority: s.priority * weight,
        });
      }
    }

    // Sort by adjusted priority
    suggestions.sort((a, b) => b.adjustedPriority - a.adjustedPriority);

    // Return sorted suggestions
    return suggestions.map((s) => s.suggestion);
  }

  /**
   * Build top suggestions by type
   */
  private buildTopByType(
    maxPerType: number,
    neighborhoodFeed?: NeighborhoodFeed,
    prerequisitePathFeed?: PrerequisitePathFeed,
    coverageFeed?: CoverageFeed,
    constellationChallengeFeed?: ConstellationChallengeFeed,
  ): {
    neighborhood: readonly NeighborhoodSuggestion[];
    prerequisite: readonly PrerequisiteSuggestion[];
    coverage: readonly CoverageSuggestion[];
    constellation: readonly ConstellationSuggestion[];
  } {
    return {
      neighborhood: (neighborhoodFeed?.suggestions || []).slice(0, maxPerType),
      prerequisite: (prerequisitePathFeed?.suggestions || []).slice(
        0,
        maxPerType,
      ),
      coverage: (coverageFeed?.suggestions || []).slice(0, maxPerType),
      constellation: (constellationChallengeFeed?.suggestions || []).slice(
        0,
        maxPerType,
      ),
    };
  }

  // ===========================================================================
  // MODE CONFIGURATION
  // ===========================================================================

  /**
   * Get mode configuration for the given mode
   */
  private getModeConfiguration(modeId: LearningModeId): ModeFeedConfiguration {
    // Extract system type from mode ID (e.g., "system:exploration" -> "exploration")
    const systemType = this.extractSystemType(modeId);

    if (systemType && MODE_FEED_CONFIGS[systemType]) {
      return MODE_FEED_CONFIGS[systemType];
    }

    // Default to exploration mode config
    return EXPLORATION_FEED_CONFIG;
  }

  /**
   * Extract system type from mode ID
   */
  private extractSystemType(modeId: string): string | null {
    if (modeId.startsWith("system:")) {
      return modeId.substring(7);
    }
    // Try to match by suffix
    const types = ["exploration", "goal_driven", "exam_oriented", "synthesis"];
    for (const type of types) {
      if (modeId.toLowerCase().includes(type)) {
        return type;
      }
    }
    return null;
  }

  // ===========================================================================
  // CONTEXT BUILDING
  // ===========================================================================

  /**
   * Build feed context
   */
  private async buildFeedContext(
    request: NavigationFeedRequest,
  ): Promise<NavigationFeedContext> {
    // Fetch basic progress summary
    const progressSummary = await this.fetchProgressSummary(request.userId);

    return {
      currentCategoryId: request.currentCategoryId,
      currentCardId: request.currentCardId,
      viewLens: request.viewLens,
      progressSummary,
    };
  }

  /**
   * Fetch user progress summary
   */
  private async fetchProgressSummary(userId: string): Promise<{
    totalCards: number;
    masteredCards: number;
    overallMastery: NormalizedValue;
    activeCategories: number;
  }> {
    // Get card counts
    const cardStats = await prisma.card.aggregate({
      where: { userId },
      _count: { id: true },
    });

    // Get category stats from Category model directly (since no userCategoryProgress exists)
    const categoryStats = await prisma.category.aggregate({
      where: { userId },
      _count: { id: true },
      _avg: { masteryScore: true },
    });

    const masteredCards = await prisma.card.count({
      where: {
        userId,
        state: "mastered",
      },
    });

    return {
      totalCards: cardStats._count.id,
      masteredCards,
      overallMastery: (categoryStats._avg.masteryScore || 0) as NormalizedValue,
      activeCategories: categoryStats._count.id,
    };
  }

  /**
   * Get default target category for prerequisite analysis
   */
  private async getDefaultTargetCategory(
    userId: string,
  ): Promise<CategoryId | null> {
    // Find most recently studied category via ReviewRecord
    const recentReview = await prisma.reviewRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          include: {
            categoryParticipations: {
              take: 1,
              orderBy: { isPrimary: "desc" },
            },
          },
        },
      },
    });

    return (
      (recentReview?.card?.categoryParticipations[0]
        ?.categoryId as CategoryId) || null
    );
  }

  // ===========================================================================
  // CACHING
  // ===========================================================================

  /**
   * Build cache key
   */
  private buildCacheKey(
    request: NavigationFeedRequest,
    feedType: string,
    extra?: string,
  ): string {
    const parts = [
      request.userId,
      feedType,
      request.modeId,
      request.currentCategoryId || "none",
      hashParameters(request.modeParameters || {}),
    ];
    if (extra) parts.push(extra);
    return parts.join(":");
  }

  /**
   * Get from cache
   */
  private getFromCache<T>(key: string): T | null {
    if (!this.config.enableCaching) return null;

    const entry = this.cache.get(key) as FeedCacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set in cache
   */
  private setCache<T>(key: string, data: T, ttlMs: number): void {
    if (!this.config.enableCaching) return;

    const entry: FeedCacheEntry<T> = {
      data,
      generatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      modeId: "", // Would be set from request
      parametersHash: "",
    };

    this.cache.set(key, entry);

    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific user
   */
  clearUserCache(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(userId)) {
        this.cache.delete(key);
      }
    }
  }

  // ===========================================================================
  // METADATA
  // ===========================================================================

  /**
   * Create feed metadata
   */
  private createMetadata(
    request: NavigationFeedRequest,
    _modeConfig: ModeFeedConfiguration, // Reserved for mode-specific metadata
    suggestionCount: number,
    generationTimeMs: number,
  ): NavigationFeedMetadata {
    return {
      modeId: request.modeId,
      parametersUsed: request.modeParameters || {},
      generatedAt: Date.now() as Timestamp,
      ttlMs: this.config.cacheTtlMs,
      suggestionCount,
      generationTimeMs,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let navigationFeedServiceInstance: NavigationFeedService | null = null;

/**
 * Get the singleton navigation feed service instance
 */
export function getNavigationFeedService(
  config?: Partial<NavigationFeedServiceConfig>,
  hooks?: NavigationFeedHooks,
): NavigationFeedService {
  if (!navigationFeedServiceInstance) {
    navigationFeedServiceInstance = new NavigationFeedService(config, hooks);
  }
  return navigationFeedServiceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetNavigationFeedService(): void {
  navigationFeedServiceInstance = null;
}
