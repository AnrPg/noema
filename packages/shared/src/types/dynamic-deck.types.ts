// =============================================================================
// DYNAMIC DECK TYPES - Decks as Live Query Views
// =============================================================================
// Phase 6C: Dynamic Decks as Query Views (Data & Query Layer)
//
// PARADIGM: Decks are NOT containers. They are LIVE QUERIES over the ecosystem.
//
// A dynamic deck defines:
// - WHAT to include (filters, predicates, graph traversals)
// - HOW to combine (union, intersection, difference, nesting)
// - WHY cards match (explainability for every inclusion)
//
// DESIGN PRINCIPLES:
// 1. Decks are queries, not storage — cards are NEVER copied
// 2. Auto-update as structure and LKGC signals change
// 3. Composable via set operations (union, intersection, difference)
// 4. Full explainability: "why is this card here?"
// 5. Subgraph traversal support (follow graph relations)
// 6. Plugin-extensible predicates
// 7. LLM-agent ready (clean inputs/outputs)
//
// NO FACE RESOLUTION. NO SCHEDULING. NO UI.
// =============================================================================

import type { UserId } from "./user.types";
import type { CanonicalCardId } from "./canonical-card.types";
import type { CategoryId } from "./ecosystem.types";
import type {
  ExtendedSemanticRole,
  ProvenanceType,
  ParticipationId,
} from "./multi-belonging.types";
import type { NodeId, EdgeId } from "./lkgc/foundation";
import type { NodeType } from "./lkgc/nodes";
import type { EdgeType } from "./lkgc/edges";
import type { EdgeDirection } from "./lkgc/edges";
import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./lkgc/foundation";

// =============================================================================
// IDENTIFIERS
// =============================================================================

/** Unique identifier for a dynamic deck */
export type DynamicDeckId = string & { readonly __brand: "DynamicDeckId" };

/** Unique identifier for a deck query */
export type DeckQueryId = string & { readonly __brand: "DeckQueryId" };

/** Unique identifier for a query predicate */
export type PredicateId = string & { readonly __brand: "PredicateId" };

/** Unique identifier for a deck snapshot (point-in-time evaluation) */
export type DeckSnapshotId = string & { readonly __brand: "DeckSnapshotId" };

/** Unique identifier for an inclusion explanation */
export type InclusionExplanationId = string & {
  readonly __brand: "InclusionExplanationId";
};

/** Unique identifier for a change event */
export type DeckChangeEventId = string & {
  readonly __brand: "DeckChangeEventId";
};

// =============================================================================
// CORE DECK QUERY DEFINITION
// =============================================================================

/**
 * Dynamic Deck - A live query view over the ecosystem
 *
 * This is the DEFINITION, not the results. Evaluation happens lazily.
 */
export interface DynamicDeckDefinition {
  /** Unique identifier */
  readonly id: DynamicDeckId;

  /** Owner */
  readonly userId: UserId;

  // =========================================================================
  // METADATA
  // =========================================================================

  /** Human-readable name */
  readonly name: string;

  /** Description of what this deck captures */
  readonly description?: string;

  /** Icon for display */
  readonly iconEmoji?: string;

  /** Color for display */
  readonly color?: string;

  // =========================================================================
  // QUERY DEFINITION
  // =========================================================================

  /** The query that defines this deck's contents */
  readonly query: DeckQuery;

  // =========================================================================
  // BEHAVIOR
  // =========================================================================

  /** How results should be sorted */
  readonly sortSpec?: DeckSortSpec;

  /** Maximum cards to return (null = unlimited) */
  readonly limit?: number;

  /** Whether to include cards from archived categories */
  readonly includeArchived: boolean;

  // =========================================================================
  // CACHE HINTS
  // =========================================================================

  /** Cached card count (for display, may be stale) */
  readonly cachedCardCount: number;

  /** When the cache was last updated */
  readonly cacheUpdatedAt?: Timestamp;

  /** Cache TTL in milliseconds (null = no caching) */
  readonly cacheTtlMs?: Duration;

  // =========================================================================
  // TIMESTAMPS
  // =========================================================================

  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

// =============================================================================
// DECK QUERY - The query algebra
// =============================================================================

/**
 * A deck query is either:
 * - A base query (filters, predicates)
 * - A combinator (union, intersection, difference of other queries)
 * - A nested reference to another deck
 */
export type DeckQuery = BaseDeckQuery | CombinatorQuery | DeckReferenceQuery;

/**
 * Discriminator for query types
 */
export type DeckQueryType =
  | "base" // Filter-based query
  | "union" // A ∪ B
  | "intersection" // A ∩ B
  | "difference" // A \ B
  | "symmetric_diff" // A △ B
  | "reference"; // Reference another deck

// =============================================================================
// BASE QUERY - Filter predicates
// =============================================================================

/**
 * Base deck query - a set of filters/predicates that cards must match
 */
export interface BaseDeckQuery {
  readonly queryType: "base";

