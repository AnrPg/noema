/**
 * @noema/events - Content Domain Events
 *
 * Event definitions for content domain events.
 * Payload types are self-contained (inlined rather than referencing
 * service-local types) so that event consumers in any service can
 * use them without importing content-service internals.
 *
 * @see EVENT_SCHEMA_SPECIFICATION
 */

import type {
  CardId,
  CardOriginMode,
  CardReviewState,
  CardState,
  CardTransformKind,
  CardType,
  ConceptId,
  ContentGenerationJobId,
  ContentGenerationJobStatus,
  DifficultyLevel,
  EventSource,
  NodeId,
  RemediationCardType,
} from '@noema/types';
import type { ITypedEvent } from '../types.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * All content event types.
 */
export const ContentEventType = {
  CARD_CREATED: 'card.created',
  CARD_UPDATED: 'card.updated',
  CARD_DELETED: 'card.deleted',
  CARD_STATE_CHANGED: 'card.state.changed',
  CARD_TAGS_UPDATED: 'card.tags.updated',
  CARD_NODES_UPDATED: 'card.nodes.updated',
  BATCH_CREATED: 'card.batch.created',
  CONCEPTS_EXTRACTED: 'concepts.extracted',
  CARD_TRANSFORMATION_CREATED: 'card.transformation.created',
  CARD_REVIEW_STATE_CHANGED: 'card.review_state.changed',
  CARD_METADATA_COMPLETED: 'card.metadata.completed',
  CONTENT_GENERATION_REQUESTED: 'content.generation.requested',
  CONTENT_GENERATION_COMPLETED: 'content.generation.completed',
  CONTENT_GENERATION_FAILED: 'content.generation.failed',
  CONTENT_COVERAGE_UPDATED: 'content.coverage.updated',
} as const;

export type ContentEventType = (typeof ContentEventType)[keyof typeof ContentEventType];

// ============================================================================
// Event Payload Snapshot Types
// ============================================================================

/**
 * Snapshot of a Card entity as carried in events.
 *
 * Self-contained — mirrors the content-service ICard interface at the
 * time of event publication without importing service-local types.
 * The Zod schema (`CardEntitySchema`) validates the exact shape.
 */
export interface ICardEntitySnapshot {
  id: CardId;
  userId: string;
  cardType: CardType | RemediationCardType;
  state: CardState;
  difficulty: DifficultyLevel;
  content: Record<string, unknown>;
  knowledgeNodeIds: NodeId[];
  anchoredCkgNodeIds: ConceptId[];
  anchoredPkgNodeIds: NodeId[];
  tags: string[];
  source: EventSource;
  originMode: CardOriginMode;
  reviewState: CardReviewState;
  sourceDocumentIds: string[];
  factualityScore: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
}

/**
 * Card update changes as carried in events.
 * Each field is optional — only changed fields are present.
 */
