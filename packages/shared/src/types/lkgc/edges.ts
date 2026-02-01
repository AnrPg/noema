// =============================================================================
// LKGC EDGES - Typed Graph Edge Types
// =============================================================================
// Defines all edge types in the LKGC knowledge graph.
// Edges are NOT generic - each edge type has specific semantics.
//
// Categories:
// - Knowledge structure (conceptual relationships)
// - Learning design (pedagogical relationships)
// - Metacognitive (self-awareness relationships)
// - Behavioral (learned patterns)
// - Obsidian mapping (document links)
// =============================================================================

import type {
  LKGCEntity,
  EdgeId,
  NodeId,
  Timestamp,
  Confidence,
  NormalizedValue,
} from "./foundation";

// =============================================================================
// EDGE TYPE DISCRIMINATOR
// =============================================================================

/**
 * All possible edge types in the LKGC graph
 */
export type EdgeType =
  // Knowledge structure
  | "prerequisite_of"
  | "part_of"
  | "explains"
  | "causes"
  | "analogous_to"
  | "example_of"
  | "counterexample_of"
  | "derived_from"
  | "defines"
  | "uses"
  | "contrasts_with"
  // Learning design
  | "targets_goal"
  | "introduced_in_path_step"
  | "assessed_by"
  | "practiced_by"
  // Metacognitive
  | "best_learned_with_strategy"
  | "error_pattern_for"
  | "reflection_about"
  // Behavioral
  | "frequently_confused_with"
  | "cross_deck_duplicate_of"
  // Obsidian mapping
  | "mentions"
  | "backlink";

// =============================================================================
// BASE EDGE - Common structure for all edges
// =============================================================================

/**
 * Edge polarity - whether the relationship is supportive or contrastive
 */
export type EdgePolarity = "support" | "contrast" | "neutral";

/**
 * Base interface for all graph edges
 */
export interface BaseEdge extends LKGCEntity<EdgeId> {
  readonly id: EdgeId;
  readonly edgeType: EdgeType;

  /** Source node */
  readonly sourceId: NodeId;

  /** Target node */
  readonly targetId: NodeId;

  /** Edge weight/strength [0, 1] */
  readonly weight: NormalizedValue;

  /** Polarity of relationship */
  readonly polarity: EdgePolarity;

  /** Number of evidence instances supporting this edge */
  readonly evidenceCount: number;

  /** Timestamp of last evidence */
  readonly lastEvidenceAt: Timestamp;

  /** Optional label/annotation */
  readonly label?: string;

  /** Is this edge bidirectional? */
  readonly bidirectional: boolean;
}

// =============================================================================
// KNOWLEDGE STRUCTURE EDGES
// =============================================================================

/**
 * prerequisite_of - A must be learned before B
 */
export interface PrerequisiteOfEdge extends BaseEdge {
  readonly edgeType: "prerequisite_of";

  /** How critical is this prerequisite? */
  readonly criticality: "required" | "recommended" | "helpful";

  /** Minimum mastery level needed */
  readonly minMasteryRequired: NormalizedValue;

  /** Skip conditions (when prerequisite can be bypassed) */
  readonly skipConditions?: readonly string[];
}

/**
 * part_of - A is a component of B (meronymy)
 */
export interface PartOfEdge extends BaseEdge {
  readonly edgeType: "part_of";

  /** Position in the whole (if ordered) */
  readonly position?: number;

  /** Is this part essential or optional? */
  readonly essential: boolean;
}

/**
 * explains - A provides explanation for B
 */
export interface ExplainsEdge extends BaseEdge {
  readonly edgeType: "explains";

  /** Explanation type */
  readonly explanationType:
    | "definition"
    | "intuition"
    | "formal"
    | "analogy"
    | "example";

  /** Target audience level */
  readonly targetLevel: "beginner" | "intermediate" | "advanced";

  /** Explanation quality rating */
  readonly qualityRating?: NormalizedValue;
}

/**
 * causes - A causally leads to B
 */
export interface CausesEdge extends BaseEdge {
  readonly edgeType: "causes";

  /** Causal mechanism (if known) */
  readonly mechanism?: string;

  /** Probability of B given A */
  readonly probability?: NormalizedValue;

  /** Temporal lag (how long after A does B occur) */
  readonly temporalLag?: number;
}

/**
 * analogous_to - A is analogous to B
 */
export interface AnalogousToEdge extends BaseEdge {
  readonly edgeType: "analogous_to";