  /** Unique ID for this query node (for explainability) */
  readonly queryId: DeckQueryId;

  /** Human-readable label for this query */
  readonly label?: string;

  // =========================================================================
  // CATEGORY FILTERS
  // =========================================================================

  /** Include cards from these categories */
  readonly includeCategoryIds?: readonly CategoryId[];

  /** Exclude cards from these categories */
  readonly excludeCategoryIds?: readonly CategoryId[];

  /** Whether to include subcategories of included categories */
  readonly includeSubcategories: boolean;

  /** Whether to exclude subcategories of excluded categories */
  readonly excludeSubcategories: boolean;

  // =========================================================================
  // PARTICIPATION FILTERS
  // =========================================================================

  /** Filter by semantic role in the category */
  readonly semanticRoles?: readonly ExtendedSemanticRole[];

  /** Filter by primary participation */
  readonly isPrimary?: boolean;

  /** Filter by provenance type */
  readonly provenanceTypes?: readonly ProvenanceType[];

  // =========================================================================
  // TAG FILTERS
  // =========================================================================

  /** Include cards with ANY of these tags */
  readonly includeTagsAny?: readonly string[];

  /** Include cards with ALL of these tags */
  readonly includeTagsAll?: readonly string[];

  /** Exclude cards with ANY of these tags */
  readonly excludeTags?: readonly string[];

  // =========================================================================
  // STATE FILTERS
  // =========================================================================

  /** Filter by card states */
  readonly cardStates?: readonly CardState[];

  /** Filter by card types */
  readonly cardTypes?: readonly string[];

  /** Only include cards that are due */
  readonly isDue?: boolean;

  /** Only include cards that are suspended */
  readonly isSuspended?: boolean;

  /** Only include cards marked as leeches */
  readonly isLeech?: boolean;

  // =========================================================================
  // NUMERIC RANGE FILTERS
  // =========================================================================

  /** Difficulty range [0, 1] */
  readonly difficultyRange?: NumericRange;

  /** Stability range (days) */
  readonly stabilityRange?: NumericRange;

  /** Mastery range [0, 1] */
  readonly masteryRange?: NumericRange;

  /** Review count range */
  readonly reviewCountRange?: IntegerRange;

  /** Lapse count range */
  readonly lapseCountRange?: IntegerRange;

  // =========================================================================
  // LKGC SIGNAL FILTERS
  // =========================================================================

  /** LKGC signal predicates */
  readonly lkgcPredicates?: readonly LkgcPredicate[];

  // =========================================================================
  // TEMPORAL FILTERS
  // =========================================================================

  /** Created within timeframe */
  readonly createdWithin?: TemporalWindow;

  /** Last reviewed within timeframe */
  readonly lastReviewedWithin?: TemporalWindow;

  /** Due within timeframe */
  readonly dueWithin?: TemporalWindow;

  /** Not reviewed for at least this long */
  readonly notReviewedFor?: Duration;

  // =========================================================================
  // GRAPH TRAVERSAL PREDICATES
  // =========================================================================

  /** Graph-based predicates */
  readonly graphPredicates?: readonly GraphPredicate[];

  // =========================================================================
  // CUSTOM PREDICATES
  // =========================================================================

  /** Plugin-defined custom predicates */
  readonly customPredicates?: readonly CustomDeckPredicate[];
}

/**
 * Card learning states
 */
export type CardState =
  | "new"
  | "learning"
  | "review"
  | "relearning"
  | "mastered"
  | "suspended";

/**
 * Numeric range specification
 */
export interface NumericRange {
  readonly min?: number;
  readonly max?: number;
}

/**
 * Integer range specification
 */
export interface IntegerRange {
  readonly min?: number;
  readonly max?: number;
}

/**
 * Temporal window specification
 */
export interface TemporalWindow {
  /** Relative: within last N milliseconds */
  readonly withinMs?: Duration;

  /** Absolute: after this timestamp */
  readonly after?: Timestamp;

  /** Absolute: before this timestamp */
  readonly before?: Timestamp;
}

// =============================================================================
// LKGC SIGNAL PREDICATES
// =============================================================================

/**
 * Predicate based on LKGC metacognitive signals
 */
export interface LkgcPredicate {
  readonly predicateId: PredicateId;

