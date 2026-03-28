/**
 * @noema/knowledge-graph-service - PKG Node API Schemas
 *
 * Zod validation schemas for PKG node route request parameters
 * and query strings. Response schemas use the domain types directly.
 */

import {
  GraphNodeTypeSchema,
  NodeIdSchema,
  StudyModeSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import {
  CreateNodeInputSchema,
  UpdateNodeInputSchema,
} from '../../domain/knowledge-graph-service/knowledge-graph.schemas.js';

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
  searchMode: z.enum(['substring', 'fulltext']).optional(),
  studyMode: StudyModeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: z
    .enum(['label', 'createdAt', 'updatedAt', 'masteryLevel', 'relevance'])
    .default('createdAt'),
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
export const CreateNodeRequestSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    nodeType: record['nodeType'] ?? record['type'],
    properties: record['properties'] ?? record['metadata'],
  };
}, CreateNodeInputSchema);

/**
 * API-layer update node request.
 * At least one field must be provided.
 */
export const UpdateNodeRequestSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    nodeType: record['nodeType'] ?? record['type'],
    properties: record['properties'] ?? record['metadata'],
  };
}, UpdateNodeInputSchema);

// ============================================================================
// Type Inference
// ============================================================================

export type UserIdParams = z.infer<typeof UserIdParamsSchema>;
export type NodeIdParams = z.infer<typeof NodeIdParamsSchema>;
export type NodeQueryParams = z.infer<typeof NodeQueryParamsSchema>;
export type CreateNodeRequest = z.infer<typeof CreateNodeRequestSchema>;
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequestSchema>;
