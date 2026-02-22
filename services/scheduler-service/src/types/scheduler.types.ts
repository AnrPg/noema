/**
 * @noema/scheduler-service - Scheduler Domain Types
 */

export type UserId = string;
export type CorrelationId = string;
export type CardId = string;

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
