import {
  ConceptCandidateIdSchema,
  CurriculumIdSchema,
  DocumentChunkIdSchema,
  DocumentIdSchema,
  IngestionIntentSchema,
  IngestionJobIdSchema,
  IngestionJobStageSchema,
  NodeIdSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';
import { IngestionEventType } from './ingestion.events.js';

export const DocumentUploadedPayloadSchema = z.object({
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  title: z.string().min(1),
  ingestionJobId: IngestionJobIdSchema,
  intent: IngestionIntentSchema,
});

export const IngestionJobStageAdvancedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  stage: IngestionJobStageSchema,
  previousStage: IngestionJobStageSchema.optional(),
});

export const DocumentParsedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  blockCount: z.number().int().nonnegative(),
});

export const ChunksEmbeddedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  chunkIds: z.array(DocumentChunkIdSchema),
});

export const ConceptCandidatesExtractedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  candidateIds: z.array(ConceptCandidateIdSchema),
});

export const CkgMappingCompletedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  matchedNodeIds: z.array(NodeIdSchema),
  proposedNodeIds: z.array(NodeIdSchema),
});

export const CurriculumHandoffRequestedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  candidateIds: z.array(ConceptCandidateIdSchema),
  curriculumId: CurriculumIdSchema.optional(),
});

export const CardHandoffRequestedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  candidateIds: z.array(ConceptCandidateIdSchema),
  contentGenerationJobIds: z.array(z.string()),
});

export const IngestionJobCompletedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  curriculumId: CurriculumIdSchema.optional(),
  contentGenerationJobIds: z.array(z.string()),
});

export const IngestionJobFailedPayloadSchema = z.object({
  ingestionJobId: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  stage: IngestionJobStageSchema,
  errorMessage: z.string().min(1),
});

export const IngestionEventSchemas = {
  [IngestionEventType.DOCUMENT_UPLOADED]: createEventSchema(
    IngestionEventType.DOCUMENT_UPLOADED,
    'Document',
    DocumentUploadedPayloadSchema
  ),
  [IngestionEventType.JOB_STAGE_ADVANCED]: createEventSchema(
    IngestionEventType.JOB_STAGE_ADVANCED,
    'IngestionJob',
    IngestionJobStageAdvancedPayloadSchema
  ),
  [IngestionEventType.DOCUMENT_PARSED]: createEventSchema(
    IngestionEventType.DOCUMENT_PARSED,
    'Document',
    DocumentParsedPayloadSchema
  ),
  [IngestionEventType.CHUNKS_EMBEDDED]: createEventSchema(
    IngestionEventType.CHUNKS_EMBEDDED,
    'DocumentChunk',
    ChunksEmbeddedPayloadSchema
  ),
  [IngestionEventType.CONCEPT_CANDIDATES_EXTRACTED]: createEventSchema(
    IngestionEventType.CONCEPT_CANDIDATES_EXTRACTED,
    'ConceptCandidate',
    ConceptCandidatesExtractedPayloadSchema
  ),
  [IngestionEventType.CKG_MAPPING_COMPLETED]: createEventSchema(
    IngestionEventType.CKG_MAPPING_COMPLETED,
    'ConceptCandidate',
    CkgMappingCompletedPayloadSchema
  ),
  [IngestionEventType.CURRICULUM_HANDOFF_REQUESTED]: createEventSchema(
    IngestionEventType.CURRICULUM_HANDOFF_REQUESTED,
    'IngestionJob',
    CurriculumHandoffRequestedPayloadSchema
  ),
  [IngestionEventType.CARD_HANDOFF_REQUESTED]: createEventSchema(
    IngestionEventType.CARD_HANDOFF_REQUESTED,
    'IngestionJob',
    CardHandoffRequestedPayloadSchema
  ),
  [IngestionEventType.JOB_COMPLETED]: createEventSchema(
    IngestionEventType.JOB_COMPLETED,
    'IngestionJob',
    IngestionJobCompletedPayloadSchema
  ),
  [IngestionEventType.JOB_FAILED]: createEventSchema(
    IngestionEventType.JOB_FAILED,
    'IngestionJob',
    IngestionJobFailedPayloadSchema
  ),
} as const;