  /** Signal type to check */
  readonly signalType: LkgcSignalType;

  /** Comparison operator */
  readonly operator: ComparisonOperator;

  /** Threshold value [0, 1] */
  readonly threshold: NormalizedValue;

  /** Optional: only within specific category context */
  readonly categoryId?: CategoryId;
}

/**
 * LKGC signal types that can be filtered on
 */
export type LkgcSignalType =
  | "confidence"
  | "stability"
  | "volatility"
  | "interference"
  | "coherence"
  | "recency"
  | "contextual_strength"
  | "mastery"
  | "retrievability"
  | "overconfidence"
  | "underconfidence";

/**
 * Comparison operators for predicates
 */
export type ComparisonOperator =
  | "eq" // Equal
  | "neq" // Not equal
  | "gt" // Greater than
  | "gte" // Greater than or equal
  | "lt" // Less than
  | "lte" // Less than or equal
  | "in" // In set
  | "nin"; // Not in set

// =============================================================================
// GRAPH TRAVERSAL PREDICATES
// =============================================================================

/**
 * Predicate based on graph relationships
 */
export type GraphPredicate =
  | DirectRelationPredicate
  | TransitiveReachabilityPredicate
  | NeighborhoodPredicate
  | PathExistsPredicate
  | SubgraphContainmentPredicate;

/**
 * Direct relation predicate - card has specific edge to/from target
 */
export interface DirectRelationPredicate {
  readonly predicateType: "direct_relation";
  readonly predicateId: PredicateId;

  /** Edge type(s) to match */
  readonly edgeTypes: readonly EdgeType[];

  /** Direction of the edge relative to the card */
  readonly direction: EdgeDirection;

  /** Target node ID (the card must have edge to/from this) */
  readonly targetNodeId?: NodeId;

  /** Target node type (the card must have edge to/from this type) */
  readonly targetNodeType?: NodeType;

  /** Minimum edge weight */
  readonly minWeight?: NormalizedValue;

  /** Minimum edge confidence */
  readonly minConfidence?: Confidence;
}

/**
 * Transitive reachability - card is reachable from/to target within depth
 */
export interface TransitiveReachabilityPredicate {
  readonly predicateType: "transitive_reachability";
  readonly predicateId: PredicateId;

  /** Starting node for traversal */
  readonly fromNodeId: NodeId;

  /** Edge types to traverse */
  readonly edgeTypes: readonly EdgeType[];

  /** Direction to traverse */
  readonly direction: EdgeDirection;

  /** Maximum depth (hops) */
  readonly maxDepth: number;

  /** Minimum edge weight to follow */
  readonly minWeight?: NormalizedValue;
}

/**
 * Neighborhood predicate - card has N neighbors matching criteria
 */
export interface NeighborhoodPredicate {
  readonly predicateType: "neighborhood";
  readonly predicateId: PredicateId;

  /** Edge types to consider */
  readonly edgeTypes?: readonly EdgeType[];

  /** Direction to look */
  readonly direction: EdgeDirection;

  /** Minimum number of neighbors */
  readonly minNeighbors?: number;

  /** Maximum number of neighbors */
  readonly maxNeighbors?: number;

  /** Filter neighbors by node type */
  readonly neighborNodeTypes?: readonly NodeType[];
}

/**
 * Path exists predicate - there exists a path between card and target
 */
export interface PathExistsPredicate {
  readonly predicateType: "path_exists";
  readonly predicateId: PredicateId;

  /** Target node */
  readonly targetNodeId: NodeId;

  /** Edge types allowed in path */
  readonly allowedEdgeTypes: readonly EdgeType[];

  /** Maximum path length */
  readonly maxPathLength: number;

  /** Direction to traverse */
  readonly direction: EdgeDirection;
}

/**
 * Subgraph containment - card must be in a specific subgraph
 */
export interface SubgraphContainmentPredicate {
  readonly predicateType: "subgraph_containment";
  readonly predicateId: PredicateId;

  /** Root node of the subgraph */
  readonly subgraphRootId: NodeId;

  /** Edge types that define the subgraph */
  readonly subgraphEdgeTypes: readonly EdgeType[];

  /** Direction from root */
  readonly direction: EdgeDirection;

  /** Maximum depth from root */
  readonly maxDepth?: number;
}

// =============================================================================
// CUSTOM PREDICATES
// =============================================================================

/**
 * Plugin-defined custom predicate
 */
export interface CustomDeckPredicate {
  readonly predicateId: PredicateId;

  /** Plugin that defines this predicate */
  readonly pluginId: string;

