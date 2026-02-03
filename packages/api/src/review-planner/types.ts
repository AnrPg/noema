// =============================================================================
// REVIEW PLANNER INTERNAL TYPES
// =============================================================================
// Internal types used by the review planner API implementation.
// These complement the shared types but are not exported from the package.
// =============================================================================

import type {
  CardId,
  CategoryId,
  ReviewPolicyId,
  PolicyChainId,
  RankingFactorId,
  LearningModeId,
  Timestamp,
  Duration,
  NormalizedValue,
  Confidence,
  ReviewPolicy,
  SchedulerCandidateOutput,
  PolicyRankedCandidate,
  PolicyFactorResult,
  RankingFactor,
  AggregationStrategy,
  NormalizationStrategy,
  PolicyExecutionMetadata,
  PolicyExplainabilitySummary,
  UrgencyLevel,
  ReviewRecommendation,
} from "@manthanein/shared";

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/** Configuration for the ReviewPlannerService */
export interface ReviewPlannerServiceConfig {
  /** Maximum candidates to process per request */
  readonly maxCandidates: number;

  /** Default time budget for session (ms) */
  readonly defaultTimeBudget: Duration;

  /** Cache TTL for ranking results (ms) */
  readonly cacheTtl: Duration;

  /** Enable explainability traces by default */
  readonly enableExplainability: boolean;

  /** Maximum factors per candidate to track */
  readonly maxFactorsPerCandidate: number;

  /** Batch size for processing candidates */
  readonly batchSize: number;

  /** Enable parallel policy execution */
  readonly enableParallelExecution: boolean;

  /** Maximum concurrent policy executions */
  readonly maxConcurrentPolicies: number;

  /** Policy execution timeout (ms) */
  readonly policyTimeoutMs: number;
}

/** Default service configuration */
export const DEFAULT_REVIEW_PLANNER_CONFIG: ReviewPlannerServiceConfig = {
  maxCandidates: 500,
  defaultTimeBudget: (30 * 60 * 1000) as Duration, // 30 minutes
  cacheTtl: (5 * 60 * 1000) as Duration, // 5 minutes
  enableExplainability: true,
  maxFactorsPerCandidate: 20,
  batchSize: 50,
  enableParallelExecution: true,
  maxConcurrentPolicies: 4,
  policyTimeoutMs: 5000,
};

// =============================================================================
// POLICY COMPOSER CONFIGURATION
// =============================================================================

/** Configuration for the PolicyComposer */
export interface PolicyComposerConfig {
  /** Default weights for built-in policies */
  readonly defaultPolicyWeights: Record<string, number>;

  /** Aggregation strategy for combining policy scores */
  readonly aggregationStrategy: AggregationStrategy;

  /** Normalization strategy for final scores */
  readonly normalizationStrategy: NormalizationStrategy;

  /** Fallback behavior when a policy fails */
  readonly fallbackBehavior: "skip" | "use_default" | "error";

  /** Enable caching of intermediate results */
  readonly enableCaching: boolean;
}

/** Default composer configuration */
export const DEFAULT_COMPOSER_CONFIG: PolicyComposerConfig = {
  defaultPolicyWeights: {
    "policy:base_urgency": 1.0,
    "policy:mode_modifier": 0.8,
    "policy:category_hook": 0.6,
    "policy:lkgc_signal": 0.7,
    "policy:structural": 0.5,
    "policy:exam_cram": 0.9,
    "policy:exploration": 0.8,
  },
  aggregationStrategy: "weighted_sum",
  normalizationStrategy: "linear",
  fallbackBehavior: "skip",
  enableCaching: true,
};

// =============================================================================
// INTERNAL PROCESSING TYPES
// =============================================================================

/** Internal candidate with accumulated scores during processing */
export interface ProcessingCandidate {
  readonly cardId: CardId;
  readonly categoryId?: CategoryId;
  readonly original: SchedulerCandidateOutput;

  // Mutable during processing
  factors: RankingFactor[];
  policyScores: Map<ReviewPolicyId, number>;
  totalScore: number;
}

/** Result from composing all policies */
export interface CompositionResult {
  /** Ranked candidates with full metadata */
  readonly rankedCandidates: PolicyRankedCandidate[];

  /** Execution metadata */
  readonly metadata: PolicyExecutionMetadata;

  /** Explainability summary */
  readonly explainability: PolicyExplainabilitySummary;

  /** Any warnings during execution */
  readonly warnings: string[];
}

/** Internal result from a single policy execution */
export interface PolicyExecutionInternalResult {
  readonly policyId: ReviewPolicyId;
  readonly factorResult: PolicyFactorResult;
  readonly executionTimeMs: number;
  readonly success: boolean;
  readonly error?: string;
}

