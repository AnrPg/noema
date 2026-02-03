/**
 * @module algorithms/dynamic-deck
 * @description Dynamic Decks as Query Views - Phase 6C Implementation
 *
 * This module provides the infrastructure for treating decks as live queries
 * over the learning ecosystem rather than static card collections.
 *
 * ## Architecture
 *
 * Dynamic decks are defined as declarative queries that:
 * 1. Filter cards based on multiple predicate types (category, role, tags, state, temporal, LKGC, graph)
 * 2. Support combinators (union, intersection, difference, symmetric_diff) for set operations
 * 3. Reference other decks to enable composition and nesting
 * 4. Auto-update as the underlying ecosystem changes
 * 5. Provide explainability for why cards are included/excluded
 *
 * ## Key Components
 *
 * - **DeckQueryEngine**: Core engine for evaluating deck queries against the ecosystem
 * - **PredicateEvaluators**: Functions for evaluating atomic predicates
 * - **DeckAutoUpdater**: Reactive system for automatic deck re-evaluation
 *
 * ## Usage Example
 *
 * ```typescript
 * import {
 *   DeckQueryEngine,
 *   DeckAutoUpdater,
 *   createDeckQueryEngine,
 *   createDeckAutoUpdater,
 * } from '@manthanein/shared/algorithms/dynamic-deck';
 *
 * // Create providers (implement these interfaces for your data store)
 * const providers = {
 *   cardDataProvider: myCardProvider,
 *   categoryHierarchyProvider: myCategoryProvider,
 *   deckDefinitionProvider: myDeckProvider,
 *   graphReader: myGraphReader,
 *   lkgcReader: myLkgcReader,
 * };
 *
 * // Initialize the query engine
 * const engine = createDeckQueryEngine(providers);
 *
 * // Evaluate a deck
 * const result = await engine.evaluate(myDeckDefinition);
 * console.log(result.includedCards); // Cards matching the query
 *
 * // Get explainability for a specific card
 * const explanation = await engine.explainCardInclusion(
 *   myDeckDefinition.id,
 *   cardId
 * );
 * console.log(explanation.summary); // Why this card is/isn't included
 *
 * // Set up auto-updates
 * const autoUpdater = createDeckAutoUpdater(engine);
 * autoUpdater.subscribe('deck-id', (event) => {
 *   console.log('Deck updated:', event.changes);
 * });
 * ```
 *
 * @see {@link DeckQueryEngine} for query evaluation
 * @see {@link DeckAutoUpdater} for reactive updates
 * @see {@link ../../types/dynamic-deck.types} for type definitions
 */

// =============================================================================
// PREDICATE EVALUATORS
// =============================================================================

export {
  // Type definitions
  type CardEvaluationData,
  type CardParticipationData,
  type CategoryHierarchyData,
  type FullEvaluationContext,
  type PredicateMatchResult,

  // Helper functions
  createMatchResult,

  // Category & Role filters
  evaluateCategoryFilter,
  evaluateSemanticRoleFilter,

  // Tag & State filters
  evaluateTagFilter,
  evaluateStateFilter,
  evaluateCardTypeFilter,
  evaluateDueFilter,
  evaluateSuspendedFilter,
  evaluateLeechFilter,

  // Range filters
  evaluateNumericRange,
  evaluateIntegerRange,

  // Temporal filters
  evaluateTemporalWindow,
  evaluateNotReviewedFor,

  // LKGC predicate
  evaluateLkgcPredicate,

  // Graph predicate
  evaluateGraphPredicate,

  // Base query evaluator
  evaluateBaseQuery,
} from "./predicate-evaluators";

// =============================================================================
// DECK QUERY ENGINE
// =============================================================================

export {
  // Main engine class
  DeckQueryEngine,

  // Factory function
  createDeckQueryEngine,

  // Configuration
  DEFAULT_ENGINE_CONFIG,

  // Type definitions
  type DeckQueryEngineConfig,
  type CardDataProvider,
  type CategoryHierarchyProvider,
  type DeckDefinitionProvider,
} from "./deck-query-engine";

// =============================================================================
// DECK AUTO-UPDATER
// =============================================================================

export {
  // Main auto-updater class
  DeckAutoUpdater,

  // Factory function
  createDeckAutoUpdater,

  // Type definitions
  type DeckTriggerEvent,
  type DeckSnapshot,
} from "./deck-auto-updater";

// =============================================================================
// RE-EXPORT TYPES FROM DYNAMIC-DECK.TYPES
// =============================================================================

export type {
  // Core deck types
  DynamicDeckId,
  DeckQueryId,
  PredicateId,
  DeckSnapshotId,
  InclusionExplanationId,
  DeckChangeEventId,
  DynamicDeckDefinition,

  // Query types
  DeckQuery,
  DeckQueryType,
  BaseDeckQuery,
  CombinatorQuery,
  DeckReferenceQuery,

  // Filter/State types
  CardState as DeckQueryCardState,
  NumericRange,
  IntegerRange,
  TemporalWindow,

  // LKGC predicates
  LkgcPredicate,
  LkgcSignalType as DeckQueryLkgcSignalType,
  ComparisonOperator,

  // Graph predicates
  GraphPredicate,
  DirectRelationPredicate,
  TransitiveReachabilityPredicate,
  NeighborhoodPredicate,
  PathExistsPredicate,
  SubgraphContainmentPredicate,
  CustomDeckPredicate,

  // Sorting
  DeckSortSpec,
  DeckSortField,
  DeckSortableField,

  // Evaluation types
  DeckQueryEvaluationInput,
  DeckQueryEvaluationResult,
  DeckCardResult,
  CardLkgcSignals,
  DeckEvaluationMetadata,
  DeckStatistics,

  // Explainability types
  CardInclusionExplanation,
  InclusionReason,
  QueryNodeMatch,
  InclusionFactor,
  InclusionFactorType,
  ExclusionThreat,

  // Auto-update types
  DeckAutoUpdateConfig,
  DeckUpdateTrigger,
  DeckChangeType,
  DeckChangeEvent,
  DeckSnapshotSummary,

  // Engine interface
  IDeckQueryEngine,
  DeckChangePreview,
  DeckQueryValidationResult,
  DeckQueryError,
  DeckQueryWarning,
  DeckQueryComplexity,

  // Predicate evaluation
  CustomPredicateEvaluator,
  PredicateEvaluationContext,
  PredicateEvaluationResult,

  // Graph/LKGC readers
  GraphReader,
  LkgcReader,
  GraphNode,
  GraphEdge,
  TraversalOptions,
  PathOptions,

  // Subscriptions
  DeckChangeCallback,
  DeckChangeSubscription,

  // Events
  DeckQueryEvent,
  DeckCreatedEvent,
  DeckUpdatedEvent,
  DeckDeletedEvent,
  DeckEvaluatedEvent,
  DeckCacheInvalidatedEvent,

  // Builders
  DeckQueryBuilder,
  BaseQueryBuilder,
  CombinatorQueryBuilder,
} from "../../types/dynamic-deck.types";

// Constants
export {
  DEFAULT_AUTO_UPDATE_CONFIG,
  DEFAULT_PAGE_SIZE,
  MAX_QUERY_COMPLEXITY,
  MAX_TRAVERSAL_DEPTH,
  MAX_COMBINATOR_OPERANDS,
} from "../../types/dynamic-deck.types";
