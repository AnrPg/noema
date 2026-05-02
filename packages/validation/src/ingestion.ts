import {
  ConceptCandidateIdSchema,
  CurriculumIdSchema,
  DocumentChunkIdSchema,
  DocumentIdSchema,
  IngestionJobIdSchema,
  NodeIdSchema,
  UserIdSchema,
} from './ids.js';
import {
  ConceptCandidateStateSchema,
  DocumentMimeKindSchema,
  DocumentSourceKindSchema,
  IngestionIntentSchema,
  IngestionJobStageSchema,
} from './enums.js';
import { JsonValueSchema } from './base.js';
import { z } from 'zod';

export const DocumentMetadataSchema = z
  .record(JsonValueSchema)
  .default({})
  .describe('Document-level metadata derived during parsing.');

export const DocumentUploadInputSchema = z.object({
  title: z.string().min(1).max(512),
  sourceKind: DocumentSourceKindSchema.default('upload'),
  mimeKind: DocumentMimeKindSchema.default('text/plain'),
  content: z.string().min(1),
  intent: IngestionIntentSchema.default('both'),
  sourceUri: z.string().url().optional(),
  metadata: DocumentMetadataSchema.optional(),
});

export const DocumentSchema = z.object({
  id: DocumentIdSchema,
  userId: UserIdSchema,
  title: z.string(),
  sourceKind: DocumentSourceKindSchema,
  mimeKind: DocumentMimeKindSchema,
  sourceUri: z.string().optional(),
  checksum: z.string(),
  byteLength: z.number().int().nonnegative(),
  metadata: DocumentMetadataSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DocumentIrBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['heading', 'paragraph', 'list_item', 'code', 'quote', 'table', 'image']),
  text: z.string(),
  level: z.number().int().positive().optional(),
  order: z.number().int().nonnegative(),
  pageRef: z.string().optional(),
  metadata: z.record(JsonValueSchema).default({}),
});

export const DocumentIrSchema = z.object({
  documentId: DocumentIdSchema,
  language: z.string().default('und'),
  title: z.string(),
  outline: z.array(DocumentIrBlockSchema),
  blocks: z.array(DocumentIrBlockSchema),
  metadata: z.record(JsonValueSchema).default({}),
  createdAt: z.string().datetime(),
});

export const DocumentChunkSchema = z.object({
  id: DocumentChunkIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  tokenEstimate: z.number().int().positive(),
  headingPath: z.array(z.string()),
  pageRef: z.string().optional(),
  vectorId: z.string().optional(),
  metadata: z.record(JsonValueSchema).default({}),
  createdAt: z.string().datetime(),
});

export const ConceptCandidateSchema = z.object({
  id: ConceptCandidateIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  label: z.string(),
  definition: z.string().optional(),
  salience: z.number().min(0).max(1),
  evidenceChunkIds: z.array(DocumentChunkIdSchema),
  state: ConceptCandidateStateSchema,
  ckgNodeId: NodeIdSchema.optional(),
  proposedNodeId: NodeIdSchema.optional(),
  metadata: z.record(JsonValueSchema).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const IngestionJobSchema = z.object({
  id: IngestionJobIdSchema,
  documentId: DocumentIdSchema,
  userId: UserIdSchema,
  intent: IngestionIntentSchema,
  stage: IngestionJobStageSchema,
  checkpoints: z.record(JsonValueSchema).default({}),
  errorMessage: z.string().optional(),
  curriculumId: CurriculumIdSchema.optional(),
  contentGenerationJobIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
});

export const CreateIngestionJobInputSchema = z.object({
  documentId: DocumentIdSchema,
  intent: IngestionIntentSchema.default('both'),
});

export const RetrievalQueryInputSchema = z.object({
  query: z.string().min(1),
  userId: UserIdSchema.optional(),
  documentIds: z.array(DocumentIdSchema).optional(),
  limit: z.number().int().positive().max(50).default(8),
});

export type DocumentUploadInput = z.infer<typeof DocumentUploadInputSchema>;
export type CreateIngestionJobInput = z.infer<typeof CreateIngestionJobInputSchema>;
export type RetrievalQueryInput = z.infer<typeof RetrievalQueryInputSchema>;
