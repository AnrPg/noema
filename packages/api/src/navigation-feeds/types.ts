// =============================================================================
// NAVIGATION FEEDS SERVICE TYPES
// =============================================================================
// Internal types for the Navigation Feed generators.
// These extend the shared types with service-specific concerns.
// =============================================================================

import type {
  NavigationFeedId,
  NavigationFeedRequest,
  NeighborhoodFeedOptions,
  PrerequisitePathOptions,
  CoverageFeedOptions,
  ConstellationChallengeOptions,
  NeighborhoodFeed,
  PrerequisitePathFeed,
  CoverageFeed,
  ConstellationChallengeFeed,
  UnifiedNavigationFeed,
  NavigationFeedMetadata as _NavigationFeedMetadata, // May be used for future type compositions
  ModeFeedConfiguration,
  LearningModeId,
  NavigationSuggestionId,
  ExplainabilityTraceId,
} from "@manthanein/shared";
import {
  createNavigationSuggestionId,
  createExplainabilityTraceId,
  createLearningModeId,
} from "@manthanein/shared";

// =============================================================================
// INTERNAL DATABASE TYPES
// =============================================================================

/**
 * Category data as retrieved from database
 */
export interface CategoryRecord {
  id: string;
  name: string;
  framingQuestion?: string | null;
  depth: number;
  path: string[]; // Note: Prisma schema has path as string array
  cardCount?: number;
}

/**
 * Category relation as retrieved from database
 * Note: Schema uses sourceCategoryId/targetCategoryId, not fromCategoryId/toCategoryId
 * Note: Schema uses isDirectional (true = one-way), not isBidirectional
 */
export interface CategoryRelationRecord {
  id: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  relationType: string;
  strength: number;
  epistemicBridge?: string | null;
  isDirectional: boolean;
}

/**
 * User category mastery as retrieved from database
 */
export interface UserCategoryMasteryRecord {
  userId: string;
  categoryId: string;
  masteryLevel: number;
  cardCount: number;
  studiedCardCount: number;
  lastActivityAt?: Date | null;
}

/**
 * Card participation record
 */
export interface ParticipationRecord {
  id: string;
  cardId: string;
  categoryId: string;
  userId: string;
  contextMastery: number;
  isPrimary: boolean;
}

// =============================================================================
// SERVICE INPUT/OUTPUT TYPES
// =============================================================================

/**
 * Internal request with resolved mode configuration
 */
export interface InternalFeedRequest extends NavigationFeedRequest {
  /** Resolved mode configuration */
  modeConfig: ModeFeedConfiguration;

  /** Resolved options for each feed type */
  resolvedOptions: {
    neighborhood?: NeighborhoodFeedOptions;
    prerequisitePath?: PrerequisitePathOptions;
    coverage?: CoverageFeedOptions;
    constellationChallenge?: ConstellationChallengeOptions;
  };
}

/**
 * Result of neighborhood feed generation
 */
export interface NeighborhoodFeedResult {
  success: boolean;
  feed?: NeighborhoodFeed;
  error?: string;
  generationTimeMs?: number;
}

/**
 * Result of prerequisite path feed generation
 */
export interface PrerequisitePathFeedResult {
  success: boolean;
  feed?: PrerequisitePathFeed;
  error?: string;
  generationTimeMs?: number;
}

/**
 * Result of coverage feed generation
 */
export interface CoverageFeedResult {
  success: boolean;
  feed?: CoverageFeed;
  error?: string;
  generationTimeMs?: number;
}

/**
 * Result of constellation challenge feed generation
 */
export interface ConstellationChallengeFeedResult {
  success: boolean;
  feed?: ConstellationChallengeFeed;
  error?: string;
  generationTimeMs?: number;
}

/**
 * Result of unified feed generation
 */
export interface UnifiedFeedResult {
  success: boolean;
  feed?: UnifiedNavigationFeed;
  error?: string;
  generationTimeMs?: number;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for the navigation feed service
 */
export interface NavigationFeedServiceConfig {
  /** Enable/disable feed types */
  enableNeighborhoodFeed: boolean;
  enablePrerequisitePathFeed: boolean;
  enableCoverageFeed: boolean;
  enableConstellationChallengeFeed: boolean;

  /** Caching settings */
  cacheTtlMs: number;
  enableCaching: boolean;

  /** Performance settings */
  maxNodesPerNeighborhood: number;
  maxPrerequisiteDepth: number;
  maxConstellationSize: number;
  maxSuggestionsPerFeed: number;

  /** Serendipity settings */
  serendipityPoolSize: number;
  serendipityMinNovelty: number;

