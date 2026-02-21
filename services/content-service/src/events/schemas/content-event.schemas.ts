/**
 * @noema/content-service - Content Event Zod Schemas
 *
 * Runtime validation schemas for content domain events.
 * Uses `createEventSchema()` from @noema/events for the envelope
 * and defines typed payload schemas for each event.
 *
 * These schemas are used by event consumers to validate incoming events
 * and by the publisher to assert outbound event structure.
 */

import { createEventSchema } from '@noema/events';
import {
  CardIdSchema,
  CardStateSchema,
  CardTypeSchema,
  EventSourceSchema,
  NodeIdSchema,
  RemediationCardTypeSchema,
} from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// Payload Schemas
// ============================================================================

/**
 * Schema for the polymorphic card entity within events.
 *
 * Validates the structural envelope of a card object.
 * Content blob is validated as `z.record(z.unknown())` because
 * the 42 type-specific schemas are enforced at the API/service layer,
 * not re-validated inside events.
 */
const CardEntitySchema = z.object({
  id: CardIdSchema,
  userId: z.string().min(1),
  cardType: z.union([CardTypeSchema, RemediationCardTypeSchema]),
  state: CardStateSchema,
  difficulty: z.string().min(1),
  content: z.record(z.unknown()),
  knowledgeNodeIds: z.array(NodeIdSchema),
  tags: z.array(z.string()),
  source: EventSourceSchema,
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  version: z.number().int().positive(),
  deletedAt: z.string().datetime().nullable(),
});

/**
 * Payload for `card.created` event.
 */
export const CardCreatedPayloadSchema = z.object({
  entity: CardEntitySchema,
  source: z.string().min(1),
  batchOperation: z.boolean().optional(),
});

/**
 * Payload for `card.updated` event.
 */
export const CardUpdatedPayloadSchema = z.object({
  changes: z
    .object({
      content: z.record(z.unknown()).optional(),
      difficulty: z.string().optional(),
      knowledgeNodeIds: z.array(NodeIdSchema).optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .describe('Fields that were changed'),
  previousVersion: z.number().int().positive(),
});

/**
 * Payload for `card.deleted` event.
 */
export const CardDeletedPayloadSchema = z.object({
  cardType: z.union([CardTypeSchema, RemediationCardTypeSchema]),
  soft: z.boolean(),
});

/**
 * Payload for `card.state.changed` event.
 */
export const CardStateChangedPayloadSchema = z.object({
  previousState: CardStateSchema,
  newState: CardStateSchema,
  reason: z.string().optional(),
});

/**
 * Payload for `card.tags.updated` event.
 */
export const CardTagsUpdatedPayloadSchema = z.object({
  tags: z.array(z.string()),
});

/**
 * Payload for `card.nodes.updated` event.
 */
export const CardNodesUpdatedPayloadSchema = z.object({
  knowledgeNodeIds: z.array(z.string()),
});

/**
 * Payload for `card.batch.created` event.
 */
export const BatchCreatedPayloadSchema = z.object({
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  cardIds: z.array(CardIdSchema),
});

// ============================================================================
// Full Event Schemas (envelope + typed payload)
// ============================================================================

export const CardCreatedEventSchema = createEventSchema(
  'card.created',
  'Card',
  CardCreatedPayloadSchema
);

export const CardUpdatedEventSchema = createEventSchema(
  'card.updated',
  'Card',
  CardUpdatedPayloadSchema
);

export const CardDeletedEventSchema = createEventSchema(
  'card.deleted',
  'Card',
  CardDeletedPayloadSchema
);

export const CardStateChangedEventSchema = createEventSchema(
  'card.state.changed',
  'Card',
  CardStateChangedPayloadSchema
);

export const CardTagsUpdatedEventSchema = createEventSchema(
  'card.tags.updated',
  'Card',
  CardTagsUpdatedPayloadSchema
);

export const CardNodesUpdatedEventSchema = createEventSchema(
  'card.nodes.updated',
  'Card',
  CardNodesUpdatedPayloadSchema
);

export const BatchCreatedEventSchema = createEventSchema(
  'card.batch.created',
  'Card',
  BatchCreatedPayloadSchema
);

// ============================================================================
// Type Inference
// ============================================================================

export type CardCreatedEventInput = z.input<typeof CardCreatedEventSchema>;
export type CardUpdatedEventInput = z.input<typeof CardUpdatedEventSchema>;
export type CardDeletedEventInput = z.input<typeof CardDeletedEventSchema>;
export type CardStateChangedEventInput = z.input<typeof CardStateChangedEventSchema>;
export type CardTagsUpdatedEventInput = z.input<typeof CardTagsUpdatedEventSchema>;
export type CardNodesUpdatedEventInput = z.input<typeof CardNodesUpdatedEventSchema>;
export type BatchCreatedEventInput = z.input<typeof BatchCreatedEventSchema>;
