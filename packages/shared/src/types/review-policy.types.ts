// =============================================================================
// REVIEW POLICY TYPES
// =============================================================================
// Policy-Based Review Planner - Influences Ranking Without Modifying Scheduler
//
// This module provides a composable policy system for ranking review candidates.
// Policies influence SELECTION and ORDERING, not the core FSRS/HLR algorithms.
//
// Key Principles:
// 1. FSRS/HLR still compute intervals, stability, retrievability
// 2. Policies only affect which cards get shown and in what order
// 3. Policies are composable and mode-aware
// 4. All decisions have explainability traces
// 5. Category structure influences priority through hooks
//
// The system supports:
// - Mode-specific weighting (exploration vs exam cram)
// - Category difficulty/decay hooks
// - LKGC signal consumption
// - Explainability for every decision
// =============================================================================

import type { UserId, CardId } from "./user.types";
import type { CategoryId } from "./ecosystem.types";
import type { ParticipationId } from "./multi-belonging.types";
import type {
  LearningModeId,
  LkgcSignalType,
  LkgcSignalValue,
  ModeRuntimeState,
} from "./learning-mode.types";
import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./lkgc/foundation";

// =============================================================================
// IDENTIFIERS
// =============================================================================

export type ReviewPolicyId = string & { readonly __brand: "ReviewPolicyId" };
export type PolicyChainId = string & { readonly __brand: "PolicyChainId" };
export type RankingFactorId = string & { readonly __brand: "RankingFactorId" };

// =============================================================================
// REVIEW CANDIDATE - Extended for Policy System
// =============================================================================

/**
 * Review candidate input from scheduler (FSRS/HLR output)
 * This is what the scheduler produces - policies consume this
 */
export interface SchedulerCandidateOutput {
  readonly cardId: CardId;
  readonly participationId?: ParticipationId;
  readonly categoryId?: CategoryId;

  // Core scheduler outputs - these are READ-ONLY to policies
  readonly schedulerData: {
    readonly dueDate: Date;
    readonly stability: number;
    readonly difficulty: number; // 1-10 scale
    readonly retrievability: number; // 0-1 probability
    readonly elapsedDays: number;
    readonly scheduledDays: number;
    readonly state: "new" | "learning" | "review" | "relearning";
    readonly halfLife?: number; // HLR specific
    readonly lastRating?: "again" | "hard" | "good" | "easy" | null;
    readonly lastReviewDate?: Date | null;
  };

  // LKGC signals for this card
  readonly lkgcSignals: Partial<Record<LkgcSignalType, LkgcSignalValue>>;

  // Category metadata hooks
  readonly categoryMetadata?: CategoryMetadataForPolicy;
}

/**
 * Category metadata relevant to policy decisions
 */
export interface CategoryMetadataForPolicy {
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly depth: number; // Hierarchy depth
  readonly path: readonly string[]; // Breadcrumb path

  // Difficulty/decay hooks
  readonly difficultyMultiplier: number; // Category-specific difficulty scaling
  readonly decayMultiplier: number; // Category-specific decay rate adjustment
  readonly volatilityFactor: number; // How volatile is mastery in this category

  // Structural metadata
  readonly cardCount: number;
  readonly prerequisiteCount: number;
  readonly dependentCount: number;
  readonly hasUnmetPrerequisites: boolean;

  // User's mastery in this category
  readonly userMastery: NormalizedValue;
  readonly masteryConfidence: Confidence;
  readonly lastActivityAt?: Timestamp;

  // Exam/deadline metadata (if applicable)
  readonly examDeadline?: Timestamp;
  readonly examWeight?: NormalizedValue; // How important for exam
}

// =============================================================================
// RANKED CANDIDATE - Policy Output
// =============================================================================

/**
 * Ranked candidate after policy processing
 */
export interface PolicyRankedCandidate {
  readonly cardId: CardId;
  readonly participationId?: ParticipationId;
  readonly categoryId?: CategoryId;

  // Original scheduler data (preserved)
  readonly schedulerData: SchedulerCandidateOutput["schedulerData"];

  // Policy-computed ranking
  readonly ranking: CandidateRanking;

  // Explainability
  readonly factors: readonly RankingFactor[];
  readonly policyContributions: readonly PolicyContribution[];

  // Metadata
  readonly processedAt: Timestamp;
  readonly policyChainId: PolicyChainId;
}

/**
 * Candidate ranking computed by policies
 */
export interface CandidateRanking {
  /** Final priority score (higher = review sooner) */
  readonly priorityScore: number;

