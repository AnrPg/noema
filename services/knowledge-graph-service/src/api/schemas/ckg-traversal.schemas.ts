/**
 * @noema/knowledge-graph-service - CKG Traversal API Schemas
 *
 * Zod validation schemas for CKG traversal route query parameters.
 * CKG traversal uses the same semantics as PKG traversal but without userId
 * scoping. Reuses the `parseEdgeTypesFilter` helper from PKG traversal schemas.
 */

import { GraphEdgeTypeSchema, NodeIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const CkgTraversalNodeIdParamsSchema = z.object({
  nodeId: NodeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * CKG subgraph query parameters (same structure as PKG but no userId).
 */
export const CkgSubgraphQueryParamsSchema = z.object({
  rootNodeId: NodeIdSchema,
  maxDepth: z.coerce.number().int().min(1).max(10).default(3),
  edgeTypes: z.string().optional(),
  direction: z.enum(['inbound', 'outbound', 'both']).default('outbound'),
});

/**
 * CKG path query parameters.
 */
export const CkgPathQueryParamsSchema = z.object({
  fromNodeId: NodeIdSchema,
  toNodeId: NodeIdSchema,
  maxDepth: z.coerce.number().int().min(1).max(20).optional(),
});

// ============================================================================
// Siblings Query Parameters — CKG (Phase 8b)
// ============================================================================

/**
 * CKG siblings query parameters (same structure as PKG but no userId).
 */
export const CkgSiblingsQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema,
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  includeParentDetails: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
  maxSiblingsPerGroup: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================================================
// Co-Parents Query Parameters — CKG (Phase 8b)
// ============================================================================

/**
 * CKG co-parents query parameters (same structure as PKG but no userId).
 */
export const CkgCoParentsQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema,
  direction: z.enum(['outbound', 'inbound']).default('inbound'),
  includeChildDetails: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
  maxCoParentsPerGroup: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================================================
// Neighborhood Query Parameters — CKG (Phase 8b)
// ============================================================================

/**
 * CKG neighborhood query parameters (same structure as PKG but no userId).
 */
export const CkgNeighborhoodQueryParamsSchema = z.object({
  hops: z.coerce.number().int().min(1).max(10).default(1),
  edgeTypes: z.string().optional(),
  nodeTypes: z.string().optional(),
  filterMode: z.enum(['full_path', 'immediate']).default('full_path'),
  direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
  maxPerGroup: z.coerce.number().int().min(1).max(100).default(25),
  includeEdges: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CkgTraversalNodeIdParams = z.infer<typeof CkgTraversalNodeIdParamsSchema>;
export type CkgSubgraphQueryParams = z.infer<typeof CkgSubgraphQueryParamsSchema>;
export type CkgPathQueryParams = z.infer<typeof CkgPathQueryParamsSchema>;
export type CkgSiblingsQueryParams = z.infer<typeof CkgSiblingsQueryParamsSchema>;
export type CkgCoParentsQueryParams = z.infer<typeof CkgCoParentsQueryParamsSchema>;
export type CkgNeighborhoodQueryParams = z.infer<typeof CkgNeighborhoodQueryParamsSchema>;
