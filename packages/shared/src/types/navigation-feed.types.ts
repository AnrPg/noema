// =============================================================================
// NAVIGATION FEED TYPES
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// Navigation feeds produce mode-aware suggestions for what to explore next.
// This is SEPARATE from review scheduling - these are about discovery and
// curriculum navigation, not memory optimization.
//
// Four feed types:
// 1. Neighborhood Feeds - Adjacent categories in the knowledge graph
// 2. Prerequisite Path Feeds - Dependencies and foundational gaps
// 3. Coverage Feeds - Completeness tracking for exam/goal modes
// 4. Constellation Challenge Feeds - Cross-context synthesis opportunities
//
// Each mode emphasizes different feeds:
// - Exploration: Neighborhood (high serendipity) + Bridge suggestions
// - Goal-Driven: Prerequisites (strict) + Coverage gaps
// - Exam-Oriented: Coverage (breadth) + Critical prerequisites
// - Synthesis: Constellation + Bridge connections
// =============================================================================

import type { CardId, UserId } from "./user.types";
import type {
  CategoryId,
  ViewLens,
  CategoryRelationType,
} from "./ecosystem.types";
import type {
  ParticipationId as _ParticipationId,
  BridgeType,
  SynthesisPromptType as _SynthesisPromptType,
  ConnectionType,
} from "./multi-belonging.types";
import type {
  LearningModeId,
  NavigationSuggestionId,
  NavigationSuggestionType,
  NavigationTarget,
  ExplainabilityTraceId,
} from "./learning-mode.types";
import type { Timestamp, NormalizedValue, Confidence } from "./lkgc/foundation";

// =============================================================================
// IDENTIFIERS
// =============================================================================

export type NavigationFeedId = string;
export type NeighborhoodNodeId = string;
export type PrerequisitePathId = string;
export type CoverageGapId = string;
export type ConstellationChallengeId = string;

// =============================================================================
// NAVIGATION FEED REQUEST - Input to feed generators
// =============================================================================

/**
 * Base request for generating navigation feeds
 */
export interface NavigationFeedRequest {
  /** User requesting the feed */
  readonly userId: UserId;

  /** Active learning mode */
  readonly modeId: LearningModeId;

  /** Current context (if any) */
  readonly currentCategoryId?: CategoryId;

  /** Current card being studied (if any) */
  readonly currentCardId?: CardId;

  /** Active view lens */
  readonly viewLens?: ViewLens;

  /** Resolved mode parameters */
  readonly modeParameters: Record<string, unknown>;

  /** Maximum suggestions per feed type */
  readonly maxSuggestionsPerType?: number;

  /** Include explainability traces */
  readonly includeExplainability?: boolean;

  /** Timestamp for freshness */
  readonly requestedAt: Timestamp;
}

/**
 * Neighborhood-specific request options
 */
export interface NeighborhoodFeedOptions {
  /** Maximum hops from current category */
  readonly maxHops?: number;

  /** Minimum relation strength to include */
  readonly minRelationStrength?: number;

  /** Relation types to follow */
  readonly relationTypes?: CategoryRelationType[];

  /** Novelty weight (0-1, how much to prefer unseen) */
  readonly noveltyWeight?: number;

  /** Serendipity factor (0-1, how much to include surprises) */
  readonly serendipityFactor?: number;

  /** Bridge bonus weight (extra priority for bridge opportunities) */
  readonly bridgeBonusWeight?: number;
}

/**
 * Prerequisite path request options
 */
export interface PrerequisitePathOptions {
  /** Maximum depth to traverse prerequisites */
  readonly maxDepth?: number;

  /** Strictness level (0=soft suggestions, 1=hard gating) */
  readonly strictnessLevel?: number;

  /** Foundation stability threshold (below this = gap) */
  readonly foundationStabilityThreshold?: number;

  /** Include transitive prerequisites */
  readonly includeTransitive?: boolean;

  /** Gap detection sensitivity */
  readonly gapSensitivity?: number;
}

/**
 * Coverage feed request options
 */
export interface CoverageFeedOptions {
  /** Target categories for coverage analysis */
  readonly targetCategoryIds?: CategoryId[];

  /** Coverage goal (how complete to aim for) */
  readonly coverageGoal?: number;

