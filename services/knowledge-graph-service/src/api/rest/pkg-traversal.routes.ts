/**
 * @noema/knowledge-graph-service - PKG Traversal Routes
 *
 * Fastify route definitions for Personal Knowledge Graph traversal operations:
 * subgraph extraction, ancestor/descendant retrieval, and path finding.
 *
 * Prefix: /api/v1/users/:userId/pkg/traversal
 */

import type { GraphEdgeType, GraphNodeType, NodeId, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IFrontierQuery } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import {
  BridgeQuery,
  CoParentsQuery,
  CommonAncestorsQuery,
  FrontierQuery,
  NeighborhoodQuery,
  PrerequisiteChainQuery,
  CentralityQuery,
  SiblingsQuery,
  TraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  BridgeQueryParamsSchema,
  CentralityQueryParamsSchema,
  CoParentsQueryParamsSchema,
  CommonAncestorsQueryParamsSchema,
  FrontierQueryParamsSchema,
  NeighborhoodQueryParamsSchema,
  PathQueryParamsSchema,
  PrerequisiteChainQueryParamsSchema,
  SiblingsQueryParamsSchema,
  SubgraphQueryParamsSchema,
  parseEdgeTypesFilter,
  parseNodeTypesFilter,
} from '../schemas/pkg-traversal.schemas.js';
import {
  type IRouteOptions,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register PKG traversal routes.
 * Prefix: /api/v1/users/:userId/pkg/traversal
 */
export function registerPkgTraversalRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/traversal/subgraph — Subgraph extraction
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/subgraph',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: "Extract a subgraph from the user's PKG",
        description:
          'Retrieve the subgraph reachable from a root node, bounded by maxDepth and filtered by edge types.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
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
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const query = SubgraphQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(query.edgeTypes) as GraphEdgeType[] | undefined;

        const traversalOptions = TraversalOptions.create({
          maxDepth: query.maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: query.direction,
          includeProperties: true,
        });

        const result = await service.getSubgraph(
          userId as UserId,
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
  // GET /api/v1/users/:userId/pkg/traversal/ancestors/:nodeId — Get ancestors
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/ancestors/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get ancestors of a PKG node',
        description: 'Traverse inbound edges to find all ancestor nodes up to maxDepth.',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const queryMap = request.query as Record<string, string>;
        const maxDepth = Number(queryMap['maxDepth'] ?? 3);
        const edgeTypesRaw = queryMap['edgeTypes'];
        const edgeTypes = parseEdgeTypesFilter(edgeTypesRaw) as GraphEdgeType[] | undefined;

        const context = buildContext(request);

        const traversalOptions = TraversalOptions.create({
          maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: 'inbound',
          includeProperties: true,
        });

        const result = await service.getAncestors(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/descendants/:nodeId — Get descendants
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/descendants/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get descendants of a PKG node',
        description: 'Traverse outbound edges to find all descendant nodes up to maxDepth.',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const queryMap = request.query as Record<string, string>;
        const maxDepth = Number(queryMap['maxDepth'] ?? 3);
        const edgeTypesRaw = queryMap['edgeTypes'];
        const edgeTypes = parseEdgeTypesFilter(edgeTypesRaw) as GraphEdgeType[] | undefined;

        const context = buildContext(request);

        const traversalOptions = TraversalOptions.create({
          maxDepth,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          direction: 'outbound',
          includeProperties: true,
        });

        const result = await service.getDescendants(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/path — Find shortest path
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/path',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Find shortest path between two PKG nodes',
        description: "Compute the shortest path between two nodes in the user's PKG.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
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
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const query = PathQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.findPath(
          userId as UserId,
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
  // GET /api/v1/users/:userId/pkg/traversal/siblings/:nodeId — Get siblings
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/siblings/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get siblings (co-children) of a PKG node',
        description:
          'Find nodes sharing a common parent via the specified edge type and direction.',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const parsed = SiblingsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const query = SiblingsQuery.create({
          edgeType: parsed.edgeType as GraphEdgeType,
          direction: parsed.direction,
          includeParentDetails: parsed.includeParentDetails,
          maxSiblingsPerGroup: parsed.maxSiblingsPerGroup,
        });

        const result = await service.getSiblings(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/co-parents/:nodeId — Get co-parents
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/co-parents/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get co-parents (co-ancestors) of a PKG node',
        description: 'Find nodes sharing a common child via the specified edge type and direction.',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const parsed = CoParentsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const query = CoParentsQuery.create({
          edgeType: parsed.edgeType as GraphEdgeType,
          direction: parsed.direction,
          includeChildDetails: parsed.includeChildDetails,
          maxCoParentsPerGroup: parsed.maxCoParentsPerGroup,
        });

        const result = await service.getCoParents(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/neighborhood/:nodeId — Get neighborhood
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/neighborhood/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get N-hop neighborhood of a PKG node',
        description:
          'Retrieve nodes reachable within N hops, grouped by connecting edge type. Supports full_path and immediate filter modes.',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const parsed = NeighborhoodQueryParamsSchema.parse(request.query);
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

        const result = await service.getNeighborhood(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/bridges — Bridge nodes (Phase 8c)
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/bridges',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Detect bridge nodes (articulation points) in the PKG',
        description:
          "Identify nodes whose removal would disconnect the graph within a domain. Uses GDS if available, otherwise falls back to Tarjan's algorithm.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
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
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const parsed = BridgeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = BridgeQuery.create({
          domain: parsed.domain,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          minComponentSize: parsed.minComponentSize,
        });

        const result = await service.getBridgeNodes(userId as UserId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/traversal/frontier — Knowledge frontier (Phase 8c)
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/frontier',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get knowledge frontier for the user',
        description:
          'Identify unmastered concepts whose prerequisites are mastered — the optimal next-study candidates.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: { type: 'string' },
            masteryThreshold: { type: 'number', minimum: 0, maximum: 1 },
            maxResults: { type: 'number', minimum: 1, maximum: 100 },
            sortBy: { type: 'string', enum: ['readiness', 'centrality', 'depth'] },
            includePrerequisites: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const parsed = FrontierQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const query = FrontierQuery.create({
          domain: parsed.domain,
          masteryThreshold: parsed.masteryThreshold,
          maxResults: parsed.maxResults,
          sortBy: parsed.sortBy,
          includePrerequisites: parsed.includePrerequisites,
        });

        // Cast needed: DeepReadonly<IFrontierQuery> wraps the MasteryLevel
        // branded type in a way that's not directly assignable.
        const result = await service.getKnowledgeFrontier(
          userId as UserId,
          query as IFrontierQuery,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/traversal/common-ancestors — Common ancestors (Phase 8c)
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/common-ancestors',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Find common ancestors of two PKG nodes',
        description:
          'Compute the intersection of ancestor sets for two nodes and extract the Lowest Common Ancestor(s).',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
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
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const parsed = CommonAncestorsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = CommonAncestorsQuery.create({
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          maxDepth: parsed.maxDepth,
        });

        const result = await service.getCommonAncestors(
          userId as UserId,
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
  // GET /api/v1/users/:userId/pkg/traversal/prerequisite-chain/:nodeId — Prerequisite chain (Phase 8d)
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/prerequisite-chain/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Get the prerequisite chain for a concept',
        description:
          "Compute the topologically-sorted prerequisite chain leading to the target node, using Kahn's algorithm.",
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: { userId: { type: 'string' }, nodeId: { type: 'string' } },
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
        const { userId, nodeId } = request.params;
        assertUserAccess(request, userId);

        const parsed = PrerequisiteChainQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = PrerequisiteChainQuery.create({
          domain: parsed.domain,
          maxDepth: parsed.maxDepth,
          includeIndirect: parsed.includeIndirect,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
        });

        const result = await service.getPrerequisiteChain(
          userId as UserId,
          nodeId as NodeId,
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
  // GET /api/v1/users/:userId/pkg/traversal/centrality — Centrality ranking (Phase 8d)
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/traversal/centrality',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Traversal'],
        summary: 'Rank PKG nodes by centrality',
        description:
          'Compute centrality ranking for nodes in a domain. Supports degree, betweenness, and PageRank algorithms.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
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
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const parsed = CentralityQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const edgeTypes = parseEdgeTypesFilter(parsed.edgeTypes) as GraphEdgeType[] | undefined;

        const query = CentralityQuery.create({
          domain: parsed.domain,
          algorithm: parsed.algorithm,
          topK: parsed.topK,
          normalise: parsed.normalise,
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
        });

        const result = await service.getCentralityRanking(userId as UserId, query, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