  /** Normalized priority (0-1) within the batch */
  readonly normalizedPriority: NormalizedValue;

  /** Rank position (1 = first) */
  readonly position: number;

  /** Urgency classification */
  readonly urgencyLevel: UrgencyLevel;

  /** Review recommendation */
  readonly recommendation: ReviewRecommendation;

  /** Confidence in this ranking */
  readonly confidence: Confidence;
}

/**
 * Urgency levels for review
 */
export type UrgencyLevel =
  | "critical" // Memory at high risk, review immediately
  | "high" // Overdue, should review soon
  | "medium" // Due or near-due
  | "low" // Not urgent, but available
  | "deferred" // Intentionally delayed (exploration mode)
  | "blocked"; // Prerequisites not met

/**
 * Review recommendation
 */
export type ReviewRecommendation =
  | "review_now" // Include in immediate session
  | "review_soon" // Include if time permits
  | "review_later" // Can be postponed
  | "skip_today" // Skip for now (exploration, rest)
  | "blocked_prerequisite" // Don't show - prerequisites missing
  | "excluded_by_mode"; // Mode explicitly excludes this

// =============================================================================
// RANKING FACTORS - Explainability Components
// =============================================================================

/**
 * Single factor contributing to ranking
 */
export interface RankingFactor {
  readonly id: RankingFactorId;
  readonly name: string;
  readonly description: string;

  /** Raw value before weighting */
  readonly rawValue: number;

  /** Weight applied to this factor */
  readonly weight: number;

  /** Contribution to final score (rawValue * weight) */
  readonly contribution: number;

  /** Source of this factor */
  readonly source: RankingFactorSource;

  /** LKGC signal (if applicable) */
  readonly lkgcSignal?: LkgcSignalType;

  /** Visual indicator for UI */
  readonly visualIndicator: "boost" | "penalty" | "neutral";

  /** Human-readable impact description */
  readonly impactDescription: string;
}

/**
 * Source of a ranking factor
 */
export type RankingFactorSource =
  | "scheduler" // From FSRS/HLR core
  | "mode_policy" // From active mode
  | "category_hook" // From category metadata
  | "lkgc_signal" // From LKGC system
  | "user_preference" // From user settings
  | "temporal" // Time-based (overdue, etc.)
  | "structural"; // Graph structure

/**
 * Policy contribution to final ranking
 */
export interface PolicyContribution {
  readonly policyId: ReviewPolicyId;
  readonly policyName: string;
  readonly weight: number;
  readonly contribution: number;
  readonly factorIds: readonly RankingFactorId[];
}

// =============================================================================
// REVIEW POLICY - Composable Policy Interface
// =============================================================================

/**
 * Review policy interface - plugins and modes implement this
 */
export interface ReviewPolicy {
  readonly id: ReviewPolicyId;
  readonly name: string;
  readonly description: string;

  /** Policy version */
  readonly version: string;

  /** Policy type */
  readonly type: ReviewPolicyType;

  /** Applicable modes (empty = all modes) */
  readonly applicableModes: readonly LearningModeId[];

  /** Priority in composition chain (higher = applied later) */
  readonly compositionPriority: number;

  /**
   * Compute ranking factors for candidates
   * This is the core ranking logic
   */
  computeFactors(
    candidates: readonly SchedulerCandidateOutput[],
    context: PolicyExecutionContext,
  ): Promise<PolicyFactorResult>;

  /**
   * Get policy weights for current context
   */
  getWeights(context: PolicyExecutionContext): PolicyWeights;

  /**
   * Validate policy can run with given context
   */
  canExecute(context: PolicyExecutionContext): PolicyValidationResult;
}

/**
 * Types of review policies
 */
export type ReviewPolicyType =
  | "base_urgency" // Computes base urgency from scheduler data
  | "mode_modifier" // Mode-specific adjustments
  | "category_hook" // Category difficulty/decay hooks
  | "lkgc_signal" // LKGC signal processing
  | "temporal" // Time-based adjustments
  | "structural" // Graph structure influence
  | "exam_cram" // Exam-specific prioritization
  | "exploration" // Exploration mode looseness
  | "filter" // Exclusion/inclusion policies
  | "composite"; // Combines other policies

/**
 * Policy execution context
 */
export interface PolicyExecutionContext {
  readonly userId: UserId;
  readonly modeRuntimeState: ModeRuntimeState;
  readonly now: Timestamp;

  /** Time budget for session (if constrained) */
  readonly timeBudget?: Duration;

