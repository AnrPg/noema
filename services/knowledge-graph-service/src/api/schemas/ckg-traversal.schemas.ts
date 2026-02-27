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
// Bridge Query Parameters — CKG (Phase 8c)
// ============================================================================

/**
 * CKG bridge nodes query parameters (same structure as PKG but no userId).
 */
export const CkgBridgeQueryParamsSchema = z.object({
  domain: z.string().min(1),
  edgeTypes: z.string().optional(),
  minComponentSize: z.coerce.number().int().min(1).max(1000).default(2),
});

// ============================================================================
// Common Ancestors Query Parameters — CKG (Phase 8c)
// ============================================================================

/**
 * CKG common ancestors query parameters (same structure as PKG but no userId).
 */
export const CkgCommonAncestorsQueryParamsSchema = z.object({
  nodeIdA: NodeIdSchema,
  nodeIdB: NodeIdSchema,
  edgeTypes: z.string().optional(),
  maxDepth: z.coerce.number().int().min(1).max(20).default(10),
});

// ============================================================================
// Prerequisite Chain Query Parameters — CKG (Phase 8d)
// ============================================================================

/**
 * CKG prerequisite chain query parameters (same structure as PKG but no userId).
 */
export const CkgPrerequisiteChainQueryParamsSchema = z.object({
  domain: z.string().min(1),
  maxDepth: z.coerce.number().int().min(1).max(50).default(10),
  edgeTypes: z.string().optional(),
  includeIndirect: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
});

// ============================================================================
// Centrality Query Parameters — CKG (Phase 8d)
// ============================================================================

/**
 * CKG centrality ranking query parameters (same structure as PKG but no userId).
 */
export const CkgCentralityQueryParamsSchema = z.object({
  domain: z.string().min(1),
  algorithm: z.enum(['degree', 'betweenness', 'pagerank']).default('degree'),
  edgeTypes: z.string().optional(),
  topK: z.coerce.number().int().min(1).max(500).default(10),
  normalise: z
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
export type CkgBridgeQueryParams = z.infer<typeof CkgBridgeQueryParamsSchema>;
export type CkgCommonAncestorsQueryParams = z.infer<typeof CkgCommonAncestorsQueryParamsSchema>;
export type CkgPrerequisiteChainQueryParams = z.infer<typeof CkgPrerequisiteChainQueryParamsSchema>;
export type CkgCentralityQueryParams = z.infer<typeof CkgCentralityQueryParamsSchema>;
