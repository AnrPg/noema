/**
 * @noema/knowledge-graph-service — Graph Read Service
 *
 * Handles all read-only graph operations for both PKG and CKG:
 * - Traversal: subgraph, ancestors, descendants, path, siblings, co-parents, neighborhood
 * - Structural Analysis (Phase 8c): bridge nodes, knowledge frontier, common ancestors
 * - Ordering & Ranking (Phase 8d): prerequisite chains, centrality ranking
 *
 * Extracted from KnowledgeGraphService as part of Fix 4.3 (God-object decomposition).
 * PKG/CKG method pairs are deduplicated via shared private helpers (Fix 4.4).
 * The only differences between PKG and CKG operations are:
 * - userId scoping (PKG passes userId to repo; CKG omits it)
 * - Node existence validation (PKG: `!node`; CKG: `node?.graphType !== CKG`)
 * - Log labels and hints labels ('PKG' vs 'CKG')
 */

import type {
  EdgeId,
  IGraphEdge,
  IGraphNode,
  IPaginatedResponse,
  ISubgraph,
  NodeId,
  UserId,
} from '@noema/types';
import { GraphType } from '@noema/types';
import type { Logger } from 'pino';

import type { AgentHintsFactory } from './agent-hints.factory.js';
import { EdgeNotFoundError, NodeNotFoundError } from './errors/graph.errors.js';
import type { IExecutionContext, IServiceResult } from './execution-context.js';
import {
  buildBridgeNodesFromIds,
  computeBetweennessCentrality,
  computePageRank,
  computeTopologicalPrerequisiteOrder,
  findArticulationPoints,
  normaliseCentralityResults,
} from './graph-analysis.js';
import type { IEdgeFilter, IGraphRepository } from './graph.repository.js';
import { MAX_PAGE_SIZE, requireAuth, validateTraversalDepth } from './service-helpers.js';
import type {
  IBridgeNode,
  IBridgeNodesResult,
  IBridgeQuery,
  ICentralityQuery,
  ICentralityResult,
  ICommonAncestorsQuery,
  ICommonAncestorsResult,
  ICoParentsQuery,
  ICoParentsResult,
  IFrontierQuery,
  IKnowledgeFrontierResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  IPrerequisiteChainQuery,
  IPrerequisiteChainResult,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
} from './value-objects/graph.value-objects.js';

// ========================================================================
// Readiness String Parsing Helpers
// ========================================================================

/** Parse numerator from "X/Y" readiness string. Returns 0 on malformed input. */
function parseReadinessNumerator(readiness: string): number {
  const parts = readiness.split('/');
  if (parts.length !== 2) return 0;
  const value = Number(parts[0]);
  return Number.isFinite(value) ? value : 0;
}

