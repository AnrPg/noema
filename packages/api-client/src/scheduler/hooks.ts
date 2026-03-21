/**
 * @noema/api-client - Scheduler Service Hooks
 *
 * TanStack Query hooks for Scheduler Service (all endpoints).
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { CardId } from '@noema/types';

import {
  commitsApi,
  dualLanePlanApi,
  forecastApi,
  proposalsApi,
  retentionApi,
  reviewQueueApi,
  schedulerCardsApi,
  simulationsApi,
} from './api.js';
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
// Query Key Factory
// ============================================================================

export const schedulerKeys = {
  all: ['scheduler'] as const,
  reviewQueue: (params?: ReviewQueueParams) =>
    [...schedulerKeys.all, 'review-queue', params] as const,
  cards: () => [...schedulerKeys.all, 'cards'] as const,
  card: (cardId: CardId) => [...schedulerKeys.cards(), cardId] as const,
  cardList: (params?: SchedulerCardListParams) =>
    [...schedulerKeys.cards(), 'list', params] as const,
  retention: () => [...schedulerKeys.all, 'retention'] as const,
  plan: (input?: DualLanePlanInput) => [...schedulerKeys.all, 'dual-lane-plan', input] as const,
  reviewWindows: (input?: ReviewWindowInput) =>
    [...schedulerKeys.all, 'review-windows', input] as const,
  candidates: (input?: SessionCandidatesInput) =>
    [...schedulerKeys.all, 'session-candidates', input] as const,
  forecast: (input?: ForecastInput) => [...schedulerKeys.all, 'forecast', input] as const,
};

// ============================================================================
// Existing Hooks (migrated from hooks/scheduler.ts)
// ============================================================================

export function useReviewQueue(
  params?: ReviewQueueParams,
  options?: Omit<UseQueryOptions<ReviewQueueResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.reviewQueue(params),
    queryFn: () => reviewQueueApi.getReviewQueue(params),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function usePredictRetention(
  options?: UseMutationOptions<RetentionPredictionResponse, Error, PredictRetentionInput>
) {
  return useMutation({
    mutationFn: retentionApi.predictRetention,
    ...options,
  });
}

export function useSchedulerCard(
  cardId: CardId,
  options?: Omit<UseQueryOptions<SchedulerCardResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.card(cardId),
    queryFn: () => schedulerCardsApi.getCard(cardId),
    enabled: cardId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useSchedulerCards(
  params: SchedulerCardListParams,
  options?: Omit<UseQueryOptions<SchedulerCardListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.cardList(params),
    queryFn: () => schedulerCardsApi.listCards(params),
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// Phase 02 — New Hooks
// ============================================================================

export function useDualLanePlan(
  input: DualLanePlanInput,
  options?: Omit<UseQueryOptions<DualLanePlanResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.plan(input),
    queryFn: () => dualLanePlanApi.getPlan(input),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useReviewWindows(
  input: ReviewWindowInput,
  options?: Omit<UseQueryOptions<ReviewWindowsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.reviewWindows(input),
    queryFn: () => proposalsApi.getReviewWindows(input),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useSessionCandidates(
  input: SessionCandidatesInput,
  options?: Omit<UseQueryOptions<SessionCandidatesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.candidates(input),
    queryFn: () => proposalsApi.getSessionCandidates(input),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useForecast(
  input: ForecastInput,
  options?: Omit<UseQueryOptions<ForecastResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.forecast(input),
    queryFn: () => forecastApi.getForecast(input),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useSimulateSession(
  options?: UseMutationOptions<SimulationResponse, Error, SimulationInput>
) {
  return useMutation({
    mutationFn: simulationsApi.simulateSession,
    ...options,
  });
}

export function useCommitSchedule(
  options?: UseMutationOptions<
    ScheduleCommitResponse,
    Error,
    { cardId: CardId; data: ScheduleCommitInput }
  >
) {
  return useMutation({
    mutationFn: ({ cardId, data }) => commitsApi.commitSchedule(cardId, data),
    ...options,
  });
}

export function useBatchCommitSchedule(
  options?: UseMutationOptions<BatchScheduleCommitResponse, Error, BatchScheduleCommitInput>
) {
  return useMutation({
    mutationFn: commitsApi.batchCommitSchedule,
    ...options,
  });
}
