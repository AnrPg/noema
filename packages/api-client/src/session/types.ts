/**
 * @noema/api-client - Session Service Types
 *
 * DTOs for Session Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  HintDepth,
  Rating,
  SchedulingAlgorithm,
  SessionId,
  SessionTerminationReason,
  StudyMode,
  TeachingApproach,
  UserId,
} from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type SessionState = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

export type SessionMode = 'standard' | 'cram' | 'preview' | 'test';
export type LearningMode = 'exploration' | 'goal_driven' | 'exam_oriented' | 'synthesis';
export type SessionRevealMode = 'all_at_once' | 'one_then_more';

export interface ISessionPresentationConfig {
  promptSide?: string;
  answerSide?: string;
  revealMode?: SessionRevealMode;
}

export interface ISessionConfigDto {
  maxCards?: number;
  maxDurationMinutes?: number;
  sessionTimeoutHours: number;
  categoryIds?: string[];
  cardTypes?: string[];
  presentation?: ISessionPresentationConfig;
}

// ============================================================================
// Session DTO
// ============================================================================

export interface ISessionDto {
  id: SessionId;
  userId: UserId;
  state: SessionState;
  mode: SessionMode;
  learningMode: LearningMode;
  studyMode: StudyMode;
  teachingApproach: TeachingApproach;
  schedulingAlgorithm: SchedulingAlgorithm;
  config: ISessionConfigDto;
  cardIds: CardId[];
  currentCardIndex: number;
  stats: {
    totalAttempts: number;
    correctCount: number;
    incorrectCount: number;
    skippedCount: number;
    averageResponseTimeMs: number;
    averageConfidence: number | null;
    averageCalibrationDelta: number | null;
    retentionRate: number;
    streakCurrent: number;
    streakBest: number;
    totalHintsUsed: number;
    uniqueCardsReviewed: number;
    newCardsIntroduced: number;
    lapsedCards: number;
    ratingDistribution: Record<string, number>;
  };
  initialQueueSize: number;
  pauseCount: number;
  totalPausedDurationMs: number;
  startedAt: string;
  lastActivityAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  terminationReason: SessionTerminationReason | null;
  version: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Attempt DTO (with metacognitive signals)
// ============================================================================

export interface IAttemptDto {
  id: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  grade: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  hintDepthUsed: number;
  dwellTimeMs: number;
  selfReportedGuess: boolean;
  reviewedAt: string;
  createdAt: string;
}

export interface IRecordAttemptInput {
  cardId: CardId;
  outcome: AttemptOutcome;
  rating: Rating;
  ratingValue: number;
  responseTimeMs: number;
  dwellTimeMs: number;
  timeToFirstInteractionMs?: number;
  confidenceBefore?: number;
  confidenceAfter?: number;
  wasRevisedBeforeCommit: boolean;
  revisionCount?: number;
  hintRequestCount?: number;
  hintDepthReached: HintDepth;
  contextSnapshot: {
    learningMode: LearningMode;
    studyMode?: StudyMode;
    teachingApproach: string;
    loadoutArchetype?: string;
    forceLevel?: string;
    cognitiveLoad?: string;
    fatigueLevel?: string;
    motivationSignal?: string;
    activeInterventionIds: string[];
  };
  priorSchedulingState?: {
    algorithm: SchedulingAlgorithm;
    stability?: number;
    difficulty?: number;
    elapsedDays: number;
    retrievability?: number;
    intervalDays?: number;
    lapseCount?: number;
    reviewCount?: number;
    leitnerBox?: number;
    sm2EaseFactor?: number;
  };
}

export interface IRequestHintInput {
  cardId?: CardId;
  hintDepth: HintDepth;
  hintRequestNumber: number;
  responseTimeMsAtRequest: number;
}

export interface IEvaluateCheckpointInput {
  trigger: 'confidence_drift' | 'latency_spike' | 'error_cascade' | 'streak_break' | 'manual';
  lastAttemptResponseTimeMs?: number;
  rollingAverageResponseTimeMs?: number;
  recentIncorrectStreak?: number;
  confidenceDrift?: number;
}

// ============================================================================
// Session Queue
// ============================================================================

export interface ISessionQueueItem {
  cardId: CardId;
  lane: 'retention' | 'calibration';
  position: number;
  injected: boolean;
}

export interface ISessionQueueDto {
  sessionId: SessionId;
  items: ISessionQueueItem[];
  remaining: number;
}

// ============================================================================
// Hints
// ============================================================================

export interface IHintResponseDto {
  acknowledged: boolean;
}

// ============================================================================
// Checkpoints
// ============================================================================

export interface IAdaptiveCheckpointDirectiveDto {
  action:
    | 'rebalance_queue'
    | 'slowdown'
    | 'increase_support'
    | 'reduce_calibration_lane'
    | 'switch_teaching_approach'
    | 'continue';
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface IEvaluateCheckpointResultDto {
  shouldAdapt: boolean;
  directives: IAdaptiveCheckpointDirectiveDto[];
  reason: string;
}

// ============================================================================
// Cohort Handshake
// ============================================================================

export interface ICohortHandshakeDto {
  cohortId: string;
  status: 'proposed' | 'accepted' | 'revised' | 'committed';
  cardIds: CardId[];
  proposedAt: string;
}

// ============================================================================
// Mid-session Updates
// ============================================================================

export interface IUpdateStrategyInput {
  strategy: string;
  parameters?: Record<string, unknown>;
}

export interface IUpdateTeachingInput {
  approach: string;
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Blueprint
// ============================================================================

export interface IBlueprintValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Offline Intents
// ============================================================================

export interface IOfflineIntentTokenDto {
  token: string;
  expiresAt: string;
  cardIds: CardId[];
}

export interface IOfflineIntentVerifyInput {
  token: string;
  attempts: IRecordAttemptInput[];
}

// ============================================================================
// Create Inputs
// ============================================================================

export interface IStartSessionInput {
  cardIds?: CardId[];
  mode?: SessionMode;
  blueprintId?: string;
  deckQueryId?: string;
  learningMode?: LearningMode;
  studyMode?: StudyMode;
  teachingApproach?: string;
  schedulingAlgorithm?: 'fsrs' | 'hlr' | 'sm2';
  loadoutId?: string;
  loadoutArchetype?: string;
  config?: {
    maxCards?: number;
    maxDurationMinutes?: number;
    sessionTimeoutHours?: number;
    categoryIds?: string[];
    cardTypes?: string[];
    presentation?: ISessionPresentationConfig;
  };
  initialCardIds?: CardId[];
  initialCardLanes?: Record<string, 'retention' | 'calibration'>;
  blueprint?: unknown;
  offlineIntentToken?: string;
}

export interface ISessionFilters {
  state?: SessionState;
  mode?: SessionMode;
  studyMode?: StudyMode;
  limit?: number;
  offset?: number;
}

export interface IStreakHistoryEntryDto {
  sessionsCompleted: number;
  totalAttempts: number;
  totalMinutes: number;
}

export interface IHeatmapEntryDto {
  date: string;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface IStreakQuery {
  days?: number;
  timezone?: string;
  studyMode?: StudyMode;
}

export interface IStreakDto {
  studyMode: StudyMode;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  isActiveToday: boolean;
  streakHistory: Record<string, IStreakHistoryEntryDto>;
  heatmapData: IHeatmapEntryDto[];
}

// ============================================================================
// Backward-compat aliases
// ============================================================================

export type SessionDto = ISessionDto;
export type AttemptDto = IAttemptDto;
export type AttemptInput = IRecordAttemptInput;
export type RecordAttemptInput = IRecordAttemptInput;
export type RequestHintInput = IRequestHintInput;
export type EvaluateCheckpointInput = IEvaluateCheckpointInput;
export type SessionQueueItem = ISessionQueueItem;
export type SessionQueueDto = ISessionQueueDto;
export type HintResponseDto = IHintResponseDto;
export type AdaptiveCheckpointDirectiveDto = IAdaptiveCheckpointDirectiveDto;
export type CheckpointDirectiveDto = IAdaptiveCheckpointDirectiveDto;
export type EvaluateCheckpointResultDto = IEvaluateCheckpointResultDto;
export type CohortHandshakeDto = ICohortHandshakeDto;
export type UpdateStrategyInput = IUpdateStrategyInput;
export type UpdateTeachingInput = IUpdateTeachingInput;
export type BlueprintValidationResult = IBlueprintValidationResult;
export type OfflineIntentTokenDto = IOfflineIntentTokenDto;
export type OfflineIntentVerifyInput = IOfflineIntentVerifyInput;
export type StartSessionInput = IStartSessionInput;
export type SessionFilters = ISessionFilters;
export type StreakDto = IStreakDto;
export type StreakQuery = IStreakQuery;

// ============================================================================
// Response aliases
// ============================================================================

export type SessionResponse = IApiResponse<ISessionDto>;
export type SessionsListResponse = IApiResponse<ISessionDto[]>;
export type AttemptResponse = IApiResponse<IAttemptDto>;
export type AttemptsListResponse = IApiResponse<IAttemptDto[]>;
export type SessionQueueResponse = IApiResponse<ISessionQueueDto>;
export type HintResponse = IApiResponse<IHintResponseDto>;
export type CheckpointResponse = IApiResponse<IEvaluateCheckpointResultDto>;
export type CohortResponse = IApiResponse<ICohortHandshakeDto>;
export type BlueprintValidationResponse = IApiResponse<IBlueprintValidationResult>;
export type OfflineTokenResponse = IApiResponse<IOfflineIntentTokenDto>;
export type StreakResponse = IApiResponse<IStreakDto>;