  /** Basis for analogy */
  readonly basis: string;

  /** Limitations of analogy */
  readonly limitations?: readonly string[];

  /** Analogy quality/strength */
  readonly analogyStrength: NormalizedValue;
}

/**
 * example_of - A is an instance of B
 */
export interface ExampleOfEdge extends BaseEdge {
  readonly edgeType: "example_of";

  /** Is this a canonical/prototypical example? */
  readonly isCanonical: boolean;

  /** Specific aspects of B that A exemplifies */
  readonly exemplifiedAspects?: readonly string[];
}

/**
 * counterexample_of - A contradicts/disproves B
 */
export interface CounterexampleOfEdge extends BaseEdge {
  readonly edgeType: "counterexample_of";

  /** What specific claim is countered */
  readonly counteredClaim: string;

  /** Conditions under which A counters B */
  readonly conditions?: string;
}

/**
 * derived_from - A is derived/computed from B
 */
export interface DerivedFromEdge extends BaseEdge {
  readonly edgeType: "derived_from";

  /** Derivation method */
  readonly derivationMethod:
    | "logical"
    | "mathematical"
    | "empirical"
    | "heuristic";

  /** Derivation steps (if explicit) */
  readonly derivationSteps?: readonly string[];
}

/**
 * defines - A defines/specifies B
 */
export interface DefinesEdge extends BaseEdge {
  readonly edgeType: "defines";

  /** Definition type */
  readonly definitionType: "formal" | "operational" | "lexical" | "stipulative";

  /** Is this the primary definition? */
  readonly isPrimary: boolean;
}

/**
 * uses - A uses/applies B
 */
export interface UsesEdge extends BaseEdge {
  readonly edgeType: "uses";

  /** How B is used in A */
  readonly usageContext: string;

  /** Is usage essential or incidental? */
  readonly essential: boolean;
}

/**
 * contrasts_with - A contrasts/differs from B
 */
export interface ContrastsWithEdge extends BaseEdge {
  readonly edgeType: "contrasts_with";

  /** Dimension of contrast */
  readonly contrastDimension: string;

  /** Specific differences */
  readonly differences: readonly ContrastDifference[];
}

export interface ContrastDifference {
  readonly aspect: string;
  readonly inSource: string;
  readonly inTarget: string;
}

// =============================================================================
// LEARNING DESIGN EDGES
// =============================================================================

/**
 * targets_goal - A learning activity targets goal B
 */
export interface TargetsGoalEdge extends BaseEdge {
  readonly edgeType: "targets_goal";

  /** Contribution to goal achievement */
  readonly contribution: NormalizedValue;

  /** Is this primary or secondary targeting? */
  readonly isPrimary: boolean;
}

/**
 * introduced_in_path_step - A is introduced in learning path step B
 */
export interface IntroducedInPathStepEdge extends BaseEdge {
  readonly edgeType: "introduced_in_path_step";

  /** Step number in path */
  readonly stepNumber: number;

  /** Introduction depth (intro vs deep dive) */
  readonly depth: "mention" | "introduction" | "exploration" | "mastery";
}

/**
 * assessed_by - A is assessed by assessment B
 */
export interface AssessedByEdge extends BaseEdge {
  readonly edgeType: "assessed_by";

  /** What aspects are assessed */
  readonly assessedAspects: readonly string[];

  /** Contribution to overall assessment score */
  readonly scoreWeight: NormalizedValue;
}

/**
 * practiced_by - Concept A is practiced by card/activity B
 */
export interface PracticedByEdge extends BaseEdge {
  readonly edgeType: "practiced_by";

  /** Practice type */
  readonly practiceType: "recall" | "recognition" | "application" | "transfer";

  /** Estimated practice value */
  readonly practiceValue: NormalizedValue;
}

// =============================================================================
// METACOGNITIVE EDGES
// =============================================================================

/**
 * best_learned_with_strategy - A is best learned using strategy B
 */
export interface BestLearnedWithStrategyEdge extends BaseEdge {
  readonly edgeType: "best_learned_with_strategy";

  /** Observed effectiveness */
  readonly effectiveness: NormalizedValue;

  /** Number of times this was effective */
  readonly successCount: number;

  /** Number of times tried */
  readonly trialCount: number;

  /** Conditions when most effective */
  readonly effectiveConditions?: readonly string[];
}

/**
 * error_pattern_for - Error pattern A occurs for concept/card B
 */
export interface ErrorPatternForEdge extends BaseEdge {
  readonly edgeType: "error_pattern_for";