/** Parse denominator from "X/Y" readiness string. Returns 0 on malformed input. */
function parseReadinessDenominator(readiness: string): number {
  const parts = readiness.split('/');
  if (parts.length !== 2) return 0;
  const value = Number(parts[1]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Read-only graph operations sub-service.
 *
 * Provides traversal, structural analysis, and ordering/ranking for
 * both PKG (user-scoped) and CKG (shared canonical) graphs.
 *
 * PKG/CKG pairs are unified through private template methods (Fix 4.4).
 */
export class GraphReadService {
  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly hintsFactory: AgentHintsFactory,
    private readonly logger: Logger
  ) {}

  // ========================================================================
  // Private Helpers — PKG/CKG Deduplication (Fix 4.4)
  // ========================================================================

  /**
   * Resolve and validate a node exists in the specified graph type.
   *
   * PKG: fetches with userId scope, throws if null.
   * CKG: fetches without userId, throws if null or wrong graphType.
   */
  private async resolveNode(
    nodeId: NodeId,
    graphType: GraphType,
    userId?: string
  ): Promise<IGraphNode> {
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (graphType === GraphType.CKG) {
      if (node?.graphType !== GraphType.CKG) {
        throw new NodeNotFoundError(nodeId, GraphType.CKG);
      }
    } else {
      if (!node || node.graphType !== GraphType.PKG) {
        throw new NodeNotFoundError(nodeId, graphType);
      }
    }
    return node;
  }

  /** Unified ancestors/descendants traversal. */
  private async doTraverseDirection(
    direction: 'ancestors' | 'descendants',
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<IGraphNode[]>> {
    requireAuth(context);
    this.logger.debug(
      { ...(userId !== undefined ? { userId } : {}), nodeId, maxDepth: options.maxDepth },
      `Getting ${label} ${direction}`
    );

    validateTraversalDepth(options.maxDepth);

    const node = await this.resolveNode(nodeId, graphType, userId);

    const result =
      direction === 'ancestors'
        ? await this.graphRepository.getAncestors(nodeId, options, userId)
        : await this.graphRepository.getDescendants(nodeId, options, userId);

    return {
      data: result,
      agentHints: this.hintsFactory.createTraversalHints(`${label} ${direction}`, result, node),
    };
  }

  /** Unified path finding. */
  private async doFindPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>> {
    requireAuth(context);
    this.logger.debug(
      { ...(userId !== undefined ? { userId } : {}), fromNodeId, toNodeId, maxDepth },
      `Finding path in ${label}`
    );

    const [fromNode, toNode] = await Promise.all([
      this.graphRepository.getNode(fromNodeId, userId),
      this.graphRepository.getNode(toNodeId, userId),
    ]);

    if (graphType === GraphType.CKG) {
      if (fromNode?.graphType !== GraphType.CKG) {
        throw new NodeNotFoundError(fromNodeId, GraphType.CKG);
      }
      if (toNode?.graphType !== GraphType.CKG) {
        throw new NodeNotFoundError(toNodeId, GraphType.CKG);
      }
    } else {
      if (!fromNode) throw new NodeNotFoundError(fromNodeId, GraphType.PKG);
      if (!toNode) throw new NodeNotFoundError(toNodeId, GraphType.PKG);
    }

    const path = await this.graphRepository.findShortestPath(fromNodeId, toNodeId, userId, maxDepth);

    return {
      data: path,
      agentHints: this.hintsFactory.createPathHints(path, fromNode, toNode),
    };
  }

  /** Unified siblings query. */
  private async doGetSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<ISiblingsResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        nodeId,
        edgeType: query.edgeType,
        direction: query.direction,
      },
      `Getting ${label} siblings`
    );

    await this.resolveNode(nodeId, graphType, userId);
    const result = await this.graphRepository.getSiblings(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.hintsFactory.createSiblingsHints(result),
    };
  }

  /** Unified co-parents query. */
  private async doGetCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<ICoParentsResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        nodeId,
        edgeType: query.edgeType,
        direction: query.direction,
      },
      `Getting ${label} co-parents`
    );

    await this.resolveNode(nodeId, graphType, userId);
    const result = await this.graphRepository.getCoParents(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.hintsFactory.createCoParentsHints(result),
    };
  }

  /** Unified neighborhood query. */
  private async doGetNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<INeighborhoodResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        nodeId,
        hops: query.hops,
        filterMode: query.filterMode,
      },
      `Getting ${label} neighborhood`
    );

    await this.resolveNode(nodeId, graphType, userId);
    const result = await this.graphRepository.getNeighborhood(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.hintsFactory.createNeighborhoodHints(result),
    };
  }

  /** Unified bridge nodes analysis. */
  private async doFindBridgeNodes(
    query: IBridgeQuery,
    context: IExecutionContext,
    label: string,
    userId?: string
  ): Promise<IServiceResult<IBridgeNodesResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        domain: query.domain,
        minComponentSize: query.minComponentSize,
      },
      `Getting ${label} bridge nodes`
    );

    const subgraph = await this.graphRepository.getDomainSubgraph(
      query.domain,
      query.edgeTypes,
      userId
    );

    const nativeApIds = await this.graphRepository.findArticulationPointsNative(
      query.domain,
      query.edgeTypes,
      userId
    );

    let bridges: IBridgeNode[];

    if (nativeApIds !== null) {
      bridges = buildBridgeNodesFromIds(
        subgraph,
        nativeApIds,
        query.edgeTypes,
        query.minComponentSize
      );
    } else {
      bridges = findArticulationPoints(subgraph, query.edgeTypes, query.minComponentSize);
    }

    const result: IBridgeNodesResult = {
      totalNodesAnalyzed: subgraph.nodes.length,
      bridges,
    };

    return {
      data: result,
      agentHints: this.hintsFactory.createBridgeNodesHints(result),
    };
  }

  /** Unified common ancestors query. */
  private async doFindCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<ICommonAncestorsResult>> {
    requireAuth(context);
    this.logger.debug(
      { ...(userId !== undefined ? { userId } : {}), nodeIdA, nodeIdB, maxDepth: query.maxDepth },
      `Getting ${label} common ancestors`
    );

    const [nodeA, nodeB] = await Promise.all([
      this.graphRepository.getNode(nodeIdA, userId),
      this.graphRepository.getNode(nodeIdB, userId),
    ]);

    if (graphType === GraphType.CKG) {
      if (nodeA?.graphType !== GraphType.CKG) throw new NodeNotFoundError(nodeIdA, GraphType.CKG);
      if (nodeB?.graphType !== GraphType.CKG) throw new NodeNotFoundError(nodeIdB, GraphType.CKG);
    } else {
      if (!nodeA) throw new NodeNotFoundError(nodeIdA, GraphType.PKG);
      if (!nodeB) throw new NodeNotFoundError(nodeIdB, GraphType.PKG);
    }

    const result = await this.graphRepository.getCommonAncestors(nodeIdA, nodeIdB, query, userId);

    return {
      data: result,
      agentHints: this.hintsFactory.createCommonAncestorsHints(result),
    };
  }

  /** Unified prerequisite chain computation. */
  private async doPrerequisiteChain(
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext,
    label: string,
    graphType: GraphType,
    userId?: string
  ): Promise<IServiceResult<IPrerequisiteChainResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        nodeId,
        maxDepth: query.maxDepth,
        includeIndirect: query.includeIndirect,
      },
      `Getting ${label} prerequisite chain`
    );

    await this.resolveNode(nodeId, graphType, userId);

    const subgraph = await this.graphRepository.getDomainSubgraph(
      query.domain,
      query.edgeTypes,
      userId
    );

    const result = computeTopologicalPrerequisiteOrder(subgraph, nodeId);

    return {
      data: result,
      agentHints: this.hintsFactory.createPrerequisiteChainHints(result),
    };
  }

  /** Unified centrality ranking computation. */
  private async doCentralityRanking(
    query: ICentralityQuery,
    context: IExecutionContext,
    label: string,
    userId?: string
  ): Promise<IServiceResult<ICentralityResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        ...(userId !== undefined ? { userId } : {}),
        domain: query.domain,
        algorithm: query.algorithm,
        topK: query.topK,
      },
      `Getting ${label} centrality ranking`
    );

    const { algorithm, topK, normalise } = query;

    if (algorithm === 'degree') {
      const entries = await this.graphRepository.getDegreeCentrality(query, userId);
      const { ranking, statistics } = normaliseCentralityResults(
        entries,
        normalise,
        topK,
        'degree'
      );
      const result: ICentralityResult = {
        algorithm: 'degree',
        domain: query.domain,
        totalNodes: entries.length,
        ranking,
        statistics,
      };
      return {
        data: result,
        agentHints: this.hintsFactory.createCentralityHints(result),
      };
    }

    const subgraph = await this.graphRepository.getDomainSubgraph(
      query.domain,
      query.edgeTypes,
      userId
    );

    if (algorithm === 'betweenness') {
      const entries = computeBetweennessCentrality(subgraph, query.edgeTypes);
      const { ranking, statistics } = normaliseCentralityResults(
        entries,
        normalise,
        topK,
        'betweenness'
      );
      const result: ICentralityResult = {
        algorithm: 'betweenness',
        domain: query.domain,
        totalNodes: entries.length,
        ranking,
        statistics,
      };
      return {
        data: result,
        agentHints: this.hintsFactory.createCentralityHints(result),
      };
    }

    // pagerank
    const entries = computePageRank(subgraph, query.edgeTypes);
    const { ranking, statistics } = normaliseCentralityResults(
      entries,
      normalise,
      topK,
      'pagerank'
    );
    const result: ICentralityResult = {
      algorithm: 'pagerank',
      domain: query.domain,
      totalNodes: entries.length,
      ranking,
      statistics,
    };
    return {
      data: result,
      agentHints: this.hintsFactory.createCentralityHints(result),
    };
  }

  // ========================================================================
  // PKG Traversal Operations (public API)
  // ========================================================================

  async getSubgraph(
    userId: UserId,
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    requireAuth(context);
    this.logger.debug(
      { userId, rootNodeId, maxDepth: traversalOptions.maxDepth },
      'Getting PKG subgraph'
    );

    validateTraversalDepth(traversalOptions.maxDepth);

    const rootNode = await this.resolveNode(rootNodeId, GraphType.PKG, userId);
    const subgraph = await this.graphRepository.getSubgraph(rootNodeId, traversalOptions, userId);

    return {
      data: subgraph,
      agentHints: this.hintsFactory.createSubgraphHints(subgraph, rootNode),
    };
  }

  getAncestors(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doTraverseDirection(
      'ancestors',
      nodeId,
      options,
      context,
      'PKG',
      GraphType.PKG,
      userId
    );
  }

  getDescendants(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doTraverseDirection(
      'descendants',
      nodeId,
      options,
      context,
      'PKG',
      GraphType.PKG,
      userId
    );
  }

  findPath(
    userId: UserId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doFindPath(fromNodeId, toNodeId, context, 'PKG', GraphType.PKG, userId, maxDepth);
  }

  getSiblings(
    userId: UserId,
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    return this.doGetSiblings(nodeId, query, context, 'PKG', GraphType.PKG, userId);
  }

  getCoParents(
    userId: UserId,
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    return this.doGetCoParents(nodeId, query, context, 'PKG', GraphType.PKG, userId);
  }

  getNeighborhood(
    userId: UserId,
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    return this.doGetNeighborhood(nodeId, query, context, 'PKG', GraphType.PKG, userId);
  }

  // ========================================================================
  // Phase 8c — PKG Structural Analysis (public API)
  // ========================================================================

  getBridgeNodes(
    userId: UserId,
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>> {
    return this.doFindBridgeNodes(query, context, 'PKG', userId);
  }

  async getKnowledgeFrontier(
    userId: UserId,
    query: IFrontierQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IKnowledgeFrontierResult>> {
    requireAuth(context);
    this.logger.debug(
      {
        userId,
        domain: query.domain,
        masteryThreshold: query.masteryThreshold,
        sortBy: query.sortBy,
        maxResults: query.maxResults,
      },
      'Getting PKG knowledge frontier'
    );

    // Repository returns frontier sorted by readiness; re-sort if needed
    const result = await this.graphRepository.getKnowledgeFrontier(query, userId);

    // The Cypher query always sorts by readiness. For alternative sort modes
    // we re-sort the result in application code.
    if (query.sortBy === 'centrality') {
      // Sort by prerequisite count descending (proxy for centrality)
      const sorted = [...result.frontier].sort((a, b) => {
        const aTotal = parseReadinessNumerator(a.prerequisiteReadiness);
        const bTotal = parseReadinessNumerator(b.prerequisiteReadiness);
        return bTotal - aTotal;
      });
      const resorted: IKnowledgeFrontierResult = {
        ...result,
        frontier: sorted,
      };
      return {
        data: resorted,
        agentHints: this.hintsFactory.createFrontierHints(resorted),
      };
    }

    if (query.sortBy === 'depth') {
      // Sort by number of prerequisites ascending (shallower concepts first)
      const sorted = [...result.frontier].sort((a, b) => {
        const aTotal = parseReadinessDenominator(a.prerequisiteReadiness);
        const bTotal = parseReadinessDenominator(b.prerequisiteReadiness);
        return aTotal - bTotal;
      });
      const resorted: IKnowledgeFrontierResult = {
        ...result,
        frontier: sorted,
      };
      return {
        data: resorted,
        agentHints: this.hintsFactory.createFrontierHints(resorted),
      };
    }

    return {
      data: result,
      agentHints: this.hintsFactory.createFrontierHints(result),
    };
  }

  getCommonAncestors(
    userId: UserId,
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>> {
    return this.doFindCommonAncestors(
      nodeIdA,
      nodeIdB,
      query,
      context,
      'PKG',
      GraphType.PKG,
      userId
    );
  }

  // ========================================================================
  // PKG Ordering & Ranking (Phase 8d, public API)
  // ========================================================================

  getPrerequisiteChain(
    userId: UserId,
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>> {
    return this.doPrerequisiteChain(nodeId, query, context, 'PKG', GraphType.PKG, userId);
  }

  getCentralityRanking(
    userId: UserId,
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>> {
    return this.doCentralityRanking(query, context, 'PKG', userId);
  }

  // ========================================================================
  // CKG Operations (read-only, public API)
  // ========================================================================

  async getCkgNode(
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    requireAuth(context);
    this.logger.debug({ nodeId }, 'Getting CKG node');

    const node = await this.resolveNode(nodeId, GraphType.CKG);

    return {
      data: node,
      agentHints: this.hintsFactory.createCkgNodeHints(node),
    };
  }

  async getCkgSubgraph(
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    requireAuth(context);
    this.logger.debug({ rootNodeId, maxDepth: traversalOptions.maxDepth }, 'Getting CKG subgraph');

    validateTraversalDepth(traversalOptions.maxDepth);

    // Verify root exists in CKG — return empty subgraph with hints if not found
    const rootNode = await this.graphRepository.getNode(rootNodeId);
    if (rootNode?.graphType !== GraphType.CKG) {
      this.logger.info(
        { rootNodeId },
        'CKG subgraph root node not found — returning empty subgraph'
      );
      const emptySubgraph: ISubgraph = { nodes: [], edges: [] };
      return {
        data: emptySubgraph,
        agentHints: {
          suggestedNextActions: [
            {
              action: 'verify_node_id',
              description: 'Verify the node ID belongs to the CKG',
              priority: 'high' as const,
              category: 'correction',
            },
            {
              action: 'check_ingestion',
              description: 'Check if the domain has been ingested',
              priority: 'medium' as const,
              category: 'exploration',
            },
          ],
          relatedResources: [],
          confidence: 0,
          sourceQuality: 'low' as const,
          validityPeriod: 'short' as const,
          contextNeeded: ['Valid CKG root node ID'],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
          preferenceAlignment: [],
          reasoning: 'No CKG data found for the requested root node.',
        },
      };
    }

    const subgraph = await this.graphRepository.getSubgraph(rootNodeId, traversalOptions);

    return {
      data: subgraph,
      agentHints: this.hintsFactory.createSubgraphHints(subgraph, rootNode),
    };
  }

  async listCkgNodes(
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    requireAuth(context);
    this.logger.debug({ filters, pagination }, 'Listing CKG nodes');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    const ckgFilter: INodeFilter = {
      ...filters,
      graphType: GraphType.CKG,
      includeDeleted: filters.includeDeleted,
    };

    const [items, total] = await Promise.all([
      this.graphRepository.findNodes(ckgFilter, limit, offset),
      this.graphRepository.countNodes(ckgFilter),
    ]);

    const result: IPaginatedResponse<IGraphNode> = {
      items,
      total,
      hasMore: offset + items.length < total,
    };

    return {
      data: result,
      agentHints: this.hintsFactory.createListHints('CKG nodes', items.length, total),
    };
  }

  async getCkgEdge(
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    requireAuth(context);
    this.logger.debug({ edgeId }, 'Getting CKG edge');

    const edge = await this.graphRepository.getEdge(edgeId);
    if (edge?.graphType !== GraphType.CKG) {
      throw new EdgeNotFoundError(edgeId as string);
    }

    return {
      data: edge,
      agentHints: this.hintsFactory.createEdgeRetrievalHints(edge),
    };
  }

  async listCkgEdges(
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    requireAuth(context);
    this.logger.debug({ filters, pagination }, 'Listing CKG edges');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    const ckgFilter: IEdgeFilter = {
      ...(filters.edgeType !== undefined ? { edgeType: filters.edgeType } : {}),
      ...(filters.sourceNodeId !== undefined ? { sourceNodeId: filters.sourceNodeId } : {}),
      ...(filters.targetNodeId !== undefined ? { targetNodeId: filters.targetNodeId } : {}),
    };

    // Fetch edges and total count in parallel for accurate pagination
    const [edges, total] = await Promise.all([
      this.graphRepository.findEdges(ckgFilter, limit, offset),
      this.graphRepository.countEdges(ckgFilter),
    ]);

    const hasMore = offset + edges.length < total;

    const result: IPaginatedResponse<IGraphEdge> = {
      items: edges,
      total,
      hasMore,
    };

    return {
      data: result,
      agentHints: this.hintsFactory.createListHints(
        'CKG edges',
        edges.length,
        result.total ?? 0
      ),
    };
  }

  // ========================================================================
  // CKG Traversal Operations (public API — delegate to unified helpers)
  // ========================================================================

  getCkgAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doTraverseDirection('ancestors', nodeId, options, context, 'CKG', GraphType.CKG);
  }

  getCkgDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doTraverseDirection('descendants', nodeId, options, context, 'CKG', GraphType.CKG);
  }

  findCkgPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.doFindPath(fromNodeId, toNodeId, context, 'CKG', GraphType.CKG, undefined, maxDepth);
  }

  getCkgSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    return this.doGetSiblings(nodeId, query, context, 'CKG', GraphType.CKG);
  }

  getCkgCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    return this.doGetCoParents(nodeId, query, context, 'CKG', GraphType.CKG);
  }

  getCkgNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    return this.doGetNeighborhood(nodeId, query, context, 'CKG', GraphType.CKG);
  }

  // ========================================================================
  // Phase 8c — CKG Structural Analysis (public API)
  // ========================================================================

  getCkgBridgeNodes(
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>> {
    return this.doFindBridgeNodes(query, context, 'CKG');
  }

  getCkgCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>> {
    return this.doFindCommonAncestors(nodeIdA, nodeIdB, query, context, 'CKG', GraphType.CKG);
  }

  // ========================================================================
  // Phase 8d — CKG Ordering & Ranking (public API)
  // ========================================================================

  getCkgPrerequisiteChain(
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>> {
    return this.doPrerequisiteChain(nodeId, query, context, 'CKG', GraphType.CKG);
  }

  getCkgCentralityRanking(
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>> {
    return this.doCentralityRanking(query, context, 'CKG');
  }
}
