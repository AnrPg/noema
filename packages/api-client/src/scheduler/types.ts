/**
 * @noema/api-client - Scheduler Service Types
 *
 * TypeScript types for Scheduler Service API endpoints.
 */

// ============================================================================
// Common
// ============================================================================

export interface ISchedulerPolicyVersion {
  version: string;
}

// ============================================================================
// Review Queue (H5)
// ============================================================================

export interface IReviewQueueParams {
  lane?: 'retention' | 'calibration';
  limit?: number;
  asOf?: string;
}

export interface IReviewQueueCard {
  cardId: string;
  userId: string;
  lane: 'retention' | 'calibration';
  schedulingAlgorithm: 'fsrs' | 'hlr' | 'sm2';
  stability: number | null;
  difficulty: number | null;
  nextReviewDate: string | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  state: string;
}

export interface IReviewQueueResponse {
  cards: IReviewQueueCard[];
  totalDue: number;
  retentionDue: number;
  calibrationDue: number;
  asOf: string;
  policyVersion: ISchedulerPolicyVersion;
}

// ============================================================================
// Retention Prediction (H6)
// ============================================================================

export interface IRetentionPredictionRequest {
  cardId: string;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  asOf?: string;
}

export interface IPredictRetentionInput {
  userId: string;
  cards: IRetentionPredictionRequest[];
}

export interface IRetentionPrediction {
  cardId: string;
  algorithm: string;
  retentionProbability: number;
  daysUntilDue: number;
  nextReviewAt: string;
  confidence: number;
}

export interface IRetentionPredictionResponse {
  predictions: IRetentionPrediction[];
  generatedAt: string;
  policyVersion: ISchedulerPolicyVersion;
}

// ============================================================================
// Scheduler Card
// ============================================================================

export interface ISchedulerCardResponse {
  card: IReviewQueueCard;
}

export interface ISchedulerCardListParams {
  userId: string;
  lane?: string;
  state?: string;
  algorithm?: string;
  dueBefore?: string;
  dueAfter?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ISchedulerCardListResponse {
  data: IReviewQueueCard[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Backward-compat aliases
// ============================================================================

export type SchedulerPolicyVersion = ISchedulerPolicyVersion;
export type ReviewQueueParams = IReviewQueueParams;
export type ReviewQueueCard = IReviewQueueCard;
export type ReviewQueueResponse = IReviewQueueResponse;
export type RetentionPredictionRequest = IRetentionPredictionRequest;
export type PredictRetentionInput = IPredictRetentionInput;
export type RetentionPrediction = IRetentionPrediction;
export type RetentionPredictionResponse = IRetentionPredictionResponse;
export type SchedulerCardResponse = ISchedulerCardResponse;
export type SchedulerCardListParams = ISchedulerCardListParams;
export type SchedulerCardListResponse = ISchedulerCardListResponse;
