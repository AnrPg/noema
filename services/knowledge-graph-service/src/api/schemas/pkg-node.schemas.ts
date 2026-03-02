/**
 * @noema/knowledge-graph-service - PKG Node API Schemas
 *
 * Zod validation schemas for PKG node route request parameters
 * and query strings. Response schemas use the domain types directly.
 */

import { GraphNodeTypeSchema, NodeIdSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const UserIdParamsSchema = z.object({
  userId: UserIdSchema,
});

export const NodeIdParamsSchema = z.object({
  userId: UserIdSchema,
  nodeId: NodeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const NodeQueryParamsSchema = z.object({
  nodeType: GraphNodeTypeSchema.optional(),
  domain: z.string().min(1).max(200).optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: z.enum(['label', 'createdAt', 'updatedAt', 'masteryLevel']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// Request Bodies
// ============================================================================

/**
 * API-layer create node request.
 * Identical to the domain CreateNodeInputSchema but defined here for
 * clear separation between API and domain validation.
 */
export const CreateNodeRequestSchema = z.object({
  label: z.string().min(1, 'Node label is required').max(200, 'Node label too long'),
  nodeType: GraphNodeTypeSchema,
  domain: z.string().min(1, 'Domain is required').max(200, 'Domain too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * API-layer update node request.
 * At least one field must be provided.
 */
export const UpdateNodeRequestSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    properties: z.record(z.unknown()).optional(),
    masteryLevel: z.number().min(0).max(1).optional(),
  })
  .refine(
    (data) =>
      data.label !== undefined ||
      data.description !== undefined ||
      data.properties !== undefined ||
      data.masteryLevel !== undefined,
    { message: 'At least one field must be provided for update' }
  );

// ============================================================================
// Type Inference
// ============================================================================

export type UserIdParams = z.infer<typeof UserIdParamsSchema>;
export type NodeIdParams = z.infer<typeof NodeIdParamsSchema>;
export type NodeQueryParams = z.infer<typeof NodeQueryParamsSchema>;
export type CreateNodeRequest = z.infer<typeof CreateNodeRequestSchema>;
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequestSchema>;
