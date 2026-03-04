/**
 * @noema/api-client - HLR Sidecar Hooks
 *
 * TanStack Query hooks for the HLR sidecar service.
 * Requires configureHlrClient() to be called during app startup.
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { hlrApi } from './api.js';
import type {
  IHLRHealthResult,
  IHLRPredictionInput,
  IHLRPredictionResult,
  IHLRTrainInput,
  IHLRTrainResult,
  IHLRWeights,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const hlrKeys = {
  all: ['hlr'] as const,
  health: () => [...hlrKeys.all, 'health'] as const,
  predict: (input: IHLRPredictionInput) => [...hlrKeys.all, 'predict', input] as const,
  weights: () => [...hlrKeys.all, 'weights'] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export function useHLRHealth(
  options?: Omit<UseQueryOptions<IHLRHealthResult>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hlrKeys.health(),
    queryFn: hlrApi.health,
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useHLRPredict(
  input: IHLRPredictionInput,
  options?: Omit<UseQueryOptions<IHLRPredictionResult>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hlrKeys.predict(input),
    queryFn: () => hlrApi.predict(input),
    enabled: input.cardId !== '' && input.userId !== '',
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useHLRTrain(options?: UseMutationOptions<IHLRTrainResult, Error, IHLRTrainInput>) {
  return useMutation({
    mutationFn: hlrApi.train,
    ...options,
  });
}

export function useHLRWeights(
  options?: Omit<UseQueryOptions<IHLRWeights>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hlrKeys.weights(),
    queryFn: hlrApi.getWeights,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