  /** Frequency of error */
  readonly frequency: NormalizedValue;

  /** Is error resolved? */
  readonly resolved: boolean;

  /** Resolution timestamp */
  readonly resolvedAt?: Timestamp;
}

/**
 * reflection_about - Reflection A is about subject B
 */
export interface ReflectionAboutEdge extends BaseEdge {
  readonly edgeType: "reflection_about";

  /** Reflection depth */
  readonly depth: "surface" | "moderate" | "deep";

  /** Key insights extracted */
  readonly insights?: readonly string[];
}

// =============================================================================
// BEHAVIORAL EDGES
// =============================================================================

/**
 * frequently_confused_with - A is often confused with B
 */
export interface FrequentlyConfusedWithEdge extends BaseEdge {
  readonly edgeType: "frequently_confused_with";

  /** Confusion rate */
  readonly confusionRate: NormalizedValue;

  /** Last confusion occurrence */
  readonly lastConfusionAt: Timestamp;

  /** Distinguishing features to emphasize */
  readonly distinguishingFeatures?: readonly string[];

  /** Mnemonic to help differentiate */
  readonly mnemonic?: string;
}

/**
 * cross_deck_duplicate_of - Card A is a duplicate of card B in another deck
 */
export interface CrossDeckDuplicateOfEdge extends BaseEdge {
  readonly edgeType: "cross_deck_duplicate_of";

  /** Similarity score */
  readonly similarity: NormalizedValue;

  /** Type of duplication */
  readonly duplicationType: "exact" | "near_duplicate" | "semantic_duplicate";

  /** Should reviews be synchronized? */
  readonly syncReviews: boolean;
}

// =============================================================================
// OBSIDIAN MAPPING EDGES
// =============================================================================

/**
 * mentions - A contains a wikilink to B (e.g., [[B]] in A's content)
 */
export interface MentionsEdge extends BaseEdge {
  readonly edgeType: "mentions";

  /** Original link text */
  readonly linkText: string;

  /** Position in source document */
  readonly position?: number;

  /** Link context (surrounding text) */
  readonly context?: string;

  /** Is this a display alias? [[target|displayed]] */
  readonly displayAlias?: string;
}

/**
 * backlink - Computed inverse of mentions (B is mentioned by A)
 */
export interface BacklinkEdge extends BaseEdge {
  readonly edgeType: "backlink";

  /** Corresponding mentions edge ID */
  readonly mentionsEdgeId: EdgeId;
}

// =============================================================================
// EDGE UNION TYPE
// =============================================================================

/**
 * Union of all edge types for type-safe graph operations
 */
export type LKGCEdge =
  // Knowledge structure
  | PrerequisiteOfEdge
  | PartOfEdge
  | ExplainsEdge
  | CausesEdge
  | AnalogousToEdge
  | ExampleOfEdge
  | CounterexampleOfEdge
  | DerivedFromEdge
  | DefinesEdge
  | UsesEdge
  | ContrastsWithEdge
  // Learning design
  | TargetsGoalEdge
  | IntroducedInPathStepEdge
  | AssessedByEdge
  | PracticedByEdge
  // Metacognitive
  | BestLearnedWithStrategyEdge
  | ErrorPatternForEdge
  | ReflectionAboutEdge
  // Behavioral
  | FrequentlyConfusedWithEdge
  | CrossDeckDuplicateOfEdge
  // Obsidian mapping
  | MentionsEdge
  | BacklinkEdge;

/**
 * Type guard for edge types
 */
export function isEdgeType<T extends EdgeType>(
  edge: LKGCEdge,
  type: T,
): edge is Extract<LKGCEdge, { edgeType: T }> {
  return edge.edgeType === type;
}

/**
 * Get edge by type (type-safe)
 */
export type EdgeOfType<T extends EdgeType> = Extract<LKGCEdge, { edgeType: T }>;

// =============================================================================
// EDGE QUERY HELPERS
// =============================================================================

/**
 * Edge direction for queries
 */
export type EdgeDirection = "outgoing" | "incoming" | "both";

/**
 * Edge query predicate
 */
export interface EdgeQueryPredicate {
  readonly edgeTypes?: readonly EdgeType[];
  readonly direction?: EdgeDirection;
  readonly minWeight?: NormalizedValue;
  readonly minConfidence?: Confidence;
  readonly polarity?: EdgePolarity;
  readonly evidenceCountMin?: number;
  readonly lastEvidenceAfter?: Timestamp;
}
