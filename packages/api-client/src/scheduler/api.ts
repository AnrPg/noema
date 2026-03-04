/**
 * @noema/api-client - Scheduler Service API
 *
 * API methods for Scheduler Service endpoints.
 */

import { http } from '../client.js';
import type {
  PredictRetentionInput,
  RetentionPredictionResponse,
  ReviewQueueParams,
  ReviewQueueResponse,
  SchedulerCardListParams,
  SchedulerCardListResponse,
  SchedulerCardResponse,
} from './types.js';

// ============================================================================
// Review Queue API (H5)
// ============================================================================

export const reviewQueueApi = {
  /**
   * Get cards due for review.
   */
  getReviewQueue: (params?: ReviewQueueParams): Promise<ReviewQueueResponse> =>
    http.get('/v1/scheduler/review-queue', { params: params as Record<string, string> }),
};

// ============================================================================
// Retention Prediction API (H6)
// ============================================================================

export const retentionApi = {
  /**
   * Predict retention probability for a set of cards.
   */
  predictRetention: (input: PredictRetentionInput): Promise<RetentionPredictionResponse> =>
    http.post('/v1/scheduler/retention/predict', input),
};

// ============================================================================
// Scheduler Cards API
// ============================================================================

export const schedulerCardsApi = {
  /**
   * Get a single scheduler card by ID.
   */
  getCard: (cardId: string): Promise<SchedulerCardResponse> =>
    http.get(`/v1/scheduler/cards/${cardId}`),

  /**
   * List scheduler cards with filters and pagination.
   */
  listCards: (params: SchedulerCardListParams): Promise<SchedulerCardListResponse> =>
    http.get('/v1/scheduler/cards', { params: params as unknown as Record<string, string> }),
};
