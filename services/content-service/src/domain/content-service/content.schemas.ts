/**
 * @noema/content-service - Validation Schemas
 *
 * Zod schemas for validating content service inputs.
 */

import { ConceptIdSchema } from '@noema/learning-kernel';
import {
  CardState,
  CardType,
  CardOriginMode,
  CardReviewState,
  CardTransformKind,
  ContentGenerationJobStatus,
  DifficultyLevel,
  EligibilityGroup,
  EpistemicMode,
  EventSource,
  RemediationCardType,
  StudyMode,
  TransformationType,
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

export const CardOriginModeSchema = z.enum([
  CardOriginMode.AUTHORED,
  CardOriginMode.RAG_GROUNDED,
  CardOriginMode.AGENT_AUTONOMOUS,
]);

export const CardReviewStateSchema = z.enum([
  CardReviewState.ACTIVE,
  CardReviewState.METADATA_INCOMPLETE,
  CardReviewState.PENDING_REVIEW,
  CardReviewState.REJECTED,
]);

export const CardTransformKindSchema = z.enum([
  CardTransformKind.REPHRASE,
  CardTransformKind.SIMPLIFY,
  CardTransformKind.INCREASE_DIFFICULTY,
  CardTransformKind.CHANGE_CARD_TYPE,
  CardTransformKind.REMEDIATION,
  CardTransformKind.REANCHOR,
]);

export const ContentGenerationJobStatusSchema = z.enum([
  ContentGenerationJobStatus.REQUESTED,
  ContentGenerationJobStatus.RUNNING,
  ContentGenerationJobStatus.COMPLETED,
  ContentGenerationJobStatus.FAILED,
  ContentGenerationJobStatus.CANCELLED,
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

export const TransformationTypeSchema = z.enum(
  Object.values(TransformationType) as [string, ...string[]]
);

export const EligibilityGroupSchema = z.enum(
  Object.values(EligibilityGroup) as [string, ...string[]]
);

export const EpistemicModeSchema = z.enum(Object.values(EpistemicMode) as [string, ...string[]]);

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

const nodeIdPattern = /^node_[a-zA-Z0-9_-]{21}$/;
const NodeIdItemSchema = z
  .string()
  .regex(nodeIdPattern, 'Invalid NodeId format. Expected node_<21-char-nanoid>');

const conceptIdPattern = /^(?:concept_|node_)[a-zA-Z0-9_-]{21}$/;
const ConceptIdItemSchema = z
  .string()
  .regex(conceptIdPattern, 'Invalid ConceptId format. Expected concept_ or node_<21-char-nanoid>');

const ContentSourceCitationSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    url: z.string().url().optional(),
    title: z.string().min(1).max(500).optional(),
    locator: z.string().min(1).max(500).optional(),
    excerptHash: z.string().min(1).max(128).optional(),
  })
  .passthrough();

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
    primaryConceptId: ConceptIdItemSchema,
    relatedConceptIds: z.array(ConceptIdItemSchema).max(50).default([]),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).default([]),
    compatibleTransformations: z.array(TransformationTypeSchema).min(1).max(6).optional(),
    defaultEligibilityGroups: z.array(EligibilityGroupSchema).max(7).optional(),
    tags: z.array(TagSchema).max(30).default([]),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
    source: EventSourceSchema.default(EventSource.USER),
    originMode: CardOriginModeSchema.default(CardOriginMode.AUTHORED),
    originAgentRunId: z.string().min(1).max(100).optional(),
    authorUserId: z.string().min(1).optional(),
    sourceDocumentIds: z.array(z.string().min(1)).max(50).default([]),
    sources: z.array(ContentSourceCitationSchema).max(100).default([]),
    anchoredCkgNodeIds: z.array(ConceptIdItemSchema).max(50).default([]),
    anchoredPkgNodeIds: z.array(NodeIdItemSchema).max(50).default([]),
    factualityScore: z.number().min(0).max(1).optional(),
    reviewState: CardReviewStateSchema.optional(),
    parentCardId: z.string().min(1).optional(),
    transformationKind: CardTransformKindSchema.optional(),
    transformationAgentRunId: z.string().min(1).max(100).optional(),
    generationJobId: z.string().min(1).optional(),
    guardianValidationId: z.string().min(1).max(100).optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    if (data.relatedConceptIds.includes(data.primaryConceptId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relatedConceptIds'],
        message: 'relatedConceptIds must not include the primaryConceptId.',
      });
    }
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
    if (data.originMode === CardOriginMode.RAG_GROUNDED) {
      if (data.sourceDocumentIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceDocumentIds'],
          message: 'RAG-grounded cards require at least one source document.',
        });
      }
      if (data.sources.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources'],
          message: 'RAG-grounded cards require at least one citation.',
        });
      }
    }
    if (
      data.originMode === CardOriginMode.AGENT_AUTONOMOUS &&
      typeof data.factualityScore !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['factualityScore'],
        message: 'Autonomous agent cards require a factuality score.',
      });
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
    primaryConceptId: ConceptIdItemSchema.optional(),
    relatedConceptIds: z.array(ConceptIdItemSchema).max(50).optional(),
    knowledgeNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    anchoredCkgNodeIds: z.array(ConceptIdItemSchema).max(50).optional(),
    anchoredPkgNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
    compatibleTransformations: z.array(TransformationTypeSchema).min(1).max(6).optional(),
    defaultEligibilityGroups: z.array(EligibilityGroupSchema).max(7).optional(),
    tags: z.array(TagSchema).max(30).optional(),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
    reviewState: CardReviewStateSchema.optional(),
    guardianValidationId: z.string().min(1).max(100).nullable().optional(),
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
  compatibleTransformations: z.array(TransformationTypeSchema).optional(),
  defaultEligibilityGroups: z.array(EligibilityGroupSchema).optional(),
  supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
  primaryConceptId: ConceptIdItemSchema.optional(),
  relatedConceptIds: z.array(ConceptIdItemSchema).optional(),
  knowledgeNodeIds: z.array(NodeIdItemSchema).optional(),
  knowledgeNodeIdMode: z
    .enum(['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'])
    .default('any')
    .optional(),
  tags: z.array(TagSchema).optional(),
  sources: z.array(EventSourceSchema).optional(),
  originModes: z.array(CardOriginModeSchema).optional(),
  reviewStates: z.array(CardReviewStateSchema).optional(),
  anchoredCkgNodeIds: z.array(ConceptIdItemSchema).optional(),
  anchoredPkgNodeIds: z.array(NodeIdItemSchema).optional(),
  sourceDocumentIds: z.array(z.string().min(1)).optional(),
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