  /** Target card count for session */
  readonly targetCardCount?: number;

  /** Category filter (if studying specific category) */
  readonly categoryFilter?: CategoryId;

  /** Cards already reviewed this session */
  readonly reviewedThisSession: readonly CardId[];

  /** Session start time */
  readonly sessionStartedAt?: Timestamp;

  /** Exam deadline (if exam mode) */
  readonly examDeadline?: Timestamp;

  /** Additional context from mode parameters */
  readonly modeParameters: Record<string, unknown>;

  /** LKGC signal snapshot for user */
  readonly userLkgcSnapshot: Partial<Record<LkgcSignalType, LkgcSignalValue>>;
}

/**
 * Result of policy factor computation
 */
export interface PolicyFactorResult {
  /** Factors per candidate */
  readonly factorsByCandidateId: ReadonlyMap<string, readonly RankingFactor[]>;

  /** Policy-level metadata */
  readonly metadata: {
    readonly executionTimeMs: number;
    readonly candidatesProcessed: number;
    readonly factorsGenerated: number;
  };

  /** Warnings/issues during computation */
  readonly warnings?: readonly string[];
}

/**
 * Policy weights configuration
 */
export interface PolicyWeights {
  /** Weight for each factor type */
  readonly factorWeights: Record<string, number>;

  /** Overall policy weight in composition */
  readonly policyWeight: number;

  /** Mode-specific weight adjustments */
  readonly modeAdjustments?: Record<LearningModeId, number>;
}

/**
 * Policy validation result
 */
export interface PolicyValidationResult {
  readonly canExecute: boolean;
  readonly reason?: string;
  readonly missingData?: readonly string[];
}

// =============================================================================
// POLICY COMPOSITION - Chain of Policies
// =============================================================================

/**
 * Policy composition chain
 */
export interface PolicyCompositionChain {
  readonly id: PolicyChainId;
  readonly name: string;
  readonly modeId: LearningModeId;

  /** Ordered list of policies to apply */
  readonly policies: readonly ComposedPolicyEntry[];

  /** Aggregation strategy for combining policy outputs */
  readonly aggregationStrategy: AggregationStrategy;

  /** Final normalization */
  readonly normalization: NormalizationStrategy;

  /** Created timestamp */
  readonly createdAt: Timestamp;
}

/**
 * Entry in composition chain
 */
export interface ComposedPolicyEntry {
  readonly policyId: ReviewPolicyId;
  readonly weight: number;
  readonly enabled: boolean;
  readonly overrideWeights?: Partial<PolicyWeights>;
}

/**
 * Strategy for aggregating policy scores
 */
export type AggregationStrategy =
  | "weighted_sum" // Sum of (score * weight)
  | "weighted_product" // Product of (score ^ weight)
  | "max" // Maximum score across policies
  | "min" // Minimum score across policies
  | "harmonic_mean" // Harmonic mean of scores
  | "geometric_mean"; // Geometric mean of scores

/**
 * Strategy for normalizing final scores
 */
export type NormalizationStrategy =
  | "none" // No normalization
  | "linear" // Linear scaling to [0, 1]
  | "softmax" // Softmax normalization
  | "rank" // Rank-based (1/rank)
  | "z_score"; // Z-score normalization

// =============================================================================
// BUILT-IN POLICY IMPLEMENTATIONS
// =============================================================================

/**
 * Base urgency policy configuration
 * Computes urgency from scheduler outputs
 */
export interface BaseUrgencyPolicyConfig {
  /** Weight for retrievability */
  readonly retrievabilityWeight: number;

  /** Weight for overdue days */
  readonly overdueWeight: number;

  /** Weight for difficulty */
  readonly difficultyWeight: number;

  /** Penalty for learning/relearning cards */
  readonly learningBoost: number;

  /** Bonus for new cards */
  readonly newCardBonus: number;

  /** Maximum overdue days to consider */
  readonly maxOverdueDays: number;

  /** Overdue decay function */
  readonly overdueDecay: "linear" | "exponential" | "logarithmic";
}

/**
 * Mode modifier policy configuration
 */
export interface ModeModifierPolicyConfig {
  /** Mode-specific boosts/penalties by signal type */
  readonly signalModifiers: Partial<Record<LkgcSignalType, number>>;

  /** Category depth preference (-1 = prefer deep, +1 = prefer shallow) */
  readonly depthPreference: number;

  /** New card introduction rate (0 = none, 1 = aggressive) */
  readonly newCardRate: NormalizedValue;

