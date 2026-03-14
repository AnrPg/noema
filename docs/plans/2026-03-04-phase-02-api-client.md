# Phase 02 (Axon) — API Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add Content, Session, Knowledge Graph, and HLR service modules to `@noema/api-client`, enhance the Scheduler module, and wire all sub-path exports.

**Architecture:** Each module follows the 4-file pattern (types → api → hooks → index). Hooks live in `<module>/hooks.ts` (co-located, not in the central `hooks/` dir). Every response is wrapped in `IApiResponse<T>` from `@noema/contracts`. The HLR sidecar runs on a different port, so the HTTP client gains an optional `baseUrl` override in `RequestConfig`.

**Tech Stack:** TypeScript 5 strict, `@tanstack/react-query` v5, `@noema/contracts` (`IApiResponse`), `@noema/types` (branded IDs).

**Key files to read before starting:**
- `packages/api-client/src/client.ts` — HTTP client
- `packages/api-client/src/user/types.ts` — type pattern (use `IApiResponse<T>` wrappers)
- `packages/api-client/src/hooks/index.ts` — existing hook pattern
- `packages/api-client/src/hooks/scheduler.ts` — existing scheduler hooks (will migrate)
- `packages/api-client/src/scheduler/api.ts` — existing scheduler api (will extend)

**No unit tests required** — acceptance criteria is `pnpm --filter @noema/api-client build` and `pnpm --filter @noema/api-client typecheck` passing clean. The hooks are React-dependent and require complex query-client mocking; verified via typecheck instead.

**Lint:** After each task run `pnpm --filter @noema/api-client lint` and fix any warnings before committing.

---

## Task 0: Add `baseUrl` override to HTTP client

**Files:**
- Modify: `packages/api-client/src/client.ts`

**Why:** The HLR sidecar runs on a different port. Adding an optional `baseUrl` to `RequestConfig` lets HLR API calls override the global base URL without a second client instance.

**Step 1: Edit `RequestConfig` interface** — add the `baseUrl` field after `timeout`:

```typescript
export interface RequestConfig extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  baseUrl?: string; // Override global base URL (e.g. for HLR sidecar)
}
```

**Step 2: Edit `buildUrl`** — accept and use the override:

Replace the existing `buildUrl` signature and first two lines:

```typescript
function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  overrideBaseUrl?: string,
): string {
  const config = getApiConfig();
  const base = (overrideBaseUrl ?? config.baseUrl).replace(/\/+$/, '');
```

**Step 3: Edit `request`** — extract `baseUrl` from config and pass it through:

```typescript
export async function request<T>(
  method: string,
  path: string,
  config: RequestConfig = {}
): Promise<T> {
  const apiConfig = getApiConfig();
  const { body, params, timeout = 30000, baseUrl: overrideBaseUrl, ...init } = config;

  const url = buildUrl(path, params, overrideBaseUrl);
  // rest unchanged
```

**Step 4: Typecheck**

```bash
pnpm --filter @noema/api-client typecheck
```
Expected: no errors.

**Step 5: Commit**

```bash
git add packages/api-client/src/client.ts
git commit -m "feat(api-client): add baseUrl override to RequestConfig for multi-service support"
```

---

## Task 1: Content Service — Types

**Files:**
- Create: `packages/api-client/src/content/types.ts`

**Step 1: Create the file**

```typescript
/**
 * @noema/api-client - Content Service Types
 *
 * DTOs for Content Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type {
  CardId,
  CategoryId,
  MediaId,
  NodeId,
  TemplateId,
  UserId,
} from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type CardType =
  | 'basic'
  | 'cloze'
  | 'short_answer'
  | 'multiple_choice'
  | 'true_false';

export type CardState = 'draft' | 'active' | 'archived' | 'deleted';

export type CardLearningState =
  | 'new'
  | 'learning'
  | 'review'
  | 'relearning'
  | 'suspended';

// ============================================================================
// Card Content (polymorphic by CardType)
// ============================================================================

export interface BasicCardContent {
  front: string;
  back: string;
}

export interface ClozeCardContent {
  text: string;
  /** Cloze deletions — substrings of `text` that should be hidden */
  cloze: string[];
}

export interface ShortAnswerCardContent {
  question: string;
  answer: string;
  acceptedAnswers?: string[];
}

export interface MultipleChoiceCardContent {
  question: string;
  choices: string[];
  correctIndex: number;
}

export interface TrueFalseCardContent {
  statement: string;
  isTrue: boolean;
}

export type CardContentDto =
  | { type: 'basic'; content: BasicCardContent }
  | { type: 'cloze'; content: ClozeCardContent }
  | { type: 'short_answer'; content: ShortAnswerCardContent }
  | { type: 'multiple_choice'; content: MultipleChoiceCardContent }
  | { type: 'true_false'; content: TrueFalseCardContent };

// ============================================================================
// Card DTO
// ============================================================================

export interface CardDto {
  id: CardId;
  userId: UserId;
  type: CardType;
  state: CardState;
  learningState: CardLearningState;
  content: CardContentDto;
  tags: string[];
  categoryId: CategoryId | null;
  templateId: TemplateId | null;
  nodeLinks: NodeId[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ============================================================================
// Deck Query
// ============================================================================

export interface DeckQueryInput {
  tags?: string[];
  categoryIds?: CategoryId[];
  nodeIds?: NodeId[];
  learningStates?: CardLearningState[];
  types?: CardType[];
  states?: CardState[];
  cursor?: string;
  limit?: number;
}

// ============================================================================
// Stats
// ============================================================================

export interface CardStatsDto {
  total: number;
  byState: Record<CardState, number>;
  byLearningState: Record<CardLearningState, number>;
  byType: Record<CardType, number>;
}

// ============================================================================
// History
// ============================================================================

export interface CardVersionSnapshot {
  version: number;
  content: CardContentDto;
  changedAt: string;
  changedBy: UserId;
}

export interface CardHistoryDto {
  cardId: CardId;
  snapshots: CardVersionSnapshot[];
}

// ============================================================================
// Templates
// ============================================================================

export interface TemplateDto {
  id: TemplateId;
  name: string;
  type: CardType;
  structure: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  type: CardType;
  structure: Record<string, unknown>;
}

export interface UpdateTemplateInput {
  name?: string;
  structure?: Record<string, unknown>;
}

// ============================================================================
// Media
// ============================================================================

export interface MediaFileDto {
  id: MediaId;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface UploadUrlResult {
  uploadUrl: string;
  mediaId: MediaId;
}

// ============================================================================
// Batch Operations
// ============================================================================

export interface BatchCreateInput {
  cards: CreateCardInput[];
}

export interface BatchCreateError {
  index: number;
  error: string;
}

export interface BatchCreateResult {
  batchId: string;
  created: number;
  failed: number;
  errors: BatchCreateError[];
}

// ============================================================================
// Cursor Pagination
// ============================================================================

export interface CardsCursorResult {
  cards: CardDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CardCountResult {
  count: number;
}

// ============================================================================
// Session Seed
// ============================================================================

export interface SessionSeedQuery {
  deckQuery: DeckQueryInput;
  limit?: number;
}

export interface SessionSeedDto {
  cardIds: CardId[];
  totalAvailable: number;
}

// ============================================================================
// Validation
// ============================================================================

export interface CardValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Create / Update Inputs
// ============================================================================

export interface CreateCardInput {
  type: CardType;
  content: CardContentDto;
  tags?: string[];
  categoryId?: CategoryId;
  templateId?: TemplateId;
  nodeLinks?: NodeId[];
}

export interface UpdateCardInput {
  content?: CardContentDto;
  tags?: string[];
  categoryId?: CategoryId | null;
  nodeLinks?: NodeId[];
}

export interface UpdateCardStateInput {
  state: CardState;
}

export interface BatchStateUpdateInput {
  cardIds: CardId[];
  state: CardState;
}

export interface UpdateCardTagsInput {
  tags: string[];
}

export interface UpdateCardNodeLinksInput {
  nodeLinks: NodeId[];
}

// ============================================================================
// Response aliases
// ============================================================================

export type CardResponse = IApiResponse<CardDto>;
export type CardsListResponse = IApiResponse<CardDto[]>;
export type CardStatsResponse = IApiResponse<CardStatsDto>;
export type CardHistoryResponse = IApiResponse<CardHistoryDto>;
export type CardVersionResponse = IApiResponse<CardVersionSnapshot>;
export type BatchCreateResponse = IApiResponse<BatchCreateResult>;
export type TemplateResponse = IApiResponse<TemplateDto>;
export type TemplatesListResponse = IApiResponse<TemplateDto[]>;
export type MediaResponse = IApiResponse<MediaFileDto>;
export type UploadUrlResponse = IApiResponse<UploadUrlResult>;
export type SessionSeedResponse = IApiResponse<SessionSeedDto>;
export type CardsCursorResponse = IApiResponse<CardsCursorResult>;
export type CardCountResponse = IApiResponse<CardCountResult>;
export type CardValidationResponse = IApiResponse<CardValidationResult>;
```

**Step 2: Typecheck**

```bash
pnpm --filter @noema/api-client typecheck
```

**Step 3: Commit**

```bash
git add packages/api-client/src/content/types.ts
git commit -m "feat(api-client): add Content service types (cards, templates, media)"
```

---

## Task 2: Content Service — API + Hooks + Index

**Files:**
- Create: `packages/api-client/src/content/api.ts`
- Create: `packages/api-client/src/content/hooks.ts`
- Create: `packages/api-client/src/content/index.ts`

**Step 1: Create `api.ts`**

