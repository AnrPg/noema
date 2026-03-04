/**
 * @noema/api-client - Content Service Types
 *
 * DTOs for Content Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId, CategoryId, MediaId, NodeId, TemplateId, UserId } from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type CardType = 'basic' | 'cloze' | 'short_answer' | 'multiple_choice' | 'true_false';

export type CardState = 'draft' | 'active' | 'archived' | 'deleted';

export type CardLearningState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';

// ============================================================================
// Card Content (polymorphic by CardType)
// ============================================================================

export interface IBasicCardContent {
  front: string;
  back: string;
}

export interface IClozeCardContent {
  text: string;
  /** Cloze deletions — substrings of `text` that should be hidden */
  cloze: string[];
}

export interface IShortAnswerCardContent {
  question: string;
  answer: string;
  acceptedAnswers?: string[];
}

export interface IMultipleChoiceCardContent {
  question: string;
  choices: string[];
  correctIndex: number;
}

export interface ITrueFalseCardContent {
  statement: string;
  isTrue: boolean;
}

export type CardContentDto =
  | { type: 'basic'; content: IBasicCardContent }
  | { type: 'cloze'; content: IClozeCardContent }
  | { type: 'short_answer'; content: IShortAnswerCardContent }
  | { type: 'multiple_choice'; content: IMultipleChoiceCardContent }
  | { type: 'true_false'; content: ITrueFalseCardContent };

// ============================================================================
// Card DTO
// ============================================================================

export interface ICardDto {
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

export interface IDeckQueryInput {
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

export interface ICardStatsDto {
  total: number;
  byState: Record<CardState, number>;
  byLearningState: Record<CardLearningState, number>;
  byType: Record<CardType, number>;
}

// ============================================================================
// History
// ============================================================================

export interface ICardVersionSnapshot {
  version: number;
  content: CardContentDto;
  changedAt: string;
  changedBy: UserId;
}

export interface ICardHistoryDto {
  cardId: CardId;
  snapshots: ICardVersionSnapshot[];
}

// ============================================================================
// Templates
// ============================================================================

export interface ITemplateDto {
  id: TemplateId;
  name: string;
  type: CardType;
  structure: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateTemplateInput {
  name: string;
  type: CardType;
  structure: Record<string, unknown>;
}

export interface IUpdateTemplateInput {
  name?: string;
  structure?: Record<string, unknown>;
}

// ============================================================================
// Media
// ============================================================================

export interface IMediaFileDto {
  id: MediaId;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface IUploadUrlResult {
  uploadUrl: string;
  mediaId: MediaId;
}

// ============================================================================
// Batch Operations
// ============================================================================

export interface IBatchCreateInput {
  cards: ICreateCardInput[];
}

export interface IBatchCreateError {
  index: number;
  error: string;
}

export interface IBatchCreateResult {
  batchId: string;
  created: number;
  failed: number;
  errors: IBatchCreateError[];
}

// ============================================================================
// Cursor Pagination
// ============================================================================

export interface ICardsCursorResult {
  cards: ICardDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ICardCountResult {
  count: number;
}

// ============================================================================
// Session Seed
// ============================================================================

export interface ISessionSeedQuery {
  deckQuery: IDeckQueryInput;
  limit?: number;
}

export interface ISessionSeedDto {
  cardIds: CardId[];
  totalAvailable: number;
}

// ============================================================================
// Validation
// ============================================================================

export interface ICardValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Create / Update Inputs
// ============================================================================

export interface ICreateCardInput {
  type: CardType;
  content: CardContentDto;
  tags?: string[];
  categoryId?: CategoryId;
  templateId?: TemplateId;
  nodeLinks?: NodeId[];
}

export interface IUpdateCardInput {
  content?: CardContentDto;
  tags?: string[];
  categoryId?: CategoryId | null;
  nodeLinks?: NodeId[];
}

export interface IUpdateCardStateInput {
  state: CardState;
}

export interface IBatchStateUpdateInput {
  cardIds: CardId[];
  state: CardState;
}

export interface IUpdateCardTagsInput {
  tags: string[];
}

export interface IUpdateCardNodeLinksInput {
  nodeLinks: NodeId[];
}

// ============================================================================
// Response aliases
// ============================================================================

export type CardResponse = IApiResponse<ICardDto>;
export type CardsListResponse = IApiResponse<ICardDto[]>;
export type CardStatsResponse = IApiResponse<ICardStatsDto>;
export type CardHistoryResponse = IApiResponse<ICardHistoryDto>;
export type CardVersionResponse = IApiResponse<ICardVersionSnapshot>;
export type BatchCreateResponse = IApiResponse<IBatchCreateResult>;
export type TemplateResponse = IApiResponse<ITemplateDto>;
export type TemplatesListResponse = IApiResponse<ITemplateDto[]>;
export type MediaResponse = IApiResponse<IMediaFileDto>;
export type UploadUrlResponse = IApiResponse<IUploadUrlResult>;
export type SessionSeedResponse = IApiResponse<ISessionSeedDto>;
export type CardsCursorResponse = IApiResponse<ICardsCursorResult>;
export type CardCountResponse = IApiResponse<ICardCountResult>;
export type CardValidationResponse = IApiResponse<ICardValidationResult>;
