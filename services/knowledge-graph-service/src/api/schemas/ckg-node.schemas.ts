/**
 * @noema/knowledge-graph-service - CKG Node API Schemas
 *
 * Zod validation schemas for CKG node route query parameters.
 * CKG routes do not have a userId URL parameter (CKG is shared).
 */

import { GraphNodeTypeSchema, NodeIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const CkgNodeIdParamsSchema = z.object({
  nodeId: NodeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const CkgNodeQueryParamsSchema = z.object({
  nodeType: GraphNodeTypeSchema.optional(),
  domain: z.string().min(1).max(200).optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: z.enum(['label', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CkgNodeIdParams = z.infer<typeof CkgNodeIdParamsSchema>;
export type CkgNodeQueryParams = z.infer<typeof CkgNodeQueryParamsSchema>;
