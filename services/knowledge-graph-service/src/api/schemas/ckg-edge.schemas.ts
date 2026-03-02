/**
 * @noema/knowledge-graph-service - CKG Edge API Schemas
 *
 * Zod validation schemas for CKG edge route query parameters.
 * CKG routes do not have a userId URL parameter (CKG is shared).
 * Mirrors the PKG edge schemas but without userId scoping.
 */

import { EdgeIdSchema, GraphEdgeTypeSchema, NodeIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const CkgEdgeIdParamsSchema = z.object({
  edgeId: EdgeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const CkgEdgeQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema.optional(),
  nodeId: NodeIdSchema.optional(),
  direction: z.enum(['inbound', 'outbound', 'both']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CkgEdgeIdParams = z.infer<typeof CkgEdgeIdParamsSchema>;
export type CkgEdgeQueryParams = z.infer<typeof CkgEdgeQueryParamsSchema>;