```typescript
/**
 * @noema/api-client - Content Service API
 *
 * HTTP wrappers for Content Service endpoints.
 */

import { http } from '../client.js';
import type { CardId, MediaId, TemplateId } from '@noema/types';
import type {
  BatchCreateInput,
  BatchCreateResponse,
  BatchStateUpdateInput,
  CardCountResponse,
  CardHistoryResponse,
  CardResponse,
  CardValidationResponse,
  CardVersionResponse,
  CardsCursorResponse,
  CreateCardInput,
  CreateTemplateInput,
  DeckQueryInput,
  MediaResponse,
  SessionSeedQuery,
  SessionSeedResponse,
  TemplateResponse,
  TemplatesListResponse,
  UpdateCardInput,
  UpdateCardNodeLinksInput,
  UpdateCardStateInput,
  UpdateCardTagsInput,
  UpdateTemplateInput,
  UploadUrlResponse,
} from './types.js';

// ============================================================================
// Cards API
// ============================================================================

export const cardsApi = {
  /** Create a new card. */
  createCard: (data: CreateCardInput): Promise<CardResponse> =>
    http.post('/v1/cards', data),

  /** Get a card by ID. */
  getCard: (id: CardId): Promise<CardResponse> =>
    http.get(`/v1/cards/${id}`),

  /** Update a card's content or metadata. */
  updateCard: (id: CardId, data: UpdateCardInput): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}`, data),

  /** Soft-delete a card. */
  deleteCard: (id: CardId): Promise<void> =>
    http.delete(`/v1/cards/${id}`),

  /** Restore a soft-deleted card. */
  restoreCard: (id: CardId): Promise<CardResponse> =>
    http.post(`/v1/cards/${id}/restore`),

  /** Query cards by DeckQuery filters (returns flat list). */
  queryCards: (query: DeckQueryInput): Promise<CardResponse[]> =>
    http.post('/v1/cards/query', query),

  /** Cursor-paginated card list. */
  getCardsCursor: (query: DeckQueryInput): Promise<CardsCursorResponse> =>
    http.get('/v1/cards/cursor', {
      params: query as Record<string, string | number | boolean | undefined>,
    }),

  /** Count cards matching a DeckQuery. */
  countCards: (query: DeckQueryInput): Promise<CardCountResponse> =>
    http.post('/v1/cards/count', query),

  /** Aggregate card statistics for current user. */
  getCardStats: (): Promise<CardResponse> =>
    http.get('/v1/cards/stats'),

  /** Transition card to a new FSM state. */
  updateCardState: (
    id: CardId,
    data: UpdateCardStateInput,
  ): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/state`, data),

  /** Batch FSM state transition for multiple cards. */
  batchUpdateState: (data: BatchStateUpdateInput): Promise<void> =>
    http.post('/v1/cards/batch/state', data),

  /** Replace all tags on a card. */
  updateCardTags: (
    id: CardId,
    data: UpdateCardTagsInput,
  ): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/tags`, data),

  /** Replace all node links on a card. */
  updateCardNodeLinks: (
    id: CardId,
    data: UpdateCardNodeLinksInput,
  ): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/node-links`, data),

  /** Validate card content without persisting. */
  validateCard: (data: CreateCardInput): Promise<CardValidationResponse> =>
    http.post('/v1/cards/validate', data),

  /** Get full version history for a card. */
  getCardHistory: (id: CardId): Promise<CardHistoryResponse> =>
    http.get(`/v1/cards/${id}/history`),

  /** Get a specific version snapshot. */
  getCardVersion: (
    id: CardId,
    version: number,
  ): Promise<CardVersionResponse> =>
    http.get(`/v1/cards/${id}/history/${String(version)}`),

  /** Initiate a batch card creation job. */
  batchCreateCards: (data: BatchCreateInput): Promise<BatchCreateResponse> =>
    http.post('/v1/cards/batch', data),

  /** Poll a batch creation job by batchId. */
  getBatch: (batchId: string): Promise<BatchCreateResponse> =>
    http.get(`/v1/cards/batch/${batchId}`),

  /** Cancel a pending batch creation job. */
  deleteBatch: (batchId: string): Promise<void> =>
    http.delete(`/v1/cards/batch/${batchId}`),

  /** Build a session seed (ordered card IDs) from a DeckQuery. */
  getSessionSeed: (query: SessionSeedQuery): Promise<SessionSeedResponse> =>
    http.post('/v1/cards/session-seed', query),
};

// ============================================================================
// Templates API
// ============================================================================

export const templatesApi = {
  /** Create a card template. */
  createTemplate: (data: CreateTemplateInput): Promise<TemplateResponse> =>
    http.post('/v1/templates', data),

  /** Get a template by ID. */
  getTemplate: (id: TemplateId): Promise<TemplateResponse> =>
    http.get(`/v1/templates/${id}`),

  /** Update a template. */
  updateTemplate: (
    id: TemplateId,
    data: UpdateTemplateInput,
  ): Promise<TemplateResponse> =>
    http.patch(`/v1/templates/${id}`, data),

  /** Delete a template. */
  deleteTemplate: (id: TemplateId): Promise<void> =>
    http.delete(`/v1/templates/${id}`),

  /** List all templates for current user. */
  listTemplates: (): Promise<TemplatesListResponse> =>
    http.get('/v1/templates'),
};

// ============================================================================
// Media API
// ============================================================================

export const mediaApi = {
  /** Request a pre-signed upload URL and reserve a MediaId. */
  requestUploadUrl: (
    filename: string,
    mimeType: string,
  ): Promise<UploadUrlResponse> =>
    http.post('/v1/media/upload-url', { filename, mimeType }),

  /** Confirm that a direct upload completed successfully. */
  confirmUpload: (id: MediaId): Promise<MediaResponse> =>
    http.post(`/v1/media/${id}/confirm`),

  /** Get media file metadata by ID. */
  getMedia: (id: MediaId): Promise<MediaResponse> =>
    http.get(`/v1/media/${id}`),

  /** Delete a media file. */
  deleteMedia: (id: MediaId): Promise<void> =>
    http.delete(`/v1/media/${id}`),
};
```

**Step 2: Create `hooks.ts`**

```typescript
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
import type { CardId, MediaId, TemplateId } from '@noema/types';
import { cardsApi, mediaApi, templatesApi } from './api.js';
import type {
  BatchCreateInput,
  BatchCreateResponse,
  CardCountResponse,
  CardDto,
  CardHistoryDto,
  CardHistoryResponse,
  CardResponse,
  CardStatsDto,
  CardValidationResponse,
  CardVersionResponse,
  CardsCursorResponse,
  CreateCardInput,
  CreateTemplateInput,
  DeckQueryInput,
  MediaResponse,
  SessionSeedDto,
  SessionSeedQuery,
  SessionSeedResponse,
  TemplateDto,
  TemplateResponse,
  TemplatesListResponse,
  UpdateCardInput,
  UpdateCardNodeLinksInput,
  UpdateCardStateInput,
  UpdateCardTagsInput,
  UpdateTemplateInput,
  UploadUrlResponse,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const contentKeys = {
  all: ['content'] as const,
  cards: () => [...contentKeys.all, 'cards'] as const,
  list: (query?: DeckQueryInput) =>
    [...contentKeys.cards(), 'list', query] as const,
  cursor: (query?: DeckQueryInput) =>
    [...contentKeys.cards(), 'cursor', query] as const,
  detail: (id: CardId) =>
    [...contentKeys.cards(), 'detail', id] as const,
  stats: () => [...contentKeys.cards(), 'stats'] as const,
  history: (id: CardId) =>
    [...contentKeys.cards(), 'history', id] as const,
  batch: (batchId: string) =>
    [...contentKeys.cards(), 'batch', batchId] as const,
  templates: () => [...contentKeys.all, 'templates'] as const,
  template: (id: TemplateId) =>
    [...contentKeys.templates(), id] as const,
  media: (id: MediaId) =>
    [...contentKeys.all, 'media', id] as const,
};

// ============================================================================
// Card Query Hooks
// ============================================================================

export function useCards(
  query: DeckQueryInput,
  options?: Omit<
    UseQueryOptions<CardResponse[], Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.list(query),
    queryFn: () => cardsApi.queryCards(query),
    ...options,
  });
}

export function useCardsCursor(
  query: Omit<DeckQueryInput, 'cursor'>,
  options?: Omit<
    UseInfiniteQueryOptions<
      CardsCursorResponse,
      Error,
      InfiniteData<CardsCursorResponse>,
      CardsCursorResponse,
      QueryKey,
      string | null
    >,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >,
) {
  return useInfiniteQuery({
    queryKey: contentKeys.cursor(query),
    queryFn: ({ pageParam }) =>
      cardsApi.getCardsCursor({ ...query, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    initialPageParam: null,
    ...options,
  });
}

export function useCard(
  id: CardId,
  options?: Omit<
    UseQueryOptions<CardResponse, Error, CardDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.detail(id),
    queryFn: () => cardsApi.getCard(id),
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

export function useCardStats(
  options?: Omit<
    UseQueryOptions<CardResponse, Error, CardStatsDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.stats(),
    queryFn: cardsApi.getCardStats,
    select: (response) => response.data as unknown as CardStatsDto,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useCardHistory(
  id: CardId,
  options?: Omit<
    UseQueryOptions<CardHistoryResponse, Error, CardHistoryDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.history(id),
    queryFn: () => cardsApi.getCardHistory(id),
    select: (response) => response.data,
    enabled: !!id,
    ...options,
  });
}

export function useCardVersion(
  id: CardId,
  version: number,
  options?: Omit<
    UseQueryOptions<CardVersionResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: [...contentKeys.history(id), version] as const,
    queryFn: () => cardsApi.getCardVersion(id, version),
    enabled: !!id && version > 0,
    ...options,
  });
}

export function useSessionSeed(
  query: SessionSeedQuery,
  options?: Omit<
    UseQueryOptions<SessionSeedResponse, Error, SessionSeedDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: [...contentKeys.cards(), 'session-seed', query] as const,
    queryFn: () => cardsApi.getSessionSeed(query),
    select: (response) => response.data,
    ...options,
  });
}

export function useCardCount(
  query: DeckQueryInput,
  options?: Omit<UseQueryOptions<CardCountResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...contentKeys.list(query), 'count'] as const,
    queryFn: () => cardsApi.countCards(query),
    ...options,
  });
}

export function useBatch(
  batchId: string,
  options?: Omit<
    UseQueryOptions<BatchCreateResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.batch(batchId),
    queryFn: () => cardsApi.getBatch(batchId),
    enabled: !!batchId,
    ...options,
  });
}

// ============================================================================
// Card Mutation Hooks
// ============================================================================

export function useCreateCard(
  options?: UseMutationOptions<CardResponse, Error, CreateCardInput>,
) {
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
  options?: UseMutationOptions<BatchCreateResponse, Error, BatchCreateInput>,
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
  options?: UseMutationOptions<
    CardResponse,
    Error,
    { id: CardId; data: UpdateCardInput }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cardsApi.updateCard(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: contentKeys.detail(id) });
      const previous = queryClient.getQueryData<CardResponse>(
        contentKeys.detail(id),
      );
      queryClient.setQueryData<CardResponse>(
        contentKeys.detail(id),
        (old) => {
          if (!old) return old;
          return { ...old, data: { ...old.data, ...data } };
        },
      );
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(contentKeys.detail(id), context.previous);
      }
    },
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: contentKeys.list() });
    },
    ...options,
  });
}

export function useDeleteCard(
  options?: UseMutationOptions<void, Error, CardId>,
) {
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
  options?: UseMutationOptions<
    CardResponse,
    Error,
    { id: CardId; data: UpdateCardStateInput }
  >,
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
  options?: UseMutationOptions<
    CardResponse,
    Error,
    { id: CardId; data: UpdateCardTagsInput }
  >,
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
  options?: UseMutationOptions<
    CardResponse,
    Error,
    { id: CardId; data: UpdateCardNodeLinksInput }
  >,
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
  options?: UseMutationOptions<
    CardValidationResponse,
    Error,
    CreateCardInput
  >,
) {
  return useMutation({
    mutationFn: cardsApi.validateCard,
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
  >,
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
  options?: Omit<
    UseQueryOptions<TemplateResponse, Error, TemplateDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: contentKeys.template(id),
    queryFn: () => templatesApi.getTemplate(id),
    select: (response) => response.data,
    enabled: !!id,
    ...options,
  });
}

export function useCreateTemplate(
  options?: UseMutationOptions<
    TemplateResponse,
    Error,
    CreateTemplateInput
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: templatesApi.createTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: contentKeys.templates(),
      });
    },
    ...options,
  });
}

export function useUpdateTemplate(
  options?: UseMutationOptions<
    TemplateResponse,
    Error,
    { id: TemplateId; data: UpdateTemplateInput }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => templatesApi.updateTemplate(id, data),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(contentKeys.template(id), response);
      void queryClient.invalidateQueries({
        queryKey: contentKeys.templates(),
      });
    },
    ...options,
  });
}

// ============================================================================
// Media Hooks
// ============================================================================

export function useRequestUploadUrl(
  options?: UseMutationOptions<
    UploadUrlResponse,
    Error,
    { filename: string; mimeType: string }
  >,
) {
  return useMutation({
    mutationFn: ({ filename, mimeType }) =>
      mediaApi.requestUploadUrl(filename, mimeType),
    ...options,
  });
}

export function useConfirmUpload(
  options?: UseMutationOptions<MediaResponse, Error, MediaId>,
) {
  return useMutation({
    mutationFn: mediaApi.confirmUpload,
    ...options,
  });
}

export function useMedia(
  id: MediaId,
  options?: Omit<UseQueryOptions<MediaResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: contentKeys.media(id),
    queryFn: () => mediaApi.getMedia(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}
```