  /** Predicate type name (plugin-specific) */
  readonly predicateType: string;

  /** Plugin-specific parameters */
  readonly parameters: Readonly<Record<string, unknown>>;

  /** Human-readable description */
  readonly description?: string;
}

// =============================================================================
// COMBINATOR QUERIES - Set algebra
// =============================================================================

/**
 * Combinator query - combines multiple queries via set operations
 */
export interface CombinatorQuery {
  readonly queryType:
    | "union"
    | "intersection"
    | "difference"
    | "symmetric_diff";

  /** Unique ID for this query node */
  readonly queryId: DeckQueryId;

  /** Human-readable label */
  readonly label?: string;

  /** Operand queries */
  readonly operands: readonly DeckQuery[];
}

/**
 * Reference to another deck (for composition)
 */
export interface DeckReferenceQuery {
  readonly queryType: "reference";

  /** Unique ID for this query node */
  readonly queryId: DeckQueryId;

  /** Human-readable label */
  readonly label?: string;

  /** Referenced deck ID */
  readonly deckId: DynamicDeckId;

  /** Whether to inherit the referenced deck's sort/limit */
  readonly inheritBehavior: boolean;
}

// =============================================================================
// SORTING
// =============================================================================

/**
 * Sort specification for deck results
 */
export interface DeckSortSpec {
  /** Fields to sort by (in order of precedence) */
  readonly fields: readonly DeckSortField[];
}

/**
 * Individual sort field
 */
export interface DeckSortField {
  readonly field: DeckSortableField;
  readonly direction: "asc" | "desc";

  /** For category-specific fields, which category */
  readonly categoryId?: CategoryId;
}

/**
 * Fields that can be sorted on
 */
export type DeckSortableField =
  // Temporal
  | "due_date"
  | "created_at"
  | "updated_at"
  | "last_reviewed_at"
  // Difficulty & scheduling
  | "difficulty"
  | "stability"
  | "retrievability"
  | "interval"
  // Performance
  | "mastery"
  | "review_count"
  | "lapse_count"
  | "accuracy"
  // LKGC signals
  | "confidence"
  | "volatility"
  | "interference"
  | "coherence"
  // Position
  | "position"
  | "position_in_category"
  // Random (for shuffle)
  | "random";

// =============================================================================
// QUERY EVALUATION - Inputs and outputs
// =============================================================================

/**
 * Input for evaluating a deck query
 */
export interface DeckQueryEvaluationInput {
  /** The deck or query to evaluate */
  readonly query: DeckQuery | DynamicDeckId;

  /** User context */
  readonly userId: UserId;

  /** Timestamp for temporal calculations */
  readonly timestamp: Timestamp;

  /** Optional: override sort */
  readonly sortOverride?: DeckSortSpec;

  /** Optional: override limit */
  readonly limitOverride?: number;

  /** Optional: pagination cursor */
  readonly cursor?: string;

  /** Page size (default: 50) */
  readonly pageSize?: number;

  /** Whether to include full explainability */
  readonly includeExplainability: boolean;

  /** Whether to include LKGC signals in results */
  readonly includeLkgcSignals: boolean;

  /** Specific card IDs to check (for "why is this card here?" queries) */
  readonly specificCardIds?: readonly CanonicalCardId[];
}

/**
 * Result of evaluating a deck query
 */
export interface DeckQueryEvaluationResult {
  /** Query that was evaluated */
  readonly queryId: DeckQueryId;

  /** Deck ID if this was a deck evaluation */
  readonly deckId?: DynamicDeckId;

  /** Matching cards */
  readonly cards: readonly DeckCardResult[];

  /** Total count (may differ from cards.length due to pagination) */
  readonly totalCount: number;

  /** Pagination cursor for next page */
  readonly nextCursor?: string;

  /** Whether there are more results */
  readonly hasMore: boolean;

  /** Evaluation metadata */
  readonly metadata: DeckEvaluationMetadata;

  /** Aggregate statistics */
  readonly statistics: DeckStatistics;
}

/**
 * A card in the deck result
 */
export interface DeckCardResult {
  /** Card ID */
  readonly cardId: CanonicalCardId;

  /** Position in the result set */
  readonly position: number;

  /** Sort key values (for debugging/inspection) */
  readonly sortKeys: Readonly<Record<string, unknown>>;

  /** LKGC signals (if requested) */
  readonly lkgcSignals?: CardLkgcSignals;

  /** Participation IDs that caused this card to be included */
  readonly matchingParticipationIds: readonly ParticipationId[];

  /** Categories this card participates in (that matched the query) */
  readonly matchingCategoryIds: readonly CategoryId[];

