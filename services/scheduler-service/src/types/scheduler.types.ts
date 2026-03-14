/**
 * @noema/scheduler-service - Scheduler Domain Types
 */

import type { CardId, CorrelationId, UserId } from '@noema/types';

export type { CardId, CorrelationId, UserId };

export interface ISchedulerLaneMix {
  retention: number;
  calibration: number;
}

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
}

export interface IDualLanePlanInput {
  userId: UserId;
  retentionCardIds: CardId[];
  calibrationCardIds: CardId[];
  targetMix?: ISchedulerLaneMix;
  maxCards: number;
  /** Optional per-card priority scores (higher = more urgent). */
  cardPriorityScores?: Record<string, number>;
  /** Interleave retention/calibration cards in the output (default true). */
  interleave?: boolean;
  /** Explicit commit gate: default false for side-effect-free planning. */
  commit?: boolean;
}

/** Per-card metadata in the plan output. */
export interface ICardDetail {
  cardId: CardId;
  lane: SchedulerLane;
  /** Priority score used for selection (0 if none provided). */
  score: number;
  /** 0-based position in the final interleaved sequence. */
  position: number;
  /** True if this card was selected via spillover from the other lane. */
  isSpillover: boolean;
}

export interface IDualLanePlan {
  planVersion: 'v2';
  policyVersion: string;
  laneMix: ISchedulerLaneMix;
  selectedCardIds: CardId[];
  retentionSelected: number;
  calibrationSelected: number;
  /** Retention-lane cards that filled calibration slots via spillover. */
  retentionSpillover: number;
  /** Calibration-lane cards that filled retention slots via spillover. */
  calibrationSpillover: number;
  /** Per-card selection metadata. */
  cardDetails: ICardDetail[];
  orchestration: IOrchestrationMetadata;
  rationale: string;
}

export interface IPolicyVersion {
  version: string;
  rulesetChecksum?: string;
}

export interface IOrchestrationMetadata {
  proposalId: string;
  decisionId: string;
  sessionRevision: number;
  sessionId?: string;
  correlationId?: string;
}

export interface IScoringBreakdown {
  urgency: number;
  retentionRisk: number;
  calibrationValue: number;
  composite: number;
}

export interface ICardScheduleInput {
  cardId: CardId;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  lastReviewAt?: string | null;
  stability?: number | null;
  difficulty?: number | null;
  lapses?: number | null;
}

export interface ICardScheduleDecision {
  cardId: CardId;
  nextReviewAt: string;
  intervalDays: number;
  lane: SchedulerLane;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  rationale: string;
}

export interface IReviewWindowProposalInput {
  userId: UserId;
  cards: ICardScheduleInput[];
  asOf?: string | null;
}

export interface IReviewWindowProposal {
  generatedAt: string;
  decisions: ICardScheduleDecision[];
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
}

export interface ISessionConstraints {
  targetCards: number;
  maxSessionDurationMinutes?: number;
  includeCalibration?: boolean;
  laneMix?: ISchedulerLaneMix;
}

export interface ISessionCandidateCard {
  cardId: CardId;
  lane: SchedulerLane;
  dueAt?: string | null;
  retentionProbability?: number | null;
  estimatedSeconds?: number | null;
}

export interface ICandidateScore {
  urgency: number;
  retentionRisk: number;
  calibrationValue: number;
  composite: number;
}

export interface ISessionCandidateProposalInput {
  userId: UserId;
  cards: ISessionCandidateCard[];
  constraints: ISessionConstraints;
  sourceDeckId?: string | null;
  sessionContext?: Record<string, unknown> | null;
}

export interface ISessionCandidateProposal {
  selectedCardIds: CardId[];
  excludedCardIds: CardId[];
  scores: {
    cardId: CardId;
    score: ICandidateScore;
  }[];
  scoringBreakdown: IScoringBreakdown;
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
  rationale: string;
}

export interface ISessionCandidateSimulationInput {
  userId: UserId;
  cards: ISessionCandidateCard[];
  constraints: ISessionConstraints;
  whatIfAdjustments?: Record<string, unknown> | null;
  sessionContext?: Record<string, unknown> | null;
}

export interface ISessionCandidateSimulation {
  selectedCardIds: CardId[];
  excludedCardIds: CardId[];
  scores: {
    cardId: CardId;
    score: ICandidateScore;
  }[];
  scoringBreakdown: IScoringBreakdown;
  policyVersion: IPolicyVersion;
  sideEffectFree: true;
}

export interface ICardScheduleCommitInput {
  userId: UserId;
  decision: ICardScheduleDecision;
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
  reason?: string;
}

export interface ICardScheduleCommitResult {
  commitId: string;
  cardId: CardId;
  status: 'committed';
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
}

export interface IBatchScheduleCommitInput {
  userId: UserId;
  decisions: ICardScheduleDecision[];
  source: 'agent' | 'session-service' | 'scheduler-service';
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
  reason?: string;
}

export interface IBatchScheduleCommitResult {
  commitId: string;
  accepted: number;
  rejected: number;
  updatedCardIds: CardId[];
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
}

