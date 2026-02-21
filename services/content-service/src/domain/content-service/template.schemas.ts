/**
 * @noema/content-service - Template Validation Schemas
 *
 * Zod schemas for validating template inputs.
 */

import { CardType, DifficultyLevel, RemediationCardType } from '@noema/types';
import { z } from 'zod';
import {
  CardBackSchema,
  CardFrontSchema,
  ExplanationSchema,
  HintSchema,
  TagSchema,
} from './value-objects/content.value-objects.js';
import { MediaAttachmentSchema } from './content.schemas.js';

// ============================================================================
// Shared Schemas
// ============================================================================

const allCardTypeValues = [...Object.values(CardType), ...Object.values(RemediationCardType)] as [
  string,
  ...string[],
];

const AnyCardTypeSchema = z.enum(allCardTypeValues);

const DifficultyLevelSchema = z.enum([
  DifficultyLevel.BEGINNER,
  DifficultyLevel.ELEMENTARY,
  DifficultyLevel.INTERMEDIATE,
  DifficultyLevel.ADVANCED,
  DifficultyLevel.EXPERT,
]);

const VisibilitySchema = z.enum(['private', 'public', 'shared']);

const nodeIdPattern = /^node_[a-zA-Z0-9]{21}$/;
const NodeIdItemSchema = z
  .string()
  .regex(nodeIdPattern, 'Invalid NodeId format. Expected node_<21-char-nanoid>');

const TemplateContentSchema = z
  .object({
    front: CardFrontSchema,
    back: CardBackSchema,
    hint: HintSchema,
    explanation: ExplanationSchema,
    media: z.array(MediaAttachmentSchema).max(20).optional(),
  })
  .passthrough()
  .describe('Template content blueprint (may contain placeholder tokens)');

// ============================================================================
// Input Schemas
// ============================================================================

export const CreateTemplateInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Template name must not be empty')
    .max(200, 'Template name must be at most 200 characters'),
  description: z.string().max(2000, 'Description must be at most 2000 characters').optional(),
  cardType: AnyCardTypeSchema,
  content: TemplateContentSchema,
  difficulty: DifficultyLevelSchema.default(DifficultyLevel.INTERMEDIATE),
  knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).default([]),
  tags: z.array(TagSchema).max(30).default([]),
  metadata: z.record(z.unknown()).default({}),
  visibility: VisibilitySchema.default('private'),
});

export const UpdateTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    content: TemplateContentSchema.optional(),
    difficulty: DifficultyLevelSchema.optional(),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    tags: z.array(TagSchema).max(30).optional(),
    metadata: z.record(z.unknown()).optional(),
    visibility: VisibilitySchema.optional(),
  })
  .strict();

export const TemplateQuerySchema = z.object({
  cardTypes: z.array(AnyCardTypeSchema).optional(),
  visibility: VisibilitySchema.optional(),
  tags: z.array(TagSchema).optional(),
  search: z.string().max(200).optional(),
  userId: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'usageCount', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CreateTemplateInputSchemaType = z.infer<typeof CreateTemplateInputSchema>;
export type UpdateTemplateInputSchemaType = z.infer<typeof UpdateTemplateInputSchema>;
export type TemplateQuerySchemaType = z.infer<typeof TemplateQuerySchema>;