  /** Why this card is included (if explainability requested) */
  readonly inclusion?: CardInclusionExplanation;
}

/**
 * LKGC signals for a card
 */
export interface CardLkgcSignals {
  readonly confidence: NormalizedValue;
  readonly stability: NormalizedValue;
  readonly volatility: NormalizedValue;
  readonly interference: NormalizedValue;
  readonly coherence: NormalizedValue;
  readonly recency: NormalizedValue;
  readonly contextualStrength: NormalizedValue;
  readonly mastery: NormalizedValue;
  readonly retrievability: NormalizedValue;
}

/**
 * Metadata about the evaluation
 */
export interface DeckEvaluationMetadata {
  /** When evaluation started */
  readonly evaluatedAt: Timestamp;

  /** How long evaluation took (ms) */
  readonly evaluationDurationMs: number;

  /** Whether results came from cache */
  readonly fromCache: boolean;

  /** Cache age if from cache (ms) */
  readonly cacheAgeMs?: number;

  /** Query complexity score (for performance monitoring) */
  readonly complexityScore: number;

  /** Number of predicates evaluated */
  readonly predicatesEvaluated: number;

  /** Number of graph traversals performed */
  readonly graphTraversals: number;
}

/**
 * Aggregate statistics for the deck
 */
export interface DeckStatistics {
  /** Total cards in deck */
  readonly totalCards: number;

  /** Cards due now */
  readonly dueNow: number;

  /** Cards due today */
  readonly dueToday: number;

  /** New cards (never reviewed) */
  readonly newCards: number;

  /** Learning cards */
  readonly learningCards: number;

  /** Review cards */
  readonly reviewCards: number;

  /** Average difficulty */
  readonly avgDifficulty: number;

  /** Average mastery */
  readonly avgMastery: number;

  /** Cards by state */
  readonly cardsByState: Readonly<Record<CardState, number>>;

  /** Categories represented */
  readonly categoryCount: number;
}

// =============================================================================
// CARD INCLUSION EXPLAINABILITY
// =============================================================================

/**
 * Explanation for why a card is included in a deck
 */
export interface CardInclusionExplanation {
  readonly explanationId: InclusionExplanationId;

  /** The card being explained */
  readonly cardId: CanonicalCardId;

  /** The deck this explanation is for */
  readonly deckId: DynamicDeckId;

  /** Overall confidence that this card belongs */
  readonly confidence: Confidence;

  /** Human-readable summary */
  readonly summary: string;

  /** Detailed reasoning chain */
  readonly reasoningChain: readonly InclusionReason[];

  /** Which query nodes matched (for combinator queries) */
  readonly matchedQueryNodes: readonly QueryNodeMatch[];

  /** Factors contributing to inclusion */
  readonly contributingFactors: readonly InclusionFactor[];

  /** What would cause this card to be excluded */
  readonly exclusionThreats: readonly ExclusionThreat[];
}

/**
 * A single reason in the inclusion chain
 */
export interface InclusionReason {
  /** Predicate or filter that matched */
  readonly predicateId: PredicateId;

  /** Human-readable description */
  readonly description: string;

  /** The actual value that matched */
  readonly matchedValue: unknown;

  /** The predicate's expected value/range */
  readonly expectedValue: unknown;

  /** Confidence of this specific match */
  readonly confidence: Confidence;
}

/**
 * Query node that matched
 */
export interface QueryNodeMatch {
  /** Query node ID */
  readonly queryId: DeckQueryId;

  /** Query node label */
  readonly label?: string;

  /** Query type */
  readonly queryType: DeckQueryType;

  /** Whether this node matched */
  readonly matched: boolean;

  /** Match score (for ranking) */
  readonly score: number;

  /** Child node matches (for combinators) */
  readonly childMatches?: readonly QueryNodeMatch[];
}

/**
 * Factor contributing to inclusion
 */
export interface InclusionFactor {
  /** Factor type */
  readonly factorType: InclusionFactorType;

  /** Human-readable description */
  readonly description: string;

  /** Weight of this factor */
  readonly weight: number;

  /** Specific evidence */
  readonly evidence: unknown;
}

/**
 * Types of inclusion factors
 */
export type InclusionFactorType =
  | "category_membership"
  | "tag_match"
  | "state_match"
  | "lkgc_signal"
  | "graph_relation"
  | "temporal_match"
  | "numeric_range"
  | "custom_predicate";

/**
 * Potential threat to card's inclusion
 */
export interface ExclusionThreat {
  /** What could cause exclusion */
  readonly threat: string;

  /** How close the card is to being excluded */
  readonly proximity: NormalizedValue;