**Step 3: Create `index.ts`**

```typescript
/**
 * @noema/api-client - Content Service Module
 */

export * from './api.js';
export * from './hooks.js';
export * from './types.js';
```

**Step 4: Typecheck + lint**

```bash
pnpm --filter @noema/api-client typecheck
pnpm --filter @noema/api-client lint
```

Fix any issues. Expected: zero errors.

**Step 5: Commit**

```bash
git add packages/api-client/src/content/
git commit -m "feat(api-client): add Content service module (cards, templates, media)"
```

---

## Task 3: Scheduler Service — Enhance with Phase 02 endpoints

The scheduler module already has review-queue and retention endpoints from an earlier phase.
This task adds the Phase 02 planning endpoints and creates a co-located `hooks.ts`.

**Files:**
- Modify: `packages/api-client/src/scheduler/types.ts` (append new types)
- Modify: `packages/api-client/src/scheduler/api.ts` (append new api objects)
- Create: `packages/api-client/src/scheduler/hooks.ts`
- Modify: `packages/api-client/src/scheduler/index.ts` (export hooks)
- Modify: `packages/api-client/src/hooks/scheduler.ts` (re-export from new location)

**Step 1: Append to `scheduler/types.ts`**

Add at the end of the existing file:

```typescript
import type { IApiResponse } from '@noema/contracts';
import type { CardId } from '@noema/types';

// ============================================================================
// Phase 02 — Dual-Lane Plan
// ============================================================================

export interface DualLanePlanInput {
  userId: string;
  asOf?: string;
  horizonDays?: number;
}

export interface LaneSlot {
  cardId: CardId;
  scheduledAt: string;
  lane: 'retention' | 'calibration';
  algorithm: 'fsrs' | 'hlr' | 'sm2';
}

export interface DualLanePlanResult {
  slots: LaneSlot[];
  totalRetention: number;
  totalCalibration: number;
  generatedAt: string;
}

// ============================================================================
// Phase 02 — Review Windows
// ============================================================================

export interface ReviewWindowInput {
  userId: string;
  date?: string;
  timezone?: string;
}

export interface ReviewWindowDto {
  startAt: string;
  endAt: string;
  cardsDue: number;
  lane: 'retention' | 'calibration';
  loadScore: number;
}

// ============================================================================
// Phase 02 — Session Candidates
// ============================================================================

export interface SessionCandidatesInput {
  userId: string;
  lane?: 'retention' | 'calibration';
  limit?: number;
  asOf?: string;
}

export interface SessionCandidateDto {
  cardId: CardId;
  lane: 'retention' | 'calibration';
  priority: number;
  daysOverdue: number;
  retentionProbability: number;
}

// ============================================================================
// Phase 02 — Simulation
// ============================================================================

export interface SimulationInput {
  userId: string;
  sessionDurationMinutes: number;
  lane?: 'retention' | 'calibration';
  asOf?: string;
}

export interface SimulationResult {
  simulatedCards: SessionCandidateDto[];
  projectedRetentionGain: number;
  estimatedDurationMinutes: number;
}

// ============================================================================
// Phase 02 — Schedule Commits
// ============================================================================

export interface ScheduleCommitInput {
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  grade: number;
  reviewedAt?: string;
}

export interface SchedulerCardDto {
  cardId: CardId;
  userId: string;
  lane: 'retention' | 'calibration';
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  nextReviewDate: string;
  stability: number | null;
  difficulty: number | null;
  reviewCount: number;
}

export interface BatchScheduleCommitInput {
  commits: Array<{ cardId: CardId } & ScheduleCommitInput>;
}

export interface BatchScheduleCommitResult {
  committed: number;
  failed: number;
  errors: Array<{ cardId: CardId; error: string }>;
}

// Response aliases
export type DualLanePlanResponse = IApiResponse<DualLanePlanResult>;
export type ReviewWindowsResponse = IApiResponse<ReviewWindowDto[]>;
export type SessionCandidatesResponse = IApiResponse<SessionCandidateDto[]>;
export type SimulationResponse = IApiResponse<SimulationResult>;
export type ScheduleCommitResponse = IApiResponse<SchedulerCardDto>;
export type BatchScheduleCommitResponse = IApiResponse<BatchScheduleCommitResult>;
```

**Step 2: Append to `scheduler/api.ts`**

Add at the end of the existing file:

```typescript
import type { CardId } from '@noema/types';
import type {
  BatchScheduleCommitInput,
  BatchScheduleCommitResponse,
  DualLanePlanInput,
  DualLanePlanResponse,
  ReviewWindowInput,
  ReviewWindowsResponse,
  ScheduleCommitInput,
  ScheduleCommitResponse,
  SessionCandidatesInput,
  SessionCandidatesResponse,
  SimulationInput,
  SimulationResponse,
} from './types.js';

export const dualLanePlanApi = {
  /** Generate a dual-lane review plan. */
  getPlan: (input: DualLanePlanInput): Promise<DualLanePlanResponse> =>
    http.post('/v1/scheduler/dual-lane/plan', input),
};

export const proposalsApi = {
  /** Get optimal review windows for a user. */
  getReviewWindows: (input: ReviewWindowInput): Promise<ReviewWindowsResponse> =>
    http.post('/v1/scheduler/proposals/review-windows', input),

  /** Get card candidates for a potential session. */
  getSessionCandidates: (
    input: SessionCandidatesInput,
  ): Promise<SessionCandidatesResponse> =>
    http.post('/v1/scheduler/proposals/session-candidates', input),
};

export const simulationsApi = {
  /** Run a "what-if" scheduling simulation. */
  simulateSession: (input: SimulationInput): Promise<SimulationResponse> =>
    http.post('/v1/scheduler/simulations/session-candidates', input),
};

export const commitsApi = {
  /** Commit a single card's schedule after review. */
  commitSchedule: (
    cardId: CardId,
    data: ScheduleCommitInput,
  ): Promise<ScheduleCommitResponse> =>
    http.post(`/v1/scheduler/commits/cards/${cardId}/schedule`, data),

  /** Batch commit schedules for multiple cards. */
  batchCommitSchedule: (
    data: BatchScheduleCommitInput,
  ): Promise<BatchScheduleCommitResponse> =>
    http.post('/v1/scheduler/commits/cards/schedule/batch', data),
};
```

**Step 3: Create `scheduler/hooks.ts`**

This file holds ALL scheduler hooks — both migrated from `hooks/scheduler.ts` and new ones.

