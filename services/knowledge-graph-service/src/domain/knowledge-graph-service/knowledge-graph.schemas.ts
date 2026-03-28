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

import { GraphEdgeTypeSchema, NodeIdSchema, StudyModeSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// Node Input Schemas
// ============================================================================

/**
 * Schema for creating a new graph node.
 * Validates label, nodeType, domain, and optional description/properties/mastery.
 */
export const CreateNodeInputSchema = z.object({
  label: z.string().min(1, 'Node label is required').max(500, 'Node label too long'),
  nodeType: z.string().min(1, 'Node type is required'),
  domain: z.string().min(1, 'Domain is required').max(200, 'Domain too long'),
  description: z.string().max(2000, 'Description too long').optional(),
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
    description: z.string().max(2000).optional(),
    domain: z.string().min(1).max(200).optional(),
    supportedStudyModes: z.array(StudyModeSchema).max(2).optional(),
    properties: z.record(z.unknown()).optional(),
    masteryLevel: z.number().min(0).max(1).optional(),
  })
  .refine(
    (data) =>
      data.label !== undefined ||
      data.description !== undefined ||
      data.domain !== undefined ||
      data.supportedStudyModes !== undefined ||
      data.properties !== undefined ||
      data.masteryLevel !== undefined,
    { message: 'At least one field must be provided for update' }
  );

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
