/**
 * @noema/api-client - Content Service Types
 *
 * DTOs for Content Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId, CategoryId, JobId, MediaId, NodeId, TemplateId, UserId } from '@noema/types';

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

/**
 * Discriminated union of all card content types, enveloped with the `type`
 * discriminant. Used in history snapshots, card creation/update inputs, and
 * anywhere the type + content pair travel together as a unit.
 */
export type CardContentDto =
  | { type: 'basic'; content: IBasicCardContent }
  | { type: 'cloze'; content: IClozeCardContent }
  | { type: 'short_answer'; content: IShortAnswerCardContent }
  | { type: 'multiple_choice'; content: IMultipleChoiceCardContent }
  | { type: 'true_false'; content: ITrueFalseCardContent };

/**
 * Union of raw card structure objects (without the `type` envelope).
 * Used by template `structure` fields where the discriminant is carried on
 * the parent object rather than inside the structure itself.
 */
export type CardStructure =
  | IBasicCardContent
  | IClozeCardContent
  | IShortAnswerCardContent
  | IMultipleChoiceCardContent
  | ITrueFalseCardContent;

// ============================================================================
// Card DTO
// ============================================================================

/**
 * Shared fields present on all card variants.
 * Not exported — consumers should use `CardDto` (the discriminated union type).
 */
interface ICardDtoBase {
  id: CardId;
  userId: UserId;
  state: CardState;
  learningState: CardLearningState;
  tags: string[];
  categoryId: CategoryId | null;
  templateId: TemplateId | null;
  nodeLinks: NodeId[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * A card returned from the API. The `type` field discriminates which `content`
 * variant is present, enabling full narrowing:
 *
 * @example
 * if (card.type === 'basic') {
 *   // card.content is narrowed to IBasicCardContent
 *   console.log(card.content.front);
 * }
 */
export type CardDto =
  | (ICardDtoBase & { type: 'basic'; content: IBasicCardContent })
  | (ICardDtoBase & { type: 'cloze'; content: IClozeCardContent })
  | (ICardDtoBase & { type: 'short_answer'; content: IShortAnswerCardContent })
  | (ICardDtoBase & { type: 'multiple_choice'; content: IMultipleChoiceCardContent })
  | (ICardDtoBase & { type: 'true_false'; content: ITrueFalseCardContent });

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

/**
 * Shared fields present on all template variants.
 * Not exported — consumers should use `TemplateDto` (the discriminated union type).
 */
interface ITemplateDtoBase {
  id: TemplateId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A template returned from the API. The `type` field discriminates which
 * `structure` variant is present, enabling full narrowing:
 *
 * @example
 * if (template.type === 'basic') {
 *   // template.structure is narrowed to IBasicCardContent
 *   console.log(template.structure.front);
 * }
 */
export type TemplateDto =
  | (ITemplateDtoBase & { type: 'basic'; structure: IBasicCardContent })
  | (ITemplateDtoBase & { type: 'cloze'; structure: IClozeCardContent })
  | (ITemplateDtoBase & { type: 'short_answer'; structure: IShortAnswerCardContent })
  | (ITemplateDtoBase & { type: 'multiple_choice'; structure: IMultipleChoiceCardContent })
  | (ITemplateDtoBase & { type: 'true_false'; structure: ITrueFalseCardContent });

/**
 * Input for creating a new template. The `type` discriminant determines which
 * `structure` shape is required.
 */
export type CreateTemplateInput =
  | { name: string; type: 'basic'; structure: IBasicCardContent }
  | { name: string; type: 'cloze'; structure: IClozeCardContent }
  | { name: string; type: 'short_answer'; structure: IShortAnswerCardContent }
  | { name: string; type: 'multiple_choice'; structure: IMultipleChoiceCardContent }
  | { name: string; type: 'true_false'; structure: ITrueFalseCardContent };

/**
 * Input for partially updating an existing template. Because this is a partial
 * update the caller may omit `type`, so `structure` is typed as the raw union
 * of all content shapes (`CardStructure`) rather than a discriminated envelope.
 */
export interface IUpdateTemplateInput {
  name?: string;
  structure?: CardStructure;
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
  /** Branded job identifier for tracking the asynchronous batch operation. */
  batchId: JobId;
  created: number;
  failed: number;
  errors: IBatchCreateError[];
}

// ============================================================================
// Cursor Pagination
// ============================================================================

export interface ICardsCursorResult {
  cards: CardDto[];
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

export type CardResponse = IApiResponse<CardDto>;
export type CardsListResponse = IApiResponse<CardDto[]>;
export type CardStatsResponse = IApiResponse<ICardStatsDto>;
export type CardHistoryResponse = IApiResponse<ICardHistoryDto>;
export type CardVersionResponse = IApiResponse<ICardVersionSnapshot>;
export type BatchCreateResponse = IApiResponse<IBatchCreateResult>;
export type TemplateResponse = IApiResponse<TemplateDto>;
export type TemplatesListResponse = IApiResponse<TemplateDto[]>;
export type MediaResponse = IApiResponse<IMediaFileDto>;
export type UploadUrlResponse = IApiResponse<IUploadUrlResult>;
export type SessionSeedResponse = IApiResponse<ISessionSeedDto>;
export type CardsCursorResponse = IApiResponse<ICardsCursorResult>;
export type CardCountResponse = IApiResponse<ICardCountResult>;
export type CardValidationResponse = IApiResponse<ICardValidationResult>;
