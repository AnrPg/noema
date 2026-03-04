/**
 * @noema/api-client - Scheduler TanStack Query Hooks
 *
 * React Query hooks for Scheduler Service API.
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { retentionApi, reviewQueueApi, schedulerCardsApi } from '../scheduler/api.js';
import type {
  PredictRetentionInput,
  RetentionPredictionResponse,
  ReviewQueueParams,
  ReviewQueueResponse,
  SchedulerCardListParams,
  SchedulerCardListResponse,
  SchedulerCardResponse,
} from '../scheduler/types.js';

// ============================================================================
// Query Keys
// ============================================================================

export const schedulerKeys = {
  all: ['scheduler'] as const,
  reviewQueue: (params?: ReviewQueueParams) =>
    [...schedulerKeys.all, 'review-queue', params] as const,
  cards: () => [...schedulerKeys.all, 'cards'] as const,
  card: (cardId: string) => [...schedulerKeys.cards(), cardId] as const,
  cardList: (params?: SchedulerCardListParams) =>
    [...schedulerKeys.cards(), 'list', params] as const,
  retention: () => [...schedulerKeys.all, 'retention'] as const,
};

// ============================================================================
// Review Queue Hooks (H5)
// ============================================================================

/**
 * Fetch due-card review queue.
 */
export function useReviewQueue(
  params?: ReviewQueueParams,
  options?: Omit<UseQueryOptions<ReviewQueueResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.reviewQueue(params),
    queryFn: () => reviewQueueApi.getReviewQueue(params),
    ...options,
  });
}

// ============================================================================
// Retention Prediction Hooks (H6)
// ============================================================================

/**
 * Predict retention for a set of cards (mutation — accepts body).
 */
export function usePredictRetention(
  options?: UseMutationOptions<RetentionPredictionResponse, Error, PredictRetentionInput>
) {
  return useMutation({
    mutationFn: retentionApi.predictRetention,
    ...options,
  });
}

// ============================================================================
// Scheduler Card Hooks
// ============================================================================

/**
 * Fetch a single scheduler card.
 */
export function useSchedulerCard(
  cardId: string,
  options?: Omit<UseQueryOptions<SchedulerCardResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.card(cardId),
    queryFn: () => schedulerCardsApi.getCard(cardId),
    enabled: !!cardId,
    ...options,
  });
}

/**
 * List scheduler cards with filters.
 */
export function useSchedulerCards(
  params: SchedulerCardListParams,
  options?: Omit<UseQueryOptions<SchedulerCardListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.cardList(params),
    queryFn: () => schedulerCardsApi.listCards(params),
    ...options,
  });
}
