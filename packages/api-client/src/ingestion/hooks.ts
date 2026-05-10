import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { ingestionApi } from './api.js';
import type { IngestionDocumentsResponse } from './types.js';

export const ingestionKeys = {
  all: ['ingestion'] as const,
  documents: () => [...ingestionKeys.all, 'documents'] as const,
};

export function useIngestionDocuments(
  options?: Omit<UseQueryOptions<IngestionDocumentsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ingestionKeys.documents(),
    queryFn: ingestionApi.listDocuments,
    staleTime: 30 * 1000,
    ...options,
  });
}