// =============================================================================
// DATABASE RECORD TYPES
// =============================================================================

/** Card review candidate from database */
export interface CardReviewCandidateRecord {
  readonly id: string;
  readonly cardId: string;
  readonly userId: string;
  readonly deckId: string;
  readonly categoryId: string | null;
  readonly dueDate: Date;
  readonly stability: number;
  readonly difficulty: number;
  readonly retrievability: number | null;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
  readonly state: string;
  readonly halfLife: number | null;
  readonly lastRating: string | null;
  readonly lastReviewDate: Date | null;
}

/** Category metadata from database */
export interface CategoryMetadataRecord {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly path: string[];
  readonly difficultyMultiplier: number | null;
  readonly decayMultiplier: number | null;
  readonly volatilityFactor: number | null;
  readonly cardCount: number;
  readonly prerequisiteCount: number;
  readonly dependentCount: number;
  readonly examDeadline: Date | null;
  readonly examWeight: number | null;
}

/** User's mastery in a category from database */
export interface UserCategoryMasteryRecord {
  readonly categoryId: string;
  readonly userId: string;
  readonly mastery: number;
  readonly confidence: number;
  readonly lastActivityAt: Date | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Generate a unique ranking factor ID */
export function generateFactorId(): RankingFactorId {
  return `factor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as RankingFactorId;
}

/** Generate a unique policy chain ID */
export function generatePolicyChainId(): PolicyChainId {
  return `chain_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as PolicyChainId;
}

/** Generate a review policy ID */
export function generatePolicyId(
  type: string,
  suffix?: string,
): ReviewPolicyId {
  const base = `policy:${type}`;
  return (suffix ? `${base}:${suffix}` : base) as ReviewPolicyId;
}

/** Normalize a score to [0, 1] range */
export function normalizeScore(
  score: number,
  min: number,
  max: number,
): NormalizedValue {
  if (max === min) return 0.5 as NormalizedValue;
  const normalized = Math.max(0, Math.min(1, (score - min) / (max - min)));
  return normalized as NormalizedValue;
}

/** Clamp a value to a range */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Get current timestamp */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/** Calculate urgency level from priority score */
export function calculateUrgencyLevel(
  priorityScore: number,
  hasBlockingPrerequisites: boolean,
): UrgencyLevel {
  if (hasBlockingPrerequisites) return "blocked";
  if (priorityScore >= 0.9) return "critical";
  if (priorityScore >= 0.7) return "high";
  if (priorityScore >= 0.4) return "medium";
  if (priorityScore >= 0.2) return "low";
  return "deferred";
}

/** Get review recommendation from urgency level */
export function getRecommendation(
  urgencyLevel: UrgencyLevel,
  _modeId: LearningModeId,
): ReviewRecommendation {
  switch (urgencyLevel) {
    case "critical":
    case "high":
      return "review_now";
    case "medium":
      return "review_soon";
    case "low":
      return "review_later";
    case "deferred":
      return "skip_today";
    case "blocked":
      return "blocked_prerequisite";
    default:
      return "review_later";
  }
}

/** Build default confidence based on data quality */
export function calculateConfidence(
  factorCount: number,
  hasLkgcSignals: boolean,
  hasCategoryMetadata: boolean,
): Confidence {
  let confidence = 0.5;

  // More factors = higher confidence
  confidence += Math.min(0.2, factorCount * 0.02);

  // LKGC signals improve confidence
  if (hasLkgcSignals) confidence += 0.15;

  // Category metadata improves confidence
  if (hasCategoryMetadata) confidence += 0.1;

  return Math.min(1, confidence) as Confidence;
}

// =============================================================================
// POLICY REGISTRATION TYPES
// =============================================================================

/** Entry for a registered policy */
export interface RegisteredPolicyEntry {
  readonly policy: ReviewPolicy;
  readonly weight: number;
  readonly enabled: boolean;
  readonly registeredAt: Timestamp;
}

/** Mode-specific policy configuration */
export interface ModePolicyConfiguration {
  readonly modeId: LearningModeId;
  readonly policyWeightOverrides: Record<string, number>;
  readonly additionalPolicies: ReviewPolicyId[];
  readonly excludedPolicies: ReviewPolicyId[];
}

// =============================================================================
// ROUTE TYPES
// =============================================================================

/** Request body for the rank endpoint */
export interface RankRequestBody {
  readonly modeId: string;
  readonly categoryFilter?: string;
  readonly maxCandidates?: number;
  readonly timeBudgetMinutes?: number;
  readonly includeExplainability?: boolean;
  readonly modeParameterOverrides?: Record<string, unknown>;
}

/** Request body for the explain endpoint */
export interface ExplainRequestBody {
  readonly cardId: string;
  readonly modeId: string;
}

/** Response wrapper */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: number;
}