  /** Breadth vs depth slider (0=depth, 1=breadth) */
  readonly breadthVsDepthSlider?: number;

  /** Minimum mastery level to count as "covered" */
  readonly coveredMasteryThreshold?: number;

  /** Time window for coverage (exam date, etc.) */
  readonly coverageWindowDays?: number;

  /** Weight critical vs peripheral content */
  readonly criticalContentWeight?: number;
}

/**
 * Constellation challenge request options
 */
export interface ConstellationChallengeOptions {
  /** Minimum participations for a card to be eligible */
  readonly minParticipations?: number;

  /** Minimum performance divergence to flag */
  readonly minDivergence?: number;

  /** Bridge types to include */
  readonly bridgeTypes?: BridgeType[];

  /** Challenge difficulty (0-1) */
  readonly challengeDifficulty?: number;

  /** Edge types allowed for path finding */
  readonly allowedEdgeTypes?: CategoryRelationType[];

  /** Maximum connection hops */
  readonly maxConnectionHops?: number;
}

// =============================================================================
// NEIGHBORHOOD FEED - Adjacent categories to explore
// =============================================================================

/**
 * A node in the neighborhood graph
 */
export interface NeighborhoodNode {
  readonly id: NeighborhoodNodeId;

  /** Category this node represents */
  readonly categoryId: CategoryId;

  /** Category name for display */
  readonly categoryName: string;

  /** Framing question of the category */
  readonly framingQuestion?: string;

  /** Distance from current category (hops) */
  readonly distanceFromCurrent: number;

  /** Relation that connects to this node */
  readonly connectionRelation?: {
    readonly type: CategoryRelationType;
    readonly strength: number;
    readonly epistemicBridge?: string;
  };

  /** User's current mastery in this category */
  readonly currentMastery?: NormalizedValue;

  /** Cards available in this category */
  readonly cardCount: number;

  /** Cards user has studied */
  readonly studiedCardCount: number;

  /** Is this a "bridge" opportunity? */
  readonly isBridgeOpportunity: boolean;

  /** Novelty score (how fresh/unseen) */
  readonly noveltyScore: NormalizedValue;

  /** Serendipity flag (surprise suggestion) */
  readonly isSerendipitous: boolean;
}

/**
 * Edge in the neighborhood graph
 */
export interface NeighborhoodEdge {
  /** Source category */
  readonly fromCategoryId: CategoryId;

  /** Target category */
  readonly toCategoryId: CategoryId;

  /** Relation type */
  readonly relationType: CategoryRelationType;

  /** Relation strength */
  readonly strength: number;

  /** What viewing through this lens reveals */
  readonly epistemicBridge?: string;

  /** Is this edge bidirectional? */
  readonly isBidirectional: boolean;
}

/**
 * Complete neighborhood feed
 */
export interface NeighborhoodFeed {
  readonly id: NavigationFeedId;
  readonly type: "neighborhood";

  /** Current category (center of the neighborhood) */
  readonly centerId: CategoryId;

  /** Nodes in the neighborhood (includes center) */
  readonly nodes: readonly NeighborhoodNode[];

  /** Edges connecting nodes */
  readonly edges: readonly NeighborhoodEdge[];

  /** Ranked suggestions (what to explore next) */
  readonly suggestions: readonly NeighborhoodSuggestion[];

  /** Optional: subgraph for visualization */
  readonly visualizationData?: NeighborhoodVisualizationData;

  /** Generation metadata */
  readonly metadata: NavigationFeedMetadata;
}

/**
 * Single neighborhood suggestion
 */
export interface NeighborhoodSuggestion {
  readonly id: NavigationSuggestionId;
  readonly type: Extract<
    NavigationSuggestionType,
    "adjacent_category" | "bridge" | "serendipity"
  >;

  /** Target node */
  readonly target: NavigationTarget;

  /** Node data */
  readonly node: NeighborhoodNode;

  /** Priority score */
  readonly priority: NormalizedValue;

  /** Human-readable reason */
  readonly reason: string;

  /** Detailed factors */
  readonly factors: NeighborhoodSuggestionFactors;

  /** Explainability trace ID */
  readonly explainabilityTraceId?: ExplainabilityTraceId;
}

/**
 * Factors that contributed to a neighborhood suggestion
 */
export interface NeighborhoodSuggestionFactors {
  /** Relation strength contribution */
  readonly relationStrengthScore: number;

