/**
 * @noema/events - Content Event Zod Schemas
 *
 * Runtime validation schemas for content domain events.
 * Uses `createEventSchema()` from @noema/events for the envelope
 * and defines typed payload schemas for each event.
 *
 * These schemas are used by event consumers to validate incoming events
 * and by the publisher to assert outbound event structure.
 */

import {
  CardIdSchema,
  CardOriginModeSchema,
  CardReviewStateSchema,
  CardStateSchema,
  CardTransformKindSchema,
  CardTypeSchema,
  ConceptIdSchema,
  ContentGenerationJobIdSchema,
  ContentGenerationJobStatusSchema,
  DifficultyLevelSchema,
  EventSourceSchema,
  NodeIdSchema,
  RemediationCardTypeSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

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
  difficulty: DifficultyLevelSchema,
  content: z.record(z.unknown()),
  knowledgeNodeIds: z.array(NodeIdSchema),
  anchoredCkgNodeIds: z.array(ConceptIdSchema).default([]),
  anchoredPkgNodeIds: z.array(NodeIdSchema).default([]),
  tags: z.array(z.string()),
  source: EventSourceSchema,
  originMode: CardOriginModeSchema,
  reviewState: CardReviewStateSchema,
  sourceDocumentIds: z.array(z.string()).default([]),
  factualityScore: z.number().min(0).max(1).nullable().default(null),
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
  originMode: CardOriginModeSchema,
  reviewState: CardReviewStateSchema,
  batchOperation: z.boolean().optional(),
});

/**
 * Payload for `card.updated` event.
 */
export const CardUpdatedPayloadSchema = z.object({
  changes: z
    .object({
      content: z.record(z.unknown()).optional(),
      difficulty: DifficultyLevelSchema.optional(),
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

/**
 * Payload for `concepts.extracted` event.
 */
export const ConceptsExtractedPayloadSchema = z.object({
  conceptIds: z.array(NodeIdSchema),
  cardIds: z.array(CardIdSchema),
  source: z.string().min(1),
});

export const CardTransformationCreatedPayloadSchema = z.object({
  parentCardId: CardIdSchema,
  variantCardId: CardIdSchema,
  transformationKind: CardTransformKindSchema,
  transformationAgentRunId: z.string().nullable().optional(),
});

export const CardReviewStateChangedPayloadSchema = z.object({
  previousReviewState: CardReviewStateSchema,
  newReviewState: CardReviewStateSchema,
  reason: z.string().optional(),
});

export const CardMetadataCompletedPayloadSchema = z.object({
  cardId: CardIdSchema,
  anchoredCkgNodeIds: z.array(ConceptIdSchema),
  anchoredPkgNodeIds: z.array(NodeIdSchema),
  tags: z.array(z.string()),
});

export const ContentGenerationJobPayloadSchema = z.object({
  jobId: ContentGenerationJobIdSchema,
  userId: z.string().min(1),
  mode: CardOriginModeSchema,
  status: ContentGenerationJobStatusSchema,
  conceptIds: z.array(ConceptIdSchema),
  documentIds: z.array(z.string()),
});

export const ContentGenerationCompletedPayloadSchema = ContentGenerationJobPayloadSchema.extend({
  createdCardIds: z.array(CardIdSchema),
  rejectedDraftCount: z.number().int().nonnegative(),
});

export const ContentGenerationFailedPayloadSchema = ContentGenerationJobPayloadSchema.extend({
  errorMessage: z.string().min(1),
});

export const ContentCoverageUpdatedPayloadSchema = z.object({
  userId: z.string().min(1),
  conceptId: ConceptIdSchema,
  activeCardCount: z.number().int().nonnegative(),
  distinctActiveCardTypes: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  metadataIncompleteCount: z.number().int().nonnegative(),
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

export const ConceptsExtractedEventSchema = createEventSchema(
  'concepts.extracted',
  'ContentImport',
  ConceptsExtractedPayloadSchema
);

export const CardTransformationCreatedEventSchema = createEventSchema(
  'card.transformation.created',
  'Card',
  CardTransformationCreatedPayloadSchema
);

export const CardReviewStateChangedEventSchema = createEventSchema(
  'card.review_state.changed',
  'Card',
  CardReviewStateChangedPayloadSchema
);

export const CardMetadataCompletedEventSchema = createEventSchema(
  'card.metadata.completed',
  'Card',
  CardMetadataCompletedPayloadSchema
);

export const ContentGenerationRequestedEventSchema = createEventSchema(
  'content.generation.requested',
  'ContentGenerationJob',
  ContentGenerationJobPayloadSchema
);

export const ContentGenerationCompletedEventSchema = createEventSchema(
  'content.generation.completed',
  'ContentGenerationJob',
  ContentGenerationCompletedPayloadSchema
);

export const ContentGenerationFailedEventSchema = createEventSchema(
  'content.generation.failed',
  'ContentGenerationJob',
  ContentGenerationFailedPayloadSchema
);

export const ContentCoverageUpdatedEventSchema = createEventSchema(
  'content.coverage.updated',
  'ConceptCardCoverage',
  ContentCoverageUpdatedPayloadSchema
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
export type ConceptsExtractedEventInput = z.input<typeof ConceptsExtractedEventSchema>;
export type CardTransformationCreatedEventInput = z.input<
  typeof CardTransformationCreatedEventSchema
>;
export type CardReviewStateChangedEventInput = z.input<typeof CardReviewStateChangedEventSchema>;
export type CardMetadataCompletedEventInput = z.input<typeof CardMetadataCompletedEventSchema>;
export type ContentGenerationRequestedEventInput = z.input<
  typeof ContentGenerationRequestedEventSchema
>;
export type ContentGenerationCompletedEventInput = z.input<
  typeof ContentGenerationCompletedEventSchema
>;
export type ContentGenerationFailedEventInput = z.input<typeof ContentGenerationFailedEventSchema>;
export type ContentCoverageUpdatedEventInput = z.input<typeof ContentCoverageUpdatedEventSchema>;