  /** Serendipity factor (0 = strict priority, 1 = random) */
  readonly serendipityFactor: NormalizedValue;

  /** Strictness (0 = loose, 1 = strict priority ordering) */
  readonly strictness: NormalizedValue;
}

/**
 * Category hook policy configuration
 */
export interface CategoryHookPolicyConfig {
  /** Apply difficulty multiplier from category */
  readonly applyDifficultyMultiplier: boolean;

  /** Apply decay multiplier from category */
  readonly applyDecayMultiplier: boolean;

  /** Boost for categories with unmet prerequisites */
  readonly prerequisiteGapBoost: number;

  /** Penalty for categories with high volatility */
  readonly volatilityPenalty: number;

  /** Mastery threshold for "well-learned" boost */
  readonly masteryThreshold: NormalizedValue;

  /** Boost for well-learned categories (maintenance) */
  readonly maintenanceBoost: number;
}

/**
 * Exam cram policy configuration
 */
export interface ExamCramPolicyConfig {
  /** Days until exam for maximum urgency */
  readonly criticalDays: number;

  /** Urgency curve steepness */
  readonly urgencyCurve: "linear" | "exponential" | "step";

  /** Prioritize coverage over depth */
  readonly coveragePriority: NormalizedValue;

  /** Skip low-weight content entirely */
  readonly skipLowWeightThreshold: NormalizedValue;

  /** Minimum mastery to consider "covered" */
  readonly coverageMasteryThreshold: NormalizedValue;

  /** Boost for frequently-examined content */
  readonly examFrequencyBoost: number;
}

/**
 * Exploration policy configuration
 */
export interface ExplorationPolicyConfig {
  /** Reduce urgency pressure */
  readonly urgencyDampening: NormalizedValue;

  /** Boost for novel content */
  readonly noveltyBoost: number;

  /** Boost for serendipitous connections */
  readonly serendipityBoost: number;

  /** Allow overdue cards to be deferred */
  readonly allowOverdueDefer: boolean;

  /** Maximum days to defer overdue */
  readonly maxDeferDays: number;

  /** Boost for bridge categories */
  readonly bridgeCategoryBoost: number;
}

// =============================================================================
// POLICY EXECUTION RESULT
// =============================================================================

/**
 * Complete result of policy chain execution
 */
export interface PolicyExecutionResult {
  /** Ranked candidates */
  readonly rankedCandidates: readonly PolicyRankedCandidate[];

  /** Execution metadata */
  readonly metadata: PolicyExecutionMetadata;

  /** Explainability summary */
  readonly explainability: PolicyExplainabilitySummary;

  /** Warnings/issues */
  readonly warnings: readonly string[];
}

/**
 * Execution metadata
 */
export interface PolicyExecutionMetadata {
  readonly policyChainId: PolicyChainId;
  readonly modeId: LearningModeId;
  readonly executedAt: Timestamp;
  readonly totalExecutionTimeMs: number;
  readonly policiesExecuted: number;
  readonly candidatesProcessed: number;
  readonly candidatesIncluded: number;
  readonly candidatesExcluded: number;

  /** Per-policy timing */
  readonly policyTimings: ReadonlyMap<ReviewPolicyId, number>;
}

/**
 * Explainability summary for the entire ranking
 */
export interface PolicyExplainabilitySummary {
  /** Overall ranking strategy description */
  readonly strategyDescription: string;

  /** Top factors influencing rankings */
  readonly topFactors: readonly {
    readonly factorName: string;
    readonly averageContribution: number;
    readonly affectedCandidates: number;
  }[];

  /** Mode influence description */
  readonly modeInfluence: string;

  /** Category hook influence */
  readonly categoryHookInfluence: string;

  /** LKGC signal influence */
  readonly lkgcInfluence: string;

  /** Recommendations for user */
  readonly userRecommendations: readonly string[];
}

// =============================================================================
// REVIEW PLANNER REQUEST/RESPONSE
// =============================================================================

/**
 * Request to the review planner
 */
export interface ReviewPlannerRequest {
  readonly userId: UserId;
  readonly modeId: LearningModeId;

  /** Override mode parameters */
  readonly modeParameterOverrides?: Record<string, unknown>;

  /** Category filter */
  readonly categoryFilter?: CategoryId;

  /** Maximum candidates to return */
  readonly maxCandidates?: number;

  /** Time budget for session */
  readonly timeBudget?: Duration;

  /** Include explainability traces */
  readonly includeExplainability?: boolean;

  /** Request timestamp */
  readonly requestedAt: Timestamp;

