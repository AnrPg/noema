/**
 * @noema/api-client - Session Service Types
 *
 * DTOs for Session Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type { AttemptId, CardId, SessionId, UserId } from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type SessionState = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

export type SessionMode = 'standard' | 'cram' | 'preview' | 'test';

// ============================================================================
// Session DTO
// ============================================================================

export interface ISessionDto {
  id: SessionId;
  userId: UserId;
  state: SessionState;
  mode: SessionMode;
  cardIds: CardId[];
  currentCardIndex: number;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
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

export interface IAttemptInput {
  cardId: CardId;
  grade: number;
  /** Confidence before seeing the answer (0–1) */
  confidenceBefore?: number;
  /** Confidence after seeing the answer (0–1) */
  confidenceAfter?: number;
  /** Signed delta: confidenceAfter − confidenceBefore */
  calibrationDelta?: number;
  /** How many hint tiers were consumed (0 = none) */
  hintDepthUsed?: number;
  /** Time the card was displayed, in milliseconds */
  dwellTimeMs?: number;
  /** User explicitly flagged this as a guess */
  selfReportedGuess?: boolean;
}

// ============================================================================
// Session Queue
// ============================================================================

export interface ISessionQueueItem {
  cardId: CardId;
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
  hint: string;
  depth: number;
  remainingHints: number;
}

// ============================================================================
// Checkpoints
// ============================================================================

export interface ICheckpointDirectiveDto {
  action: 'continue' | 'pause' | 'complete' | 'switch_mode';
  reason: string;
  suggestedMode?: SessionMode;
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
  attempts: IAttemptInput[];
}

// ============================================================================
// Create Inputs
// ============================================================================

export interface IStartSessionInput {
  cardIds?: CardId[];
  mode?: SessionMode;
  blueprintId?: string;
}

export interface ISessionFilters {
  state?: SessionState;
  mode?: SessionMode;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Backward-compat aliases
// ============================================================================

export type SessionDto = ISessionDto;
export type AttemptDto = IAttemptDto;
export type AttemptInput = IAttemptInput;
export type SessionQueueItem = ISessionQueueItem;
export type SessionQueueDto = ISessionQueueDto;
export type HintResponseDto = IHintResponseDto;
export type CheckpointDirectiveDto = ICheckpointDirectiveDto;
export type CohortHandshakeDto = ICohortHandshakeDto;
export type UpdateStrategyInput = IUpdateStrategyInput;
export type UpdateTeachingInput = IUpdateTeachingInput;
export type BlueprintValidationResult = IBlueprintValidationResult;
export type OfflineIntentTokenDto = IOfflineIntentTokenDto;
export type OfflineIntentVerifyInput = IOfflineIntentVerifyInput;
export type StartSessionInput = IStartSessionInput;
export type SessionFilters = ISessionFilters;

// ============================================================================
// Response aliases
// ============================================================================

export type SessionResponse = IApiResponse<ISessionDto>;
export type SessionsListResponse = IApiResponse<ISessionDto[]>;
export type AttemptResponse = IApiResponse<IAttemptDto>;
export type AttemptsListResponse = IApiResponse<IAttemptDto[]>;
export type SessionQueueResponse = IApiResponse<ISessionQueueDto>;
export type HintResponse = IApiResponse<IHintResponseDto>;
export type CheckpointResponse = IApiResponse<ICheckpointDirectiveDto>;
export type CohortResponse = IApiResponse<ICohortHandshakeDto>;
export type BlueprintValidationResponse = IApiResponse<IBlueprintValidationResult>;
export type OfflineTokenResponse = IApiResponse<IOfflineIntentTokenDto>;
