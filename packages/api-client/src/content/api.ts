/**
 * @noema/api-client - Content Service API
 *
 * HTTP wrappers for Content Service endpoints.
 */

import type { CardId, JobId, MediaId, TemplateId } from '@noema/types';

import { http } from '../client.js';
import type {
  BatchCardsResponse,
  BatchCreateResponse,
  CardImportExecuteResponse,
  CardImportPreviewResponse,
  BatchSummariesResponse,
  CardCountResponse,
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
  ICardImportExecuteInput,
  ICardImportPreviewInput,
  ICreateCardInput,
  IDeckQueryInput,
  ISessionSeedQuery,
  IUpdateCardInput,
  IUpdateCardNodeLinksInput,
  IUpdateCardStateInput,
  IUpdateCardTagsInput,
  IUpdateTemplateInput,
  MediaResponse,
  SessionSeedResponse,
  TemplateResponse,
  TemplatesListResponse,
  UploadUrlResponse,
} from './types.js';

function normalizeCardState(state: string): string {
  return state.toLowerCase();
}

function normalizeDeckQuery(query: IDeckQueryInput): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if (query.search !== undefined && query.search !== '') normalized['search'] = query.search;
  if (query.cardTypes !== undefined && query.cardTypes.length > 0) {
    normalized['cardTypes'] = query.cardTypes;
  }
  if (query.states !== undefined && query.states.length > 0) {
    normalized['states'] = query.states.map(normalizeCardState);
  }
  if (query.supportedStudyModes !== undefined && query.supportedStudyModes.length > 0) {
    normalized['supportedStudyModes'] = query.supportedStudyModes;
  }
  if (query.tags !== undefined && query.tags.length > 0) normalized['tags'] = query.tags;
  if (query.knowledgeNodeIds !== undefined && query.knowledgeNodeIds.length > 0) {
    normalized['knowledgeNodeIds'] = query.knowledgeNodeIds;
  }

  const sources =
    query.sources !== undefined && query.sources.length > 0
      ? query.sources
      : query.source !== undefined && query.source !== ''
        ? [query.source]
        : undefined;
  if (sources !== undefined) normalized['sources'] = sources;

  if (query.sortBy !== undefined && query.sortBy !== 'nextReviewAt') {
    normalized['sortBy'] = query.sortBy;
  }

  const sortOrder = query.sortOrder ?? query.sortDir;
  if (sortOrder !== undefined) normalized['sortOrder'] = sortOrder;

  if (query.limit !== undefined) normalized['limit'] = query.limit;
  if (query.offset !== undefined) normalized['offset'] = query.offset;

  return normalized;
}

// ============================================================================
// Cards API
// ============================================================================