  /** Novelty contribution */
  readonly noveltyScore: number;

  /** Bridge opportunity bonus */
  readonly bridgeBonusScore: number;

  /** Serendipity contribution */
  readonly serendipityScore: number;

  /** User's interest signal (from history) */
  readonly interestScore: number;

  /** Prerequisite satisfaction */
  readonly prerequisiteSatisfaction: NormalizedValue;
}

/**
 * Data for visualizing neighborhood as a graph
 */
export interface NeighborhoodVisualizationData {
  /** Node positions (x, y normalized to 0-1) */
  readonly nodePositions: Record<CategoryId, { x: number; y: number }>;

  /** Suggested layout algorithm */
  readonly layoutAlgorithm: "force_directed" | "radial" | "hierarchical";

  /** Highlight current category */
  readonly centerId: CategoryId;

  /** Highlight suggested paths */
  readonly highlightedPaths: readonly {
    nodeIds: readonly CategoryId[];
    color: string;
    label: string;
  }[];
}

// =============================================================================
// PREREQUISITE PATH FEED - Dependencies and foundational gaps
// =============================================================================

/**
 * A prerequisite node in the dependency graph
 */
export interface PrerequisiteNode {
  readonly id: string;

  /** Category ID */
  readonly categoryId: CategoryId;

  /** Category name */
  readonly categoryName: string;

  /** Depth in prerequisite tree (0 = direct prerequisite) */
  readonly depth: number;

  /** Is this a foundational gap? */
  readonly isGap: boolean;

  /** User's mastery level */
  readonly mastery: NormalizedValue;

  /** Stability of knowledge */
  readonly stability: NormalizedValue;

  /** Is this blocking progress? */
  readonly isBlocking: boolean;

  /** Cards in this category */
  readonly cardCount: number;

  /** Cards mastered */
  readonly masteredCardCount: number;

  /** Estimated time to complete (minutes) */
  readonly estimatedTimeMinutes?: number;
}

/**
 * A path through prerequisites
 */
export interface PrerequisitePath {
  readonly id: PrerequisitePathId;

  /** Ordered nodes from foundation to target */
  readonly nodes: readonly PrerequisiteNode[];

  /** Total gaps in this path */
  readonly gapCount: number;

  /** Overall completion */
  readonly completion: NormalizedValue;

  /** Is this a critical path? */
  readonly isCritical: boolean;

  /** Estimated total time */
  readonly estimatedTotalTimeMinutes?: number;
}

/**
 * Complete prerequisite path feed
 */
export interface PrerequisitePathFeed {
  readonly id: NavigationFeedId;
  readonly type: "prerequisite_path";

  /** Target category (what we're building toward) */
  readonly targetCategoryId: CategoryId;

  /** All prerequisite nodes */
  readonly allNodes: readonly PrerequisiteNode[];

  /** Computed paths */
  readonly paths: readonly PrerequisitePath[];

  /** Detected gaps (ordered by importance) */
  readonly gaps: readonly PrerequisiteGap[];

  /** Ranked suggestions */
  readonly suggestions: readonly PrerequisiteSuggestion[];

  /** Dependency graph edges */
  readonly dependencyEdges: readonly PrerequisiteEdge[];

  /** Generation metadata */
  readonly metadata: NavigationFeedMetadata;
}

/**
 * Edge in prerequisite graph
 */
export interface PrerequisiteEdge {
  /** Source (prerequisite) category */
  readonly fromCategoryId: CategoryId;

  /** Target (dependent) category */
  readonly toCategoryId: CategoryId;

  /** Strength of dependency */
  readonly dependencyStrength: NormalizedValue;

  /** Type of dependency */
  readonly dependencyType: "hard" | "soft" | "recommended";

  /** Is this satisfied? */
  readonly isSatisfied: boolean;
}

/**
 * A detected prerequisite gap
 */
export interface PrerequisiteGap {
  readonly id: CoverageGapId;

  /** Category with the gap */
  readonly categoryId: CategoryId;

  /** Category name */
  readonly categoryName: string;

  /** Current mastery */
  readonly currentMastery: NormalizedValue;

  /** Required mastery */
  readonly requiredMastery: NormalizedValue;

  /** Gap severity */
  readonly severity: GapSeverity;