  /** Which predicate would trigger exclusion */
  readonly predicateId?: PredicateId;
}

// =============================================================================
// AUTO-UPDATE & CHANGE TRACKING
// =============================================================================

/**
 * Configuration for deck auto-update behavior
 */
export interface DeckAutoUpdateConfig {
  /** Whether auto-update is enabled */
  readonly enabled: boolean;

  /** Minimum interval between updates (ms) */
  readonly minIntervalMs: Duration;

  /** Triggers that cause re-evaluation */
  readonly triggers: readonly DeckUpdateTrigger[];

  /** Whether to notify on changes */
  readonly notifyOnChanges: boolean;

  /** Types of changes to notify about */
  readonly notifyChangeTypes: readonly DeckChangeType[];
}

/**
 * Events that can trigger deck re-evaluation
 */
export type DeckUpdateTrigger =
  | "card_created"
  | "card_updated"
  | "card_deleted"
  | "card_reviewed"
  | "card_state_changed"
  | "participation_created"
  | "participation_updated"
  | "participation_deleted"
  | "category_updated"
  | "lkgc_signal_changed"
  | "tag_changed"
  | "manual"
  | "scheduled";

/**
 * Types of changes to a deck's contents
 */
export type DeckChangeType =
  | "card_added"
  | "card_removed"
  | "card_reordered"
  | "statistics_changed";

/**
 * A change event for a deck
 */
export interface DeckChangeEvent {
  readonly eventId: DeckChangeEventId;
  readonly deckId: DynamicDeckId;
  readonly timestamp: Timestamp;
  readonly changeType: DeckChangeType;

  /** Cards affected by this change */
  readonly affectedCardIds: readonly CanonicalCardId[];

  /** What triggered this change */
  readonly trigger: DeckUpdateTrigger;

  /** Previous state (for rollback/comparison) */
  readonly previousSnapshot?: DeckSnapshotSummary;

  /** New state */
  readonly newSnapshot: DeckSnapshotSummary;
}

/**
 * Summary of a deck snapshot (lightweight)
 */
export interface DeckSnapshotSummary {
  readonly snapshotId: DeckSnapshotId;
  readonly timestamp: Timestamp;
  readonly cardCount: number;
  readonly cardIdHash: string; // Hash of sorted card IDs for quick comparison
}

// =============================================================================
// DECK QUERY ENGINE INTERFACE
// =============================================================================

/**
 * Interface for the deck query evaluation engine
 *
 * Implementations must be:
 * - Stateless (all state comes from inputs)
 * - Deterministic (same inputs → same outputs)
 * - Side-effect free (no mutations)
 */
export interface IDeckQueryEngine {
  /**
   * Evaluate a deck query and return matching cards
   */
  evaluate(input: DeckQueryEvaluationInput): Promise<DeckQueryEvaluationResult>;

  /**
   * Explain why a specific card is/isn't in a deck
   */
  explainCardInclusion(
    cardId: CanonicalCardId,
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<CardInclusionExplanation | null>;

  /**
   * Preview what cards would be affected by a query change
   */
  previewQueryChange(
    deckId: DynamicDeckId,
    newQuery: DeckQuery,
    userId: UserId,
  ): Promise<DeckChangePreview>;

  /**
   * Get deck statistics without full evaluation
   */
  getStatistics(deckId: DynamicDeckId, userId: UserId): Promise<DeckStatistics>;

  /**
   * Validate a deck query for errors/warnings
   */
  validateQuery(query: DeckQuery): DeckQueryValidationResult;

  /**
   * Register a custom predicate evaluator
   */
  registerPredicateEvaluator(
    pluginId: string,
    predicateType: string,
    evaluator: CustomPredicateEvaluator,
  ): void;

  /**
   * Subscribe to deck changes
   */
  subscribeToChanges(
    deckId: DynamicDeckId,
    callback: DeckChangeCallback,
  ): DeckChangeSubscription;
}

/**
 * Preview of changes from modifying a deck query
 */
export interface DeckChangePreview {
  readonly deckId: DynamicDeckId;

  /** Cards that would be added */
  readonly cardsToAdd: readonly CanonicalCardId[];

  /** Cards that would be removed */
  readonly cardsToRemove: readonly CanonicalCardId[];

  /** Cards that would change position */
  readonly cardsToReorder: readonly CanonicalCardId[];

  /** Net change in card count */
  readonly netChange: number;