export const cardsApi = {
  /** Create a new card. */
  createCard: (data: ICreateCardInput): Promise<CardResponse> => http.post('/v1/cards', data),

  /** Get a card by ID. */
  getCard: (id: CardId): Promise<CardResponse> => http.get(`/v1/cards/${id}`),

  /** Update a card's content or metadata. */
  updateCard: (id: CardId, data: IUpdateCardInput): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}`, data),

  /** Soft-delete a card. */
  deleteCard: (id: CardId): Promise<void> => http.delete(`/v1/cards/${id}`),

  /** Restore a soft-deleted card. */
  restoreCard: (id: CardId): Promise<CardResponse> => http.post(`/v1/cards/${id}/restore`),

  /** Query cards by DeckQuery filters (returns flat list). */
  queryCards: (query: IDeckQueryInput): Promise<CardsListResponse> =>
    http.post('/v1/cards/query', normalizeDeckQuery(query)),

  /** Cursor-paginated card list. */
  getCardsCursor: (query: IDeckQueryInput): Promise<CardsCursorResponse> =>
    http.get('/v1/cards/cursor', {
      params: normalizeDeckQuery(query) as Record<string, string | number | boolean | undefined>,
    }),

  /** Count cards matching a DeckQuery. */
  countCards: (query: IDeckQueryInput): Promise<CardCountResponse> =>
    http.post('/v1/cards/count', normalizeDeckQuery(query)),

  /** Aggregate card statistics for current user. */
  getCardStats: (): Promise<CardStatsResponse> => http.get('/v1/cards/stats'),

  /** Transition card to a new FSM state. */
  updateCardState: (id: CardId, data: IUpdateCardStateInput): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/state`, data),

  /** Batch FSM state transition for multiple cards. */
  batchUpdateState: (data: IBatchStateUpdateInput): Promise<void> =>
    http.post('/v1/cards/batch/state', data),

  /** Replace all tags on a card. */
  updateCardTags: (id: CardId, data: IUpdateCardTagsInput): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/tags`, data),

  /** Replace all node links on a card. */
  updateCardNodeLinks: (id: CardId, data: IUpdateCardNodeLinksInput): Promise<CardResponse> =>
    http.patch(`/v1/cards/${id}/node-links`, data),

  /** Validate card content without persisting. */
  validateCard: (data: ICreateCardInput): Promise<CardValidationResponse> =>
    http.post('/v1/cards/validate', data),

  /** Get full version history for a card. */
  getCardHistory: (id: CardId): Promise<CardHistoryResponse> => http.get(`/v1/cards/${id}/history`),

  /** Get a specific version snapshot. */
  getCardVersion: (id: CardId, version: number): Promise<CardVersionResponse> =>
    http.get(`/v1/cards/${id}/history/${String(version)}`),

  /** Initiate a batch card creation job. */
  batchCreateCards: (data: IBatchCreateInput): Promise<BatchCreateResponse> =>
    http.post('/v1/cards/batch', data),

  /** Preview a structured file import before execution. */
  previewImport: (data: ICardImportPreviewInput): Promise<CardImportPreviewResponse> =>
    http.post('/v1/cards/import/preview', data),

  /** Execute a structured file import into tracked batch cards. */
  executeImport: (data: ICardImportExecuteInput): Promise<CardImportExecuteResponse> =>
    http.post('/v1/cards/import/execute', data),

  /** Poll a batch creation job by jobId. */
  getBatch: (batchId: JobId): Promise<BatchCardsResponse> => http.get(`/v1/cards/batch/${batchId}`),

  /** Cancel a pending batch creation job. */
  deleteBatch: (batchId: JobId): Promise<void> => http.delete(`/v1/cards/batch/${batchId}`),

  /** Get recent card creation batches for the current user. */
  findRecentBatches: (limit?: number): Promise<BatchSummariesResponse> =>
    http.get('/v1/cards/batch/recent', { params: { limit } }),

  /** Build a session seed (ordered card IDs) from a DeckQuery. */
  getSessionSeed: (query: ISessionSeedQuery): Promise<SessionSeedResponse> =>
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
  getTemplate: (id: TemplateId): Promise<TemplateResponse> => http.get(`/v1/templates/${id}`),

  /** Update a template. */
  updateTemplate: (id: TemplateId, data: IUpdateTemplateInput): Promise<TemplateResponse> =>
    http.patch(`/v1/templates/${id}`, data),

  /** Delete a template. */
  deleteTemplate: (id: TemplateId): Promise<void> => http.delete(`/v1/templates/${id}`),

  /** List all templates for current user. */
  listTemplates: (): Promise<TemplatesListResponse> => http.get('/v1/templates'),
};

// ============================================================================
// Media API
// ============================================================================

export const mediaApi = {
  /** Request a pre-signed upload URL and reserve a MediaId. */
  requestUploadUrl: (filename: string, mimeType: string): Promise<UploadUrlResponse> =>
    http.post('/v1/media/upload-url', { filename, mimeType }),

  /** Confirm that a direct upload completed successfully. */
  confirmUpload: (id: MediaId): Promise<MediaResponse> => http.post(`/v1/media/${id}/confirm`),

  /** Get media file metadata by ID. */
  getMedia: (id: MediaId): Promise<MediaResponse> => http.get(`/v1/media/${id}`),

  /** Delete a media file. */
  deleteMedia: (id: MediaId): Promise<void> => http.delete(`/v1/media/${id}`),
};