  /** What this gap is blocking */
  readonly blockingTargets: readonly CategoryId[];

  /** Estimated remediation time */
  readonly estimatedRemediationMinutes?: number;

  /** Priority to address */
  readonly priority: NormalizedValue;

  /** Reason this is flagged */
  readonly reason: string;
}

/**
 * Gap severity levels
 */
export type GapSeverity =
  | "critical" // Blocks multiple important targets
  | "significant" // Blocks some progress
  | "moderate" // Slows progress
  | "minor"; // Nice to have

/**
 * Prerequisite suggestion
 */
export interface PrerequisiteSuggestion {
  readonly id: NavigationSuggestionId;
  readonly type: Extract<
    NavigationSuggestionType,
    "prerequisite" | "goal_progress"
  >;

  /** Target */
  readonly target: NavigationTarget;

  /** Node data */
  readonly node: PrerequisiteNode;

  /** Gap data (if this addresses a gap) */
  readonly gap?: PrerequisiteGap;

  /** Priority score */
  readonly priority: NormalizedValue;

  /** Human-readable reason */
  readonly reason: string;

  /** Is this strictly required? */
  readonly isRequired: boolean;

  /** What this unlocks */
  readonly unlocks: readonly CategoryId[];

  /** Explainability trace */
  readonly explainabilityTraceId?: ExplainabilityTraceId;
}

// =============================================================================
// COVERAGE FEED - Completeness tracking for exam/goal modes
// =============================================================================

/**
 * Coverage status for a category
 */
export interface CategoryCoverage {
  readonly categoryId: CategoryId;
  readonly categoryName: string;

  /** Total cards in category */
  readonly totalCards: number;

  /** Cards studied at least once */
  readonly studiedCards: number;

  /** Cards at target mastery */
  readonly masteredCards: number;

  /** Overall coverage (0-1) */
  readonly coverageLevel: NormalizedValue;

  /** Average mastery of studied cards */
  readonly averageMastery: NormalizedValue;

  /** Is this a critical category? */
  readonly isCritical: boolean;

  /** Weight in overall coverage calculation */
  readonly weight: number;

  /** Last activity timestamp */
  readonly lastActivityAt?: Timestamp;

  /** Depth in category hierarchy */
  readonly depth: number;
}

/**
 * A coverage gap
 */
export interface CoverageGap {
  readonly id: CoverageGapId;

  /** Category with incomplete coverage */
  readonly categoryId: CategoryId;

  /** Category name */
  readonly categoryName: string;

  /** Current coverage */
  readonly currentCoverage: NormalizedValue;

  /** Target coverage */
  readonly targetCoverage: NormalizedValue;

  /** Cards remaining to study */
  readonly remainingCards: number;

  /** Estimated time to close gap */
  readonly estimatedTimeMinutes?: number;

  /** Gap priority */
  readonly priority: NormalizedValue;

  /** Gap type */
  readonly gapType: CoverageGapType;

  /** Why this gap matters */
  readonly reason: string;

  /** Is this gap critical for exam/goal? */
  readonly isCritical: boolean;
}

/**
 * Types of coverage gaps
 */
export type CoverageGapType =
  | "never_studied" // Cards never seen
  | "unstable" // Studied but forgotten
  | "partial" // Some cards studied, some not
  | "depth_insufficient" // Studied but not deep enough
  | "breadth_insufficient"; // Missing related areas

/**
 * Overall coverage summary
 */
export interface CoverageSummary {
  /** Total categories in scope */
  readonly totalCategories: number;

  /** Categories at target coverage */
  readonly coveredCategories: number;

  /** Overall coverage level */
  readonly overallCoverage: NormalizedValue;

  /** Weighted coverage (by importance) */
  readonly weightedCoverage: NormalizedValue;

  /** Total cards in scope */
  readonly totalCards: number;

  /** Total cards mastered */
  readonly masteredCards: number;

  /** Estimated time to full coverage */
  readonly estimatedRemainingTimeMinutes?: number;

  /** Coverage trend (improving/declining) */
  readonly trend: "improving" | "stable" | "declining";

  /** Critical gaps count */
  readonly criticalGapCount: number;
}

/**
 * Complete coverage feed
 */
export interface CoverageFeed {
  readonly id: NavigationFeedId;
  readonly type: "coverage";

