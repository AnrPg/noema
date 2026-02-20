/**
 * @noema/content-service - Content Events
 *
 * Event definitions for content domain events.
 * Follow EVENT_SCHEMA_SPECIFICATION patterns.
 */

import type { ITypedEvent } from '@noema/events';
import type { CardId, CardState, CardType, RemediationCardType } from '@noema/types';
import type { ICard, IUpdateCardInput } from '../types/content.types.js';

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
// Event Payloads
// ============================================================================

/**
 * Payload for card.created event.
 */
export interface ICardCreatedPayload {
  entity: ICard;
  source: string;
  batchOperation?: boolean;
}

/**
 * Payload for card.updated event.
 */
export interface ICardUpdatedPayload {
  changes: IUpdateCardInput;
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
  nodeIds: string[];
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
