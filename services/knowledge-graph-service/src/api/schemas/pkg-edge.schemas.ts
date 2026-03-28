/**
 * @noema/knowledge-graph-service - PKG Edge API Schemas
 *
 * Zod validation schemas for PKG edge route request parameters
 * and query strings.
 */

import {
  EdgeIdSchema,
  GraphEdgeTypeSchema,
  NodeIdSchema,
  StudyModeSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const EdgeIdParamsSchema = z.object({
  userId: UserIdSchema,
  edgeId: EdgeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const EdgeQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema.optional(),
  nodeId: NodeIdSchema.optional(),
  studyMode: StudyModeSchema.optional(),
  direction: z.enum(['inbound', 'outbound', 'both']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

// ============================================================================
// Request Bodies
// ============================================================================

/**
 * API-layer create edge request.
 */
export const CreateEdgeRequestSchema = z.object({
  edgeType: GraphEdgeTypeSchema,
  sourceNodeId: NodeIdSchema,
  targetNodeId: NodeIdSchema,
  weight: z.number().min(0).max(1).optional(),
  properties: z.record(z.unknown()).optional(),
  skipAcyclicityCheck: z.boolean().default(false),
});

/**
 * API-layer update edge request.
 * At least one of weight or properties must be provided.
 */
export const UpdateEdgeRequestSchema = z
  .object({
    weight: z.number().min(0).max(1).optional(),
    properties: z.record(z.unknown()).optional(),
  })
  .refine((data) => data.weight !== undefined || data.properties !== undefined, {
    message: 'At least one field must be provided for edge update',
  });

// ============================================================================
// Type Inference
// ============================================================================

export type EdgeIdParams = z.infer<typeof EdgeIdParamsSchema>;
export type EdgeQueryParams = z.infer<typeof EdgeQueryParamsSchema>;
export type CreateEdgeRequest = z.infer<typeof CreateEdgeRequestSchema>;
export type UpdateEdgeRequest = z.infer<typeof UpdateEdgeRequestSchema>;