export const CompleteCardMetadataInputSchema = z.object({
  cardType: AnyCardTypeSchema.optional(),
  difficulty: DifficultyLevelSchema.optional(),
  tags: z.array(TagSchema).max(30).optional(),
  primaryConceptId: ConceptIdItemSchema.optional(),
  relatedConceptIds: z.array(ConceptIdItemSchema).max(50).optional(),
  anchoredCkgNodeIds: z.array(ConceptIdItemSchema).max(50).optional(),
  anchoredPkgNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const PromoteCardFromReviewInputSchema = z.object({
  decisionNote: z.string().max(1000).optional(),
});

export const TransformCardInputSchema = z.object({
  transformationKind: CardTransformKindSchema,
  prompt: z.string().max(4000).optional(),
  targetCardType: AnyCardTypeSchema.optional(),
  targetCardTypes: z.array(AnyCardTypeSchema).max(20).optional(),
  count: z.number().int().min(1).max(20).default(1),
  primaryConceptId: ConceptIdItemSchema.optional(),
  relatedConceptIds: z.array(ConceptIdItemSchema).max(50).optional(),
  anchoredCkgNodeIds: z.array(ConceptIdItemSchema).max(50).optional(),
  anchoredPkgNodeIds: z.array(NodeIdItemSchema).max(50).optional(),
});

export const CreateContentGenerationJobInputSchema = z.object({
  mode: z.enum([CardOriginMode.RAG_GROUNDED, CardOriginMode.AGENT_AUTONOMOUS]),
  conceptIds: z.array(ConceptIdItemSchema).min(1).max(50),
  documentIds: z.array(z.string().min(1)).max(50).default([]),
  curriculumContext: z.record(z.unknown()).default({}),
  studentContext: z.record(z.unknown()).default({}),
  desiredCardTypes: z.array(AnyCardTypeSchema).max(20).default([]),
  varietyMandate: z
    .object({
      minDistinctTypesPerConcept: z.number().int().min(1).max(10).default(3),
    })
    .default({ minDistinctTypesPerConcept: 3 }),
  budget: z
    .object({
      maxCards: z.number().int().min(1).max(100).default(12),
      timeoutMs: z.number().int().min(1000).max(120000).default(5000),
    })
    .default({ maxCards: 12, timeoutMs: 5000 }),
});

export const ImportGeneratedContentBatchInputSchema = z.object({
  job: CreateContentGenerationJobInputSchema,
  cards: z.array(z.record(z.unknown())).max(100),
  activityVariants: z.array(z.record(z.unknown())).max(100).default([]),
  rejectedDrafts: z.array(z.record(z.unknown())).default([]),
  agentRunId: z.string().min(1).max(100).nullable().optional(),
  resultPayload: z.record(z.unknown()).default({}),
});

export const ActivityPayloadCandidatesInputSchema = z.object({
  conceptId: ConceptIdSchema,
  transformationType: TransformationTypeSchema,
  eligibilityGroup: EligibilityGroupSchema,
  epistemicMode: EpistemicModeSchema,
  difficultyBucket: z.number().int().min(0).max(4),
  studyMode: StudyModeSchema.default(StudyMode.KNOWLEDGE_GAINING),
  limit: z.number().int().min(1).max(50).default(10),
  includeTemplates: z.boolean().default(true),
  includeGeneratedVariants: z.boolean().default(true),
});

export const CreateGeneratedActivityVariantInputSchema = z.object({
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  transformationType: TransformationTypeSchema,
  epistemicMode: EpistemicModeSchema,
  difficultyBucket: z.number().int().min(0).max(4),
  sourceCardIds: z.array(z.string().min(1).max(100)).max(25).default([]),
  prompt: z.string().min(1).max(8000),
  renderPayload: z.record(z.unknown()).default({}),
  expectedResponseType: z.string().min(1).max(100),
  responseSchema: z.record(z.unknown()),
  variantSeed: z.string().min(1).max(200),
  generatorMetadata: z.record(z.unknown()).default({}),
  ttlAt: z.string().datetime(),
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
export type CompleteCardMetadataInputSchemaType = z.infer<
  typeof CompleteCardMetadataInputSchema
>;
export type PromoteCardFromReviewInputSchemaType = z.infer<
  typeof PromoteCardFromReviewInputSchema
>;
export type TransformCardInputSchemaType = z.infer<typeof TransformCardInputSchema>;
export type CreateContentGenerationJobInputSchemaType = z.infer<
  typeof CreateContentGenerationJobInputSchema
>;
export type ImportGeneratedContentBatchInputSchemaType = z.infer<
  typeof ImportGeneratedContentBatchInputSchema
>;
export type SessionSeedInputSchemaType = z.infer<typeof SessionSeedInputSchema>;
export type ActivityPayloadCandidatesInputSchemaType = z.infer<
  typeof ActivityPayloadCandidatesInputSchema
>;
export type CreateGeneratedActivityVariantInputSchemaType = z.infer<
  typeof CreateGeneratedActivityVariantInputSchema
>;
