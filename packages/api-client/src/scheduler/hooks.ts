/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { ConceptId } from '@noema/types';

import { schedulerApi } from './api.js';
import type {
  ConceptScheduleQuery,
  ConceptScheduleResponse,
  DueConceptsQuery,
  DueConceptsResponse,
  TransformationHistoryQuery,
  TransformationHistoryResponse,
} from './types.js';

export const schedulerKeys = {
  all: ['scheduler'] as const,
  dueConcepts: (query?: DueConceptsQuery) => [...schedulerKeys.all, 'due-concepts', query] as const,
  conceptSchedule: (conceptId: ConceptId, query?: ConceptScheduleQuery) =>
    [...schedulerKeys.all, 'concept-schedule', conceptId, query] as const,
  transformationHistory: (conceptId: ConceptId, query?: TransformationHistoryQuery) =>
    [...schedulerKeys.all, 'transformation-history', conceptId, query] as const,
};

export function useDueConcepts(
  query?: DueConceptsQuery,
  options?: Omit<UseQueryOptions<DueConceptsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.dueConcepts(query),
    queryFn: () => schedulerApi.getDueConcepts(query),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useConceptSchedule(
  conceptId: ConceptId,
  query?: ConceptScheduleQuery,
  options?: Omit<UseQueryOptions<ConceptScheduleResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.conceptSchedule(conceptId, query),
    queryFn: () => schedulerApi.getConceptSchedule(conceptId, query),
    enabled: conceptId !== '',
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useTransformationHistory(
  conceptId: ConceptId,
  query?: TransformationHistoryQuery,
  options?: Omit<UseQueryOptions<TransformationHistoryResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: schedulerKeys.transformationHistory(conceptId, query),
    queryFn: () => schedulerApi.getTransformationHistory(conceptId, query),
    enabled: conceptId !== '',
    staleTime: 60 * 1000,
    ...options,
  });
}