```typescript
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
  PredictRetentionInput,
  RetentionPredictionResponse,
  ReviewWindowInput,
  ReviewWindowsResponse,
  ReviewQueueParams,
  ReviewQueueResponse,
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
  card: (cardId: string) => [...schedulerKeys.cards(), cardId] as const,
  cardList: (params?: SchedulerCardListParams) =>
    [...schedulerKeys.cards(), 'list', params] as const,
  retention: () => [...schedulerKeys.all, 'retention'] as const,
  plan: (input?: DualLanePlanInput) =>
    [...schedulerKeys.all, 'dual-lane-plan', input] as const,
  reviewWindows: (input?: ReviewWindowInput) =>
    [...schedulerKeys.all, 'review-windows', input] as const,
  candidates: (input?: SessionCandidatesInput) =>
    [...schedulerKeys.all, 'session-candidates', input] as const,
};

// ============================================================================
// Existing Hooks (migrated from hooks/scheduler.ts)
// ============================================================================

export function useReviewQueue(
  params?: ReviewQueueParams,
  options?: Omit<UseQueryOptions<ReviewQueueResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: schedulerKeys.reviewQueue(params),
    queryFn: () => reviewQueueApi.getReviewQueue(params),
    ...options,
  });
}

export function usePredictRetention(
  options?: UseMutationOptions<
    RetentionPredictionResponse,
    Error,
    PredictRetentionInput
  >,
) {
  return useMutation({
    mutationFn: retentionApi.predictRetention,
    ...options,
  });
}

export function useSchedulerCard(
  cardId: string,
  options?: Omit<
    UseQueryOptions<SchedulerCardResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: schedulerKeys.card(cardId),
    queryFn: () => schedulerCardsApi.getCard(cardId),
    enabled: !!cardId,
    ...options,
  });
}

export function useSchedulerCards(
  params: SchedulerCardListParams,
  options?: Omit<
    UseQueryOptions<SchedulerCardListResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: schedulerKeys.cardList(params),
    queryFn: () => schedulerCardsApi.listCards(params),
    ...options,
  });
}

// ============================================================================
// Phase 02 — New Hooks
// ============================================================================

export function useDualLanePlan(
  input: DualLanePlanInput,
  options?: Omit<
    UseQueryOptions<DualLanePlanResponse>,
    'queryKey' | 'queryFn'
  >,
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
  options?: Omit<
    UseQueryOptions<ReviewWindowsResponse>,
    'queryKey' | 'queryFn'
  >,
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
  options?: Omit<
    UseQueryOptions<SessionCandidatesResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: schedulerKeys.candidates(input),
    queryFn: () => proposalsApi.getSessionCandidates(input),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useSimulateSession(
  options?: UseMutationOptions<SimulationResponse, Error, SimulationInput>,
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
  >,
) {
  return useMutation({
    mutationFn: ({ cardId, data }) => commitsApi.commitSchedule(cardId, data),
    ...options,
  });
}

export function useBatchCommitSchedule(
  options?: UseMutationOptions<
    BatchScheduleCommitResponse,
    Error,
    BatchScheduleCommitInput
  >,
) {
  return useMutation({
    mutationFn: commitsApi.batchCommitSchedule,
    ...options,
  });
}
```

**Step 4: Update `scheduler/index.ts`** — add hooks export:

```typescript
/**
 * @noema/api-client - Scheduler Service Module
 */

export * from './api.js';
export * from './hooks.js';
export * from './types.js';
```

**Step 5: Update `hooks/scheduler.ts`** — replace with re-export to avoid duplication:

```typescript
/**
 * @noema/api-client - Scheduler Hooks (re-export)
 *
 * Hooks have moved to scheduler/hooks.ts.
 * This file re-exports for backward compatibility.
 */

export {
  schedulerKeys,
  usePredictRetention,
  useReviewQueue,
  useSchedulerCard,
  useSchedulerCards,
} from '../scheduler/hooks.js';
```

**Step 6: Typecheck + lint**

```bash
pnpm --filter @noema/api-client typecheck
pnpm --filter @noema/api-client lint
```

Fix any issues (common: missing imports in api.ts — the new api functions need the `http` import which is already at the top of the file).

**Step 7: Commit**

```bash
git add packages/api-client/src/scheduler/
git commit -m "feat(api-client): enhance Scheduler module with Phase 02 planning endpoints"
```

---

## Task 4: Session Service Module

**Files:**
- Create: `packages/api-client/src/session/types.ts`
- Create: `packages/api-client/src/session/api.ts`
- Create: `packages/api-client/src/session/hooks.ts`
- Create: `packages/api-client/src/session/index.ts`

**Step 1: Create `session/types.ts`**

```typescript
/**
 * @noema/api-client - Session Service Types
 */

import type { IApiResponse } from '@noema/contracts';
import type { AttemptId, CardId, SessionId, UserId } from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type SessionState =
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'EXPIRED';

export type SessionMode = 'standard' | 'cram' | 'preview' | 'test';

// ============================================================================
// Session DTO
// ============================================================================

export interface SessionDto {
  id: SessionId;
  userId: UserId;
  state: SessionState;
  mode: SessionMode;
  cardIds: CardId[];
  currentCardIndex: number;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Attempt DTO (with metacognitive signals)
// ============================================================================

export interface AttemptDto {
  id: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  grade: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  hintDepthUsed: number;
  dwellTimeMs: number;
  selfReportedGuess: boolean;
  reviewedAt: string;
  createdAt: string;
}

export interface AttemptInput {
  cardId: CardId;
  grade: number;
  /** Confidence before seeing the answer (0–1) */
  confidenceBefore?: number;
  /** Confidence after seeing the answer (0–1) */
  confidenceAfter?: number;
  /** Signed delta: confidenceAfter − confidenceBefore */
  calibrationDelta?: number;
  /** How many hint tiers were consumed (0 = none) */
  hintDepthUsed?: number;
  /** Time the card was displayed, in milliseconds */
  dwellTimeMs?: number;
  /** User explicitly flagged this as a guess */
  selfReportedGuess?: boolean;
}

// ============================================================================
// Session Queue
// ============================================================================

export interface SessionQueueItem {
  cardId: CardId;
  position: number;
  injected: boolean;
}

export interface SessionQueueDto {
  sessionId: SessionId;
  items: SessionQueueItem[];
  remaining: number;
}

// ============================================================================
// Hints
// ============================================================================

export interface HintResponseDto {
  hint: string;
  depth: number;
  remainingHints: number;
}

// ============================================================================
// Checkpoints
// ============================================================================

export interface CheckpointDirectiveDto {
  action: 'continue' | 'pause' | 'complete' | 'switch_mode';
  reason: string;
  suggestedMode?: SessionMode;
}

// ============================================================================
// Cohort Handshake
// ============================================================================

export interface CohortHandshakeDto {
  cohortId: string;
  status: 'proposed' | 'accepted' | 'revised' | 'committed';
  cardIds: CardId[];
  proposedAt: string;
}

// ============================================================================
// Mid-session Updates
// ============================================================================

export interface UpdateStrategyInput {
  strategy: string;
  parameters?: Record<string, unknown>;
}

export interface UpdateTeachingInput {
  approach: string;
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Blueprint
// ============================================================================

export interface BlueprintValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Offline Intents
// ============================================================================

export interface OfflineIntentTokenDto {
  token: string;
  expiresAt: string;
  cardIds: CardId[];
}

export interface OfflineIntentVerifyInput {
  token: string;
  attempts: AttemptInput[];
}

// ============================================================================
// Create Inputs
// ============================================================================

export interface StartSessionInput {
  cardIds?: CardId[];
  mode?: SessionMode;
  blueprintId?: string;
}

export interface SessionFilters {
  state?: SessionState;
  mode?: SessionMode;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Response aliases
// ============================================================================

export type SessionResponse = IApiResponse<SessionDto>;
export type SessionsListResponse = IApiResponse<SessionDto[]>;
export type AttemptResponse = IApiResponse<AttemptDto>;
export type AttemptsListResponse = IApiResponse<AttemptDto[]>;
export type SessionQueueResponse = IApiResponse<SessionQueueDto>;
export type HintResponse = IApiResponse<HintResponseDto>;
export type CheckpointResponse = IApiResponse<CheckpointDirectiveDto>;
export type CohortResponse = IApiResponse<CohortHandshakeDto>;
export type BlueprintValidationResponse = IApiResponse<BlueprintValidationResult>;
export type OfflineTokenResponse = IApiResponse<OfflineIntentTokenDto>;
```

**Step 2: Create `session/api.ts`**

```typescript
/**
 * @noema/api-client - Session Service API
 */

import { http } from '../client.js';
import type { AttemptId, SessionId } from '@noema/types';
import type {
  AttemptInput,
  AttemptResponse,
  AttemptsListResponse,
  BlueprintValidationResponse,
  CheckpointResponse,
  CohortHandshakeDto,
  CohortResponse,
  HintResponse,
  OfflineIntentVerifyInput,
  OfflineTokenResponse,
  SessionFilters,
  SessionQueueResponse,
  SessionResponse,
  SessionsListResponse,
  StartSessionInput,
  UpdateStrategyInput,
  UpdateTeachingInput,
} from './types.js';

// ============================================================================
// Session Lifecycle API
// ============================================================================

export const sessionsApi = {
  /** Start a new session. */
  startSession: (data: StartSessionInput): Promise<SessionResponse> =>
    http.post('/v1/sessions', data),

  /** List sessions with optional filters. */
  listSessions: (filters?: SessionFilters): Promise<SessionsListResponse> =>
    http.get('/v1/sessions', {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),

  /** Get a session by ID. */
  getSession: (id: SessionId): Promise<SessionResponse> =>
    http.get(`/v1/sessions/${id}`),

  /** Pause an active session. */
  pauseSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/pause`),

  /** Resume a paused session. */
  resumeSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/resume`),

  /** Complete a session normally. */
  completeSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/complete`),

  /** Mark session as expired (server-side TTL exceeded). */
  expireSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/expire`),

  /** Abandon a session (user-initiated quit). */
  abandonSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/abandon`),
};

// ============================================================================
// Attempts API
// ============================================================================

export const attemptsApi = {
  /** Record a card attempt within a session. */
  recordAttempt: (
    sessionId: SessionId,
    data: AttemptInput,
  ): Promise<AttemptResponse> =>
    http.post(`/v1/sessions/${sessionId}/attempts`, data),

  /** List all attempts in a session. */
  listAttempts: (sessionId: SessionId): Promise<AttemptsListResponse> =>
    http.get(`/v1/sessions/${sessionId}/attempts`),

  /** Request a hint for a specific attempt. */
  requestHint: (
    sessionId: SessionId,
    attemptId: AttemptId,
  ): Promise<HintResponse> =>
    http.post(`/v1/sessions/${sessionId}/attempts/${attemptId}/hint`),
};

// ============================================================================
// Queue API
// ============================================================================

export const queueApi = {
  /** Get the current session card queue. */
  getQueue: (sessionId: SessionId): Promise<SessionQueueResponse> =>
    http.get(`/v1/sessions/${sessionId}/queue`),

  /** Inject a card into the current queue position. */
  injectCard: (
    sessionId: SessionId,
    cardId: string,
  ): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/inject`, { cardId }),

  /** Remove a card from the queue. */
  removeCard: (
    sessionId: SessionId,
    cardId: string,
  ): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/remove`, { cardId }),
};

// ============================================================================
// Checkpoint API
// ============================================================================

export const checkpointApi = {
  /** Trigger an adaptive checkpoint evaluation. */
  evaluateCheckpoint: (sessionId: SessionId): Promise<CheckpointResponse> =>
    http.post(`/v1/sessions/${sessionId}/checkpoints/evaluate`),
};

// ============================================================================
// Cohort Handshake API
// ============================================================================

