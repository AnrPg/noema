/**
 * @noema/knowledge-graph-service - Service Input Validation Schemas
 *
 * Zod schemas for validating inputs at the service boundary. These provide
 * runtime validation for dynamically constructed agent inputs, matching the
 * content-service's safeParse + ValidationError pattern.
 *
 * Each schema corresponds to a repository input interface:
 * - CreateNodeInputSchema → ICreateNodeInput
 * - UpdateNodeInputSchema → IUpdateNodeInput
 * - CreateEdgeInputSchema → ICreateEdgeInput
 * - UpdateEdgeInputSchema → IUpdateEdgeInput
 * - EdgeFilterSchema      → IEdgeFilter
 */

import { CkgNodeStatus } from '@noema/types';
import { GraphEdgeTypeSchema, NodeIdSchema, StudyModeSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// Node Input Schemas
// ============================================================================

const ConfidenceBandSchema = z.enum(['low', 'medium', 'high']);

const CanonicalExternalRefSchema = z.object({
  sourceId: z.string().min(1),
  externalId: z.string().min(1),
  iri: z.string().min(1).nullable().optional(),
  refType: z.string().min(1).nullable().optional(),
  sourceVersion: z.string().min(1).nullable().optional(),
  url: z.string().min(1).nullable().optional(),
  isCanonical: z.boolean().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
});

const OntologyMappingSchema = z.object({
  sourceId: z.string().min(1),
  externalId: z.string().min(1),
  mappingKind: z.string().min(1),
  targetExternalId: z.string().min(1).nullable().optional(),
  targetIri: z.string().min(1).nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  confidenceBand: ConfidenceBandSchema.nullable().optional(),
  conflictFlags: z.array(z.string().min(1)).default([]).optional(),
});

const NodeProvenanceEntrySchema = z.object({
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1).nullable().optional(),
  runId: z.string().min(1).nullable().optional(),
  artifactId: z.string().min(1).nullable().optional(),
  harvestedAt: z.string().datetime().nullable().optional(),
  license: z.string().min(1).nullable().optional(),
  requestUrl: z.string().url().nullable().optional(),
  recordKind: z.string().min(1).nullable().optional(),
});

const NodeReviewMetadataSchema = z.object({
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  confidenceBand: ConfidenceBandSchema.nullable().optional(),
  conflictFlags: z.array(z.string().min(1)).default([]).optional(),
  reviewState: z
    .enum(['ready', 'blocked', 'reviewer_overridden', 'endpoint_unresolved'])
    .nullable()
    .optional(),
  notes: z.array(z.string().min(1)).default([]).optional(),
  overridden: z.boolean().optional(),
});

const SourceCoverageSummarySchema = z.object({
  contributingSourceIds: z.array(z.string().min(1)).default([]),
  sourceCount: z.number().int().nonnegative(),
  hasBackboneSource: z.boolean().optional(),
  hasEnhancementSource: z.boolean().optional(),
  lastEnrichedAt: z.string().datetime().nullable().optional(),
});

const NodeEnrichmentSchema = {
  status: z.enum(Object.values(CkgNodeStatus) as [string, ...string[]]).optional(),
  aliases: z.array(z.string().min(1)).default([]).optional(),
  languages: z.array(z.string().min(1)).default([]).optional(),
  tags: z.array(z.string().min(1)).default([]).optional(),
  semanticHints: z.array(z.string().min(1)).default([]).optional(),
  canonicalExternalRefs: z.array(CanonicalExternalRefSchema).default([]).optional(),
  ontologyMappings: z.array(OntologyMappingSchema).default([]).optional(),
  provenance: z.array(NodeProvenanceEntrySchema).default([]).optional(),
  reviewMetadata: NodeReviewMetadataSchema.nullable().optional(),
  sourceCoverage: SourceCoverageSummarySchema.nullable().optional(),
} as const;

/**
 * Schema for creating a new graph node.
 * Validates label, nodeType, domain, and optional description/properties/mastery.
 */
export const CreateNodeInputSchema = z.object({
  label: z.string().min(1, 'Node label is required').max(500, 'Node label too long'),
  nodeType: z.string().min(1, 'Node type is required'),
  domain: z.string().min(1, 'Domain is required').max(200, 'Domain too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  ...NodeEnrichmentSchema,
  supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
  properties: z.record(z.unknown()).optional(),
  masteryLevel: z.number().min(0).max(1).optional(),
});

/**
 * Schema for updating a graph node (partial update).
 * At least one field must be provided.
 */
export const UpdateNodeInputSchema = z
  .object({
    label: z.string().min(1).max(500).optional(),
    nodeType: z.string().min(1).optional(),
    description: z.string().max(2000).optional(),
    domain: z.string().min(1).max(200).optional(),
    ...NodeEnrichmentSchema,
    studyMode: StudyModeSchema.optional(),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
    properties: z.record(z.unknown()).optional(),
    masteryLevel: z.number().min(0).max(1).optional(),
  })
  .refine(
    (data) =>
      data.label !== undefined ||
      data.nodeType !== undefined ||
      data.description !== undefined ||
      data.domain !== undefined ||
      data.status !== undefined ||
      data.aliases !== undefined ||
      data.languages !== undefined ||
      data.tags !== undefined ||
      data.semanticHints !== undefined ||
      data.canonicalExternalRefs !== undefined ||
      data.ontologyMappings !== undefined ||
      data.provenance !== undefined ||
      data.reviewMetadata !== undefined ||
      data.sourceCoverage !== undefined ||
      data.studyMode !== undefined ||
      data.supportedStudyModes !== undefined ||
      data.properties !== undefined ||
      data.masteryLevel !== undefined,
    { message: 'At least one field must be provided for update' }
  )
  .refine((data) => data.studyMode === undefined || data.masteryLevel !== undefined, {
    message: 'studyMode can only be provided when masteryLevel is also provided',
  });

// ============================================================================
// Edge Input Schemas
// ============================================================================

/**
 * Schema for creating a new graph edge.
 * Validates source/target node IDs, edge type, and optional weight/properties.
 */
export const CreateEdgeInputSchema = z.object({
  sourceNodeId: NodeIdSchema,
  targetNodeId: NodeIdSchema,
  edgeType: GraphEdgeTypeSchema,
  weight: z.number().min(0).max(1).optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * Schema for updating a graph edge (weight and/or properties).
 * At least one field must be provided.
 */
export const UpdateEdgeInputSchema = z
  .object({
    weight: z.number().min(0).max(1).optional(),
    properties: z.record(z.unknown()).optional(),
  })
  .refine((data) => data.weight !== undefined || data.properties !== undefined, {
    message: 'At least one field must be provided for edge update',
  });

/**
 * Schema for edge filter criteria.
 */
export const EdgeFilterSchema = z.object({
  edgeType: GraphEdgeTypeSchema.optional(),
  sourceNodeId: NodeIdSchema.optional(),
  targetNodeId: NodeIdSchema.optional(),
  userId: z.string().optional(),
});

// ============================================================================
// Pagination Schema
// ============================================================================

/**
 * Schema for pagination parameters.
 */
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CreateNodeInputSchemaType = z.infer<typeof CreateNodeInputSchema>;
export type UpdateNodeInputSchemaType = z.infer<typeof UpdateNodeInputSchema>;
export type CreateEdgeInputSchemaType = z.infer<typeof CreateEdgeInputSchema>;
export type UpdateEdgeInputSchemaType = z.infer<typeof UpdateEdgeInputSchema>;
export type EdgeFilterSchemaType = z.infer<typeof EdgeFilterSchema>;
export type PaginationSchemaType = z.infer<typeof PaginationSchema>;
