/**
 * @noema/api-client - Scheduler Service API
 *
 * API methods for Scheduler Service endpoints.
 */

import type { CardId } from '@noema/types';

import { http } from '../client.js';
import type {
  BatchScheduleCommitInput,
  BatchScheduleCommitResponse,
  DualLanePlanInput,
  DualLanePlanResponse,
  ForecastInput,
  ForecastResponse,
  PredictRetentionInput,
  RetentionPredictionResponse,
  ReviewQueueParams,
  ReviewQueueResponse,
  ReviewWindowInput,
  ReviewWindowsResponse,
  ScheduleCommitInput,
  ScheduleCommitResponse,
  SchedulerCardListParams,
  SchedulerCardListResponse,
  SchedulerCardResponse,
  SessionCandidatesInput,
  SessionCandidatesResponse,
  SimulationInput,
  SimulationResponse,
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
  getCard: (cardId: CardId): Promise<SchedulerCardResponse> =>
    http.get(`/v1/scheduler/cards/${cardId}`),

  /**
   * List scheduler cards with filters and pagination.
   */
  listCards: (params: SchedulerCardListParams): Promise<SchedulerCardListResponse> =>
    http.get('/v1/scheduler/cards', { params: params as unknown as Record<string, string> }),
};

// ============================================================================
// Phase 02 — Dual-Lane Plan API
// ============================================================================

export const dualLanePlanApi = {
  /** Generate a dual-lane review plan. */
  getPlan: (input: DualLanePlanInput): Promise<DualLanePlanResponse> =>
    http.post('/v1/scheduler/dual-lane/plan', input),
};

// ============================================================================
// Phase 02 — Proposals API
// ============================================================================

export const proposalsApi = {
  /** Get optimal review windows for a user. */
  getReviewWindows: (input: ReviewWindowInput): Promise<ReviewWindowsResponse> =>
    http.post('/v1/scheduler/proposals/review-windows', input),

  /** Get card candidates for a potential session. */
  getSessionCandidates: (input: SessionCandidatesInput): Promise<SessionCandidatesResponse> =>
    http.post('/v1/scheduler/proposals/session-candidates', input),
};

// ============================================================================
// Phase 02 — Simulations API
// ============================================================================

export const simulationsApi = {
  /** Run a "what-if" scheduling simulation. */
  simulateSession: (input: SimulationInput): Promise<SimulationResponse> =>
    http.post('/v1/scheduler/simulations/session-candidates', input),
};

export const forecastApi = {
  /** Generate a multi-day review forecast. */
  getForecast: (input: ForecastInput): Promise<ForecastResponse> =>
    http.post('/v1/scheduler/forecast', input),
};

// ============================================================================
// Phase 02 — Commits API
// ============================================================================

export const commitsApi = {
  /** Commit a single card's schedule after review. */
  commitSchedule: (cardId: CardId, data: ScheduleCommitInput): Promise<ScheduleCommitResponse> =>
    http.post(`/v1/scheduler/commits/cards/${cardId}/schedule`, data),

  /** Batch commit schedules for multiple cards. */
  batchCommitSchedule: (data: BatchScheduleCommitInput): Promise<BatchScheduleCommitResponse> =>
    http.post('/v1/scheduler/commits/cards/schedule/batch', data),
};
