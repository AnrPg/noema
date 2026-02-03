// =============================================================================
// ALGORITHMS INDEX
// =============================================================================
// Export all algorithm implementations and utilities.
//
// NOTE: Types are exported from types/index.ts to avoid duplicate exports.
// This file only exports:
// 1. Implementation classes and factory functions
// 2. Configuration constants
// 3. Types that are UNIQUE to the algorithms layer (adapter configs, etc.)
// =============================================================================

// FSRS (Free Spaced Repetition Scheduler)
export {
  FSRSScheduler,
  createFSRSScheduler,
  formatInterval,
  calculateMemoryIntegrityScore,
} from "./fsrs";

// HLR (Half-Life Regression)
export {
  HLRScheduler,
  createHLRScheduler,
  calculateMemoryStrength,
  estimateReviewTime,
  calculateOptimalLoad,
} from "./hlr";

// Unified Scheduler Interface
export {
  UnifiedScheduler,
  createScheduler,
  createSchedulerFromConfig,
  createInitialSRSState,
  isCardDue,
  daysUntilDue,
  sortCardsByPriority,
  calculateRelativeOverdueness,
  batchSchedule,
  getCardSetStatistics,
} from "./scheduler";

export type { IScheduler, CardSetStatistics } from "./scheduler";

// Face Resolution Engine (Phase 6B)
export {
  // Engine
  FaceResolutionEngine,
  createFaceResolutionEngine,
  FaceResolutionInputBuilder,
  buildResolutionInput,

  // Condition evaluators
  evaluateCategoryCondition,
  evaluateRoleCondition,
  evaluateModeCondition,
  evaluateDepthCondition,
  evaluateIntentCondition,
  evaluateLkgcSignalCondition,
  evaluateUserPreferenceCondition,
  evaluateTemporalCondition,
  evaluateCustomCondition,
  createCompositeEvaluator,
  buildDefaultEvaluatorRegistry,
  evaluateConditionSet,

  // Constants
  DEFAULT_RESOLUTION_CONFIG,
  DEPTH_LEVEL_ORDER,
} from "./face-resolution";

// NOTE: Face resolution types are exported from types/index.ts

// Dynamic Deck Query Engine (Phase 6C)
export {
  // Engine
  DeckQueryEngine,
  createDeckQueryEngine,
  DEFAULT_ENGINE_CONFIG as DEFAULT_DECK_ENGINE_CONFIG,

  // Auto-updater
  DeckAutoUpdater,
  createDeckAutoUpdater,

  // Predicate evaluators
  evaluateCategoryFilter,
  evaluateSemanticRoleFilter,
  evaluateTagFilter,
  evaluateStateFilter,
  evaluateCardTypeFilter,
  evaluateDueFilter,
  evaluateSuspendedFilter,
  evaluateLeechFilter,
  evaluateNumericRange,
  evaluateIntegerRange,
  evaluateTemporalWindow,
  evaluateNotReviewedFor,
  evaluateLkgcPredicate,
  evaluateGraphPredicate,
  evaluateBaseQuery,

  // Helpers
  createMatchResult,

  // Constants
  DEFAULT_AUTO_UPDATE_CONFIG,
  DEFAULT_PAGE_SIZE,
  MAX_QUERY_COMPLEXITY,
  MAX_TRAVERSAL_DEPTH,
  MAX_COMBINATOR_OPERANDS,
} from "./dynamic-deck";

// Types unique to the dynamic-deck algorithms layer (not in types/)
export type {
  // Local types from predicate-evaluators
  CardEvaluationData,
  CardParticipationData,
  CategoryHierarchyData,
  FullEvaluationContext,
  PredicateMatchResult,

  // Local types from deck-query-engine
  DeckQueryEngineConfig,
  CardDataProvider,
  CategoryHierarchyProvider,
  DeckDefinitionProvider,

  // Local types from deck-auto-updater
  DeckTriggerEvent,
  DeckSnapshot,
} from "./dynamic-deck";

// NOTE: All dynamic-deck.types are exported from types/index.ts

// Review Session Orchestrator (Phase 6D)
export {
  // Orchestrator
  ReviewSessionOrchestrator,
  createSessionOrchestrator,
  buildContextIndicators,
  DEFAULT_SESSION_ORCHESTRATOR_CONFIG,

  // Adapters
  DeckFilterAdapter,
  FaceResolutionAdapter,
  FacePivotAnalyzer,
  DEFAULT_FACE_ADAPTER_CONFIG,

  // Explainability Builder
  ExplainabilityBuilder,
  DEFAULT_EXPLAINABILITY_CONFIG,
} from "./review-session";

// Types unique to the review-session algorithms layer (not in types/)
export type {
  // Adapter types
  DeckQueryEngineAdapter,
  FaceAdapterConfig,
  ExplainabilityConfig,
  PivotHistoryEntry,
  PivotPattern,
  PivotRecommendation,
} from "./review-session";

// NOTE: All review-session.types are exported from types/index.ts
