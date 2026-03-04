/**
 * @noema/api-client - Scheduler Service Types
 *
 * TypeScript types for Scheduler Service API endpoints.
 */

// ============================================================================
// Common
// ============================================================================

export interface SchedulerPolicyVersion {
  version: string;
}

// ============================================================================
// Review Queue (H5)
// ============================================================================

export interface ReviewQueueParams {
  lane?: 'retention' | 'calibration';
  limit?: number;
  asOf?: string;
}

export interface ReviewQueueCard {
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

export interface ReviewQueueResponse {
  cards: ReviewQueueCard[];
  totalDue: number;
  retentionDue: number;
  calibrationDue: number;
  asOf: string;
  policyVersion: SchedulerPolicyVersion;
}

// ============================================================================
// Retention Prediction (H6)
// ============================================================================

export interface RetentionPredictionRequest {
  cardId: string;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  asOf?: string;
}

export interface PredictRetentionInput {
  userId: string;
  cards: RetentionPredictionRequest[];
}

export interface RetentionPrediction {
  cardId: string;
  algorithm: string;
  retentionProbability: number;
  daysUntilDue: number;
  nextReviewAt: string;
  confidence: number;
}

export interface RetentionPredictionResponse {
  predictions: RetentionPrediction[];
  generatedAt: string;
  policyVersion: SchedulerPolicyVersion;
}

// ============================================================================
// Scheduler Card
// ============================================================================

export interface SchedulerCardResponse {
  card: ReviewQueueCard;
}

export interface SchedulerCardListParams {
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

export interface SchedulerCardListResponse {
  data: ReviewQueueCard[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