// ============================================================================
// Phase 4 Tool Support Types
// ============================================================================

/**
 * Input for get-srs-schedule tool (review queue retrieval).
 */
export interface IReviewQueueInput {
  userId: UserId;
  lane?: SchedulerLane;
  limit?: number;
  asOf?: string;
}

/**
 * Output for get-srs-schedule tool.
 */
export interface IReviewQueue {
  cards: ISchedulerCard[];
  totalDue: number;
  retentionDue: number;
  calibrationDue: number;
  asOf: string;
  policyVersion: IPolicyVersion;
}

/**
 * Single retention prediction request.
 */
export interface IRetentionPredictionRequest {
  cardId: CardId;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  asOf?: string;
}

/**
 * Input for predict-retention tool.
 */
export interface IRetentionPredictionInput {
  userId: UserId;
  cards: IRetentionPredictionRequest[];
}

/**
 * Single retention prediction result.
 */
export interface IRetentionPrediction {
  cardId: CardId;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  retentionProbability: number;
  daysUntilDue: number;
  nextReviewAt: string;
  confidence: number;
}

/**
 * Output for predict-retention tool.
 */
export interface IRetentionPredictionResult {
  predictions: IRetentionPrediction[];
  generatedAt: string;
  policyVersion: IPolicyVersion;
}

/**
 * Full projection for a single card — combines scheduling state, retention
 * prediction, and forgetting risk.
 * Output of get-card-projection tool (Phase 4E).
 */
export interface ICardProjection {
  cardId: CardId;
  userId: UserId;
  lane: SchedulerLane;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  state: SchedulerCardState;
  /** Predicted probability of recall at asOf time [0-1]. */
  retentionProbability: number;
  /** 1 - retentionProbability: how likely the card has been forgotten. */
  forgettingRisk: number;
  /** Recommended lane based on current retention probability. */
  recommendedLane: SchedulerLane;
  /** Days until the next scheduled review date (negative = overdue). */
  daysUntilDue: number;
  /** Next scheduled review date (ISO string). */
  nextReviewDate: string;
  /** FSRS stability or HLR half-life in days. */
  stability: number | null;
  /** HLR-specific half-life in days. */
  halfLife: number | null;
  /** Total number of reviews for this card. */
  reviewCount: number;
  /** Point-in-time for which the projection was computed. */
  asOf: string;
  policyVersion: IPolicyVersion;
}

/**
 * Session card adjustment action.
 */
export interface ISessionCardAdjustment {
  cardId: CardId;
  action: 'add' | 'remove' | 'reprioritize';
  reason: string;
  newPriority?: number;
}

/**
 * Input for apply-session-adjustments tool.
 */
export interface ISessionAdjustmentInput {
  userId: UserId;
  sessionId: string;
  adjustments: ISessionCardAdjustment[];
  orchestration: IOrchestrationMetadata;
}

/**
 * Output for apply-session-adjustments tool.
 */
export interface ISessionAdjustmentResult {
  sessionId: string;
  appliedCount: number;
  adjustments: ISessionCardAdjustment[];
  policyVersion: IPolicyVersion;
  orchestration: IOrchestrationMetadata;
}

// ============================================================================
// Phase 3 — Read API Types
// ============================================================================

/**
 * Response shape for GET /v1/scheduler/cards/:cardId (single card).
 * Includes everything needed for the Card Schedule Inspector.
 */
