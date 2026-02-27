/**
 * @noema/knowledge-graph-service - PKG Traversal API Schemas
 *
 * Zod validation schemas for PKG traversal route query parameters.
 */

import {
  GraphEdgeTypeSchema,
  GraphNodeTypeSchema,
  NodeIdSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const TraversalNodeIdParamsSchema = z.object({
  userId: UserIdSchema,
  nodeId: NodeIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Subgraph query parameters.
 *
 * `edgeTypes` is a comma-separated string of GraphEdgeType values
 * (parsed into an array by the route handler).
 */
export const SubgraphQueryParamsSchema = z.object({
  rootNodeId: NodeIdSchema,
  maxDepth: z.coerce.number().int().min(1).max(10).default(3),
  edgeTypes: z.string().optional(),
  direction: z.enum(['inbound', 'outbound', 'both']).default('outbound'),
});

/**
 * Path query parameters.
 */
export const PathQueryParamsSchema = z.object({
  fromNodeId: NodeIdSchema,
  toNodeId: NodeIdSchema,
  maxDepth: z.coerce.number().int().min(1).max(20).optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a comma-separated edge types string into a validated array.
 * Returns undefined if the input is undefined or empty.
 */
export function parseEdgeTypesFilter(edgeTypesParam: string | undefined): string[] | undefined {
  if (!edgeTypesParam) return undefined;
  const types = edgeTypesParam
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  // Validate each entry against the edge type schema
  for (const t of types) {
    GraphEdgeTypeSchema.parse(t);
  }
  return types;
}

/**
 * Parse a comma-separated node types string into a validated array.
 * Returns undefined if the input is undefined or empty.
 */
export function parseNodeTypesFilter(nodeTypesParam: string | undefined): string[] | undefined {
  if (!nodeTypesParam) return undefined;
  const types = nodeTypesParam
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of types) {
    GraphNodeTypeSchema.parse(t);
  }
  return types;
}

// ============================================================================
// Siblings Query Parameters (Phase 8b)
// ============================================================================

/**
 * Siblings query parameters.
 * `edgeType` is required — specifies the semantic dimension for sibling-hood.
 */
export const SiblingsQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema,
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  includeParentDetails: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
  maxSiblingsPerGroup: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================================================
// Co-Parents Query Parameters (Phase 8b)
// ============================================================================

/**
 * Co-parents query parameters.
 * `edgeType` is required — specifies the semantic dimension for co-parenting.
 */
export const CoParentsQueryParamsSchema = z.object({
  edgeType: GraphEdgeTypeSchema,
  direction: z.enum(['outbound', 'inbound']).default('inbound'),
  includeChildDetails: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
  maxCoParentsPerGroup: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================================================
// Neighborhood Query Parameters (Phase 8b)
// ============================================================================

/**
 * Neighborhood query parameters.
 */
export const NeighborhoodQueryParamsSchema = z.object({
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
// Bridge Query Parameters (Phase 8c)
// ============================================================================

/**
 * Bridge nodes (articulation points) query parameters.
 * `domain` is required — specifies the knowledge domain to analyze.
 */
export const BridgeQueryParamsSchema = z.object({
  domain: z.string().min(1),
  edgeTypes: z.string().optional(),
  minComponentSize: z.coerce.number().int().min(1).max(1000).default(2),
});

// ============================================================================
// Frontier Query Parameters (Phase 8c)
// ============================================================================

/**
 * Knowledge frontier query parameters.
 * `domain` is required. Returns unmastered nodes whose prerequisites are mastered.
 */
export const FrontierQueryParamsSchema = z.object({
  domain: z.string().min(1),
  masteryThreshold: z.coerce.number().min(0).max(1).default(0.7),
  maxResults: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['readiness', 'centrality', 'depth']).default('readiness'),
  includePrerequisites: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
});

// ============================================================================
// Common Ancestors Query Parameters (Phase 8c)
// ============================================================================

/**
 * Common ancestors query parameters.
 * `nodeIdA` and `nodeIdB` are required — the two nodes to analyze.
 */
export const CommonAncestorsQueryParamsSchema = z.object({
  nodeIdA: NodeIdSchema,
  nodeIdB: NodeIdSchema,
  edgeTypes: z.string().optional(),
  maxDepth: z.coerce.number().int().min(1).max(20).default(10),
});

// ============================================================================
// Type Inference
// ============================================================================

export type TraversalNodeIdParams = z.infer<typeof TraversalNodeIdParamsSchema>;
export type SubgraphQueryParams = z.infer<typeof SubgraphQueryParamsSchema>;
export type PathQueryParams = z.infer<typeof PathQueryParamsSchema>;
export type SiblingsQueryParams = z.infer<typeof SiblingsQueryParamsSchema>;
export type CoParentsQueryParams = z.infer<typeof CoParentsQueryParamsSchema>;
export type NeighborhoodQueryParams = z.infer<typeof NeighborhoodQueryParamsSchema>;
export type BridgeQueryParams = z.infer<typeof BridgeQueryParamsSchema>;
export type FrontierQueryParams = z.infer<typeof FrontierQueryParamsSchema>;
export type CommonAncestorsQueryParams = z.infer<typeof CommonAncestorsQueryParamsSchema>;
