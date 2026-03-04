/**
 * @noema/api-client - Content Service API
 *
 * HTTP wrappers for Content Service endpoints.
 */

import type { CardId, JobId, MediaId, TemplateId } from '@noema/types';

import { http } from '../client.js';
import type {
  BatchCreateResponse,
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
    http.post('/v1/cards/query', query),

  /** Cursor-paginated card list. */
  getCardsCursor: (query: IDeckQueryInput): Promise<CardsCursorResponse> =>
    http.post('/v1/cards/cursor', query),

  /** Count cards matching a DeckQuery. */
  countCards: (query: IDeckQueryInput): Promise<CardCountResponse> =>
    http.post('/v1/cards/count', query),

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

  /** Poll a batch creation job by jobId. */
  getBatch: (batchId: JobId): Promise<BatchCreateResponse> =>
    http.get(`/v1/cards/batch/${batchId}`),

  /** Cancel a pending batch creation job. */
  deleteBatch: (batchId: JobId): Promise<void> => http.delete(`/v1/cards/batch/${batchId}`),

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
