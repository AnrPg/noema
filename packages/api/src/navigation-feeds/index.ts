// =============================================================================
// NAVIGATION FEEDS MODULE
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// This module provides mode-aware navigation suggestions for learning.
// It is NOT about review scheduling - it's about discovery and curriculum
// navigation.
//
// Exports:
// - NavigationFeedService - Main service for generating feeds
// - Individual generators for specific feed types
// - Types and configuration
// =============================================================================

// Service
export {
  NavigationFeedService,
  getNavigationFeedService,
  resetNavigationFeedService,
} from "./navigation-feed.service.js";

// Generators
export { NeighborhoodFeedGenerator } from "./neighborhood-feed.generator.js";
export { PrerequisitePathFeedGenerator } from "./prerequisite-path-feed.generator.js";
export { CoverageFeedGenerator } from "./coverage-feed.generator.js";
export { ConstellationChallengeFeedGenerator } from "./constellation-challenge-feed.generator.js";

// Types
export type {
  NavigationFeedServiceConfig,
  NavigationFeedHooks,
  FeedCacheEntry,
  FeedCacheKey,
  UnifiedFeedResult,
  NeighborhoodFeedResult,
  PrerequisitePathFeedResult,
  CoverageFeedResult,
  ConstellationChallengeFeedResult,
  InternalFeedRequest,
  CategoryRecord,
  CategoryRelationRecord,
  UserCategoryMasteryRecord,
  ParticipationRecord,
  TraversalNode,
  VisitedNode,
  NeighborhoodScoringWeights,
  PrerequisiteScoringWeights,
  CoverageScoringWeights,
  ConstellationScoringWeights,
} from "./types.js";

export {
  DEFAULT_FEED_SERVICE_CONFIG,
  generateFeedId,
  generateSuggestionId,
  hashParameters,
} from "./types.js";

// Routes - Fastify plugin
export { navigationFeedRoutes } from "./routes.js";
export { default as navigationFeedRoutesPlugin } from "./routes.js";