  /** New statistics */
  readonly newStatistics: DeckStatistics;
}

/**
 * Result of validating a deck query
 */
export interface DeckQueryValidationResult {
  readonly valid: boolean;
  readonly errors: readonly DeckQueryError[];
  readonly warnings: readonly DeckQueryWarning[];
  readonly complexity: DeckQueryComplexity;
}

/**
 * Error in a deck query
 */
export interface DeckQueryError {
  readonly code: string;
  readonly message: string;
  readonly path: string; // JSON path to the error
  readonly queryId?: DeckQueryId;
}

/**
 * Warning about a deck query
 */
export interface DeckQueryWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly queryId?: DeckQueryId;
  readonly suggestion?: string;
}

/**
 * Complexity assessment of a deck query
 */
export interface DeckQueryComplexity {
  /** Overall complexity score (1-10) */
  readonly score: number;

  /** Number of predicates */
  readonly predicateCount: number;

  /** Number of graph traversals */
  readonly graphTraversalCount: number;

  /** Maximum traversal depth */
  readonly maxTraversalDepth: number;

  /** Number of combinator operations */
  readonly combinatorCount: number;

  /** Estimated evaluation time (ms) */
  readonly estimatedTimeMs: number;

  /** Performance warnings */
  readonly performanceWarnings: readonly string[];
}

// =============================================================================
// CUSTOM PREDICATE EVALUATION
// =============================================================================

/**
 * Custom predicate evaluator function (plugin-provided)
 */
export type CustomPredicateEvaluator = (
  context: PredicateEvaluationContext,
) => Promise<PredicateEvaluationResult>;

/**
 * Context for evaluating a custom predicate
 */
export interface PredicateEvaluationContext {
  /** The predicate to evaluate */
  readonly predicate: CustomDeckPredicate;

  /** Card ID being tested */
  readonly cardId: CanonicalCardId;

  /** User context */
  readonly userId: UserId;

  /** Timestamp */
  readonly timestamp: Timestamp;

  /** Access to graph store (read-only) */
  readonly graphReader: GraphReader;

  /** Access to LKGC signals */
  readonly lkgcReader: LkgcReader;
}

/**
 * Result of predicate evaluation
 */
export interface PredicateEvaluationResult {
  /** Whether the card matches */
  readonly matches: boolean;

  /** Confidence in the match */
  readonly confidence: Confidence;

  /** Explanation for the result */
  readonly explanation: string;

  /** Detailed match info */
  readonly matchDetails?: Readonly<Record<string, unknown>>;
}

/**
 * Read-only interface to the graph
 */
export interface GraphReader {
  getNode(id: NodeId): Promise<GraphNode | undefined>;
  getEdges(
    nodeId: NodeId,
    direction: EdgeDirection,
    edgeTypes?: readonly EdgeType[],
  ): Promise<readonly GraphEdge[]>;
  traverse(
    startId: NodeId,
    options: TraversalOptions,
  ): Promise<readonly NodeId[]>;
  pathExists(
    fromId: NodeId,
    toId: NodeId,
    options: PathOptions,
  ): Promise<boolean>;
}

/**
 * Read-only interface to LKGC signals
 */
export interface LkgcReader {
  getSignals(
    cardId: CanonicalCardId,
    categoryId?: CategoryId,
  ): Promise<CardLkgcSignals>;
  getSignal(
    cardId: CanonicalCardId,
    signalType: LkgcSignalType,
    categoryId?: CategoryId,
  ): Promise<NormalizedValue>;
}

/**
 * Minimal graph node for queries
 */
export interface GraphNode {
  readonly id: NodeId;
  readonly nodeType: NodeType;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Minimal graph edge for queries
 */
export interface GraphEdge {
  readonly id: EdgeId;
  readonly edgeType: EdgeType;
  readonly sourceId: NodeId;
  readonly targetId: NodeId;
  readonly weight: NormalizedValue;
  readonly confidence: Confidence;
}

/**
 * Options for graph traversal
 */
export interface TraversalOptions {
  readonly edgeTypes?: readonly EdgeType[];
  readonly direction: EdgeDirection;
  readonly maxDepth: number;
  readonly minWeight?: NormalizedValue;
  readonly limit?: number;
}

/**
 * Options for path finding
 */
export interface PathOptions {
  readonly allowedEdgeTypes: readonly EdgeType[];
  readonly direction: EdgeDirection;
  readonly maxPathLength: number;
}

// =============================================================================
// CHANGE SUBSCRIPTION
// =============================================================================

/**
 * Callback for deck changes
 */
export type DeckChangeCallback = (event: DeckChangeEvent) => void;

/**
 * Subscription handle
 */
export interface DeckChangeSubscription {
  /** Unsubscribe from changes */
  unsubscribe(): void;

