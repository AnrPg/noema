/**
 * @noema/api-client - Content Service Hooks
 *
 * TanStack Query hooks for Content Service.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { CardId, JobId, MediaId, TemplateId } from '@noema/types';

import { cardsApi, mediaApi, templatesApi } from './api.js';
import type {
  BatchCreateResponse,
  BatchSummariesResponse,
  CardCountResponse,
  ICardDto,
  CardHistoryResponse,
  CardResponse,
  CardStatsResponse,
  CardValidationResponse,
  CardVersionResponse,
  CardsListResponse,
  CardsCursorResponse,
  CreateTemplateInput,
  IBatchCreateInput,
  IBatchStateUpdateInput,
  ICardHistoryDto,
  ICardStatsDto,
  ICreateCardInput,
  IDeckQueryInput,
  ISessionSeedDto,
  ISessionSeedQuery,
  IUpdateCardInput,
  IUpdateCardNodeLinksInput,
  IUpdateCardStateInput,
  IUpdateCardTagsInput,
  IUpdateTemplateInput,
  MediaResponse,
  SessionSeedResponse,
  TemplateDto,
  TemplateResponse,
  TemplatesListResponse,
  UploadUrlResponse,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const contentKeys = {
  all: ['content'] as const,
  cards: () => [...contentKeys.all, 'cards'] as const,
  list: (query?: IDeckQueryInput) => [...contentKeys.cards(), 'list', query] as const,
  cursor: (query?: Omit<IDeckQueryInput, 'cursor'>) =>
    [...contentKeys.cards(), 'cursor', query] as const,
  detail: (id: CardId) => [...contentKeys.cards(), 'detail', id] as const,
  stats: () => [...contentKeys.cards(), 'stats'] as const,
  history: (id: CardId) => [...contentKeys.cards(), 'history', id] as const,
  batch: (batchId?: string) => [...contentKeys.cards(), 'batch', batchId] as const,
  batchCards: (batchId?: string) => [...contentKeys.cards(), 'batchCards', batchId] as const,
  counts: (query?: IDeckQueryInput) => [...contentKeys.cards(), 'count', query ?? null] as const,
  recentBatches: () => [...contentKeys.cards(), 'recentBatches'] as const,
  templates: () => [...contentKeys.all, 'templates'] as const,
  template: (id: TemplateId) => [...contentKeys.templates(), id] as const,
  media: (id: MediaId) => [...contentKeys.all, 'media', id] as const,
};

// ============================================================================
// Card Query Hooks
// ============================================================================

export function useCards(
  query: IDeckQueryInput,
  options?: Omit<UseQueryOptions<CardsListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.list(query),
    queryFn: () => cardsApi.queryCards(query),
    ...options,
  });
}

export function useCardsCursor(
  query: Omit<IDeckQueryInput, 'cursor'>,
  options?: Omit<
    UseInfiniteQueryOptions<
      CardsCursorResponse,
      Error,
      InfiniteData<CardsCursorResponse>,
      QueryKey,
      string | null
    >,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  return useInfiniteQuery({
    queryKey: contentKeys.cursor(query),
    queryFn: ({ pageParam }) => {
      const cursorQuery: IDeckQueryInput =
        pageParam !== null ? { ...query, cursor: pageParam } : query;
      return cardsApi.getCardsCursor(cursorQuery);
    },
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    initialPageParam: null,
    ...options,
  });
}

export function useCard(
  id: CardId,
  options?: Omit<UseQueryOptions<CardResponse, Error, ICardDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.detail(id),
    queryFn: () => cardsApi.getCard(id),
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
    enabled: id !== '',
    ...options,
  });
}

export function useCardStats(
  options?: Omit<UseQueryOptions<CardStatsResponse, Error, ICardStatsDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.stats(),
    queryFn: cardsApi.getCardStats,
    select: (response) => response.data,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useCardHistory(
  id: CardId,
  options?: Omit<
    UseQueryOptions<CardHistoryResponse, Error, ICardHistoryDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: contentKeys.history(id),
    queryFn: () => cardsApi.getCardHistory(id),
    select: (response) => response.data,
    enabled: id !== '',
    ...options,
  });
}

export function useCardVersion(
  id: CardId,
  version: number,
  options?: Omit<UseQueryOptions<CardVersionResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...contentKeys.history(id), version] as const,
    queryFn: () => cardsApi.getCardVersion(id, version),
    enabled: id !== '' && version > 0,
    ...options,
  });
}

export function useSessionSeed(
  query: ISessionSeedQuery,
  options?: Omit<
    UseQueryOptions<SessionSeedResponse, Error, ISessionSeedDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...contentKeys.cards(), 'session-seed', query] as const,
    queryFn: () => cardsApi.getSessionSeed(query),
    select: (response) => response.data,
    ...options,
  });
}

export function useCardCount(
  query: IDeckQueryInput,
  options?: Omit<UseQueryOptions<CardCountResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.counts(query),
    queryFn: () => cardsApi.countCards(query),
    ...options,
  });
}

export function useBatch(
  batchId: JobId,
  options?: Omit<UseQueryOptions<BatchCreateResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.batch(batchId),
    queryFn: () => cardsApi.getBatch(batchId),
    enabled: batchId !== '',
    ...options,
  });
}

export function useRecentBatches(
  limit?: number,
  options?: Omit<UseQueryOptions<BatchSummariesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.recentBatches(),
    queryFn: () => cardsApi.findRecentBatches(limit),
    ...options,
  });
}

// ============================================================================
// Card Mutation Hooks
// ============================================================================

export function useCreateCard(options?: UseMutationOptions<CardResponse, Error, ICreateCardInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.createCard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    ...options,
  });
}

export function useBatchCreateCards(
  options?: UseMutationOptions<BatchCreateResponse, Error, IBatchCreateInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.batchCreateCards,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    ...options,
  });
}

export function useUpdateCard(
  options?: UseMutationOptions<CardResponse, Error, { id: CardId; data: IUpdateCardInput }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cardsApi.updateCard(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: contentKeys.list() });
    },
    ...options,
  });
}

export function useDeleteCard(options?: UseMutationOptions<void, Error, CardId>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.deleteCard,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: contentKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.list() });
    },
    ...options,
  });
}

export function useCardStateTransition(
  options?: UseMutationOptions<CardResponse, Error, { id: CardId; data: IUpdateCardStateInput }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cardsApi.updateCardState(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: contentKeys.list() });
    },
    ...options,
  });
}

export function useUpdateCardTags(
  options?: UseMutationOptions<CardResponse, Error, { id: CardId; data: IUpdateCardTagsInput }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cardsApi.updateCardTags(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.detail(id), response);
    },
    ...options,
  });
}

export function useUpdateCardNodeLinks(
  options?: UseMutationOptions<CardResponse, Error, { id: CardId; data: IUpdateCardNodeLinksInput }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cardsApi.updateCardNodeLinks(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.detail(id), response);
    },
    ...options,
  });
}

export function useValidateCardContent(
  options?: UseMutationOptions<CardValidationResponse, Error, ICreateCardInput>
) {
  return useMutation({
    mutationFn: cardsApi.validateCard,
    ...options,
  });
}

export function useRollbackBatch(options?: UseMutationOptions<void, Error, { batchId: string }>) {
  return useMutation({
    mutationFn: ({ batchId }) => cardsApi.deleteBatch(batchId as JobId),
    ...options,
  });
}

export function useBatchCardStateTransition(
  options?: UseMutationOptions<void, Error, IBatchStateUpdateInput>
) {
  return useMutation({
    mutationFn: (data) => cardsApi.batchUpdateState(data),
    ...options,
  });
}

// ============================================================================
// Template Hooks
// ============================================================================

export function useTemplates(
  options?: Omit<
    UseQueryOptions<TemplatesListResponse, Error, TemplateDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: contentKeys.templates(),
    queryFn: templatesApi.listTemplates,
    select: (response) => response.data,
    ...options,
  });
}

export function useTemplate(
  id: TemplateId,
  options?: Omit<UseQueryOptions<TemplateResponse, Error, TemplateDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.template(id),
    queryFn: () => templatesApi.getTemplate(id),
    select: (response) => response.data,
    enabled: id !== '',
    ...options,
  });
}

export function useCreateTemplate(
  options?: UseMutationOptions<TemplateResponse, Error, CreateTemplateInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: templatesApi.createTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.templates() });
    },
    ...options,
  });
}

export function useUpdateTemplate(
  options?: UseMutationOptions<
    TemplateResponse,
    Error,
    { id: TemplateId; data: IUpdateTemplateInput }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => templatesApi.updateTemplate(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.template(id), response);
      void queryClient.invalidateQueries({ queryKey: contentKeys.templates() });
    },
    ...options,
  });
}

export function useDeleteTemplate(options?: UseMutationOptions<void, Error, TemplateId>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: templatesApi.deleteTemplate,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: contentKeys.template(id) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.templates() });
    },
    ...options,
  });
}

// ============================================================================
// Media Hooks
// ============================================================================

export function useRequestUploadUrl(
  options?: UseMutationOptions<UploadUrlResponse, Error, { filename: string; mimeType: string }>
) {
  return useMutation({
    mutationFn: ({ filename, mimeType }) => mediaApi.requestUploadUrl(filename, mimeType),
    ...options,
  });
}

export function useConfirmUpload(options?: UseMutationOptions<MediaResponse, Error, MediaId>) {
  return useMutation({
    mutationFn: mediaApi.confirmUpload,
    ...options,
  });
}

export function useMedia(
  id: MediaId,
  options?: Omit<UseQueryOptions<MediaResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.media(id),
    queryFn: () => mediaApi.getMedia(id),
    enabled: id !== '',
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}