  /** Target scope (what we're covering) */
  readonly scopeCategoryIds: readonly CategoryId[];

  /** Coverage by category */
  readonly categoryCovarges: readonly CategoryCoverage[];

  /** Detected gaps */
  readonly gaps: readonly CoverageGap[];

  /** Overall summary */
  readonly summary: CoverageSummary;

  /** Ranked suggestions */
  readonly suggestions: readonly CoverageSuggestion[];

  /** Generation metadata */
  readonly metadata: NavigationFeedMetadata;
}

/**
 * Coverage suggestion
 */
export interface CoverageSuggestion {
  readonly id: NavigationSuggestionId;
  readonly type: Extract<
    NavigationSuggestionType,
    "exam_coverage" | "goal_progress"
  >;

  /** Target */
  readonly target: NavigationTarget;

  /** Coverage data for this category */
  readonly coverage: CategoryCoverage;

  /** Gap being addressed (if any) */
  readonly gap?: CoverageGap;

  /** Priority score */
  readonly priority: NormalizedValue;

  /** Human-readable reason */
  readonly reason: string;

  /** Cards to study in this category */
  readonly recommendedCardIds?: readonly CardId[];

  /** Expected coverage improvement */
  readonly expectedCoverageImprovement: number;

  /** Explainability trace */
  readonly explainabilityTraceId?: ExplainabilityTraceId;
}

// =============================================================================
// CONSTELLATION CHALLENGE FEED - Cross-context synthesis opportunities
// =============================================================================

/**
 * A constellation - group of related cross-context cards
 */
export interface Constellation {
  readonly id: string;

  /** Cards in this constellation */
  readonly cardIds: readonly CardId[];

  /** Categories involved */
  readonly categoryIds: readonly CategoryId[];

  /** Type of constellation */
  readonly constellationType: ConstellationType;

  /** Central theme/concept */
  readonly centralTheme: string;

  /** Strength of connections */
  readonly connectionStrength: NormalizedValue;

  /** User's synthesis progress */
  readonly synthesisProgress: NormalizedValue;

  /** Bridge cards linking members */
  readonly bridgeCardIds: readonly CardId[];
}

/**
 * Types of constellations
 */
export type ConstellationType =
  | "semantic_cluster" // Same concept, different contexts
  | "analogical_chain" // Analogous relationships across domains
  | "contrast_set" // Contrasting implementations
  | "dependency_web" // Complex prerequisite relationships
  | "application_family"; // Same principle, different applications

/**
 * A constellation challenge - synthesis task
 */
export interface ConstellationChallenge {
  readonly id: ConstellationChallengeId;

  /** Constellation this challenge is based on */
  readonly constellation: Constellation;

  /** Challenge type */
  readonly challengeType: ConstellationChallengeType;

  /** Challenge prompt */
  readonly prompt: string;

  /** Alternative prompts */
  readonly alternativePrompts: readonly string[];

  /** Hints (progressive disclosure) */
  readonly hints: readonly string[];

  /** Cards involved */
  readonly involvedCardIds: readonly CardId[];

  /** Categories involved */
  readonly involvedCategoryIds: readonly CategoryId[];

  /** Difficulty level */
  readonly difficulty: NormalizedValue;

  /** Expected time to complete */
  readonly estimatedTimeMinutes?: number;

  /** What successful completion demonstrates */
  readonly learningOutcome: string;
}

/**
 * Types of constellation challenges
 */
export type ConstellationChallengeType =
  | "identify_common_principle" // What do these share?
  | "explain_difference" // How do these differ?
  | "transfer_application" // Apply concept X in context Y
  | "predict_interaction" // What happens when X meets Y?
  | "synthesize_understanding" // Integrate these into one explanation
  | "create_bridge"; // Create a bridge card connecting these

/**
 * A bridge opportunity - potential connection to create
 */
export interface BridgeOpportunity {
  readonly id: string;

  /** Bridge type */
  readonly bridgeType: BridgeType;

  /** Source */
  readonly sourceCardId?: CardId;
  readonly sourceCategoryId?: CategoryId;

  /** Target */
  readonly targetCardId?: CardId;
  readonly targetCategoryId?: CategoryId;

  /** Suggested connection type */
  readonly connectionType: ConnectionType;

