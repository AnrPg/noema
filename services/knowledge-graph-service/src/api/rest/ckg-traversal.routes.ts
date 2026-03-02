/**
 * @noema/knowledge-graph-service - CKG Traversal Routes
 *
 * Fastify route definitions for Canonical Knowledge Graph traversal operations:
 * subgraph extraction, ancestor/descendant retrieval, and path finding.
 *
 * CKG is shared; no userId scoping in URLs. Auth required for read access.
 * Mirrors the PKG traversal routes but without userId parameters.
 *
 * Prefix: /api/v1/ckg/traversal
 */

import type { GraphEdgeType, GraphNodeType, NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import {
  BridgeQuery,
  CentralityQuery,
  CoParentsQuery,
  CommonAncestorsQuery,
  NeighborhoodQuery,
  PrerequisiteChainQuery,
  SiblingsQuery,
  TraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  CkgBridgeQueryParamsSchema,
  CkgCentralityQueryParamsSchema,
  CkgCoParentsQueryParamsSchema,
  CkgCommonAncestorsQueryParamsSchema,
  CkgNeighborhoodQueryParamsSchema,
  CkgPathQueryParamsSchema,
  CkgPrerequisiteChainQueryParamsSchema,
  CkgSiblingsQueryParamsSchema,
  CkgSubgraphQueryParamsSchema,
} from '../schemas/ckg-traversal.schemas.js';
import {
  TraversalDirectionQueryParamsSchema,
  parseEdgeTypesFilter,
  parseNodeTypesFilter,
} from '../schemas/pkg-traversal.schemas.js';
import {
  type IRouteOptions,
  NodeIdParamSchema,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register CKG traversal routes.
 * Prefix: /api/v1/ckg/traversal
 */
export function registerCkgTraversalRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/ckg/traversal/subgraph — CKG subgraph extraction
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/subgraph',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Extract a subgraph from the CKG',
        description:
          'Retrieve the subgraph reachable from a root CKG node, bounded by maxDepth and filtered by edge types.',
        querystring: {
          type: 'object',
          required: ['rootNodeId'],
          properties: {
            rootNodeId: { type: 'string' },
            maxDepth: { type: 'number', minimum: 1, maximum: 10 },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = CkgSubgraphQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(query.edgeTypes) as GraphEdgeType[] | undefined;

        const traversalOptions = TraversalOptions.create({
          maxDepth: query.maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: query.direction,
          includeProperties: true,
        });

        const result = await service.getCkgSubgraph(
          query.rootNodeId as NodeId,
          traversalOptions,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/ancestors/:nodeId — Get CKG ancestors
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/ancestors/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get ancestors of a CKG node',
        description: 'Traverse inbound edges to find all ancestor nodes in the CKG up to maxDepth.',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            maxDepth: { type: 'number', minimum: 1, maximum: 10 },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);

        const query = TraversalDirectionQueryParamsSchema.parse(request.query);
        const edgeTypes = parseEdgeTypesFilter(query.edgeTypes) as GraphEdgeType[] | undefined;

        const context = buildContext(request);

        const traversalOptions = TraversalOptions.create({
          maxDepth: query.maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: 'inbound',
          includeProperties: true,
        });

        const result = await service.getCkgAncestors(nodeId as NodeId, traversalOptions, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/descendants/:nodeId — Get CKG descendants
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/descendants/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get descendants of a CKG node',
        description:
          'Traverse outbound edges to find all descendant nodes in the CKG up to maxDepth.',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            maxDepth: { type: 'number', minimum: 1, maximum: 10 },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);

        const query = TraversalDirectionQueryParamsSchema.parse(request.query);
        const edgeTypes = parseEdgeTypesFilter(query.edgeTypes) as GraphEdgeType[] | undefined;

        const context = buildContext(request);

        const traversalOptions = TraversalOptions.create({
          maxDepth: query.maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: 'outbound',
          includeProperties: true,
        });

        const result = await service.getCkgDescendants(nodeId as NodeId, traversalOptions, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/path — Find shortest path in CKG
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/path',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Find shortest path between two CKG nodes',
        description:
          'Compute the shortest path between two nodes in the Canonical Knowledge Graph.',
        querystring: {
          type: 'object',
          required: ['fromNodeId', 'toNodeId'],
          properties: {
            fromNodeId: { type: 'string' },
            toNodeId: { type: 'string' },
            maxDepth: { type: 'number', minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = CkgPathQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.findCkgPath(
          query.fromNodeId as NodeId,
          query.toNodeId as NodeId,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/siblings/:nodeId — Get CKG siblings
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/siblings/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get siblings (co-children) of a CKG node',
        description:
          'Find CKG nodes sharing a common parent via the specified edge type and direction.',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['edgeType'],
          properties: {
            edgeType: {
              type: 'string',
              description: 'Edge type defining parent-child relationship',
            },
            direction: { type: 'string', enum: ['outbound', 'inbound'], default: 'outbound' },
            includeParentDetails: { type: 'string', enum: ['true', 'false'], default: 'true' },
            maxSiblingsPerGroup: { type: 'number', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);
        const parsed = CkgSiblingsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const query = SiblingsQuery.create({
          edgeType: parsed.edgeType as GraphEdgeType,
          direction: parsed.direction,
          includeParentDetails: parsed.includeParentDetails,
          maxSiblingsPerGroup: parsed.maxSiblingsPerGroup,
        });

        const result = await service.getCkgSiblings(nodeId as NodeId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/co-parents/:nodeId — Get CKG co-parents
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/co-parents/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get co-parents (co-ancestors) of a CKG node',
        description:
          'Find CKG nodes sharing a common child via the specified edge type and direction.',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['edgeType'],
          properties: {
            edgeType: {
              type: 'string',
              description: 'Edge type defining parent-child relationship',
            },
            direction: { type: 'string', enum: ['outbound', 'inbound'], default: 'inbound' },
            includeChildDetails: { type: 'string', enum: ['true', 'false'], default: 'true' },
            maxCoParentsPerGroup: { type: 'number', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);
        const parsed = CkgCoParentsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const query = CoParentsQuery.create({
          edgeType: parsed.edgeType as GraphEdgeType,
          direction: parsed.direction,
          includeChildDetails: parsed.includeChildDetails,
          maxCoParentsPerGroup: parsed.maxCoParentsPerGroup,
        });

        const result = await service.getCkgCoParents(nodeId as NodeId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/neighborhood/:nodeId — Get CKG neighborhood
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/neighborhood/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get N-hop neighborhood of a CKG node',
        description:
          'Retrieve CKG nodes reachable within N hops, grouped by connecting edge type. Supports full_path and immediate filter modes.',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            hops: { type: 'number', minimum: 1, maximum: 10, default: 1 },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            nodeTypes: { type: 'string', description: 'Comma-separated node types' },
            filterMode: { type: 'string', enum: ['full_path', 'immediate'], default: 'full_path' },
            direction: { type: 'string', enum: ['inbound', 'outbound', 'both'], default: 'both' },
            maxPerGroup: { type: 'number', minimum: 1, maximum: 100, default: 25 },
            includeEdges: { type: 'string', enum: ['true', 'false'], default: 'true' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);
        const parsed = CkgNeighborhoodQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;
        const nodeTypes = parseNodeTypesFilter(parsed.nodeTypes) as GraphNodeType[] | undefined;

        const query = NeighborhoodQuery.create({
          hops: parsed.hops,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          ...(nodeTypes !== undefined ? { nodeTypes } : {}),
          filterMode: parsed.filterMode,
          direction: parsed.direction,
          maxPerGroup: parsed.maxPerGroup,
          includeEdges: parsed.includeEdges,
        });

        const result = await service.getCkgNeighborhood(nodeId as NodeId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/bridges — CKG Bridge nodes (Phase 8c)
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/bridges',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Detect bridge nodes (articulation points) in the CKG',
        description:
          'Identify canonical nodes whose removal would disconnect the graph within a domain.',
        querystring: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: { type: 'string' },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            minComponentSize: { type: 'number', minimum: 1, maximum: 1000, default: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const parsed = CkgBridgeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = BridgeQuery.create({
          domain: parsed.domain,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          minComponentSize: parsed.minComponentSize,
        });

        const result = await service.getCkgBridgeNodes(query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/common-ancestors — CKG Common ancestors (Phase 8c)
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/common-ancestors',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Find common ancestors of two CKG nodes',
        description:
          'Compute the intersection of ancestor sets for two canonical nodes and extract the LCA(s).',
        querystring: {
          type: 'object',
          required: ['nodeIdA', 'nodeIdB'],
          properties: {
            nodeIdA: { type: 'string' },
            nodeIdB: { type: 'string' },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            maxDepth: { type: 'number', minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const parsed = CkgCommonAncestorsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = CommonAncestorsQuery.create({
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          maxDepth: parsed.maxDepth,
        });

        const result = await service.getCkgCommonAncestors(
          parsed.nodeIdA as NodeId,
          parsed.nodeIdB as NodeId,
          query,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/prerequisite-chain/:nodeId — CKG Prerequisite chain (Phase 8d)
  // ============================================================================

  fastify.get<{ Params: { nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/prerequisite-chain/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Get the prerequisite chain for a CKG concept',
        description:
          "Compute the topologically-sorted prerequisite chain leading to the target node in the canonical graph, using Kahn's algorithm.",
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: { nodeId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: { type: 'string' },
            maxDepth: { type: 'number', minimum: 1, maximum: 50 },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            includeIndirect: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = NodeIdParamSchema.parse(request.params);
        const parsed = CkgPrerequisiteChainQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = PrerequisiteChainQuery.create({
          domain: parsed.domain,
          maxDepth: parsed.maxDepth,
          includeIndirect: parsed.includeIndirect,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
        });

        const result = await service.getCkgPrerequisiteChain(nodeId as NodeId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/traversal/centrality — CKG Centrality ranking (Phase 8d)
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/traversal/centrality',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Traversal'],
        summary: 'Rank CKG nodes by centrality',
        description:
          'Compute centrality ranking for nodes in a domain of the canonical graph. Supports degree, betweenness, and PageRank algorithms.',
        querystring: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: { type: 'string' },
            algorithm: { type: 'string', enum: ['degree', 'betweenness', 'pagerank'] },
            edgeTypes: { type: 'string', description: 'Comma-separated edge types' },
            topK: { type: 'number', minimum: 1, maximum: 500 },
            normalise: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const parsed = CkgCentralityQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = CentralityQuery.create({
          domain: parsed.domain,
          algorithm: parsed.algorithm,
          topK: parsed.topK,
          normalise: parsed.normalise,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
        });

        const result = await service.getCkgCentralityRanking(query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