export interface ICardUpdateChanges {
  content?: Record<string, unknown>;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Event Payloads
// ============================================================================

/**
 * Payload for card.created event.
 */
export interface ICardCreatedPayload {
  entity: ICardEntitySnapshot;
  source: string;
  originMode: CardOriginMode;
  reviewState: CardReviewState;
  batchOperation?: boolean;
}

/**
 * Payload for card.updated event.
 */
export interface ICardUpdatedPayload {
  changes: ICardUpdateChanges;
  previousVersion: number;
}

/**
 * Payload for card.deleted event.
 */
export interface ICardDeletedPayload {
  cardType: CardType | RemediationCardType;
  soft: boolean;
}

/**
 * Payload for card.state.changed event.
 */
export interface ICardStateChangedPayload {
  previousState: CardState;
  newState: CardState;
  reason?: string;
}

/**
 * Payload for card.tags.updated event.
 */
export interface ICardTagsUpdatedPayload {
  tags: string[];
}

/**
 * Payload for card.nodes.updated event.
 */
export interface ICardNodesUpdatedPayload {
  knowledgeNodeIds: string[];
}

/**
 * Payload for card.batch.created event.
 */
export interface IBatchCreatedPayload {
  total: number;
  successCount: number;
  failureCount: number;
  cardIds: CardId[];
}

/**
 * Payload for concepts.extracted event.
 */
export interface IConceptsExtractedPayload {
  conceptIds: NodeId[];
  cardIds: CardId[];
  source: string;
}

export interface ICardTransformationCreatedPayload {
  parentCardId: CardId;
  variantCardId: CardId;
  transformationKind: CardTransformKind;
  transformationAgentRunId?: string | null;
}

export interface ICardReviewStateChangedPayload {
  previousReviewState: CardReviewState;
  newReviewState: CardReviewState;
  reason?: string;
}

export interface ICardMetadataCompletedPayload {
  cardId: CardId;
  anchoredCkgNodeIds: ConceptId[];
  anchoredPkgNodeIds: NodeId[];
  tags: string[];
}

export interface IContentGenerationJobPayload {
  jobId: ContentGenerationJobId;
  userId: string;
  mode: CardOriginMode;
  status: ContentGenerationJobStatus;
  conceptIds: ConceptId[];
  documentIds: string[];
}

export interface IContentGenerationCompletedPayload extends IContentGenerationJobPayload {
  createdCardIds: CardId[];
  rejectedDraftCount: number;
}

export interface IContentGenerationFailedPayload extends IContentGenerationJobPayload {
  errorMessage: string;
}

export interface IContentCoverageUpdatedPayload {
  userId: string;
  conceptId: ConceptId;
  activeCardCount: number;
  distinctActiveCardTypes: number;
  pendingReviewCount: number;
  metadataIncompleteCount: number;
}

// ============================================================================
// Typed Events
// ============================================================================

export type CardCreatedEvent = ITypedEvent<'card.created', 'Card', ICardCreatedPayload>;
export type CardUpdatedEvent = ITypedEvent<'card.updated', 'Card', ICardUpdatedPayload>;
export type CardDeletedEvent = ITypedEvent<'card.deleted', 'Card', ICardDeletedPayload>;
export type CardStateChangedEvent = ITypedEvent<
  'card.state.changed',
  'Card',
  ICardStateChangedPayload
>;
export type CardTagsUpdatedEvent = ITypedEvent<
  'card.tags.updated',
  'Card',
  ICardTagsUpdatedPayload
>;
export type CardNodesUpdatedEvent = ITypedEvent<
  'card.nodes.updated',
  'Card',
  ICardNodesUpdatedPayload
>;
export type BatchCreatedEvent = ITypedEvent<'card.batch.created', 'Card', IBatchCreatedPayload>;
export type ConceptsExtractedEvent = ITypedEvent<
  'concepts.extracted',
  'ContentImport',
  IConceptsExtractedPayload
>;
export type CardTransformationCreatedEvent = ITypedEvent<
  'card.transformation.created',
  'Card',
  ICardTransformationCreatedPayload
>;
export type CardReviewStateChangedEvent = ITypedEvent<
  'card.review_state.changed',
  'Card',
  ICardReviewStateChangedPayload
>;
export type CardMetadataCompletedEvent = ITypedEvent<
  'card.metadata.completed',
  'Card',
  ICardMetadataCompletedPayload
>;
export type ContentGenerationRequestedEvent = ITypedEvent<
  'content.generation.requested',
  'ContentGenerationJob',
  IContentGenerationJobPayload
>;
export type ContentGenerationCompletedEvent = ITypedEvent<
  'content.generation.completed',
  'ContentGenerationJob',
  IContentGenerationCompletedPayload
>;
export type ContentGenerationFailedEvent = ITypedEvent<
  'content.generation.failed',
  'ContentGenerationJob',
  IContentGenerationFailedPayload
>;
export type ContentCoverageUpdatedEvent = ITypedEvent<
  'content.coverage.updated',
  'ConceptCardCoverage',
  IContentCoverageUpdatedPayload
>;

/**
 * Union of all content domain events.
 */
export type ContentDomainEvent =
  | CardCreatedEvent
  | CardUpdatedEvent
  | CardDeletedEvent
  | CardStateChangedEvent
  | CardTagsUpdatedEvent
  | CardNodesUpdatedEvent
  | BatchCreatedEvent
  | ConceptsExtractedEvent
  | CardTransformationCreatedEvent
  | CardReviewStateChangedEvent
  | CardMetadataCompletedEvent
  | ContentGenerationRequestedEvent
  | ContentGenerationCompletedEvent
  | ContentGenerationFailedEvent
  | ContentCoverageUpdatedEvent;