  /** Additional context */
  readonly additionalContext?: Record<string, unknown>;
}

/**
 * Response from review planner
 */
export interface ReviewPlannerResponse {
  readonly success: boolean;
  readonly error?: string;

  /** Ranked candidates for review */
  readonly candidates: readonly PolicyRankedCandidate[];

  /** Execution result details */
  readonly executionResult: PolicyExecutionResult;

  /** Session recommendations */
  readonly sessionRecommendations: SessionRecommendations;

  /** Generation timestamp */
  readonly generatedAt: Timestamp;

  /** Cache TTL */
  readonly ttlMs: Duration;
}

/**
 * Session recommendations based on ranking
 */
export interface SessionRecommendations {
  /** Recommended session length */
  readonly recommendedDuration: Duration;

  /** Recommended card count */
  readonly recommendedCardCount: number;

  /** Focus areas */
  readonly focusAreas: readonly {
    readonly categoryId: CategoryId;
    readonly categoryName: string;
    readonly reason: string;
    readonly cardCount: number;
  }[];

  /** Warnings (e.g., many overdue cards) */
  readonly warnings: readonly string[];

  /** Mode-specific tips */
  readonly modeTips: readonly string[];
}

// =============================================================================
// POLICY REGISTRY
// =============================================================================

/**
 * Policy registration entry
 */
export interface PolicyRegistryEntry {
  readonly policy: ReviewPolicy;
  readonly registeredAt: Timestamp;
  readonly registeredBy: "system" | "plugin";
  readonly pluginId?: string;
  readonly enabled: boolean;
}

/**
 * Policy registry interface
 */
export interface PolicyRegistry {
  /** Register a policy */
  register(policy: ReviewPolicy): void;

  /** Unregister a policy */
  unregister(policyId: ReviewPolicyId): void;

  /** Get policy by ID */
  get(policyId: ReviewPolicyId): ReviewPolicy | undefined;

  /** Get all policies */
  getAll(): readonly PolicyRegistryEntry[];

  /** Get policies for a mode */
  getForMode(modeId: LearningModeId): readonly ReviewPolicy[];

  /** Get policies by type */
  getByType(type: ReviewPolicyType): readonly ReviewPolicy[];
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/**
 * Default base urgency policy config
 */
export const DEFAULT_BASE_URGENCY_CONFIG: BaseUrgencyPolicyConfig = {
  retrievabilityWeight: 0.4,
  overdueWeight: 0.3,
  difficultyWeight: 0.1,
  learningBoost: 0.2,
  newCardBonus: 0.0,
  maxOverdueDays: 30,
  overdueDecay: "logarithmic",
};

/**
 * Default exploration mode config
 */
export const DEFAULT_EXPLORATION_CONFIG: ExplorationPolicyConfig = {
  urgencyDampening: 0.5 as NormalizedValue,
  noveltyBoost: 0.3,
  serendipityBoost: 0.2,
  allowOverdueDefer: true,
  maxDeferDays: 7,
  bridgeCategoryBoost: 0.25,
};

/**
 * Default exam cram config
 */
export const DEFAULT_EXAM_CRAM_CONFIG: ExamCramPolicyConfig = {
  criticalDays: 3,
  urgencyCurve: "exponential",
  coveragePriority: 0.7 as NormalizedValue,
  skipLowWeightThreshold: 0.1 as NormalizedValue,
  coverageMasteryThreshold: 0.6 as NormalizedValue,
  examFrequencyBoost: 0.4,
};

/**
 * Default goal-driven config
 */
export const DEFAULT_GOAL_DRIVEN_CONFIG: ModeModifierPolicyConfig = {
  signalModifiers: {
    prerequisite_completion: 0.5,
    blocking_gap: -0.3,
    mastery_level: 0.2,
  },
  depthPreference: 0.3, // Slightly prefer depth
  newCardRate: 0.3 as NormalizedValue,
  serendipityFactor: 0.1 as NormalizedValue,
  strictness: 0.7 as NormalizedValue,
};

/**
 * Default synthesis mode config
 */
export const DEFAULT_SYNTHESIS_CONFIG: ModeModifierPolicyConfig = {
  signalModifiers: {
    synthesis_depth: 0.4,
    cross_context_stability: 0.3,
    exploration_potential: 0.2,
  },
  depthPreference: -0.2, // Prefer broader view
  newCardRate: 0.2 as NormalizedValue,
  serendipityFactor: 0.4 as NormalizedValue, // High serendipity
  strictness: 0.3 as NormalizedValue, // Loose ordering
};