export const cohortApi = {
  propose: (
    sessionId: SessionId,
    data: Partial<CohortHandshakeDto>,
  ): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/propose`, data),

  accept: (sessionId: SessionId): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/accept`),

  revise: (
    sessionId: SessionId,
    data: Partial<CohortHandshakeDto>,
  ): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/revise`, data),

  commit: (sessionId: SessionId): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/commit`),
};

// ============================================================================
// Mid-Session Update API
// ============================================================================

export const midSessionApi = {
  /** Update the session's scheduling strategy mid-session. */
  updateStrategy: (
    sessionId: SessionId,
    data: UpdateStrategyInput,
  ): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${sessionId}/strategy`, data),

  /** Update the teaching approach mid-session. */
  updateTeaching: (
    sessionId: SessionId,
    data: UpdateTeachingInput,
  ): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${sessionId}/teaching`, data),
};

// ============================================================================
// Blueprint API
// ============================================================================

export const blueprintApi = {
  /** Validate an agent-generated session blueprint. */
  validateBlueprint: (blueprint: unknown): Promise<BlueprintValidationResponse> =>
    http.post('/v1/sessions/blueprint/validate', blueprint),
};

// ============================================================================
// Offline Intents API
// ============================================================================

export const offlineApi = {
  /** Get an offline intent token for deferred session recording. */
  getToken: (cardIds: string[]): Promise<OfflineTokenResponse> =>
    http.post('/v1/sessions/offline-intents', { cardIds }),

  /** Verify and submit offline attempts using a token. */
  verifyAndSubmit: (
    data: OfflineIntentVerifyInput,
  ): Promise<AttemptsListResponse> =>
    http.post('/v1/sessions/offline-intents/verify', data),
};
```

**Step 3: Create `session/hooks.ts`**

```typescript
/**
 * @noema/api-client - Session Service Hooks
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { AttemptId, SessionId } from '@noema/types';
import {
  attemptsApi,
  blueprintApi,
  checkpointApi,
  cohortApi,
  midSessionApi,
  offlineApi,
  queueApi,
  sessionsApi,
} from './api.js';
import type {
  AttemptInput,
  AttemptResponse,
  AttemptsListResponse,
  BlueprintValidationResponse,
  CheckpointResponse,
  CohortHandshakeDto,
  CohortResponse,
  HintResponse,
  OfflineIntentVerifyInput,
  OfflineTokenResponse,
  SessionDto,
  SessionFilters,
  SessionQueueDto,
  SessionQueueResponse,
  SessionResponse,
  SessionsListResponse,
  StartSessionInput,
  UpdateStrategyInput,
  UpdateTeachingInput,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const sessionKeys = {
  all: ['sessions'] as const,
  list: (filters?: SessionFilters) =>
    [...sessionKeys.all, 'list', filters] as const,
  detail: (id: SessionId) => [...sessionKeys.all, 'detail', id] as const,
  queue: (id: SessionId) => [...sessionKeys.detail(id), 'queue'] as const,
  attempts: (id: SessionId) =>
    [...sessionKeys.detail(id), 'attempts'] as const,
};

// ============================================================================
// Session Query Hooks
// ============================================================================

export function useSessions(
  filters?: SessionFilters,
  options?: Omit<
    UseQueryOptions<SessionsListResponse, Error, SessionDto[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: sessionKeys.list(filters),
    queryFn: () => sessionsApi.listSessions(filters),
    select: (response) => response.data,
    ...options,
  });
}

export function useSession(
  id: SessionId,
  options?: Omit<
    UseQueryOptions<SessionResponse, Error, SessionDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: () => sessionsApi.getSession(id),
    select: (response) => response.data,
    enabled: !!id,
    ...options,
  });
}

export function useSessionQueue(
  sessionId: SessionId,
  options?: Omit<
    UseQueryOptions<SessionQueueResponse, Error, SessionQueueDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: sessionKeys.queue(sessionId),
    queryFn: () => queueApi.getQueue(sessionId),
    select: (response) => response.data,
    enabled: !!sessionId,
    ...options,
  });
}

export function useSessionAttempts(
  sessionId: SessionId,
  options?: Omit<
    UseQueryOptions<AttemptsListResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: sessionKeys.attempts(sessionId),
    queryFn: () => attemptsApi.listAttempts(sessionId),
    enabled: !!sessionId,
    ...options,
  });
}

// ============================================================================
// Session Lifecycle Mutations
// ============================================================================

export function useStartSession(
  options?: UseMutationOptions<SessionResponse, Error, StartSessionInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.startSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

export function usePauseSession(
  options?: UseMutationOptions<SessionResponse, Error, SessionId>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.pauseSession,
    onSuccess: (response, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), response);
    },
    ...options,
  });
}

export function useResumeSession(
  options?: UseMutationOptions<SessionResponse, Error, SessionId>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.resumeSession,
    onSuccess: (response, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), response);
    },
    ...options,
  });
}

export function useCompleteSession(
  options?: UseMutationOptions<SessionResponse, Error, SessionId>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.completeSession,
    onSuccess: (response, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

export function useAbandonSession(
  options?: UseMutationOptions<SessionResponse, Error, SessionId>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.abandonSession,
    onSuccess: (response, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// Attempt Mutations
// ============================================================================

export function useRecordAttempt(
  sessionId: SessionId,
  options?: UseMutationOptions<AttemptResponse, Error, AttemptInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => attemptsApi.recordAttempt(sessionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sessionKeys.attempts(sessionId),
      });
      void queryClient.invalidateQueries({
        queryKey: sessionKeys.queue(sessionId),
      });
    },
    ...options,
  });
}

export function useRequestHint(
  sessionId: SessionId,
  options?: UseMutationOptions<HintResponse, Error, AttemptId>,
) {
  return useMutation({
    mutationFn: (attemptId) =>
      attemptsApi.requestHint(sessionId, attemptId),
    ...options,
  });
}

// ============================================================================
// Checkpoint Mutation
// ============================================================================

export function useEvaluateCheckpoint(
  sessionId: SessionId,
  options?: UseMutationOptions<CheckpointResponse, Error, void>,
) {
  return useMutation({
    mutationFn: () => checkpointApi.evaluateCheckpoint(sessionId),
    ...options,
  });
}

// ============================================================================
// Cohort Mutations
// ============================================================================

export function useProposeCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<
    CohortResponse,
    Error,
    Partial<CohortHandshakeDto>
  >,
) {
  return useMutation({
    mutationFn: (data) => cohortApi.propose(sessionId, data),
    ...options,
  });
}

export function useAcceptCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse, Error, void>,
) {
  return useMutation({
    mutationFn: () => cohortApi.accept(sessionId),
    ...options,
  });
}

export function useReviseCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<
    CohortResponse,
    Error,
    Partial<CohortHandshakeDto>
  >,
) {
  return useMutation({
    mutationFn: (data) => cohortApi.revise(sessionId, data),
    ...options,
  });
}

export function useCommitCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse, Error, void>,
) {
  return useMutation({
    mutationFn: () => cohortApi.commit(sessionId),
    ...options,
  });
}

// ============================================================================
// Mid-Session Mutations
// ============================================================================

export function useUpdateSessionStrategy(
  sessionId: SessionId,
  options?: UseMutationOptions<SessionResponse, Error, UpdateStrategyInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => midSessionApi.updateStrategy(sessionId, data),
    onSuccess: (response) => {
      queryClient.setQueryData(sessionKeys.detail(sessionId), response);
    },
    ...options,
  });
}

export function useUpdateTeachingApproach(
  sessionId: SessionId,
  options?: UseMutationOptions<SessionResponse, Error, UpdateTeachingInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => midSessionApi.updateTeaching(sessionId, data),
    onSuccess: (response) => {
      queryClient.setQueryData(sessionKeys.detail(sessionId), response);
    },
    ...options,
  });
}

// ============================================================================
// Blueprint + Offline Mutations
// ============================================================================

export function useValidateBlueprint(
  options?: UseMutationOptions<BlueprintValidationResponse, Error, unknown>,
) {
  return useMutation({
    mutationFn: blueprintApi.validateBlueprint,
    ...options,
  });
}

export function useOfflineIntentToken(
  options?: UseMutationOptions<OfflineTokenResponse, Error, string[]>,
) {
  return useMutation({
    mutationFn: offlineApi.getToken,
    ...options,
  });
}

export function useVerifyOfflineIntents(
  options?: UseMutationOptions<
    AttemptsListResponse,
    Error,
    OfflineIntentVerifyInput
  >,
) {
  return useMutation({
    mutationFn: offlineApi.verifyAndSubmit,
    ...options,
  });
}
```

**Step 4: Create `session/index.ts`**

```typescript
/**
 * @noema/api-client - Session Service Module
 */

export * from './api.js';
export * from './hooks.js';
export * from './types.js';
```

**Step 5: Typecheck + lint**

```bash
pnpm --filter @noema/api-client typecheck
pnpm --filter @noema/api-client lint
```

**Step 6: Commit**

```bash
git add packages/api-client/src/session/
git commit -m "feat(api-client): add Session service module (lifecycle, attempts, checkpoints, cohort)"
```

---

## Task 5: Knowledge Graph Service Module

**Files:**
- Create: `packages/api-client/src/knowledge-graph/types.ts`
- Create: `packages/api-client/src/knowledge-graph/api.ts`
- Create: `packages/api-client/src/knowledge-graph/hooks.ts`
- Create: `packages/api-client/src/knowledge-graph/index.ts`

**Step 1: Create `knowledge-graph/types.ts`**

```typescript
/**
 * @noema/api-client - Knowledge Graph Service Types
 */

import type { IApiResponse } from '@noema/contracts';
import type {
  EdgeId,
  MutationId,
  NodeId,
  ProposerId,
  UserId,
} from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type NodeType =
  | 'concept'
  | 'skill'
  | 'fact'
  | 'procedure'
  | 'principle'
  | 'example';

export type EdgeType =
  | 'prerequisite'
  | 'related'
  | 'part_of'
  | 'example_of'
  | 'contradicts';

export type MutationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'retrying';

export type MisconceptionStatus =
  | 'detected'
  | 'confirmed'
  | 'resolved'
  | 'dismissed';

// ============================================================================
// PKG / CKG Node DTO
// ============================================================================

