/**
 * @noema/session-service - Service-Internal Types
 *
 * Domain types used within the session service.
 * These map to the Prisma models but are service-internal (not in @noema/types).
 */

import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  CardQueueStatus,
  CognitiveLoadLevel,
  DeckQueryLogId,
  FatigueLevel,
  ForceLevel,
  HintDepth,
  LearningMode,
  LoadoutArchetype,
  LoadoutId,
  MotivationSignal,
  Rating,
  SchedulingAlgorithm,
  SessionId,
  SessionTerminationReason,
  TeachingApproach,
  UserId,
} from '@noema/types';

// ============================================================================
// Session State Enum (service-internal FSM state)
// ============================================================================

export const SessionState = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  EXPIRED: 'expired',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

// ============================================================================
// Session Config (immutable after creation)
// ============================================================================

export interface ISessionConfig {
  maxCards?: number;
  maxDurationMinutes?: number;
  sessionTimeoutHours: number;
  categoryIds?: string[];
  cardTypes?: string[];
}

// ============================================================================
// Session Statistics (mutable — updated on each attempt)
// ============================================================================

export interface ISessionStats {
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
}

export function createEmptyStats(): ISessionStats {
  return {
    totalAttempts: 0,
    correctCount: 0,
    incorrectCount: 0,
    skippedCount: 0,
    averageResponseTimeMs: 0,
    averageConfidence: null,
    averageCalibrationDelta: null,
    retentionRate: 0,
    streakCurrent: 0,
    streakBest: 0,
    totalHintsUsed: 0,
    uniqueCardsReviewed: 0,
    newCardsIntroduced: 0,
    lapsedCards: 0,
    ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
  };
}

// ============================================================================
// Session Entity
// ============================================================================

export interface ISession {
  id: SessionId;
  userId: UserId;
  deckQueryId: DeckQueryLogId;
  state: SessionState;
  learningMode: LearningMode;
  teachingApproach: TeachingApproach;
  schedulingAlgorithm: SchedulingAlgorithm;
  loadoutId: LoadoutId | null;
  loadoutArchetype: LoadoutArchetype | null;
  forceLevel: ForceLevel | null;
  config: ISessionConfig;
  stats: ISessionStats;
  initialQueueSize: number;
  pauseCount: number;
  totalPausedDurationMs: number;
  lastPausedAt: string | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  terminationReason: SessionTerminationReason | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Attempt Context Snapshot
// ============================================================================

export interface IAttemptContext {
  learningMode: LearningMode;
  teachingApproach: TeachingApproach;
  loadoutArchetype?: LoadoutArchetype;
  forceLevel?: ForceLevel;
  cognitiveLoad?: CognitiveLoadLevel;
  fatigueLevel?: FatigueLevel;
  motivationSignal?: MotivationSignal;
  activeInterventionIds: string[];
}

// ============================================================================
// Prior Scheduling State
// ============================================================================

export interface IPriorScheduling {
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
}

// ============================================================================
// Attempt Entity
// ============================================================================

export interface IAttempt {
  id: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  userId: UserId;
  sequenceNumber: number;
  outcome: AttemptOutcome;
  rating: Rating;
  ratingValue: number;
  responseTimeMs: number;
  dwellTimeMs: number;
  timeToFirstInteractionMs: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  wasRevisedBeforeCommit: boolean;
  revisionCount: number;
  hintRequestCount: number;
  hintDepthReached: HintDepth;
  contextSnapshot: IAttemptContext;
  priorSchedulingState: IPriorScheduling | null;
  traceId: string | null;
  diagnosisId: string | null;
  createdAt: string;
}

// ============================================================================
// Session Queue Item
// ============================================================================

export interface ISessionQueueItem {
  id: string;
  sessionId: SessionId;
  cardId: CardId;
  position: number;
  status: CardQueueStatus;
  injectedBy: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

export interface IStartSessionInput {
  deckQueryId: DeckQueryLogId;
  learningMode: LearningMode;
  teachingApproach?: TeachingApproach;
  schedulingAlgorithm?: SchedulingAlgorithm;
  loadoutId?: LoadoutId;
  loadoutArchetype?: LoadoutArchetype;
  config: ISessionConfig;
  initialCardIds: CardId[];
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
  contextSnapshot: IAttemptContext;
  priorSchedulingState?: IPriorScheduling;
}

export interface IRequestHintInput {
  hintDepth: HintDepth;
  hintRequestNumber: number;
  responseTimeMsAtRequest: number;
}

export interface IInjectQueueInput {
  cardId: CardId;
  position: number;
  reason: string;
  injectedBy?: string;
}

export interface IRemoveQueueInput {
  cardId: CardId;
  reason: string;
  removedBy?: string;
}

export interface IUpdateStrategyInput {
  newLoadoutId: LoadoutId;
  newLoadoutArchetype: LoadoutArchetype;
  newForceLevel: ForceLevel;
  trigger: string;
}

export interface IChangeTeachingInput {
  newApproach: TeachingApproach;
  trigger: string;
}

// ============================================================================
// Session Filters (for list queries)
// ============================================================================

export interface ISessionFilters {
  state?: SessionState;
  learningMode?: LearningMode;
}