  /** Confidence in this suggestion */
  readonly confidence: Confidence;

  /** Why this bridge is suggested */
  readonly rationale: string;

  /** What understanding this would demonstrate */
  readonly learningValue: string;

  /** Suggested question */
  readonly suggestedQuestion?: string;

  /** Suggested answer */
  readonly suggestedAnswer?: string;
}

/**
 * Complete constellation challenge feed
 */
export interface ConstellationChallengeFeed {
  readonly id: NavigationFeedId;
  readonly type: "constellation_challenge";

  /** Detected constellations */
  readonly constellations: readonly Constellation[];

  /** Generated challenges */
  readonly challenges: readonly ConstellationChallenge[];

  /** Bridge opportunities */
  readonly bridgeOpportunities: readonly BridgeOpportunity[];

  /** Ranked suggestions */
  readonly suggestions: readonly ConstellationSuggestion[];

  /** Performance divergences that triggered some suggestions */
  readonly triggeringDivergences: readonly PerformanceDivergenceSummary[];

  /** Generation metadata */
  readonly metadata: NavigationFeedMetadata;
}

/**
 * Summary of performance divergence for feed context
 */
export interface PerformanceDivergenceSummary {
  readonly cardId: CardId;
  readonly bestContextId: CategoryId;
  readonly worstContextId: CategoryId;
  readonly spread: number;
  readonly severity: "critical" | "significant" | "moderate" | "minor";
}

/**
 * Constellation/synthesis suggestion
 */
export interface ConstellationSuggestion {
  readonly id: NavigationSuggestionId;
  readonly type: Extract<
    NavigationSuggestionType,
    "synthesis_opportunity" | "bridge"
  >;

  /** Target */
  readonly target: NavigationTarget;

  /** Challenge or bridge data */
  readonly challenge?: ConstellationChallenge;
  readonly bridgeOpportunity?: BridgeOpportunity;

  /** Priority score */
  readonly priority: NormalizedValue;

  /** Human-readable reason */
  readonly reason: string;

  /** Learning value */
  readonly learningValue: string;

  /** Difficulty */
  readonly difficulty: NormalizedValue;

  /** Explainability trace */
  readonly explainabilityTraceId?: ExplainabilityTraceId;
}

// =============================================================================
// UNIFIED NAVIGATION FEED - Combined output from all generators
// =============================================================================

/**
 * Unified navigation feed combining all feed types
 */
export interface UnifiedNavigationFeed {
  readonly id: NavigationFeedId;

  /** Active mode that shaped this feed */
  readonly modeId: LearningModeId;

  /** Individual feed components */
  readonly neighborhoodFeed?: NeighborhoodFeed;
  readonly prerequisitePathFeed?: PrerequisitePathFeed;
  readonly coverageFeed?: CoverageFeed;
  readonly constellationChallengeFeed?: ConstellationChallengeFeed;

  /** Unified, ranked suggestions (merged and re-ranked) */
  readonly rankedSuggestions: readonly NavigationSuggestionUnion[];

  /** Top suggestions by type */
  readonly topByType: {
    readonly neighborhood: readonly NeighborhoodSuggestion[];
    readonly prerequisite: readonly PrerequisiteSuggestion[];
    readonly coverage: readonly CoverageSuggestion[];
    readonly constellation: readonly ConstellationSuggestion[];
  };

  /** Current context info */
  readonly context: NavigationFeedContext;

  /** Generation metadata */
  readonly metadata: NavigationFeedMetadata;
}

/**
 * Union of all suggestion types
 */
export type NavigationSuggestionUnion =
  | NeighborhoodSuggestion
  | PrerequisiteSuggestion
  | CoverageSuggestion
  | ConstellationSuggestion;

/**
 * Context in which the feed was generated
 */
export interface NavigationFeedContext {
  /** Current category (if any) */
  readonly currentCategoryId?: CategoryId;

  /** Current card (if any) */
  readonly currentCardId?: CardId;

  /** Active view lens */
  readonly viewLens?: ViewLens;

  /** User's overall progress summary */
  readonly progressSummary?: {
    readonly totalCards: number;
    readonly masteredCards: number;
    readonly overallMastery: NormalizedValue;
    readonly activeCategories: number;
  };
}

/**
 * Metadata for navigation feed
 */
