/**
 * @noema/content-service - Validation Schemas
 *
 * Zod schemas for validating content service inputs.
 */

import {
  CardState,
  CardType,
  DifficultyLevel,
  EventSource,
  RemediationCardType,
} from '@noema/types';
import { z } from 'zod';
import {
  CardBackSchema,
  CardFrontSchema,
  ExplanationSchema,
  HintSchema,
  TagSchema,
} from './value-objects/content.value-objects.js';

// ============================================================================
// Enum Schemas
// ============================================================================

/** All card type values (standard + remediation) */
const allCardTypeValues = [...Object.values(CardType), ...Object.values(RemediationCardType)] as [
  string,
  ...string[],
];

export const AnyCardTypeSchema = z.enum(allCardTypeValues).describe('Card type discriminator');

export const CardStateSchema = z.enum([
  CardState.DRAFT,
  CardState.ACTIVE,
  CardState.SUSPENDED,
  CardState.ARCHIVED,
]);

export const DifficultyLevelSchema = z.enum([
  DifficultyLevel.BEGINNER,
  DifficultyLevel.ELEMENTARY,
  DifficultyLevel.INTERMEDIATE,
  DifficultyLevel.ADVANCED,
  DifficultyLevel.EXPERT,
]);

export const EventSourceSchema = z.enum([
  EventSource.USER,
  EventSource.AGENT,
  EventSource.SYSTEM,
  EventSource.IMPORT,
]);

// ============================================================================
// Media Attachment Schema
// ============================================================================

export const MediaAttachmentSchema = z.object({
  url: z.string().url('Invalid media URL'),
  mimeType: z.string().min(1, 'MIME type required'),
  alt: z.string().max(500).optional(),
  position: z.enum(['front', 'back', 'shared']).default('shared'),
});

// ============================================================================
// Card Content Schema (Base)
// ============================================================================

/**
 * Base card content — all card types must have front + back.
 * Additional type-specific fields are allowed via passthrough.
 */
export const CardContentSchema = z
  .object({
    front: CardFrontSchema,
    back: CardBackSchema,
    hint: HintSchema,
    explanation: ExplanationSchema,
    media: z.array(MediaAttachmentSchema).max(20).optional(),
  })
  .passthrough()
  .describe('Polymorphic card content (type-specific fields allowed)');

// ============================================================================
// Node ID Schema
// ============================================================================

const nodeIdPattern = /^node_[a-zA-Z0-9]{21}$/;
const NodeIdItemSchema = z
  .string()
  .regex(nodeIdPattern, 'Invalid NodeId format. Expected node_<21-char-nanoid>');

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for creating a new card.
 */
export const CreateCardInputSchema = z.object({
  cardType: AnyCardTypeSchema,
  content: CardContentSchema,
  difficulty: DifficultyLevelSchema.default(DifficultyLevel.INTERMEDIATE),
  nodeIds: z.array(NodeIdItemSchema).max(50).default([]),
  tags: z.array(TagSchema).max(30).default([]),
  source: EventSourceSchema.default(EventSource.USER),
  metadata: z.record(z.unknown()).default({}),
});

/**
 * Schema for batch card creation.
 * Maximum 100 cards per batch.
 */
export const BatchCreateCardInputSchema = z.object({
  cards: z
    .array(CreateCardInputSchema)
    .min(1, 'Batch must contain at least 1 card')
    .max(100, 'Batch cannot exceed 100 cards'),
});

/**
 * Schema for updating a card.
 */
export const UpdateCardInputSchema = z
  .object({
    content: CardContentSchema.optional(),
    difficulty: DifficultyLevelSchema.optional(),
    nodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    tags: z.array(TagSchema).max(30).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

/**
 * Schema for changing card state.
 */
export const ChangeCardStateInputSchema = z.object({
  state: CardStateSchema,
  reason: z.string().max(500).optional(),
});

/**
 * Schema for DeckQuery (dynamic card queries).
 */
export const DeckQuerySchema = z.object({
  cardTypes: z.array(AnyCardTypeSchema).optional(),
  states: z.array(CardStateSchema).optional(),
  difficulties: z.array(DifficultyLevelSchema).optional(),
  nodeIds: z.array(NodeIdItemSchema).optional(),
  tags: z.array(TagSchema).optional(),
  sources: z.array(EventSourceSchema).optional(),
  userId: z.string().optional(),
  search: z.string().max(200).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  updatedAfter: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'difficulty']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CreateCardInputSchemaType = z.infer<typeof CreateCardInputSchema>;
export type BatchCreateCardInputSchemaType = z.infer<typeof BatchCreateCardInputSchema>;
export type UpdateCardInputSchemaType = z.infer<typeof UpdateCardInputSchema>;
export type ChangeCardStateInputSchemaType = z.infer<typeof ChangeCardStateInputSchema>;
export type DeckQuerySchemaType = z.infer<typeof DeckQuerySchema>;
