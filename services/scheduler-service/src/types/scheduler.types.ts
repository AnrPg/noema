/**
 * @noema/scheduler-service - Scheduler Domain Types
 */

import type { CardId, CorrelationId, UserId } from '@noema/types';

export type { CardId, CorrelationId, UserId };

export type AdaptiveCheckpointSignal =
  | 'confidence_drift'
  | 'latency_spike'
  | 'error_cascade'
  | 'streak_break'
  | 'manual';

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
}

export interface IDualLanePlan {
  planVersion: 'v1';
  laneMix: ISchedulerLaneMix;
  selectedCardIds: CardId[];
  retentionSelected: number;
  calibrationSelected: number;
  rationale: string;
}

export interface IOfflineIntentTokenInput {
  userId: UserId;
  sessionBlueprint: unknown;
  expiresInSeconds: number;
}

export interface IOfflineIntentTokenClaims {
  tokenVersion: 'v1';
  userId: UserId;
  sessionBlueprint: {
    checkpointSignals?: AdaptiveCheckpointSignal[];
  };
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface IOfflineIntentToken {
  token: string;
  expiresAt: string;
}

export interface IVerifyOfflineIntentTokenInput {
  token: string;
}

export interface IVerifyOfflineIntentTokenResult {
  valid: boolean;
  userId?: UserId;
  expiresAt?: string;
  checkpointSignals?: AdaptiveCheckpointSignal[];
  reason?: string;
}

// ============================================================================
// Database Entity Types
// ============================================================================

export type SchedulerLane = 'retention' | 'calibration';

export type SchedulerCardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended' | 'graduated';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ISchedulerCard {
  id: CardId;
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