  /** Default thresholds */
  defaultMasteryThreshold: number;
  defaultGapThreshold: number;
  defaultDivergenceThreshold: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_FEED_SERVICE_CONFIG: NavigationFeedServiceConfig = {
  enableNeighborhoodFeed: true,
  enablePrerequisitePathFeed: true,
  enableCoverageFeed: true,
  enableConstellationChallengeFeed: true,

  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  enableCaching: true,

  maxNodesPerNeighborhood: 30,
  maxPrerequisiteDepth: 5,
  maxConstellationSize: 10,
  maxSuggestionsPerFeed: 10,

  serendipityPoolSize: 100,
  serendipityMinNovelty: 0.3,

  defaultMasteryThreshold: 0.8,
  defaultGapThreshold: 0.6,
  defaultDivergenceThreshold: 0.2,
};

// =============================================================================
// HOOK INTERFACES
// =============================================================================

/**
 * Hooks for customizing feed generation behavior
 */
export interface NavigationFeedHooks {
  /** Called before generating any feed */
  beforeFeedGeneration?: (request: NavigationFeedRequest) => Promise<void>;

  /** Called after generating a feed */
  afterFeedGeneration?: (
    request: NavigationFeedRequest,
    result: UnifiedFeedResult,
  ) => Promise<void>;

  /** Custom scoring for neighborhood suggestions */
  customNeighborhoodScoring?: (
    node: CategoryRecord,
    relation: CategoryRelationRecord | null,
    context: NavigationFeedRequest,
  ) => Promise<number>;

  /** Custom filtering for prerequisite gaps */
  customGapFilter?: (
    gap: { categoryId: string; mastery: number; requiredMastery: number },
    context: NavigationFeedRequest,
  ) => Promise<boolean>;

  /** Custom constellation detection */
  customConstellationDetector?: (
    participations: ParticipationRecord[],
    context: NavigationFeedRequest,
  ) => Promise<{ cardIds: string[]; categoryIds: string[]; theme: string }[]>;
}

// =============================================================================
// CACHE TYPES
// =============================================================================

/**
 * Cache entry for navigation feeds
 */
export interface FeedCacheEntry<T> {
  data: T;
  generatedAt: number;
  expiresAt: number;
  modeId: LearningModeId;
  parametersHash: string;
}

/**
 * Cache key structure
 */
export interface FeedCacheKey {
  userId: string;
  feedType: string;
  modeId: LearningModeId;
  contextCategoryId?: string;
}

// =============================================================================
// GRAPH TRAVERSAL TYPES
// =============================================================================

/**
 * Node in the traversal queue
 */
export interface TraversalNode {
  categoryId: string;
  depth: number;
  pathFromRoot: string[];
  cumulativeStrength: number;
  relation?: CategoryRelationRecord;
}

/**
 * Visited node record
 */
export interface VisitedNode {
  categoryId: string;
  shortestDepth: number;
  strongestPath: string[];
  strongestRelation?: CategoryRelationRecord;
}

// =============================================================================
// SCORING TYPES
// =============================================================================

/**
 * Scoring weights for neighborhood suggestions
 */
export interface NeighborhoodScoringWeights {
  relationStrength: number;
  novelty: number;
  bridgeBonus: number;
  serendipity: number;
  interest: number;
  prerequisiteSatisfaction: number;
}

/**
 * Scoring weights for prerequisite suggestions
 */
export interface PrerequisiteScoringWeights {
  blockingImpact: number;
  gapSeverity: number;
  estimatedTime: number;
  dependencyCount: number;
}

/**
 * Scoring weights for coverage suggestions
 */
export interface CoverageScoringWeights {
  coverageGap: number;
  criticality: number;
  timeEfficiency: number;
  freshness: number;
}

/**
 * Scoring weights for constellation suggestions
 */
export interface ConstellationScoringWeights {
  connectionStrength: number;
  divergenceSignal: number;
  bridgeValue: number;
  difficultyMatch: number;
}

// =============================================================================
// ID GENERATION
// =============================================================================

/**
 * Generate a unique feed ID
 */
export function generateFeedId(): NavigationFeedId {
  return `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique suggestion ID
 */
export function generateSuggestionId(): NavigationSuggestionId {
  return createNavigationSuggestionId(
    `sug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  );
}

/**
 * Generate a unique explainability trace ID
 */
export function generateTraceId(): ExplainabilityTraceId {
  return createExplainabilityTraceId(
    `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  );
}

/**
 * Create a LearningModeId from a string
 */
export function createModeId(value: string): LearningModeId {
  return createLearningModeId(value);
}

/**
 * Generate a hash for parameters (for caching)
 */
export function hashParameters(params: Record<string, unknown>): string {
  return JSON.stringify(params)
    .split("")
    .reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0)
    .toString(36);
}