export interface ISchedulerCardResponse {
  cardId: CardId;
  userId: UserId;
  lane: SchedulerLane;
  state: SchedulerCardState;
  schedulingAlgorithm: 'fsrs' | 'hlr' | 'sm2';
  /** FSRS: memory stability in days */
  stability: number | null;
  /** FSRS: intrinsic difficulty [0-10] */
  difficulty: number | null;
  /** Current inter-review interval in days */
  interval: number;
  /** HLR: days until recall probability drops to 50% */
  halfLife: number | null;
  /** Current recall probability [0-1]. FSRS: forgetting curve. HLR: 2^(-deltaDays/halfLife). */
  currentRecallProbability: number | null;
  nextReviewDate: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated list response for GET /v1/scheduler/cards.
 * Same shape as single-card but without inline recall probability (for performance).
 */
export interface ISchedulerCardListResponse {
  cards: ISchedulerCardResponse[];
}

/**
 * Query filters for the cards list endpoint.
 */
export interface ISchedulerCardQueryFilters {
  userId: UserId;
  lane?: SchedulerLane;
  state?: SchedulerCardState;
  algorithm?: 'fsrs' | 'hlr' | 'sm2';
  dueBefore?: string;
  dueAfter?: string;
  sortBy?: 'nextReviewDate' | 'stability' | 'difficulty' | 'reviewCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Response shape for a single review in the review history.
 */
export interface IReviewResponse {
  id: string;
  cardId: CardId;
  userId: UserId;
  sessionId: string;
  attemptId: string;
  rating: Rating;
  ratingValue: number;
  outcome: string;
  deltaDays: number;
  responseTime: number | null;
  reviewedAt: string;
  lane: SchedulerLane;
  algorithm: string;
  priorState: Record<string, unknown>;
  newState: Record<string, unknown>;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  hintDepthReached: number | null;
}

/**
 * Query filters for the reviews list endpoint.
 */
export interface IReviewQueryFilters {
  userId: UserId;
  cardId?: CardId;
  sessionId?: string;
  lane?: SchedulerLane;
  algorithm?: string;
  rating?: Rating;
  outcome?: string;
  reviewedAfter?: string;
  reviewedBefore?: string;
  sortBy?: 'reviewedAt' | 'responseTime' | 'rating';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Aggregated review statistics response.
 */
export interface IReviewStatsResponse {
  totalReviews: number;
  averageResponseTimeMs: number | null;
  ratingDistribution: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
  outcomeDistribution: {
    correct: number;
    incorrect: number;
    partial: number;
    skipped: number;
  };
  averageCalibrationDelta: number | null;
  averageInterval: number | null;
  reviewsByDay: Array<{ date: string; count: number }>;
}

/**
 * Request body for POST /v1/scheduler/forecast.
 */
export interface IForecastInput {
  userId: UserId;
  /** Number of days to forecast (default 7, max 90) */
  days?: number;
  /** Include already-overdue cards in day 0 (default true) */
  includeOverdue?: boolean;
}

/**
 * Per-lane breakdown in a forecast day.
 */
export interface IForecastLaneCounts {
  newDue: number;
  overdue: number;
  total: number;
}

/**
 * Single day in the forecast projection.
 */
export interface IForecastDay {
  date: string;
  retention: IForecastLaneCounts;
  calibration: IForecastLaneCounts;
  combined: IForecastLaneCounts;
  estimatedMinutes: number;
}

/**
 * Full forecast response.
 */
export interface IForecastResponse {
  days: IForecastDay[];
  generatedAt: string;
  model: 'consumed';
  averageSecondsPerCard: number;
}

/**
 * Suggested time block for review windows.
 */
export interface ISuggestedTimeBlock {
  startTime: string;
  endTime: string;
  cardCount: number;
  description: string;
}

/**
 * Enhanced review window proposal with retention probability and time blocks.
 */
export interface IEnhancedCardScheduleDecision extends ICardScheduleDecision {
  retentionProbability?: number | null;
}

export interface IEnhancedReviewWindowProposal extends Omit<IReviewWindowProposal, 'decisions'> {
  decisions: IEnhancedCardScheduleDecision[];
  suggestedTimeBlocks: ISuggestedTimeBlock[];
}

// ============================================================================
// Database Entity Types
// ============================================================================

export type SchedulerLane = 'retention' | 'calibration';

export type SchedulerCardState =
  | 'new'
  | 'learning'
  | 'review'
  | 'relearning'
  | 'suspended'
  | 'graduated';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ISchedulerCard {
  id: string;
  cardId: CardId;
  userId: UserId;
  lane: SchedulerLane;
  stability: number | null;
  difficultyParameter: number | null;
  halfLife: number | null;
  interval: number;
  nextReviewDate: string; // ISO date string
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  schedulingAlgorithm: string;
  cardType: string | null;
  difficulty: string | null;
  knowledgeNodeIds: string[];
  state: SchedulerCardState;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IReview {
  id: string;
  cardId: CardId;
  userId: UserId;
  sessionId: string;
  attemptId: string;
  rating: Rating;
  ratingValue: number;
  outcome: string;
  deltaDays: number;
  responseTime: number | null;
  reviewedAt: string;
  priorState: Record<string, unknown>;
  newState: Record<string, unknown>;
  schedulingAlgorithm: string;
  lane: SchedulerLane;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  hintRequestCount: number | null;
  createdAt: string;
}

export interface ICalibrationData {
  id: string;
  userId: UserId;
  cardId: CardId | null;
  cardType: string | null;
  parameters: Record<string, unknown>;
  sampleCount: number;
  confidenceScore: number;
  lastTrainedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface ISchedulerCardFilters {
  lane?: SchedulerLane;
  state?: SchedulerCardState;
  dueBefore?: Date;
  schedulingAlgorithm?: string;
}

export interface IReviewFilters {
  startDate?: Date;
  endDate?: Date;
  lane?: SchedulerLane;
  rating?: Rating;
  sessionId?: string;
}

// ============================================================================
// Extended Filter Types (Phase 3 — paginated queries)
// ============================================================================

export interface IPaginationParams {
  limit: number;
  offset: number;
}

export interface ISortParams<T extends string = string> {
  sortBy: T;
  sortOrder: 'asc' | 'desc';
}

export interface ISchedulerCardExtendedFilters {
  lane?: SchedulerLane;
  state?: SchedulerCardState;
  schedulingAlgorithm?: string;
  dueBefore?: Date;
  dueAfter?: Date;
}

export interface IReviewExtendedFilters {
  cardId?: CardId;
  sessionId?: string;
  lane?: SchedulerLane;
  schedulingAlgorithm?: string;
  rating?: Rating;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
}