export interface NavigationFeedMetadata {
  /** Mode that generated this feed */
  readonly modeId: LearningModeId;

  /** Parameters used */
  readonly parametersUsed: Record<string, unknown>;

  /** Generation timestamp */
  readonly generatedAt: Timestamp;

  /** Time to live (caching) */
  readonly ttlMs: number;

  /** Number of suggestions generated */
  readonly suggestionCount: number;

  /** Generation performance */
  readonly generationTimeMs: number;

  /** Top-level explainability trace */
  readonly explainabilityTraceId?: ExplainabilityTraceId;
}

// =============================================================================
// FEED GENERATOR INTERFACES - For service implementation
// =============================================================================

/**
 * Interface for neighborhood feed generator
 */
export interface NeighborhoodFeedGenerator {
  /**
   * Generate neighborhood feed for a given context
   */
  generate(
    request: NavigationFeedRequest,
    options?: NeighborhoodFeedOptions,
  ): Promise<NeighborhoodFeed>;
}

/**
 * Interface for prerequisite path feed generator
 */
export interface PrerequisitePathFeedGenerator {
  /**
   * Generate prerequisite path feed for a target category
   */
  generate(
    request: NavigationFeedRequest,
    targetCategoryId: CategoryId,
    options?: PrerequisitePathOptions,
  ): Promise<PrerequisitePathFeed>;
}

/**
 * Interface for coverage feed generator
 */
export interface CoverageFeedGenerator {
  /**
   * Generate coverage feed for a scope
   */
  generate(
    request: NavigationFeedRequest,
    options?: CoverageFeedOptions,
  ): Promise<CoverageFeed>;
}

/**
 * Interface for constellation challenge feed generator
 */
export interface ConstellationChallengeFeedGenerator {
  /**
   * Generate constellation challenge feed
   */
  generate(
    request: NavigationFeedRequest,
    options?: ConstellationChallengeOptions,
  ): Promise<ConstellationChallengeFeed>;
}

/**
 * Interface for unified navigation feed service
 */
export interface NavigationFeedService {
  /**
   * Generate unified navigation feed for current context
   */
  generateUnifiedFeed(
    request: NavigationFeedRequest,
  ): Promise<UnifiedNavigationFeed>;

  /**
   * Generate only neighborhood feed
   */
  generateNeighborhoodFeed(
    request: NavigationFeedRequest,
    options?: NeighborhoodFeedOptions,
  ): Promise<NeighborhoodFeed>;

  /**
   * Generate only prerequisite path feed
   */
  generatePrerequisitePathFeed(
    request: NavigationFeedRequest,
    targetCategoryId: CategoryId,
    options?: PrerequisitePathOptions,
  ): Promise<PrerequisitePathFeed>;

  /**
   * Generate only coverage feed
   */
  generateCoverageFeed(
    request: NavigationFeedRequest,
    options?: CoverageFeedOptions,
  ): Promise<CoverageFeed>;

  /**
   * Generate only constellation challenge feed
   */
  generateConstellationChallengeFeed(
    request: NavigationFeedRequest,
    options?: ConstellationChallengeOptions,
  ): Promise<ConstellationChallengeFeed>;
}

// =============================================================================
// MODE-SPECIFIC FEED CONFIGURATION
// =============================================================================

/**
 * How a mode configures its navigation feeds
 */
export interface ModeFeedConfiguration {
  /** Mode ID */
  readonly modeId: LearningModeId;

  /** Enabled feed types */
  readonly enabledFeeds: readonly NavigationFeedType[];

  /** Weight for each feed type in unified ranking */
  readonly feedWeights: Record<NavigationFeedType, number>;

  /** Default options for each feed type */
  readonly defaultOptions: {
    readonly neighborhood?: NeighborhoodFeedOptions;
    readonly prerequisitePath?: PrerequisitePathOptions;
    readonly coverage?: CoverageFeedOptions;
    readonly constellationChallenge?: ConstellationChallengeOptions;
  };

  /** Maximum suggestions to return */
  readonly maxTotalSuggestions: number;

  /** Maximum suggestions per type */
  readonly maxSuggestionsPerType: number;
}

/**
 * Navigation feed type enum
 */
export type NavigationFeedType =
  | "neighborhood"
  | "prerequisite_path"
  | "coverage"
  | "constellation_challenge";

