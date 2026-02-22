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

import type { CardId, CardState, CardType, DifficultyLevel, EventSource, NodeId, RemediationCardType } from '@noema/types';
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
  tags: string[];
  source: EventSource;
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

// ============================================================================
// Typed Events
// ============================================================================

export type CardCreatedEvent = ITypedEvent<'card.created', 'Card', ICardCreatedPayload>;
export type CardUpdatedEvent = ITypedEvent<'card.updated', 'Card', ICardUpdatedPayload>;
export type CardDeletedEvent = ITypedEvent<'card.deleted', 'Card', ICardDeletedPayload>;
export type CardStateChangedEvent = ITypedEvent<'card.state.changed', 'Card', ICardStateChangedPayload>;
export type CardTagsUpdatedEvent = ITypedEvent<'card.tags.updated', 'Card', ICardTagsUpdatedPayload>;
export type CardNodesUpdatedEvent = ITypedEvent<'card.nodes.updated', 'Card', ICardNodesUpdatedPayload>;
export type BatchCreatedEvent = ITypedEvent<'card.batch.created', 'Card', IBatchCreatedPayload>;

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
  | BatchCreatedEvent;