export interface GraphNodeDto {
  id: NodeId;
  type: NodeType;
  label: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNodeInput {
  type: NodeType;
  label: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateNodeInput {
  label?: string;
  description?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PKG / CKG Edge DTO
// ============================================================================

export interface GraphEdgeDto {
  id: EdgeId;
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateEdgeInput {
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Traversal Results
// ============================================================================

export interface SubgraphDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
}

export interface SubgraphParams {
  rootNodeId: NodeId;
  depth?: number;
  edgeTypes?: EdgeType[];
}

export interface PrerequisiteChainDto {
  nodeId: NodeId;
  chain: GraphNodeDto[];
  depth: number;
}

export interface KnowledgeFrontierDto {
  nodes: GraphNodeDto[];
  totalReady: number;
}

export interface BridgeNodesDto {
  nodes: GraphNodeDto[];
}

export interface CentralityEntry {
  nodeId: NodeId;
  score: number;
}

export interface CentralityDto {
  rankings: CentralityEntry[];
}

export interface TopologyDto {
  nodeCount: number;
  edgeCount: number;
  isAcyclic: boolean;
  stronglyConnectedComponents: number;
}

export interface CommonAncestorsInput {
  nodeIds: NodeId[];
}

// ============================================================================
// PKG Operations Log
// ============================================================================

export interface PkgOperationDto {
  id: string;
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge';
  entityId: string;
  performedAt: string;
  performedBy: UserId;
}

// ============================================================================
// Structural Metrics
// ============================================================================

export interface StructuralMetricsDto {
  userId: UserId;
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  density: number;
  clusteredNodes: number;
  isolatedNodes: number;
  computedAt: string;
}

export interface StructuralHealthReportDto {
  userId: UserId;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
  computedAt: string;
}

export interface MetricHistoryEntry {
  computedAt: string;
  nodeCount: number;
  edgeCount: number;
  density: number;
  score: number;
}

export interface MetricHistoryDto {
  userId: UserId;
  entries: MetricHistoryEntry[];
}

// ============================================================================
// Misconceptions
// ============================================================================

export interface MisconceptionDto {
  id: string;
  userId: UserId;
  nodeId: NodeId;
  pattern: string;
  status: MisconceptionStatus;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface MisconceptionDetectionResult {
  detected: MisconceptionDto[];
  totalAnalyzed: number;
}

export interface UpdateMisconceptionStatusInput {
  status: MisconceptionStatus;
}

// ============================================================================
// CKG Mutations
// ============================================================================

export interface CkgMutationDto {
  id: MutationId;
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge';
  status: MutationStatus;
  proposedBy: ProposerId;
  payload: Record<string, unknown>;
  reviewedBy: UserId | null;
  reviewNote: string | null;
  proposedAt: string;
  reviewedAt: string | null;
}

export interface CkgMutationFilters {
  status?: MutationStatus;
  proposedBy?: ProposerId;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Comparison
// ============================================================================

export interface PkgCkgComparisonDto {
  userId: UserId;
  pkgNodeCount: number;
  ckgNodeCount: number;
  matchedNodes: number;
  missingFromPkg: GraphNodeDto[];
  extraInPkg: GraphNodeDto[];
  alignmentScore: number;
}

// ============================================================================
// Response aliases
// ============================================================================

export type NodeResponse = IApiResponse<GraphNodeDto>;
export type NodesListResponse = IApiResponse<GraphNodeDto[]>;
export type EdgeResponse = IApiResponse<GraphEdgeDto>;
export type EdgesListResponse = IApiResponse<GraphEdgeDto[]>;
export type SubgraphResponse = IApiResponse<SubgraphDto>;
export type PrerequisiteChainResponse = IApiResponse<PrerequisiteChainDto>;
export type FrontierResponse = IApiResponse<KnowledgeFrontierDto>;
export type BridgeNodesResponse = IApiResponse<BridgeNodesDto>;
export type CentralityResponse = IApiResponse<CentralityDto>;
export type TopologyResponse = IApiResponse<TopologyDto>;
export type OperationsResponse = IApiResponse<PkgOperationDto[]>;
export type MetricsResponse = IApiResponse<StructuralMetricsDto>;
export type HealthResponse = IApiResponse<StructuralHealthReportDto>;
export type MetricHistoryResponse = IApiResponse<MetricHistoryDto>;
export type MisconceptionsResponse = IApiResponse<MisconceptionDto[]>;
export type MisconceptionDetectionResponse = IApiResponse<MisconceptionDetectionResult>;
export type CkgMutationsResponse = IApiResponse<CkgMutationDto[]>;
export type CkgMutationResponse = IApiResponse<CkgMutationDto>;
export type ComparisonResponse = IApiResponse<PkgCkgComparisonDto>;
```

**Step 2: Create `knowledge-graph/api.ts`**

```typescript
/**
 * @noema/api-client - Knowledge Graph Service API
 */

import { http } from '../client.js';
import type { EdgeId, MutationId, NodeId, UserId } from '@noema/types';
import type {
  BridgeNodesResponse,
  CentralityResponse,
  CkgMutationFilters,
  CkgMutationResponse,
  CkgMutationsResponse,
  CommonAncestorsInput,
  ComparisonResponse,
  CreateEdgeInput,
  CreateNodeInput,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
  MisconceptionDetectionResponse,
  MisconceptionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  PrerequisiteChainResponse,
  SubgraphParams,
  SubgraphResponse,
  TopologyResponse,
  UpdateMisconceptionStatusInput,
  UpdateNodeInput,
} from './types.js';

const pkgBase = (userId: UserId) => `/api/v1/users/${userId}/pkg`;
const ckgBase = '/api/v1/ckg';
const metricsBase = (userId: UserId) => `/api/v1/users/${userId}/metrics`;
const miscBase = (userId: UserId) => `/api/v1/users/${userId}/misconceptions`;

// ============================================================================
// PKG Nodes API
// ============================================================================

export const pkgNodesApi = {
  create: (userId: UserId, data: CreateNodeInput): Promise<NodeResponse> =>
    http.post(`${pkgBase(userId)}/nodes`, data),

  list: (userId: UserId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/nodes`),

  get: (userId: UserId, nodeId: NodeId): Promise<NodeResponse> =>
    http.get(`${pkgBase(userId)}/nodes/${nodeId}`),

  update: (
    userId: UserId,
    nodeId: NodeId,
    data: UpdateNodeInput,
  ): Promise<NodeResponse> =>
    http.patch(`${pkgBase(userId)}/nodes/${nodeId}`, data),

  delete: (userId: UserId, nodeId: NodeId): Promise<void> =>
    http.delete(`${pkgBase(userId)}/nodes/${nodeId}`),
};

// ============================================================================
// PKG Edges API
// ============================================================================

export const pkgEdgesApi = {
  create: (userId: UserId, data: CreateEdgeInput): Promise<EdgeResponse> =>
    http.post(`${pkgBase(userId)}/edges`, data),

  list: (userId: UserId): Promise<EdgesListResponse> =>
    http.get(`${pkgBase(userId)}/edges`),

  get: (userId: UserId, edgeId: EdgeId): Promise<EdgeResponse> =>
    http.get(`${pkgBase(userId)}/edges/${edgeId}`),

  delete: (userId: UserId, edgeId: EdgeId): Promise<void> =>
    http.delete(`${pkgBase(userId)}/edges/${edgeId}`),
};

// ============================================================================
// PKG Traversal API
// ============================================================================

export const pkgTraversalApi = {
  getSubgraph: (
    userId: UserId,
    params: SubgraphParams,
  ): Promise<SubgraphResponse> =>
    http.get(`${pkgBase(userId)}/traversal/subgraph`, {
      params: params as Record<string, string | number | boolean | undefined>,
    }),

  getPrerequisites: (
    userId: UserId,
    nodeId: NodeId,
  ): Promise<PrerequisiteChainResponse> =>
    http.get(`${pkgBase(userId)}/traversal/prerequisites/${nodeId}`),

  getRelated: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/related/${nodeId}`),

  getTopology: (userId: UserId): Promise<TopologyResponse> =>
    http.get(`${pkgBase(userId)}/traversal/topology`),

  getFrontier: (userId: UserId): Promise<FrontierResponse> =>
    http.get(`${pkgBase(userId)}/traversal/frontier`),

  getBridges: (userId: UserId): Promise<BridgeNodesResponse> =>
    http.get(`${pkgBase(userId)}/traversal/bridges`),

  getCentrality: (userId: UserId): Promise<CentralityResponse> =>
    http.get(`${pkgBase(userId)}/traversal/centrality`),

  getSiblings: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/siblings/${nodeId}`),

  getCoParents: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/co-parents/${nodeId}`),

  getCommonAncestors: (
    userId: UserId,
    data: CommonAncestorsInput,
  ): Promise<NodesListResponse> =>
    http.post(`${pkgBase(userId)}/traversal/common-ancestors`, data),
};

// ============================================================================
// PKG Operations Log
// ============================================================================

export const pkgOperationsApi = {
  list: (userId: UserId): Promise<OperationsResponse> =>
    http.get(`${pkgBase(userId)}/operations`),
};

// ============================================================================
// CKG Read API
// ============================================================================

export const ckgNodesApi = {
  list: (): Promise<NodesListResponse> =>
    http.get(`${ckgBase}/nodes`),

  get: (nodeId: NodeId): Promise<NodeResponse> =>
    http.get(`${ckgBase}/nodes/${nodeId}`),
};

export const ckgEdgesApi = {
  list: (): Promise<EdgesListResponse> =>
    http.get(`${ckgBase}/edges`),

  get: (edgeId: EdgeId): Promise<EdgeResponse> =>
    http.get(`${ckgBase}/edges/${edgeId}`),
};

// ============================================================================
// CKG Mutations API
// ============================================================================

export const ckgMutationsApi = {
  list: (filters?: CkgMutationFilters): Promise<CkgMutationsResponse> =>
    http.get(`${ckgBase}/mutations`, {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),

  get: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.get(`${ckgBase}/mutations/${mutationId}`),

  approve: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/approve`, { note }),

  reject: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/reject`, { note }),

  cancel: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/cancel`),

  retry: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/retry`),
};

// ============================================================================
// CKG Traversal API (mirrors PKG traversal but on canonical graph)
// ============================================================================

export const ckgTraversalApi = {
  getSubgraph: (params: SubgraphParams): Promise<SubgraphResponse> =>
    http.get(`${ckgBase}/traversal/subgraph`, {
      params: params as Record<string, string | number | boolean | undefined>,
    }),

  getFrontier: (): Promise<FrontierResponse> =>
    http.get(`${ckgBase}/traversal/frontier`),

  getCentrality: (): Promise<CentralityResponse> =>
    http.get(`${ckgBase}/traversal/centrality`),
};

// ============================================================================
// Structural Metrics API
// ============================================================================

export const metricsApi = {
  get: (userId: UserId): Promise<MetricsResponse> =>
    http.get(metricsBase(userId)),

  compute: (userId: UserId): Promise<MetricsResponse> =>
    http.post(`${metricsBase(userId)}/compute`),

  getHistory: (userId: UserId): Promise<MetricHistoryResponse> =>
    http.get(`${metricsBase(userId)}/history`),
};

// ============================================================================
// Structural Health API
// ============================================================================

export const healthApi = {
  get: (userId: UserId): Promise<HealthResponse> =>
    http.get(`/api/v1/users/${userId}/structural-health`),
};

// ============================================================================
// Misconceptions API
// ============================================================================

export const misconceptionsApi = {
  list: (userId: UserId): Promise<MisconceptionsResponse> =>
    http.get(miscBase(userId)),

  detect: (userId: UserId): Promise<MisconceptionDetectionResponse> =>
    http.post(`${miscBase(userId)}/detect`),

  updateStatus: (
    userId: UserId,
    misconceptionId: string,
    data: UpdateMisconceptionStatusInput,
  ): Promise<MisconceptionResponse> =>
    http.patch(`${miscBase(userId)}/${misconceptionId}`, data),
};

// ============================================================================
// Comparison API
// ============================================================================

export const comparisonApi = {
  compare: (userId: UserId): Promise<ComparisonResponse> =>
    http.get(`/api/v1/users/${userId}/comparison`),
};
```

**Step 3: Create `knowledge-graph/hooks.ts`**

```typescript
/**
 * @noema/api-client - Knowledge Graph Service Hooks
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { EdgeId, MutationId, NodeId, UserId } from '@noema/types';
import {
  ckgEdgesApi,
  ckgMutationsApi,
  ckgNodesApi,
  ckgTraversalApi,
  comparisonApi,
  healthApi,
  metricsApi,
  misconceptionsApi,
  pkgEdgesApi,
  pkgNodesApi,
  pkgOperationsApi,
  pkgTraversalApi,
} from './api.js';
import type {
  CentralityDto,
  CkgMutationDto,
  CkgMutationFilters,
  CkgMutationResponse,
  CkgMutationsResponse,
  CommonAncestorsInput,
  ComparisonResponse,
  CreateEdgeInput,
  CreateNodeInput,
  EdgeResponse,
  FrontierResponse,
  GraphEdgeDto,
  GraphNodeDto,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
  MisconceptionDetectionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  PkgCkgComparisonDto,
  PrerequisiteChainResponse,
  SubgraphParams,
  SubgraphResponse,
  TopologyResponse,
  UpdateMisconceptionStatusInput,
  UpdateNodeInput,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const kgKeys = {
  all: ['kg'] as const,
  pkg: (userId: UserId) => [...kgKeys.all, 'pkg', userId] as const,
  pkgNodes: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'nodes'] as const,
  pkgNode: (userId: UserId, nodeId: NodeId) =>
    [...kgKeys.pkgNodes(userId), nodeId] as const,
  pkgEdges: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'edges'] as const,
  pkgEdge: (userId: UserId, edgeId: EdgeId) =>
    [...kgKeys.pkgEdges(userId), edgeId] as const,
  pkgSubgraph: (userId: UserId, params: SubgraphParams) =>
    [...kgKeys.pkg(userId), 'subgraph', params] as const,
  pkgPrerequisites: (userId: UserId, nodeId: NodeId) =>
    [...kgKeys.pkg(userId), 'prerequisites', nodeId] as const,
  pkgFrontier: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'frontier'] as const,
  pkgBridges: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'bridges'] as const,
  pkgCentrality: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'centrality'] as const,
  pkgTopology: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'topology'] as const,
  pkgOps: (userId: UserId) =>
    [...kgKeys.pkg(userId), 'operations'] as const,
  ckg: () => [...kgKeys.all, 'ckg'] as const,
  ckgNodes: () => [...kgKeys.ckg(), 'nodes'] as const,
  ckgEdges: () => [...kgKeys.ckg(), 'edges'] as const,
  ckgMutations: (filters?: CkgMutationFilters) =>
    [...kgKeys.ckg(), 'mutations', filters] as const,
  ckgMutation: (id: MutationId) =>
    [...kgKeys.ckg(), 'mutations', id] as const,
  metrics: (userId: UserId) =>
    [...kgKeys.all, 'metrics', userId] as const,
  metricHistory: (userId: UserId) =>
    [...kgKeys.metrics(userId), 'history'] as const,
  health: (userId: UserId) =>
    [...kgKeys.all, 'health', userId] as const,
  misconceptions: (userId: UserId) =>
    [...kgKeys.all, 'misconceptions', userId] as const,
  comparison: (userId: UserId) =>
    [...kgKeys.all, 'comparison', userId] as const,
};

// ============================================================================
// PKG Node Hooks
// ============================================================================

export function usePKGNodes(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<NodesListResponse, Error, GraphNodeDto[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.pkgNodes(userId),
    queryFn: () => pkgNodesApi.list(userId),
    select: (r) => r.data,
    enabled: !!userId,
    ...options,
  });
}

export function usePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<
    UseQueryOptions<NodeResponse, Error, GraphNodeDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.pkgNode(userId, nodeId),
    queryFn: () => pkgNodesApi.get(userId, nodeId),
    select: (r) => r.data,
    enabled: !!userId && !!nodeId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreatePKGNode(
  userId: UserId,
  options?: UseMutationOptions<NodeResponse, Error, CreateNodeInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

export function useUpdatePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<NodeResponse, Error, UpdateNodeInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.update(userId, nodeId, data),
    onSuccess: (response) => {
      queryClient.setQueryData(kgKeys.pkgNode(userId, nodeId), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

export function useDeletePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<void, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgNodesApi.delete(userId, nodeId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: kgKeys.pkgNode(userId, nodeId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Edge Hooks
// ============================================================================

export function usePKGEdges(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<EdgeResponse[] | ReturnType<typeof pkgEdgesApi.list>, Error, GraphEdgeDto[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.pkgEdges(userId),
    queryFn: () => pkgEdgesApi.list(userId),
    select: (r) => r.data,
    enabled: !!userId,
    ...options,
  });
}

export function useCreatePKGEdge(
  userId: UserId,
  options?: UseMutationOptions<EdgeResponse, Error, CreateEdgeInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgEdgesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

export function useDeletePKGEdge(
  userId: UserId,
  edgeId: EdgeId,
  options?: UseMutationOptions<void, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgEdgesApi.delete(userId, edgeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Traversal Hooks
// ============================================================================

export function usePKGSubgraph(
  userId: UserId,
  params: SubgraphParams,
  options?: Omit<UseQueryOptions<SubgraphResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.pkgSubgraph(userId, params),
    queryFn: () => pkgTraversalApi.getSubgraph(userId, params),
    enabled: !!userId && !!params.rootNodeId,
    ...options,
  });
}

export function usePKGPrerequisites(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<
    UseQueryOptions<PrerequisiteChainResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.pkgPrerequisites(userId, nodeId),
    queryFn: () => pkgTraversalApi.getPrerequisites(userId, nodeId),
    enabled: !!userId && !!nodeId,
    ...options,
  });
}

export function useKnowledgeFrontier(
  userId: UserId,
  options?: Omit<UseQueryOptions<FrontierResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.pkgFrontier(userId),
    queryFn: () => pkgTraversalApi.getFrontier(userId),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useBridgeNodes(
  userId: UserId,
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.pkgBridges(userId),
    queryFn: () => pkgTraversalApi.getBridges(userId),
    enabled: !!userId,
    ...options,
  });
}

export function useCentrality(
  userId: UserId,
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.pkgCentrality(userId),
    queryFn: () => pkgTraversalApi.getCentrality(userId),
    enabled: !!userId,
    ...options,
  });
}

export function useCommonAncestors(
  userId: UserId,
  options?: UseMutationOptions<NodesListResponse, Error, CommonAncestorsInput>,
) {
  return useMutation({
    mutationFn: (data) => pkgTraversalApi.getCommonAncestors(userId, data),
    ...options,
  });
}

// ============================================================================
// CKG Hooks
// ============================================================================

export function useCKGNodes(
  options?: Omit<
    UseQueryOptions<NodesListResponse, Error, GraphNodeDto[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.ckgNodes(),
    queryFn: ckgNodesApi.list,
    select: (r) => r.data,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useCKGEdges(
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.ckgEdges(),
    queryFn: ckgEdgesApi.list,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useCKGMutations(
  filters?: CkgMutationFilters,
  options?: Omit<
    UseQueryOptions<CkgMutationsResponse, Error, CkgMutationDto[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.ckgMutations(filters),
    queryFn: () => ckgMutationsApi.list(filters),
    select: (r) => r.data,
    ...options,
  });
}

export function useCKGMutation(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationResponse, Error, CkgMutationDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.ckgMutation(id),
    queryFn: () => ckgMutationsApi.get(id),
    select: (r) => r.data,
    enabled: !!id,
    ...options,
  });
}

export function useApproveMutation(
  options?: UseMutationOptions<
    CkgMutationResponse,
    Error,
    { id: MutationId; note?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.approve(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useRejectMutation(
  options?: UseMutationOptions<
    CkgMutationResponse,
    Error,
    { id: MutationId; note?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.reject(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

// ============================================================================
// Metrics + Health Hooks
// ============================================================================

export function useStructuralMetrics(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricsResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.metrics(userId),
    queryFn: () => metricsApi.get(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useMetricHistory(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<MetricHistoryResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.metricHistory(userId),
    queryFn: () => metricsApi.getHistory(userId),
    enabled: !!userId,
    ...options,
  });
}

export function useStructuralHealth(
  userId: UserId,
  options?: Omit<UseQueryOptions<HealthResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: kgKeys.health(userId),
    queryFn: () => healthApi.get(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// Misconception Hooks
// ============================================================================

export function useMisconceptions(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<MisconceptionsResponse>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.misconceptions(userId),
    queryFn: () => misconceptionsApi.list(userId),
    enabled: !!userId,
    ...options,
  });
}

export function useDetectMisconceptions(
  userId: UserId,
  options?: UseMutationOptions<MisconceptionDetectionResponse, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => misconceptionsApi.detect(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kgKeys.misconceptions(userId),
      });
    },
    ...options,
  });
}

export function useUpdateMisconceptionStatus(
  userId: UserId,
  options?: UseMutationOptions<
    unknown,
    Error,
    { id: string; data: UpdateMisconceptionStatusInput }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      misconceptionsApi.updateStatus(userId, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kgKeys.misconceptions(userId),
      });
    },
    ...options,
  });
}

// ============================================================================
// Comparison Hook
// ============================================================================

export function usePKGCKGComparison(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<ComparisonResponse, Error, PkgCkgComparisonDto>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: kgKeys.comparison(userId),
    queryFn: () => comparisonApi.compare(userId),
    select: (r) => r.data,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
```

**Step 4: Create `knowledge-graph/index.ts`**

```typescript
/**
 * @noema/api-client - Knowledge Graph Service Module
 */

export * from './api.js';
export * from './hooks.js';
export * from './types.js';
```

**Step 5: Typecheck + lint**

```bash
pnpm --filter @noema/api-client typecheck
pnpm --filter @noema/api-client lint
```

Fix issues. Common pitfall: `MisconceptionResponse` is used in `api.ts` but wasn't exported from `types.ts` — add it if missing.

**Step 6: Commit**

```bash
git add packages/api-client/src/knowledge-graph/
git commit -m "feat(api-client): add Knowledge Graph service module (PKG, CKG, metrics, misconceptions)"
```

---

## Task 6: HLR Sidecar Module

**Files:**
- Create: `packages/api-client/src/hlr/types.ts`
- Create: `packages/api-client/src/hlr/api.ts`
- Create: `packages/api-client/src/hlr/hooks.ts`
- Create: `packages/api-client/src/hlr/index.ts`

**Step 1: Create `hlr/types.ts`**

```typescript
/**
 * @noema/api-client - HLR Sidecar Types
 *
 * The HLR (Half-Life Regression) sidecar is a Python service that runs
 * separately from the main API. Its base URL is configured independently
 * via configureHlrClient().
 */

// ============================================================================
// HLR Types
// ============================================================================

export interface HLRPredictionInput {
  /** User ID for retrieval history lookup */
  userId: string;
  /** Card ID to predict recall for */
  cardId: string;
  /** Optional: timestamp to predict recall at (ISO 8601, defaults to now) */
  asOf?: string;
}

export interface HLRPredictionResult {
  cardId: string;
  recallProbability: number;
  halfLifeDays: number;
  predictedAt: string;
}

export interface HLRTrainInput {
  userId: string;
  cardId: string;
  /** Whether the card was recalled correctly */
  recalled: boolean;
  /** Time elapsed since last review in days */
  deltaT: number;
  /** Timestamp of the review */
  reviewedAt: string;
}

export interface HLRTrainResult {
  cardId: string;
  updatedHalfLife: number;
  trainedAt: string;
}

export interface HLRWeights {
  /** Intercept term */
  theta0: number;
  /** Half-life coefficient */
  theta1: number;
  /** Difficulty coefficient */
  theta2: number;
  /** Additional feature weights */
  extra: Record<string, number>;
  updatedAt: string;
}

export interface HLRHealthResult {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
}
```

**Step 2: Create `hlr/api.ts`**

The HLR sidecar needs a separate base URL. Pass it via `RequestConfig.baseUrl` from Task 0.

```typescript
/**
 * @noema/api-client - HLR Sidecar API
 *
 * All calls pass `baseUrl` to override the global API base URL.
 * Configure the sidecar URL with configureHlrClient().
 */

import { http } from '../client.js';
import type {
  HLRHealthResult,
  HLRPredictionInput,
  HLRPredictionResult,
  HLRTrainInput,
  HLRTrainResult,
  HLRWeights,
} from './types.js';

// ============================================================================
// HLR Base URL Config
// ============================================================================

let hlrBaseUrl: string | undefined;

/**
 * Configure the HLR sidecar base URL.
 * Call this during app startup alongside configureApiClient().
 *
 * @example
 * configureHlrClient('http://localhost:3005');
 */
export function configureHlrClient(baseUrl: string): void {
  hlrBaseUrl = baseUrl;
}

function getHlrBaseUrl(): string {
  if (!hlrBaseUrl) {
    throw new Error(
      'HLR client not configured. Call configureHlrClient(url) first.',
    );
  }
  return hlrBaseUrl;
}

// ============================================================================
// HLR API
// ============================================================================

export const hlrApi = {
  /** Health check for the HLR sidecar. */
  health: (): Promise<HLRHealthResult> =>
    http.get('/health', { baseUrl: getHlrBaseUrl() }),

  /** Predict recall probability and half-life for a card. */
  predict: (input: HLRPredictionInput): Promise<HLRPredictionResult> =>
    http.post('/predict', input, { baseUrl: getHlrBaseUrl() }),

  /** Online weight update after a review event. */
  train: (input: HLRTrainInput): Promise<HLRTrainResult> =>
    http.post('/train', input, { baseUrl: getHlrBaseUrl() }),

  /** Get current model weights. */
  getWeights: (): Promise<HLRWeights> =>
    http.get('/weights', { baseUrl: getHlrBaseUrl() }),

  /** Replace model weights (admin only). */
  putWeights: (weights: Omit<HLRWeights, 'updatedAt'>): Promise<HLRWeights> =>
    http.put('/weights', weights, { baseUrl: getHlrBaseUrl() }),
};
```

**Step 3: Create `hlr/hooks.ts`**

```typescript
/**
 * @noema/api-client - HLR Sidecar Hooks
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { hlrApi } from './api.js';
import type {
  HLRHealthResult,
  HLRPredictionInput,
  HLRPredictionResult,
  HLRTrainInput,
  HLRTrainResult,
  HLRWeights,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const hlrKeys = {
  all: ['hlr'] as const,
  health: () => [...hlrKeys.all, 'health'] as const,
  predict: (input: HLRPredictionInput) =>
    [...hlrKeys.all, 'predict', input] as const,
  weights: () => [...hlrKeys.all, 'weights'] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export function useHLRHealth(
  options?: Omit<
    UseQueryOptions<HLRHealthResult>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: hlrKeys.health(),
    queryFn: hlrApi.health,
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useHLRPredict(
  input: HLRPredictionInput,
  options?: Omit<
    UseQueryOptions<HLRPredictionResult>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: hlrKeys.predict(input),
    queryFn: () => hlrApi.predict(input),
    enabled: !!input.cardId && !!input.userId,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useHLRTrain(
  options?: UseMutationOptions<HLRTrainResult, Error, HLRTrainInput>,
) {
  return useMutation({
    mutationFn: hlrApi.train,
    ...options,
  });
}

export function useHLRWeights(
  options?: Omit<UseQueryOptions<HLRWeights>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: hlrKeys.weights(),
    queryFn: hlrApi.getWeights,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
```

**Step 4: Create `hlr/index.ts`**

```typescript
/**
 * @noema/api-client - HLR Sidecar Module
 */

export * from './api.js';
export * from './hooks.js';
export * from './types.js';
```

**Step 5: Typecheck + lint**

```bash
pnpm --filter @noema/api-client typecheck
pnpm --filter @noema/api-client lint
```

**Step 6: Commit**

```bash
git add packages/api-client/src/hlr/
git commit -m "feat(api-client): add HLR sidecar module with configureHlrClient() base URL support"
```

---

## Task 7: Package Wiring + Final Verification

**Files:**
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/api-client/package.json`

**Step 1: Update `src/index.ts`**

Replace the existing content:

```typescript
/**
 * @noema/api-client
 *
 * Type-safe API client for Noema services.
 */

// Client
export {
  ApiRequestError,
  configureApiClient,
  getApiConfig,
  http,
  request,
  type ApiClientConfig,
  type ApiError,
  type RequestConfig,
} from './client.js';

// User Service
export * from './user/index.js';

// Scheduler Service
export * from './scheduler/index.js';

// Content Service
export * from './content/index.js';

// Session Service
export * from './session/index.js';

// Knowledge Graph Service
export * from './knowledge-graph/index.js';

// HLR Sidecar
export * from './hlr/index.js';

// React Query Hooks (user + scheduler — for backward compat)
export * from './hooks/index.js';
```

**Step 2: Update `package.json` exports**

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./user": {
      "types": "./dist/user/index.d.ts",
      "import": "./dist/user/index.js"
    },
    "./scheduler": {
      "types": "./dist/scheduler/index.d.ts",
      "import": "./dist/scheduler/index.js"
    },
    "./content": {
      "types": "./dist/content/index.d.ts",
      "import": "./dist/content/index.js"
    },
    "./session": {
      "types": "./dist/session/index.d.ts",
      "import": "./dist/session/index.js"
    },
    "./knowledge-graph": {
      "types": "./dist/knowledge-graph/index.d.ts",
      "import": "./dist/knowledge-graph/index.js"
    },
    "./hlr": {
      "types": "./dist/hlr/index.d.ts",
      "import": "./dist/hlr/index.js"
    },
    "./hooks": {
      "types": "./dist/hooks/index.d.ts",
      "import": "./dist/hooks/index.js"
    }
  }
}
```

**Step 3: Full build**

```bash
pnpm --filter @noema/api-client build
```

Expected: zero errors, `dist/` populated.

**Step 4: Full typecheck**

```bash
pnpm --filter @noema/api-client typecheck
```

Expected: zero errors.

**Step 5: Lint**

```bash
pnpm --filter @noema/api-client lint
```

Fix all warnings/errors.

**Step 6: Verify web consumer**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero new errors from `@noema/api-client`.

**Step 7: Commit**

```bash
git add packages/api-client/src/index.ts packages/api-client/package.json
git commit -m "feat(api-client): wire all Phase 02 module exports and package.json sub-paths"
```

---

## Acceptance Checklist

- [ ] `pnpm --filter @noema/api-client build` — clean
- [ ] `pnpm --filter @noema/api-client typecheck` — zero errors
- [ ] `pnpm --filter @noema/api-client lint` — zero errors
- [ ] `pnpm --filter @noema/web typecheck` — no new errors
- [ ] All 5 new modules importable from `@noema/api-client`
- [ ] Sub-path imports work: `@noema/api-client/content`, `/session`, `/knowledge-graph`, `/hlr`, `/scheduler`
- [ ] `configureHlrClient()` exported and documented
- [ ] `IApiResponse<T>` used on all new response types
- [ ] Query key factories are deterministic and serializable
- [ ] Mutations invalidate related queries
- [ ] `useUpdateCard` has optimistic update with rollback