// =============================================================================
// DEFAULT CONFIGURATIONS BY MODE
// =============================================================================

/**
 * Default feed configuration for Exploration mode
 */
export const EXPLORATION_FEED_CONFIG: ModeFeedConfiguration = {
  modeId: "system:exploration" as LearningModeId,
  enabledFeeds: ["neighborhood", "constellation_challenge"],
  feedWeights: {
    neighborhood: 0.6,
    prerequisite_path: 0.1,
    coverage: 0.1,
    constellation_challenge: 0.2,
  },
  defaultOptions: {
    neighborhood: {
      maxHops: 2,
      noveltyWeight: 0.4,
      serendipityFactor: 0.15,
      bridgeBonusWeight: 0.3,
    },
    constellationChallenge: {
      bridgeTypes: ["concept_to_concept", "context_to_context"],
      challengeDifficulty: 0.5,
    },
  },
  maxTotalSuggestions: 15,
  maxSuggestionsPerType: 8,
} as const;

/**
 * Default feed configuration for Goal-Driven mode
 */
export const GOAL_DRIVEN_FEED_CONFIG: ModeFeedConfiguration = {
  modeId: "system:goal_driven" as LearningModeId,
  enabledFeeds: ["prerequisite_path", "coverage", "neighborhood"],
  feedWeights: {
    neighborhood: 0.2,
    prerequisite_path: 0.5,
    coverage: 0.25,
    constellation_challenge: 0.05,
  },
  defaultOptions: {
    prerequisitePath: {
      maxDepth: 3,
      strictnessLevel: 0.7,
      foundationStabilityThreshold: 0.8,
      includeTransitive: true,
    },
    coverage: {
      coverageGoal: 0.9,
      breadthVsDepthSlider: 0.4,
    },
    neighborhood: {
      maxHops: 1,
      noveltyWeight: 0.2,
      serendipityFactor: 0.05,
    },
  },
  maxTotalSuggestions: 12,
  maxSuggestionsPerType: 6,
} as const;

/**
 * Default feed configuration for Exam-Oriented mode
 */
export const EXAM_ORIENTED_FEED_CONFIG: ModeFeedConfiguration = {
  modeId: "system:exam_oriented" as LearningModeId,
  enabledFeeds: ["coverage", "prerequisite_path"],
  feedWeights: {
    neighborhood: 0.05,
    prerequisite_path: 0.35,
    coverage: 0.55,
    constellation_challenge: 0.05,
  },
  defaultOptions: {
    coverage: {
      coverageGoal: 1.0,
      breadthVsDepthSlider: 0.6,
      criticalContentWeight: 0.8,
    },
    prerequisitePath: {
      maxDepth: 2,
      strictnessLevel: 0.5,
      foundationStabilityThreshold: 0.7,
    },
  },
  maxTotalSuggestions: 10,
  maxSuggestionsPerType: 5,
} as const;

/**
 * Default feed configuration for Synthesis mode
 */
export const SYNTHESIS_FEED_CONFIG: ModeFeedConfiguration = {
  modeId: "system:synthesis" as LearningModeId,
  enabledFeeds: ["constellation_challenge", "neighborhood"],
  feedWeights: {
    neighborhood: 0.2,
    prerequisite_path: 0.1,
    coverage: 0.1,
    constellation_challenge: 0.6,
  },
  defaultOptions: {
    constellationChallenge: {
      minParticipations: 2,
      minDivergence: 0.2,
      bridgeTypes: [
        "concept_to_concept",
        "context_to_context",
        "concept_context",
      ],
      challengeDifficulty: 0.6,
      maxConnectionHops: 3,
    },
    neighborhood: {
      maxHops: 2,
      bridgeBonusWeight: 0.5,
      noveltyWeight: 0.3,
    },
  },
  maxTotalSuggestions: 12,
  maxSuggestionsPerType: 8,
} as const;

/**
 * Map of mode types to their default feed configurations
 */
export const MODE_FEED_CONFIGS: Record<string, ModeFeedConfiguration> = {
  exploration: EXPLORATION_FEED_CONFIG,
  goal_driven: GOAL_DRIVEN_FEED_CONFIG,
  exam_oriented: EXAM_ORIENTED_FEED_CONFIG,
  synthesis: SYNTHESIS_FEED_CONFIG,
};