  /** Check if subscription is active */
  readonly active: boolean;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Event types for deck query system
 */
export type DeckQueryEvent =
  | DeckCreatedEvent
  | DeckUpdatedEvent
  | DeckDeletedEvent
  | DeckEvaluatedEvent
  | DeckCacheInvalidatedEvent;

export interface DeckCreatedEvent {
  readonly eventType: "deck_created";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly deck: DynamicDeckDefinition;
}

export interface DeckUpdatedEvent {
  readonly eventType: "deck_updated";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly previousQuery: DeckQuery;
  readonly newQuery: DeckQuery;
}

export interface DeckDeletedEvent {
  readonly eventType: "deck_deleted";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

export interface DeckEvaluatedEvent {
  readonly eventType: "deck_evaluated";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly metadata: DeckEvaluationMetadata;
  readonly resultCount: number;
}

export interface DeckCacheInvalidatedEvent {
  readonly eventType: "deck_cache_invalidated";
  readonly deckId: DynamicDeckId;
  readonly timestamp: Timestamp;
  readonly reason: DeckUpdateTrigger;
}

// =============================================================================
// BUILDER UTILITIES
// =============================================================================

/**
 * Fluent builder for deck queries
 */
export interface DeckQueryBuilder {
  /** Start a base query */
  base(): BaseQueryBuilder;

  /** Union of queries */
  union(...queries: readonly DeckQuery[]): CombinatorQueryBuilder;

  /** Intersection of queries */
  intersection(...queries: readonly DeckQuery[]): CombinatorQueryBuilder;

  /** Difference of queries (first minus rest) */
  difference(
    primary: DeckQuery,
    ...subtract: readonly DeckQuery[]
  ): CombinatorQueryBuilder;

  /** Reference another deck */
  reference(deckId: DynamicDeckId): DeckReferenceQuery;
}

/**
 * Builder for base queries
 */
export interface BaseQueryBuilder {
  /** Include categories */
  includeCategories(...categoryIds: readonly CategoryId[]): BaseQueryBuilder;

  /** Exclude categories */
  excludeCategories(...categoryIds: readonly CategoryId[]): BaseQueryBuilder;

  /** Filter by semantic roles */
  withRoles(...roles: readonly ExtendedSemanticRole[]): BaseQueryBuilder;

  /** Filter by tags (any) */
  withTagsAny(...tags: readonly string[]): BaseQueryBuilder;

  /** Filter by tags (all) */
  withTagsAll(...tags: readonly string[]): BaseQueryBuilder;

  /** Exclude tags */
  excludeTags(...tags: readonly string[]): BaseQueryBuilder;

  /** Filter by card states */
  inStates(...states: readonly CardState[]): BaseQueryBuilder;

  /** Filter by difficulty range */
  difficultyBetween(min: number, max: number): BaseQueryBuilder;

  /** Filter by mastery range */
  masteryBetween(min: number, max: number): BaseQueryBuilder;

  /** Add LKGC predicate */
  withLkgcPredicate(
    signalType: LkgcSignalType,
    operator: ComparisonOperator,
    threshold: NormalizedValue,
  ): BaseQueryBuilder;

  /** Add graph predicate */
  withGraphPredicate(predicate: GraphPredicate): BaseQueryBuilder;

  /** Only due cards */
  onlyDue(): BaseQueryBuilder;

  /** Build the query */
  build(): BaseDeckQuery;
}

/**
 * Builder for combinator queries
 */
export interface CombinatorQueryBuilder {
  /** Set label */
  label(label: string): CombinatorQueryBuilder;

  /** Build the query */
  build(): CombinatorQuery;
}

// =============================================================================
// CONSTANTS & DEFAULTS
// =============================================================================

/**
 * Default configuration for deck auto-update
 */
export const DEFAULT_AUTO_UPDATE_CONFIG: DeckAutoUpdateConfig = {
  enabled: true,
  minIntervalMs: 5000 as Duration, // 5 seconds
  triggers: [
    "card_created",
    "card_deleted",
    "card_state_changed",
    "participation_created",
    "participation_deleted",
    "tag_changed",
  ],
  notifyOnChanges: true,
  notifyChangeTypes: ["card_added", "card_removed"],
};

/**
 * Default page size for query results
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Maximum allowed query complexity score
 */
export const MAX_QUERY_COMPLEXITY = 10;

/**
 * Maximum traversal depth for graph predicates
 */
export const MAX_TRAVERSAL_DEPTH = 10;

/**
 * Maximum number of operands in a combinator query
 */
export const MAX_COMBINATOR_OPERANDS = 20;
