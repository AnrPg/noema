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
  StudyMode,
} from '@noema/types';
import { z } from 'zod';
import { CardContentSchemaRegistry } from './card-content.schemas.js';
export { MediaAttachmentSchema } from './value-objects/content.value-objects.js';
import {
  CardBackSchema,
  CardFrontSchema,
  ExplanationSchema,
  HintSchema,
  MediaAttachmentSchema,
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

export const StudyModeSchema = z.enum(Object.values(StudyMode) as [string, ...string[]]);

// ============================================================================
// Card Content Schema (Base)
// ============================================================================

/**
 * Base card content — all card types must have front + back.
 * Additional type-specific fields are allowed via passthrough.
 * Type-specific validation is performed by the discriminated validator
 * in card-content.schemas.ts when paired with a cardType.
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
 * Validates content against the type-specific schema based on cardType.
 */
export const CreateCardInputSchema = z
  .object({
    cardType: AnyCardTypeSchema,
    content: CardContentSchema,
    difficulty: DifficultyLevelSchema.default(DifficultyLevel.INTERMEDIATE),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).default([]),
    tags: z.array(TagSchema).max(30).default([]),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
    source: EventSourceSchema.default(EventSource.USER),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    const typeSchema = CardContentSchemaRegistry[data.cardType];
    if (!typeSchema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cardType'],
        message: `Unknown card type: '${data.cardType}'`,
      });
      return;
    }
    const result = typeSchema.safeParse(data.content);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['content', ...issue.path],
        });
      }
    }
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

const CardImportFileTypeSchema = z.enum([
  'json',
  'jsonl',
  'csv',
  'tsv',
  'xlsx',
  'txt',
  'markdown',
  'latex',
  'typst',
]);

const CardImportPayloadSchema = z.object({
  encoding: z.enum(['text', 'base64']),
  content: z.string().min(1, 'Import payload cannot be empty'),
});

const CardImportMappingTargetSchema = z.enum([
  'front',
  'back',
  'hint',
  'explanation',
  'tags',
  'knowledgeNodeIds',
  'difficulty',
  'state',
  'dump',
]);

export const CardImportPreviewInputSchema = z.object({
  fileName: z.string().min(1),
  fileType: CardImportFileTypeSchema,
  formatId: z.string().min(1),
  payload: CardImportPayloadSchema,
  sheetName: z.string().min(1).optional(),
  supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
});

export const CardImportFieldMappingSchema = z.object({
  sourceKey: z.string().min(1),
  targetFieldId: CardImportMappingTargetSchema,
  dumpKey: z.string().min(1).optional(),
});

export const CardImportRecordMetadataSchema = z
  .object({
    index: z.number().int().min(0),
    tags: z.array(TagSchema).max(30).optional(),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    difficulty: DifficultyLevelSchema.optional(),
    state: z.enum([CardState.DRAFT, CardState.ACTIVE]).optional(),
  })
  .strict();

export const CardImportExecuteInputSchema = CardImportPreviewInputSchema.extend({
  mappings: z
    .array(CardImportFieldMappingSchema)
    .min(1, 'Import execution requires at least one field mapping'),
  sharedTags: z.array(TagSchema).max(30).default([]),
  sharedKnowledgeNodeIds: z.array(NodeIdItemSchema).max(50).default([]),
  sharedDifficulty: DifficultyLevelSchema.optional(),
  sharedState: z.enum([CardState.DRAFT, CardState.ACTIVE]).default(CardState.DRAFT),
  recordMetadata: z.array(CardImportRecordMetadataSchema).max(100).optional(),
});

/**
 * Schema for updating a card.
 * Note: content is validated against the base schema here. Type-specific
 * validation on update requires the existing card's cardType and is
 * performed by the service layer via validateCardContent().
 */
export const UpdateCardInputSchema = z
  .object({
    content: CardContentSchema.optional(),
    difficulty: DifficultyLevelSchema.optional(),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    tags: z.array(TagSchema).max(30).optional(),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
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
  supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
  knowledgeNodeIds: z.array(NodeIdItemSchema).optional(),
  knowledgeNodeIdMode: z
    .enum(['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'])
    .default('any')
    .optional(),
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

/**
 * Schema for generating a session seed from a DeckQuery.
 */
export const SessionSeedInputSchema = z.object({
  query: DeckQuerySchema,
  strategy: z.enum(['query_order', 'randomized', 'difficulty_balanced']).default('query_order'),
  maxCards: z.number().int().min(1).max(200).default(40),
  includeCardSummaries: z.boolean().default(false),
  strategyContext: z
    .object({
      loadoutArchetype: z.string().optional(),
      forceLevel: z.string().optional(),
      targetLaneMix: z
        .object({
          retention: z.number().min(0).max(1),
          calibration: z.number().min(0).max(1),
        })
        .optional(),
      checkpointSignals: z
        .array(
          z.enum(['confidence_drift', 'latency_spike', 'error_cascade', 'streak_break', 'manual'])
        )
        .optional(),
    })
    .optional(),
  policySnapshot: z
    .object({
      pacingPolicy: z.object({
        targetSecondsPerCard: z.number().int().min(5).max(300),
        hardCapSecondsPerCard: z.number().int().min(10).max(600),
        slowdownOnError: z.boolean(),
      }),
      hintPolicy: z.object({
        maxHintsPerCard: z.number().int().min(0).max(5),
        progressiveHintsOnly: z.boolean(),
        allowAnswerReveal: z.boolean(),
      }),
      commitPolicy: z.object({
        requireConfidenceBeforeCommit: z.boolean(),
        requireVerificationGate: z.boolean(),
      }),
      reflectionPolicy: z.object({
        postAttemptReflection: z.boolean(),
        postSessionReflection: z.boolean(),
      }),
    })
    .optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CreateCardInputSchemaType = z.infer<typeof CreateCardInputSchema>;
export type BatchCreateCardInputSchemaType = z.infer<typeof BatchCreateCardInputSchema>;
export type CardImportPreviewInputSchemaType = z.infer<typeof CardImportPreviewInputSchema>;
export type CardImportExecuteInputSchemaType = z.infer<typeof CardImportExecuteInputSchema>;
export type UpdateCardInputSchemaType = z.infer<typeof UpdateCardInputSchema>;
export type ChangeCardStateInputSchemaType = z.infer<typeof ChangeCardStateInputSchema>;
export type DeckQuerySchemaType = z.infer<typeof DeckQuerySchema>;
export type SessionSeedInputSchemaType = z.infer<typeof SessionSeedInputSchema>;
