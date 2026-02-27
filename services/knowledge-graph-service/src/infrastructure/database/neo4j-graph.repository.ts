/**
 * @noema/knowledge-graph-service — Neo4j Graph Repository
 *
 * Concrete implementation of IGraphRepository using the Neo4j driver.
 * Implements all four ISP sub-interfaces: INodeRepository, IEdgeRepository,
 * ITraversalRepository, IBatchGraphRepository.
 *
 * Design decisions:
 * - Sessions created per-operation (not shared across calls)
 * - Explicit transactions for write operations
 * - Read transactions (auto-commit) for read operations
 * - Type-specific relationship types (D1): PREREQUISITE, PART_OF, etc.
 * - Branded IDs generated via nanoid with prefixes
 * - All Cypher queries use parameterized queries ($params)
 */

import { nanoid } from 'nanoid';
import type { Integer, ManagedTransaction } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import type pino from 'pino';

import type {
  EdgeId,
  GraphEdgeType,
  IGraphEdge,
  IGraphNode,
  ISubgraph,
  NodeId,
} from '@noema/types';
import { ID_PREFIXES } from '@noema/types';

import {
  DuplicateNodeError,
  EdgeNotFoundError,
  GraphConsistencyError,
  NodeNotFoundError,
} from '../../domain/knowledge-graph-service/errors/index.js';
import type {
  EdgeDirection,
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IGraphRepository,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from '../../domain/knowledge-graph-service/graph.repository.js';
import type {
  ICoParentsQuery,
  ICoParentsResult,
  ICommonAncestorsQuery,
  ICommonAncestorsResult,
  IFrontierQuery,
  IKnowledgeFrontierResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { Neo4jClient } from './neo4j-client.js';
import {
  buildEdgeProperties,
  buildNodeProperties,
  buildNodeUpdateProperties,
  buildSubgraph,
  edgeTypeToRelType,
  graphTypeToLabel,
  inferGraphType,
  mapNodeToGraphNode,
  mapRelationshipToGraphEdge,
  nodeTypeToLabel,
} from './neo4j-mapper.js';

// ============================================================================
// Constants
// ============================================================================

/** All 8 relationship types for Cypher multi-type patterns */
const ALL_REL_TYPES = [
  'PREREQUISITE',
  'PART_OF',
  'IS_A',
  'RELATED_TO',
  'CONTRADICTS',
  'EXEMPLIFIES',
  'CAUSES',
  'DERIVED_FROM',
] as const;

/** Build a Cypher relationship type pattern for given edge types */
function buildRelTypePattern(edgeTypes?: readonly GraphEdgeType[]): string {
  if (!edgeTypes || edgeTypes.length === 0) {
    return ALL_REL_TYPES.join('|');
  }
  return edgeTypes.map(edgeTypeToRelType).join('|');
}

/** Generate a prefixed node ID */
function generateNodeId(): NodeId {
  return `${ID_PREFIXES.NodeId}${nanoid()}` as NodeId;
}

/** Generate a prefixed edge ID */
function generateEdgeId(): EdgeId {
  return `${ID_PREFIXES.EdgeId}${nanoid()}` as EdgeId;
}

// ============================================================================
// Neo4jGraphRepository
// ============================================================================

export class Neo4jGraphRepository implements IGraphRepository {
  private readonly neo4j: Neo4jClient;
  private readonly logger: pino.Logger;

  constructor(neo4jClient: Neo4jClient, logger: pino.Logger) {
    this.neo4j = neo4jClient;
    this.logger = logger.child({ component: 'Neo4jGraphRepository' });
  }

  // ==========================================================================
  // INodeRepository
  // ==========================================================================

  async createNode(
    graphType: string,
    input: ICreateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const nodeId = generateNodeId();
    const primaryLabel = graphTypeToLabel(graphType);
    const secondaryLabel = nodeTypeToLabel(input.nodeType);
    const props = buildNodeProperties(input, nodeId, graphType, userId);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `CREATE (n:${primaryLabel}:${secondaryLabel} $props)
           RETURN n`,
          { props }
        );
      });

      const node = result.records[0]?.get('n') as neo4j.Node | undefined;
      if (node === undefined) {
        throw new GraphConsistencyError(
          'node_creation_failed',
          `Failed to create node with id ${nodeId}`
        );
      }

      this.logger.debug({ nodeId, graphType, nodeType: input.nodeType }, 'Node created');
      return mapNodeToGraphNode(node);
    } catch (error) {
      this.translateNeo4jError(error, 'createNode', { nodeId, graphType });
    } finally {
      await session.close();
    }
  }

  async getNode(nodeId: NodeId, userId?: string): Promise<IGraphNode | null> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})
           ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
           RETURN n
           LIMIT 1`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      const record = result.records[0];
      if (record === undefined) return null;

      return mapNodeToGraphNode(record.get('n') as neo4j.Node);
    } finally {
      await session.close();
    }
  }

  async updateNode(
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const updateProps = buildNodeUpdateProperties(updates);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})
           ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
           SET n += $updateProps
           RETURN n`,
          { nodeId, updateProps, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      const record = result.records[0];
      if (record === undefined) {
        throw new NodeNotFoundError(nodeId);
      }

      this.logger.debug({ nodeId }, 'Node updated');
      return mapNodeToGraphNode(record.get('n') as neo4j.Node);
    } catch (error) {
      this.translateNeo4jError(error, 'updateNode', { nodeId });
    } finally {
      await session.close();
    }
  }

  async deleteNode(nodeId: NodeId, userId?: string): Promise<void> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})
           ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
           SET n.isDeleted = true, n.deletedAt = $deletedAt, n.updatedAt = $deletedAt
           RETURN n`,
          {
            nodeId,
            deletedAt: new Date().toISOString(),
            ...(userId !== undefined ? { userId } : {}),
          }
        );
      });

      if (result.records.length === 0) {
        throw new NodeNotFoundError(nodeId);
      }

      this.logger.debug({ nodeId }, 'Node soft-deleted');
    } catch (error) {
      this.translateNeo4jError(error, 'deleteNode', { nodeId });
    } finally {
      await session.close();
    }
  }

  async findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]> {
    const { whereClauses, params } = this.buildNodeFilterClauses(filter);
    const labelFilter = this.buildLabelFilter(filter);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n${labelFilter})
           ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
           RETURN n
           ORDER BY n.createdAt DESC
           SKIP $offset LIMIT $limit`,
          { ...params, offset: neo4jInt(offset), limit: neo4jInt(limit) }
        );
      });

      return result.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  async countNodes(filter: INodeFilter): Promise<number> {
    const { whereClauses, params } = this.buildNodeFilterClauses(filter);
    const labelFilter = this.buildLabelFilter(filter);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n${labelFilter})
           ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
           RETURN count(n) AS total`,
          params
        );
      });

      const record = result.records[0];
      if (record === undefined) return 0;

      const count: unknown = record.get('total');
      return typeof count === 'object' && count !== null && 'toNumber' in count
        ? (count as { toNumber(): number }).toNumber()
        : Number(count);
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // IEdgeRepository
  // ==========================================================================

  async createEdge(
    _graphType: string,
    input: ICreateEdgeInput,
    userId?: string
  ): Promise<IGraphEdge> {
    const edgeId = generateEdgeId();
    const relType = edgeTypeToRelType(input.edgeType);
    const edgeProps = buildEdgeProperties(input, edgeId, userId);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        // Match source and target nodes, create typed relationship
        return tx.run(
          `MATCH (source {nodeId: $sourceNodeId, isDeleted: false})
           MATCH (target {nodeId: $targetNodeId, isDeleted: false})
           CREATE (source)-[r:${relType} $edgeProps]->(target)
           RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                  source.graphType AS sourceGraphType`,
          {
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
            edgeProps,
          }
        );
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphConsistencyError(
          'edge_creation_failed',
          `Failed to create edge from ${input.sourceNodeId} to ${input.targetNodeId}. One or both nodes not found.`
        );
      }

      const rel = record.get('r') as neo4j.Relationship;
      const sourceId = record.get('sourceId') as NodeId;
      const targetId = record.get('targetId') as NodeId;
      const sourceGT = record.get('sourceGraphType') as string;

      this.logger.debug({ edgeId, edgeType: input.edgeType }, 'Edge created');
      return mapRelationshipToGraphEdge(
        rel,
        sourceId,
        targetId,
        (sourceGT === 'ckg' ? 'ckg' : 'pkg') as IGraphEdge['graphType']
      );
    } catch (error) {
      this.translateNeo4jError(error, 'createEdge', { edgeId });
    } finally {
      await session.close();
    }
  }

  async getEdge(edgeId: EdgeId): Promise<IGraphEdge | null> {
    const relTypePattern = ALL_REL_TYPES.join('|');

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (source)-[r:${relTypePattern}]->(target)
           WHERE r.edgeId = $edgeId
           RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                  source.graphType AS graphType`,
          { edgeId }
        );
      });

      const record = result.records[0];
      if (record === undefined) return null;

      return mapRelationshipToGraphEdge(
        record.get('r') as neo4j.Relationship,
        record.get('sourceId') as NodeId,
        record.get('targetId') as NodeId,
        record.get('graphType') as IGraphEdge['graphType']
      );
    } finally {
      await session.close();
    }
  }

  async updateEdge(edgeId: EdgeId, updates: IUpdateEdgeInput): Promise<IGraphEdge> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    const updateProps: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.weight !== undefined) {
      updateProps['weight'] = updates.weight;
    }
    if (updates.properties !== undefined) {
      // Merge properties into edge — flatten to top-level prop keys
      for (const [key, value] of Object.entries(updates.properties)) {
        updateProps[`prop_${key}`] = value;
      }
    }

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (src)-[r:${relTypePattern}]->(tgt)
           WHERE r.edgeId = $edgeId
           SET r += $updateProps
           RETURN r, src.nodeId AS sourceNodeId, tgt.nodeId AS targetNodeId, labels(src) AS srcLabels`,
          { edgeId, updateProps }
        );
      });

      const record = result.records[0];
      if (record === undefined) {
        throw new EdgeNotFoundError(edgeId);
      }

      this.logger.debug({ edgeId }, 'Edge updated');
      return mapRelationshipToGraphEdge(
        record.get('r') as neo4j.Relationship,
        record.get('sourceNodeId') as NodeId,
        record.get('targetNodeId') as NodeId,
        inferGraphType(record.get('srcLabels') as string[])
      );
    } catch (error) {
      this.translateNeo4jError(error, 'updateEdge', { edgeId });
    } finally {
      await session.close();
    }
  }

  async removeEdge(edgeId: EdgeId): Promise<void> {
    const relTypePattern = ALL_REL_TYPES.join('|');

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH ()-[r:${relTypePattern}]->()
           WHERE r.edgeId = $edgeId
           DELETE r
           RETURN count(r) AS deleted`,
          { edgeId }
        );
      });

      const record = result.records[0];
      const deleted = record ? toJsNumber(record.get('deleted')) : 0;
      if (deleted === 0) {
        throw new EdgeNotFoundError(edgeId);
      }

      this.logger.debug({ edgeId }, 'Edge removed');
    } catch (error) {
      this.translateNeo4jError(error, 'removeEdge', { edgeId });
    } finally {
      await session.close();
    }
  }

  async findEdges(filter: IEdgeFilter, limit?: number, offset?: number): Promise<IGraphEdge[]> {
    const relTypes =
      filter.edgeType !== undefined ? edgeTypeToRelType(filter.edgeType) : ALL_REL_TYPES.join('|');

    const whereClauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.sourceNodeId !== undefined) {
      whereClauses.push('source.nodeId = $sourceNodeId');
      params['sourceNodeId'] = filter.sourceNodeId;
    }
    if (filter.targetNodeId !== undefined) {
      whereClauses.push('target.nodeId = $targetNodeId');
      params['targetNodeId'] = filter.targetNodeId;
    }
    if (filter.userId !== undefined) {
      whereClauses.push('r.userId = $userId');
      params['userId'] = filter.userId;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Build pagination clause
    let paginationClause = '';
    if (offset !== undefined && offset > 0) {
      paginationClause += ` SKIP ${String(offset)}`;
    }
    if (limit !== undefined) {
      paginationClause += ` LIMIT ${String(limit)}`;
    }

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (source)-[r:${relTypes}]->(target)
           ${whereStr}
           RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                  source.graphType AS graphType${paginationClause}`,
          params
        );
      });

      return result.records.map((rec) =>
        mapRelationshipToGraphEdge(
          rec.get('r') as neo4j.Relationship,
          rec.get('sourceId') as NodeId,
          rec.get('targetId') as NodeId,
          rec.get('graphType') as IGraphEdge['graphType']
        )
      );
    } finally {
      await session.close();
    }
  }

  async getEdgesForNode(nodeId: NodeId, direction: EdgeDirection): Promise<IGraphEdge[]> {
    const relTypePattern = ALL_REL_TYPES.join('|');

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        // For 'both', we need to determine direction per relationship
        if (direction === 'both') {
          return tx.run(
            `MATCH (n {nodeId: $nodeId})-[r:${relTypePattern}]-(other)
             RETURN r, startNode(r).nodeId AS sourceId, endNode(r).nodeId AS targetId,
                    n.graphType AS graphType`,
            { nodeId }
          );
        }

        if (direction === 'inbound') {
          return tx.run(
            `MATCH (source)-[r:${relTypePattern}]->(n {nodeId: $nodeId})
             RETURN r, source.nodeId AS sourceId, n.nodeId AS targetId,
                    source.graphType AS graphType`,
            { nodeId }
          );
        }

        // outbound
        return tx.run(
          `MATCH (n {nodeId: $nodeId})-[r:${relTypePattern}]->(target)
           RETURN r, n.nodeId AS sourceId, target.nodeId AS targetId,
                  n.graphType AS graphType`,
          { nodeId }
        );
      });

      return result.records.map((rec) =>
        mapRelationshipToGraphEdge(
          rec.get('r') as neo4j.Relationship,
          rec.get('sourceId') as NodeId,
          rec.get('targetId') as NodeId,
          rec.get('graphType') as IGraphEdge['graphType']
        )
      );
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // ITraversalRepository
  // ==========================================================================

  async getAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    const relPattern = buildRelTypePattern(options.edgeTypes);
    const userFilter =
      userId !== undefined ? 'AND all(x IN nodes(path) WHERE x.userId = $userId)' : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH path = (n {nodeId: $nodeId})<-[:${relPattern}*1..${String(options.maxDepth)}]-(ancestor)
           WHERE ancestor.isDeleted = false ${userFilter}
           RETURN DISTINCT ancestor`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      return result.records.map((rec) => mapNodeToGraphNode(rec.get('ancestor') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  async getDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    const relPattern = buildRelTypePattern(options.edgeTypes);
    const userFilter =
      userId !== undefined ? 'AND all(x IN nodes(path) WHERE x.userId = $userId)' : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH path = (n {nodeId: $nodeId})-[:${relPattern}*1..${String(options.maxDepth)}]->(descendant)
           WHERE descendant.isDeleted = false ${userFilter}
           RETURN DISTINCT descendant`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      return result.records.map((rec) => mapNodeToGraphNode(rec.get('descendant') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  async findShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.findFilteredShortestPath(fromNodeId, toNodeId, undefined, undefined, userId);
  }

  async findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    nodeTypeFilter?: readonly string[],
    userId?: string
  ): Promise<IGraphNode[]> {
    const relPattern = buildRelTypePattern(edgeTypeFilter);
    const params: Record<string, unknown> = { fromNodeId, toNodeId };

    if (userId !== undefined) {
      params['userId'] = userId;
    }

    let nodeFilterClause = '';
    if (nodeTypeFilter && nodeTypeFilter.length > 0) {
      nodeFilterClause = `AND all(x IN nodes(path) WHERE x.nodeType IN $nodeTypeFilter)`;
      params['nodeTypeFilter'] = nodeTypeFilter;
    }

    const userClause =
      userId !== undefined ? 'AND all(x IN nodes(path) WHERE x.userId = $userId)' : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (from {nodeId: $fromNodeId}), (to {nodeId: $toNodeId})
           MATCH path = shortestPath((from)-[:${relPattern}*]-(to))
           WHERE all(x IN nodes(path) WHERE x.isDeleted = false)
           ${nodeFilterClause} ${userClause}
           RETURN [n IN nodes(path) | n] AS pathNodes`,
          params
        );
      });

      const record = result.records[0];
      if (!record) return [];

      const pathNodes = record.get('pathNodes') as unknown[];
      return pathNodes.map((node) => mapNodeToGraphNode(node as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  async getSubgraph(
    rootNodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<ISubgraph> {
    const relPattern = buildRelTypePattern(options.edgeTypes);
    const userFilter =
      userId !== undefined ? 'AND all(x IN nodes(path) WHERE x.userId = $userId)' : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH path = (root {nodeId: $rootNodeId})-[:${relPattern}*0..${String(options.maxDepth)}]-(connected)
           WHERE all(x IN nodes(path) WHERE x.isDeleted = false)
           ${userFilter}
           WITH collect(DISTINCT connected) AS allNodes,
                [r IN collect(DISTINCT relationships(path)) | head(r)] AS allRels
           UNWIND allNodes AS n
           WITH collect(DISTINCT n) AS nodes, allRels
           UNWIND allRels AS r
           WITH nodes, collect(DISTINCT r) AS rels
           RETURN nodes, rels`,
          { rootNodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      const record = result.records[0];
      if (record === undefined) {
        return { nodes: [], edges: [], rootNodeId };
      }

      // Neo4j returns collections of nodes and relationships
      const nodes = record.get('nodes') as neo4j.Node[];
      const rels = record.get('rels') as neo4j.Relationship[];

      // Build node map for edge source/target resolution
      const nodeIdMap = new Map<string, NodeId>();
      for (const node of nodes) {
        const graphNode = mapNodeToGraphNode(node);
        nodeIdMap.set(node.identity.toString(), graphNode.nodeId);
      }

      const relMappings = rels.map((rel) => ({
        rel,
        sourceNodeId: nodeIdMap.get(rel.start.toString()) ?? ('' as NodeId),
        targetNodeId: nodeIdMap.get(rel.end.toString()) ?? ('' as NodeId),
        graphType: inferGraphType(nodes[0]?.labels ?? []),
      }));

      return buildSubgraph(nodes, relMappings, rootNodeId);
    } finally {
      await session.close();
    }
  }

  async detectCycles(nodeId: NodeId, edgeType?: GraphEdgeType, userId?: string): Promise<NodeId[]> {
    const relPattern = edgeType !== undefined ? edgeTypeToRelType(edgeType) : buildRelTypePattern();
    const userFilter =
      userId !== undefined ? 'WHERE all(x IN nodes(path) WHERE x.userId = $userId)' : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        // Look for paths that start and end at the same node
        // Limit depth to avoid unbounded traversal
        return tx.run(
          `MATCH path = (n {nodeId: $nodeId})-[:${relPattern}*1..50]->(n)
           ${userFilter}
           RETURN [x IN nodes(path) | x.nodeId] AS cycleNodeIds
           LIMIT 1`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      const record = result.records[0];
      if (!record) return [];

      return (record.get('cycleNodeIds') as string[]).map((id) => id as NodeId);
    } finally {
      await session.close();
    }
  }

  async getSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    userId?: string
  ): Promise<ISiblingsResult> {
    const relType = edgeTypeToRelType(query.edgeType);
    const userFilter =
      userId !== undefined
        ? 'AND me.userId = $userId AND parent.userId = $userId AND sibling.userId = $userId'
        : '';

    // Direction-dispatched: outbound = me→parent, inbound = parent→me
    const matchClause =
      query.direction === 'outbound'
        ? `MATCH (me {nodeId: $nodeId})-[e1:${relType}]->(parent)<-[e2:${relType}]-(sibling)`
        : `MATCH (me {nodeId: $nodeId})<-[e1:${relType}]-(parent)-[e2:${relType}]->(sibling)`;

    const session = this.neo4j.getSession();
    try {
      // First, fetch the origin node
      const originResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(`MATCH (n {nodeId: $nodeId}) WHERE n.isDeleted = false RETURN n`, {
          nodeId,
          ...(userId !== undefined ? { userId } : {}),
        });
      });
      const originRecord = originResult.records[0];
      if (!originRecord) {
        return {
          originNodeId: nodeId,
          originNode: { nodeId } as IGraphNode,
          edgeType: query.edgeType,
          direction: query.direction,
          groups: [],
          totalSiblingCount: 0,
        };
      }
      const originNode = mapNodeToGraphNode(originRecord.get('n') as neo4j.Node);

      // Execute the sibling query
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `${matchClause}
           WHERE me.isDeleted = false
             AND parent.isDeleted = false
             AND sibling.isDeleted = false
             AND sibling.nodeId <> $nodeId
             ${userFilter}
           WITH parent, collect(DISTINCT sibling) AS allSiblings, count(DISTINCT sibling) AS totalInGroup
           RETURN parent, allSiblings[0..${String(query.maxSiblingsPerGroup)}] AS siblings, totalInGroup
           ORDER BY totalInGroup DESC`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      let totalSiblingCount = 0;
      const groups = result.records.map((rec) => {
        const parentNode = mapNodeToGraphNode(rec.get('parent') as neo4j.Node);
        const siblingNodes = (rec.get('siblings') as neo4j.Node[]).map(mapNodeToGraphNode);
        const total = (rec.get('totalInGroup') as Integer).toNumber();
        totalSiblingCount += total;
        return {
          parent: parentNode,
          edgeType: query.edgeType,
          siblings: siblingNodes,
          totalInGroup: total,
        };
      });

      return {
        originNodeId: nodeId,
        originNode: originNode,
        edgeType: query.edgeType,
        direction: query.direction,
        groups,
        totalSiblingCount,
      };
    } finally {
      await session.close();
    }
  }

  async getCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    userId?: string
  ): Promise<ICoParentsResult> {
    const relType = edgeTypeToRelType(query.edgeType);
    const userFilter =
      userId !== undefined
        ? 'AND me.userId = $userId AND child.userId = $userId AND coParent.userId = $userId'
        : '';

    // Direction-dispatched: outbound = me→child, inbound = child→me
    const matchClause =
      query.direction === 'outbound'
        ? `MATCH (me {nodeId: $nodeId})-[e1:${relType}]->(child)<-[e2:${relType}]-(coParent)`
        : `MATCH (me {nodeId: $nodeId})<-[e1:${relType}]-(child)-[e2:${relType}]->(coParent)`;

    const session = this.neo4j.getSession();
    try {
      // First, fetch the origin node
      const originResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(`MATCH (n {nodeId: $nodeId}) WHERE n.isDeleted = false RETURN n`, {
          nodeId,
          ...(userId !== undefined ? { userId } : {}),
        });
      });
      const originRecord = originResult.records[0];
      if (!originRecord) {
        return {
          originNodeId: nodeId,
          originNode: { nodeId } as IGraphNode,
          edgeType: query.edgeType,
          direction: query.direction,
          groups: [],
          totalCoParentCount: 0,
        };
      }
      const originNode = mapNodeToGraphNode(originRecord.get('n') as neo4j.Node);

      // Execute the co-parents query
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `${matchClause}
           WHERE me.isDeleted = false
             AND child.isDeleted = false
             AND coParent.isDeleted = false
             AND coParent.nodeId <> $nodeId
             ${userFilter}
           WITH child, collect(DISTINCT coParent) AS allCoParents, count(DISTINCT coParent) AS totalInGroup
           RETURN child, allCoParents[0..${String(query.maxCoParentsPerGroup)}] AS coParents, totalInGroup
           ORDER BY totalInGroup DESC`,
          { nodeId, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      let totalCoParentCount = 0;
      const groups = result.records.map((rec) => {
        const childNode = mapNodeToGraphNode(rec.get('child') as neo4j.Node);
        const coParentNodes = (rec.get('coParents') as neo4j.Node[]).map(mapNodeToGraphNode);
        const total = (rec.get('totalInGroup') as Integer).toNumber();
        totalCoParentCount += total;
        return {
          child: childNode,
          edgeType: query.edgeType,
          coParents: coParentNodes,
          totalInGroup: total,
        };
      });

      return {
        originNodeId: nodeId,
        originNode: originNode,
        edgeType: query.edgeType,
        direction: query.direction,
        groups,
        totalCoParentCount,
      };
    } finally {
      await session.close();
    }
  }

  async getNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    userId?: string
  ): Promise<INeighborhoodResult> {
    const relPattern = buildRelTypePattern(query.edgeTypes);
    const userFilter =
      userId !== undefined ? 'AND all(x IN nodes(path) WHERE x.userId = $userId)' : '';
    const nodeTypeFilter =
      query.nodeTypes !== undefined && query.nodeTypes.length > 0
        ? 'AND all(x IN nodes(path)[1..] WHERE x.nodeType IN $nodeTypes)'
        : '';

    // Build direction pattern
    const dirArrowLeft = query.direction === 'inbound' ? '<' : '';
    const dirArrowRight = query.direction === 'outbound' ? '>' : '';

    const session = this.neo4j.getSession();
    try {
      // First, fetch the origin node
      const originResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(`MATCH (n {nodeId: $nodeId}) WHERE n.isDeleted = false RETURN n`, { nodeId });
      });
      const originRecord = originResult.records[0];
      if (!originRecord) {
        return {
          originNodeId: nodeId,
          originNode: { nodeId } as IGraphNode,
          groups: [],
          edges: [],
          totalNeighborCount: 0,
        };
      }
      const originNode = mapNodeToGraphNode(originRecord.get('n') as neo4j.Node);

      const params: Record<string, unknown> = {
        nodeId,
        ...(userId !== undefined ? { userId } : {}),
        ...(query.nodeTypes !== undefined && query.nodeTypes.length > 0
          ? { nodeTypes: query.nodeTypes }
          : {}),
      };

      let groupsResult: {
        edgeType: string;
        direction: string;
        neighbors: neo4j.Node[];
        totalInGroup: number;
      }[];
      let edgeRecords: IGraphEdge[] = [];

      if (query.filterMode === 'immediate' && query.hops > 1) {
        // Immediate mode: first hop filtered, remaining hops untyped
        const remainingHops = query.hops - 1;

        const result = await session.executeRead(async (tx: ManagedTransaction) => {
          return tx.run(
            `MATCH (origin {nodeId: $nodeId})${dirArrowLeft}-[r1:${relPattern}]-${dirArrowRight}(hop1)
             WHERE hop1.isDeleted = false AND origin.isDeleted = false
               ${userId !== undefined ? 'AND origin.userId = $userId AND hop1.userId = $userId' : ''}
             WITH origin, hop1, r1, type(r1) AS firstEdgeType,
                  CASE WHEN startNode(r1) = origin THEN 'outbound' ELSE 'inbound' END AS dir
             OPTIONAL MATCH path = (hop1)-[*1..${String(remainingHops)}]-(further)
             WHERE all(n IN nodes(path) WHERE n.isDeleted = false)
               ${query.nodeTypes !== undefined && query.nodeTypes.length > 0 ? 'AND all(n IN nodes(path) WHERE n.nodeType IN $nodeTypes)' : ''}
               ${userId !== undefined ? 'AND all(n IN nodes(path) WHERE n.userId = $userId)' : ''}
             WITH firstEdgeType, dir,
                  collect(DISTINCT hop1) + collect(DISTINCT further) AS allNeighbors
             UNWIND allNeighbors AS neighbor
             WITH firstEdgeType, dir, neighbor
             WHERE neighbor.nodeId <> $nodeId
             WITH firstEdgeType AS edgeType, dir,
                  collect(DISTINCT neighbor)[0..${String(query.maxPerGroup)}] AS neighbors,
                  count(DISTINCT neighbor) AS totalInGroup
             RETURN edgeType, dir, neighbors, totalInGroup`,
            params
          );
        });

        groupsResult = result.records.map((rec) => ({
          edgeType: rec.get('edgeType') as string,
          direction: rec.get('dir') as string,
          neighbors: rec.get('neighbors') as neo4j.Node[],
          totalInGroup: (rec.get('totalInGroup') as Integer).toNumber(),
        }));
      } else {
        // Full-path mode (or hops=1 where both modes are equivalent)
        const result = await session.executeRead(async (tx: ManagedTransaction) => {
          return tx.run(
            `MATCH path = (origin {nodeId: $nodeId})${dirArrowLeft}-[rels:${relPattern}*1..${String(query.hops)}]-${dirArrowRight}(neighbor)
             WHERE all(n IN nodes(path) WHERE n.isDeleted = false)
               ${nodeTypeFilter}
               ${userFilter}
             WITH origin, neighbor, relationships(path) AS pathRels, length(path) AS dist
             WITH origin, neighbor, head(pathRels) AS firstRel, dist
             ORDER BY dist ASC
             WITH origin, type(firstRel) AS edgeType,
                  CASE WHEN startNode(firstRel) = origin THEN 'outbound' ELSE 'inbound' END AS dir,
                  collect(DISTINCT neighbor)[0..${String(query.maxPerGroup)}] AS neighbors,
                  count(DISTINCT neighbor) AS totalInGroup
             RETURN edgeType, dir, neighbors, totalInGroup`,
            params
          );
        });

        groupsResult = result.records.map((rec) => ({
          edgeType: rec.get('edgeType') as string,
          direction: rec.get('dir') as string,
          neighbors: rec.get('neighbors') as neo4j.Node[],
          totalInGroup: (rec.get('totalInGroup') as Integer).toNumber(),
        }));
      }

      // Optionally fetch edges
      if (query.includeEdges) {
        const allNeighborNodeIds = groupsResult.flatMap((g) =>
          g.neighbors.map((n) => mapNodeToGraphNode(n).nodeId)
        );
        if (allNeighborNodeIds.length > 0) {
          const edgesResult = await session.executeRead(async (tx: ManagedTransaction) => {
            return tx.run(
              `MATCH (a)-[r]->(b)
               WHERE (a.nodeId = $nodeId OR a.nodeId IN $neighborNodeIds)
                 AND (b.nodeId = $nodeId OR b.nodeId IN $neighborNodeIds)
                 AND a.isDeleted = false AND b.isDeleted = false
               RETURN r, a.nodeId AS sourceId, b.nodeId AS targetId, a.graphType AS graphType`,
              { nodeId, neighborNodeIds: allNeighborNodeIds }
            );
          });
          edgeRecords = edgesResult.records.map((rec) =>
            mapRelationshipToGraphEdge(
              rec.get('r') as neo4j.Relationship,
              rec.get('sourceId') as NodeId,
              rec.get('targetId') as NodeId,
              rec.get('graphType') as IGraphEdge['graphType']
            )
          );
        }
      }

      const groups = groupsResult.map((g) => ({
        edgeType: g.edgeType.toLowerCase() as IGraphEdge['edgeType'],
        direction: g.direction as 'inbound' | 'outbound',
        neighbors: g.neighbors.map(mapNodeToGraphNode),
        totalInGroup: g.totalInGroup,
      }));

      const totalNeighborCount = groups.reduce((sum, g) => sum + g.totalInGroup, 0);

      return {
        originNodeId: nodeId,
        originNode: originNode,
        groups,
        edges: query.includeEdges ? edgeRecords : [],
        totalNeighborCount,
      };
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Phase 8c: Structural Analysis Operations
  // ==========================================================================

  /**
   * GDS availability detection. Cached after first check.
   */
  private gdsAvailable: boolean | undefined;

  private async checkGdsAvailability(): Promise<boolean> {
    if (this.gdsAvailable !== undefined) return this.gdsAvailable;

    const session = this.neo4j.getSession();
    try {
      await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run('RETURN gds.version() AS version');
      });
      this.gdsAvailable = true;
      this.logger.info('Neo4j GDS detected — native graph algorithms available');
    } catch {
      this.gdsAvailable = false;
      this.logger.info('Neo4j GDS not available — using application-code algorithms');
    } finally {
      await session.close();
    }

    return this.gdsAvailable;
  }

  async getDomainSubgraph(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    userId?: string
  ): Promise<ISubgraph> {
    const relPattern = buildRelTypePattern(edgeTypes);
    const userFilter = userId !== undefined ? 'AND n.userId = $userId' : '';
    const edgeUserFilter =
      userId !== undefined ? 'AND a.userId = $userId AND b.userId = $userId' : '';

    const session = this.neo4j.getSession();
    try {
      // Fetch all nodes in the domain
      const nodesResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {domain: $domain})
           WHERE n.isDeleted = false ${userFilter}
           RETURN n`,
          { domain, ...(userId !== undefined ? { userId } : {}) }
        );
      });

      const nodes = nodesResult.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));

      if (nodes.length === 0) {
        return { nodes: [], edges: [] };
      }

      const nodeIds = nodes.map((n) => n.nodeId);

      // Fetch all edges between domain nodes of the specified types
      const edgesResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (a)-[r:${relPattern}]->(b)
           WHERE a.domain = $domain AND b.domain = $domain
             AND a.isDeleted = false AND b.isDeleted = false
             AND a.nodeId IN $nodeIds AND b.nodeId IN $nodeIds
             ${edgeUserFilter}
           RETURN r, a.nodeId AS sourceId, b.nodeId AS targetId,
                  CASE WHEN any(l IN labels(a) WHERE l STARTS WITH 'Pkg') THEN 'pkg' ELSE 'ckg' END AS graphType`,
          {
            domain,
            nodeIds,
            ...(userId !== undefined ? { userId } : {}),
          }
        );
      });

      const edges = edgesResult.records.map((r) =>
        mapRelationshipToGraphEdge(
          r.get('r') as neo4j.Relationship,
          r.get('sourceId') as NodeId,
          r.get('targetId') as NodeId,
          r.get('graphType') as IGraphEdge['graphType']
        )
      );

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async findArticulationPointsNative(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    userId?: string
  ): Promise<NodeId[] | null> {
    const gdsAvailable = await this.checkGdsAvailability();
    if (!gdsAvailable) return null;

    const relPattern = buildRelTypePattern(edgeTypes);
    const userFilter = userId !== undefined ? 'AND n.userId = $userId' : '';

    const session = this.neo4j.getSession();
    const graphName = `bridge_analysis_${domain}_${Date.now()}`;

    try {
      // Project the domain subgraph into GDS
      const nodeQuery = `MATCH (n {domain: $domain}) WHERE n.isDeleted = false ${userFilter} RETURN id(n) AS id`;
      const relQuery = `MATCH (a {domain: $domain})-[r:${relPattern}]->(b {domain: $domain})
                        WHERE a.isDeleted = false AND b.isDeleted = false
                          ${userId !== undefined ? 'AND a.userId = $userId AND b.userId = $userId' : ''}
                        RETURN id(a) AS source, id(b) AS target`;

      await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `CALL gds.graph.project.cypher($graphName, $nodeQuery, $relQuery, {
             parameters: { domain: $domain ${userId !== undefined ? ', userId: $userId' : ''} }
           })`,
          {
            graphName,
            nodeQuery,
            relQuery,
            domain,
            ...(userId !== undefined ? { userId } : {}),
          }
        );
      });

      // Run articulation point detection
      const apResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `CALL gds.articulationPoints.stream($graphName)
           YIELD nodeId
           WITH gds.util.asNode(nodeId) AS node
           RETURN node.nodeId AS nodeId`,
          { graphName }
        );
      });

      const articulationPointIds = apResult.records.map((r) => r.get('nodeId') as NodeId);

      return articulationPointIds;
    } catch (error) {
      this.logger.warn(
        { error, domain },
        "GDS articulation point detection failed — caller should fall back to Tarjan's"
      );
      return null;
    } finally {
      // Clean up the projected graph
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          return tx.run('CALL gds.graph.drop($graphName, false)', { graphName });
        });
      } catch {
        // Ignore cleanup errors
      }
      await session.close();
    }
  }

  async getKnowledgeFrontier(
    query: IFrontierQuery,
    userId: string
  ): Promise<IKnowledgeFrontierResult> {
    const session = this.neo4j.getSession();
    try {
      // Main frontier query: find unmastered nodes with at least one mastered prerequisite
      const frontierResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (node:PkgNode {userId: $userId, domain: $domain})
           WHERE node.isDeleted = false
             AND (node.masteryLevel IS NULL OR node.masteryLevel < $threshold)
           OPTIONAL MATCH (node)-[:PREREQUISITE]->(prereq:PkgNode {userId: $userId})
           WHERE prereq.isDeleted = false
           WITH node,
                collect(prereq) AS prereqs,
                [p IN collect(prereq) WHERE p.masteryLevel >= $threshold] AS masteredPrereqs
           WHERE size(masteredPrereqs) > 0 OR size(prereqs) = 0
           RETURN node,
                  masteredPrereqs,
                  size(masteredPrereqs) AS masteredCount,
                  size(prereqs) AS totalPrereqs,
                  CASE WHEN size(prereqs) = 0 THEN 1.0
                       ELSE toFloat(size(masteredPrereqs)) / size(prereqs)
                  END AS readinessScore
           ORDER BY readinessScore DESC
           LIMIT $maxResults`,
          {
            userId,
            domain: query.domain,
            threshold: query.masteryThreshold,
            maxResults: neo4j.int(query.maxResults),
          }
        );
      });

      // Build frontier nodes
      const frontier = frontierResult.records.map((rec) => {
        const node = mapNodeToGraphNode(rec.get('node') as neo4j.Node);
        const masteredCount = (rec.get('masteredCount') as Integer).toNumber();
        const totalPrereqs = (rec.get('totalPrereqs') as Integer).toNumber();
        const readinessScore = rec.get('readinessScore') as number;

        const masteredPrereqNodes = query.includePrerequisites
          ? (rec.get('masteredPrereqs') as neo4j.Node[]).map(mapNodeToGraphNode)
          : undefined;

        // Compute average mastery of prerequisites
        const masteredPrereqs = rec.get('masteredPrereqs') as neo4j.Node[];
        const avgMastery =
          masteredPrereqs.length > 0
            ? masteredPrereqs.reduce((sum, p) => {
                const ml = p.properties['masteryLevel'];
                return sum + (typeof ml === 'number' ? ml : 0);
              }, 0) / masteredPrereqs.length
            : 0;

        return {
          node,
          prerequisiteMasteryAvg: avgMastery,
          prerequisiteReadiness: `${String(masteredCount)}/${String(totalPrereqs)}`,
          readinessScore,
          ...(masteredPrereqNodes !== undefined
            ? { masteredPrerequisites: masteredPrereqNodes }
            : {}),
        };
      });

      // Summary statistics
      const summaryResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n:PkgNode {userId: $userId, domain: $domain})
           WHERE n.isDeleted = false
           WITH count(n) AS total,
                sum(CASE WHEN n.masteryLevel >= $threshold THEN 1 ELSE 0 END) AS mastered,
                sum(CASE WHEN n.masteryLevel IS NULL OR n.masteryLevel < $threshold THEN 1 ELSE 0 END) AS unmastered
           RETURN total, mastered, unmastered`,
          {
            userId,
            domain: query.domain,
            threshold: query.masteryThreshold,
          }
        );
      });

      const summaryRec = summaryResult.records[0];
      const totalNodes =
        summaryRec !== undefined ? (summaryRec.get('total') as Integer).toNumber() : 0;
      const totalMastered =
        summaryRec !== undefined ? (summaryRec.get('mastered') as Integer).toNumber() : 0;
      const totalUnmastered =
        summaryRec !== undefined ? (summaryRec.get('unmastered') as Integer).toNumber() : 0;

      return {
        domain: query.domain,
        masteryThreshold: query.masteryThreshold,
        frontier,
        summary: {
          totalMastered,
          totalUnmastered,
          totalFrontier: frontier.length,
          totalDeepUnmastered: totalUnmastered - frontier.length,
          masteryPercentage: totalNodes > 0 ? totalMastered / totalNodes : 0,
        },
      };
    } finally {
      await session.close();
    }
  }

  async getCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    userId?: string
  ): Promise<ICommonAncestorsResult> {
    const relPattern = buildRelTypePattern(query.edgeTypes);
    const userFilter = userId !== undefined ? 'AND a.userId = $userId' : '';
    const ancestorUserFilter =
      userId !== undefined
        ? 'WHERE ancestor.userId = $userId AND ancestor.isDeleted = false'
        : 'WHERE ancestor.isDeleted = false';

    const session = this.neo4j.getSession();
    try {
      // Fetch both query nodes
      const nodesResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (a) WHERE a.nodeId IN [$nodeIdA, $nodeIdB] AND a.isDeleted = false ${userFilter}
           RETURN a`,
          {
            nodeIdA,
            nodeIdB,
            ...(userId !== undefined ? { userId } : {}),
          }
        );
      });

      const fetchedNodes = nodesResult.records.map((r) =>
        mapNodeToGraphNode(r.get('a') as neo4j.Node)
      );
      const nodeA = fetchedNodes.find((n) => n.nodeId === nodeIdA);
      const nodeB = fetchedNodes.find((n) => n.nodeId === nodeIdB);

      if (nodeA === undefined || nodeB === undefined) {
        // Return empty result if either node not found
        const emptyNode = (id: NodeId) =>
          ({
            nodeId: id,
            graphType: 'pkg',
            nodeType: 'concept',
            label: '',
            domain: '',
            properties: {},
            createdAt: '',
            updatedAt: '',
          }) as unknown as IGraphNode;

        return {
          nodeA: nodeA ?? emptyNode(nodeIdA),
          nodeB: nodeB ?? emptyNode(nodeIdB),
          lowestCommonAncestors: [],
          allCommonAncestors: [],
          directlyConnected: false,
          pathFromA: [],
          pathFromB: [],
        };
      }

      // Check direct connection
      const directResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (a {nodeId: $nodeIdA})-[r:${relPattern}]-(b {nodeId: $nodeIdB})
           RETURN count(r) > 0 AS connected`,
          { nodeIdA, nodeIdB }
        );
      });
      const directlyConnected = directResult.records[0]?.get('connected') === true;

      // Find ancestors of both nodes and compute intersection
      const ancestorsResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH pathA = (a {nodeId: $nodeIdA})-[:${relPattern}*1..${String(query.maxDepth)}]->(ancestorA)
           ${ancestorUserFilter.replace('ancestor', 'ancestorA')}
           WITH collect(DISTINCT {nodeId: ancestorA.nodeId, node: ancestorA, depth: length(pathA)}) AS ancestorsA

           MATCH pathB = (b {nodeId: $nodeIdB})-[:${relPattern}*1..${String(query.maxDepth)}]->(ancestorB)
           ${ancestorUserFilter.replace('ancestor', 'ancestorB')}
           WITH ancestorsA, collect(DISTINCT {nodeId: ancestorB.nodeId, node: ancestorB, depth: length(pathB)}) AS ancestorsB

           UNWIND ancestorsA AS entryA
           UNWIND ancestorsB AS entryB
           WHERE entryA.nodeId = entryB.nodeId
           WITH entryA.node AS ancestor,
                min(entryA.depth) AS depthFromA,
                min(entryB.depth) AS depthFromB
           RETURN ancestor,
                  depthFromA,
                  depthFromB,
                  depthFromA + depthFromB AS combinedDepth
           ORDER BY combinedDepth ASC`,
          {
            nodeIdA,
            nodeIdB,
            ...(userId !== undefined ? { userId } : {}),
          }
        );
      });

      const allCommonAncestors = ancestorsResult.records.map((rec) => ({
        node: mapNodeToGraphNode(rec.get('ancestor') as neo4j.Node),
        depthFromA: (rec.get('depthFromA') as Integer).toNumber(),
        depthFromB: (rec.get('depthFromB') as Integer).toNumber(),
        combinedDepth: (rec.get('combinedDepth') as Integer).toNumber(),
      }));

      // LCA = ancestors with the minimum combinedDepth
      const minCombinedDepth =
        allCommonAncestors.length > 0 ? allCommonAncestors[0]!.combinedDepth : Infinity;
      const lowestCommonAncestors = allCommonAncestors
        .filter((a) => a.combinedDepth === minCombinedDepth)
        .map((a) => a.node);

      // Compute paths from A and B to the first LCA
      let pathFromA: IGraphNode[] = [];
      let pathFromB: IGraphNode[] = [];

      if (lowestCommonAncestors.length > 0) {
        const lcaNodeId = lowestCommonAncestors[0]!.nodeId;

        const pathsResult = await session.executeRead(async (tx: ManagedTransaction) => {
          return tx.run(
            `OPTIONAL MATCH pathA = shortestPath((a {nodeId: $nodeIdA})-[:${relPattern}*1..${String(query.maxDepth)}]->(lca {nodeId: $lcaNodeId}))
             WITH [n IN nodes(pathA) | n] AS nodesA
             OPTIONAL MATCH pathB = shortestPath((b {nodeId: $nodeIdB})-[:${relPattern}*1..${String(query.maxDepth)}]->(lca2 {nodeId: $lcaNodeId}))
             RETURN nodesA, [n IN nodes(pathB) | n] AS nodesB`,
            { nodeIdA, nodeIdB, lcaNodeId }
          );
        });

        const pathRec = pathsResult.records[0];
        if (pathRec !== undefined) {
          const nodesA = pathRec.get('nodesA') as neo4j.Node[] | null;
          const nodesB = pathRec.get('nodesB') as neo4j.Node[] | null;
          if (nodesA !== null) pathFromA = nodesA.map(mapNodeToGraphNode);
          if (nodesB !== null) pathFromB = nodesB.map(mapNodeToGraphNode);
        }
      }

      return {
        nodeA,
        nodeB,
        lowestCommonAncestors,
        allCommonAncestors,
        directlyConnected,
        pathFromA,
        pathFromB,
      };
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // IBatchGraphRepository
  // ==========================================================================

  async createNodes(
    graphType: string,
    inputs: readonly ICreateNodeInput[],
    userId?: string
  ): Promise<IGraphNode[]> {
    if (inputs.length === 0) return [];

    const primaryLabel = graphTypeToLabel(graphType);
    const nodeDataList = inputs.map((input) => {
      const nodeId = generateNodeId();
      return {
        nodeId,
        secondaryLabel: nodeTypeToLabel(input.nodeType),
        props: buildNodeProperties(input, nodeId, graphType, userId),
      };
    });

    const session = this.neo4j.getSession();
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        // Use UNWIND for batch creation
        const records = await tx.run(
          `UNWIND $items AS item
           CALL {
             WITH item
             CREATE (n:${primaryLabel} { nodeId: item.props.nodeId, graphType: item.props.graphType, nodeType: item.props.nodeType, label: item.props.label, domain: item.props.domain, createdAt: item.props.createdAt, updatedAt: item.props.updatedAt, isDeleted: false })
             SET n += item.props
             SET n:${primaryLabel}
             RETURN n
           }
           RETURN n`,
          {
            items: nodeDataList.map((d) => ({
              props: d.props,
              secondaryLabel: d.secondaryLabel,
            })),
          }
        );
        return records;
      });

      // For batch creates, we need to add secondary labels
      // Since CALL subqueries limit dynamic labeling, we do a follow-up
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const item of nodeDataList) {
          await tx.run(
            `MATCH (n:${primaryLabel} {nodeId: $nodeId})
             SET n:${item.secondaryLabel}`,
            { nodeId: item.nodeId }
          );
        }
      });

      // Re-fetch the created nodes with all labels
      const fetchResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n:${primaryLabel})
           WHERE n.nodeId IN $nodeIds
           RETURN n`,
          { nodeIds: nodeDataList.map((d) => d.nodeId) }
        );
      });

      this.logger.debug({ count: inputs.length, graphType }, 'Batch nodes created');
      return fetchResult.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  async createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]> {
    if (inputs.length === 0) return [];

    const session = this.neo4j.getSession();
    try {
      const edges: IGraphEdge[] = [];

      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const input of inputs) {
          const edgeId = generateEdgeId();
          const relType = edgeTypeToRelType(input.edgeType);
          const edgeProps = buildEdgeProperties(input, edgeId, userId);

          const result = await tx.run(
            `MATCH (source {nodeId: $sourceNodeId, isDeleted: false})
             MATCH (target {nodeId: $targetNodeId, isDeleted: false})
             CREATE (source)-[r:${relType} $edgeProps]->(target)
             RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                    source.graphType AS graphType`,
            {
              sourceNodeId: input.sourceNodeId,
              targetNodeId: input.targetNodeId,
              edgeProps,
            }
          );

          const record = result.records[0];
          if (record !== undefined) {
            edges.push(
              mapRelationshipToGraphEdge(
                record.get('r') as neo4j.Relationship,
                record.get('sourceId') as NodeId,
                record.get('targetId') as NodeId,
                record.get('graphType') as IGraphEdge['graphType']
              )
            );
          }
        }
      });

      this.logger.debug({ count: inputs.length, graphType }, 'Batch edges created');
      return edges;
    } finally {
      await session.close();
    }
  }

  async getNodesByIds(nodeIds: readonly NodeId[], userId?: string): Promise<IGraphNode[]> {
    if (nodeIds.length === 0) return [];

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n)
           WHERE n.nodeId IN $nodeIds AND n.isDeleted = false
           ${userId !== undefined ? 'AND n.userId = $userId' : ''}
           RETURN n`,
          { nodeIds: [...nodeIds], ...(userId !== undefined ? { userId } : {}) }
        );
      });

      return result.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Build dynamic WHERE clauses and parameters from an INodeFilter.
   */
  private buildNodeFilterClauses(filter: INodeFilter): {
    whereClauses: string[];
    params: Record<string, unknown>;
  } {
    const whereClauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (!filter.includeDeleted) {
      whereClauses.push('n.isDeleted = false');
    }

    if (filter.nodeType !== undefined) {
      whereClauses.push('n.nodeType = $nodeType');
      params['nodeType'] = filter.nodeType;
    }

    if (filter.domain !== undefined) {
      whereClauses.push('n.domain = $domain');
      params['domain'] = filter.domain;
    }

    if (filter.userId !== undefined) {
      whereClauses.push('n.userId = $userId');
      params['userId'] = filter.userId;
    }

    if (filter.labelContains !== undefined) {
      whereClauses.push('toLower(n.label) CONTAINS toLower($labelContains)');
      params['labelContains'] = filter.labelContains;
    }

    return { whereClauses, params };
  }

  /**
   * Build a label filter string for MATCH clauses from INodeFilter.
   */
  private buildLabelFilter(filter: INodeFilter): string {
    if (filter.graphType === 'pkg') return ':PkgNode';
    if (filter.graphType === 'ckg') return ':CkgNode';
    return ''; // Match all nodes
  }

  // ==========================================================================
  // IGraphRepository — Transactional Support
  // ==========================================================================

  /**
   * Execute a callback within a single Neo4j transaction.
   *
   * All graph operations inside the callback are performed on the same
   * session/transaction and commit atomically. On failure, the entire
   * transaction is rolled back, ensuring no partial CKG mutations.
   */
  async runInTransaction<T>(fn: (txRepo: IGraphRepository) => Promise<T>): Promise<T> {
    const session = this.neo4j.getSession();
    const tx = session.beginTransaction();

    // Create a lightweight transactional proxy that delegates Cypher
    // execution to the open transaction instead of creating new sessions.
    const txRepo = new Neo4jTransactionalGraphRepository(tx);

    try {
      const result = await fn(txRepo);
      await tx.commit();
      return result;
    } catch (error) {
      try {
        await tx.rollback();
      } catch (rbError) {
        this.logger.warn(
          { error: rbError },
          'Transaction rollback failed (original error will be thrown)'
        );
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Translate Neo4j driver errors to domain errors.
   * Domain errors (NodeNotFoundError, EdgeNotFoundError, etc.) are re-thrown as-is.
   */
  private translateNeo4jError(
    error: unknown,
    operation: string,
    context: Record<string, unknown>
  ): never {
    // Re-throw domain errors without wrapping
    if (
      error instanceof NodeNotFoundError ||
      error instanceof EdgeNotFoundError ||
      error instanceof DuplicateNodeError ||
      error instanceof GraphConsistencyError
    ) {
      throw error;
    }

    if (error instanceof Error) {
      const neo4jError = error as { code?: string };

      // Constraint violation → DuplicateNodeError
      if (neo4jError.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
        const label = context['label'] ?? context['nodeId'] ?? '';
        const domain = context['domain'] ?? '';
        const nodeId = context['nodeId'] ?? '';
        throw new DuplicateNodeError(
          typeof label === 'string' ? label : JSON.stringify(label),
          typeof domain === 'string' ? domain : JSON.stringify(domain),
          typeof nodeId === 'string' ? nodeId : JSON.stringify(nodeId)
        );
      }

      // Session/connection errors → GraphConsistencyError
      if (
        neo4jError.code?.startsWith('Neo.TransientError') === true ||
        neo4jError.code?.startsWith('Neo.ClientError.Transaction') === true
      ) {
        throw new GraphConsistencyError(
          'transaction_failed',
          `Neo4j transaction failed during ${operation}: ${error.message}`,
          context
        );
      }

      // Service unavailable (connection pool exhausted, server down)
      if (
        neo4jError.code === 'ServiceUnavailable' ||
        neo4jError.code === 'Neo.ClientError.Security.Unauthorized'
      ) {
        throw new GraphConsistencyError(
          'service_unavailable',
          `Neo4j unavailable during ${operation}: ${error.message}`,
          context
        );
      }

      // Session expired (connection dropped mid-operation)
      if (neo4jError.code === 'SessionExpired') {
        throw new GraphConsistencyError(
          'session_expired',
          `Neo4j session expired during ${operation}: ${error.message}`,
          context
        );
      }

      // Database errors (schema issues, internal failures)
      if (neo4jError.code?.startsWith('Neo.DatabaseError') === true) {
        throw new GraphConsistencyError(
          'database_error',
          `Neo4j database error during ${operation}: ${error.message}`,
          context
        );
      }
    }

    // Unknown error — rethrow
    throw error;
  }
}

// ============================================================================
// Utility
// ============================================================================

function neo4jInt(value: number): Integer {
  return neo4j.int(value);
}

function toJsNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return 0;
}

// ============================================================================
// Neo4jTransactionalGraphRepository
// ============================================================================

/**
 * Lightweight IGraphRepository that executes all operations on an
 * existing explicit Neo4j transaction (no new sessions created).
 *
 * Used exclusively by `Neo4jGraphRepository.runInTransaction()` to
 * provide atomic multi-operation semantics for the CKG commit protocol.
 *
 * Note: traversal & batch read methods are pass-through stubs that throw
 * since the commit protocol only needs write operations + getNode/getEdge.
 */
class Neo4jTransactionalGraphRepository implements IGraphRepository {
  constructor(private readonly tx: neo4j.Transaction) {}

  // ── Node CRUD ─────────────────────────────────────────────────────────

  async createNode(
    graphType: string,
    input: ICreateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const nodeId = generateNodeId();
    const primaryLabel = graphTypeToLabel(graphType);
    const secondaryLabel = nodeTypeToLabel(input.nodeType);
    const props = buildNodeProperties(input, nodeId, graphType, userId);

    const result = await this.tx.run(
      `CREATE (n:${primaryLabel}:${secondaryLabel} $props) RETURN n`,
      { props }
    );

    const node = result.records[0]?.get('n') as neo4j.Node | undefined;
    if (!node) {
      throw new GraphConsistencyError('node_creation_failed', `Failed to create node ${nodeId}`);
    }

    return mapNodeToGraphNode(node);
  }

  async getNode(nodeId: NodeId, userId?: string): Promise<IGraphNode | null> {
    const result = await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       RETURN n LIMIT 1`,
      { nodeId, ...(userId !== undefined ? { userId } : {}) }
    );

    const record = result.records[0];
    return record ? mapNodeToGraphNode(record.get('n') as neo4j.Node) : null;
  }

  async updateNode(
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const updateProps = buildNodeUpdateProperties(updates);
    const result = await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       SET n += $updateProps RETURN n`,
      { nodeId, updateProps, ...(userId !== undefined ? { userId } : {}) }
    );

    const record = result.records[0];
    if (!record) throw new NodeNotFoundError(nodeId);
    return mapNodeToGraphNode(record.get('n') as neo4j.Node);
  }

  async deleteNode(nodeId: NodeId, userId?: string): Promise<void> {
    const result = await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       SET n.isDeleted = true, n.deletedAt = $deletedAt, n.updatedAt = $deletedAt
       RETURN n`,
      { nodeId, deletedAt: new Date().toISOString(), ...(userId !== undefined ? { userId } : {}) }
    );

    if (result.records.length === 0) throw new NodeNotFoundError(nodeId);
  }

  async findNodes(_filter: INodeFilter, _limit: number, _offset: number): Promise<IGraphNode[]> {
    throw new Error('findNodes is not supported within a transaction context');
  }

  async countNodes(_filter: INodeFilter): Promise<number> {
    throw new Error('countNodes is not supported within a transaction context');
  }

  // ── Edge CRUD ─────────────────────────────────────────────────────────

  async createEdge(
    _graphType: string,
    input: ICreateEdgeInput,
    userId?: string
  ): Promise<IGraphEdge> {
    const edgeId = generateEdgeId();
    const relType = edgeTypeToRelType(input.edgeType);
    const edgeProps = buildEdgeProperties(input, edgeId, userId);

    const result = await this.tx.run(
      `MATCH (source {nodeId: $sourceNodeId, isDeleted: false})
       MATCH (target {nodeId: $targetNodeId, isDeleted: false})
       CREATE (source)-[r:${relType} $edgeProps]->(target)
       RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
              source.graphType AS sourceGraphType`,
      { sourceNodeId: input.sourceNodeId, targetNodeId: input.targetNodeId, edgeProps }
    );

    const record = result.records[0];
    if (!record) {
      throw new GraphConsistencyError(
        'edge_creation_failed',
        `Failed to create edge from ${String(input.sourceNodeId)} to ${String(input.targetNodeId)}`
      );
    }

    return mapRelationshipToGraphEdge(
      record.get('r') as neo4j.Relationship,
      record.get('sourceId') as NodeId,
      record.get('targetId') as NodeId,
      inferGraphType([record.get('sourceGraphType') as string])
    );
  }

  async getEdge(edgeId: EdgeId): Promise<IGraphEdge | null> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    const result = await this.tx.run(
      `MATCH (source)-[r:${relTypePattern}]->(target)
       WHERE r.edgeId = $edgeId
       RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
              source.graphType AS graphType`,
      { edgeId }
    );

    const record = result.records[0];
    if (!record) return null;

    return mapRelationshipToGraphEdge(
      record.get('r') as neo4j.Relationship,
      record.get('sourceId') as NodeId,
      record.get('targetId') as NodeId,
      record.get('graphType') as IGraphEdge['graphType']
    );
  }

  async updateEdge(edgeId: EdgeId, updates: IUpdateEdgeInput): Promise<IGraphEdge> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    const updateProps: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.weight !== undefined) updateProps['weight'] = updates.weight;
    if (updates.properties !== undefined) {
      for (const [key, value] of Object.entries(updates.properties)) {
        updateProps[`prop_${key}`] = value;
      }
    }

    const result = await this.tx.run(
      `MATCH (src)-[r:${relTypePattern}]->(tgt)
       WHERE r.edgeId = $edgeId
       SET r += $updateProps
       RETURN r, src.nodeId AS sourceNodeId, tgt.nodeId AS targetNodeId, labels(src) AS srcLabels`,
      { edgeId, updateProps }
    );

    const record = result.records[0];
    if (!record) throw new EdgeNotFoundError(edgeId);

    return mapRelationshipToGraphEdge(
      record.get('r') as neo4j.Relationship,
      record.get('sourceNodeId') as NodeId,
      record.get('targetNodeId') as NodeId,
      inferGraphType(record.get('srcLabels') as string[])
    );
  }

  async removeEdge(edgeId: EdgeId): Promise<void> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    const result = await this.tx.run(
      `MATCH ()-[r:${relTypePattern}]->()
       WHERE r.edgeId = $edgeId
       DELETE r RETURN count(r) AS deleted`,
      { edgeId }
    );

    const deleted = result.records[0] ? toJsNumber(result.records[0].get('deleted')) : 0;
    if (deleted === 0) throw new EdgeNotFoundError(edgeId);
  }

  async findEdges(_filter: IEdgeFilter): Promise<IGraphEdge[]> {
    throw new Error('findEdges is not supported within a transaction context');
  }

  async getEdgesForNode(nodeId: NodeId, direction: EdgeDirection): Promise<IGraphEdge[]> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    let query: string;

    switch (direction) {
      case 'outbound':
        query = `MATCH (n {nodeId: $nodeId})-[r:${relTypePattern}]->(target)
                 RETURN r, n.nodeId AS sourceId, target.nodeId AS targetId, labels(n) AS srcLabels`;
        break;
      case 'inbound':
        query = `MATCH (source)-[r:${relTypePattern}]->(n {nodeId: $nodeId})
                 RETURN r, source.nodeId AS sourceId, n.nodeId AS targetId, labels(source) AS srcLabels`;
        break;
      default:
        query = `MATCH (n {nodeId: $nodeId})-[r:${relTypePattern}]-(other)
                 RETURN r, startNode(r).nodeId AS sourceId, endNode(r).nodeId AS targetId, labels(startNode(r)) AS srcLabels`;
    }

    const result = await this.tx.run(query, { nodeId });
    return result.records.map((rec) =>
      mapRelationshipToGraphEdge(
        rec.get('r') as neo4j.Relationship,
        rec.get('sourceId') as NodeId,
        rec.get('targetId') as NodeId,
        inferGraphType(rec.get('srcLabels') as string[])
      )
    );
  }

  // ── Traversal (not needed in transaction context, stubs) ──────────────

  async getAncestors(): Promise<IGraphNode[]> {
    throw new Error('getAncestors is not supported within a transaction context');
  }

  async getDescendants(): Promise<IGraphNode[]> {
    throw new Error('getDescendants is not supported within a transaction context');
  }

  async findShortestPath(): Promise<IGraphNode[]> {
    throw new Error('findShortestPath is not supported within a transaction context');
  }

  async findFilteredShortestPath(): Promise<IGraphNode[]> {
    throw new Error('findFilteredShortestPath is not supported within a transaction context');
  }

  async getSubgraph(): Promise<ISubgraph> {
    throw new Error('getSubgraph is not supported within a transaction context');
  }

  async detectCycles(): Promise<NodeId[]> {
    throw new Error('detectCycles is not supported within a transaction context');
  }

  // ── Batch operations ──────────────────────────────────────────────────

  async createNodes(
    graphType: string,
    inputs: readonly ICreateNodeInput[],
    userId?: string
  ): Promise<IGraphNode[]> {
    const results: IGraphNode[] = [];
    for (const input of inputs) {
      results.push(await this.createNode(graphType, input, userId));
    }
    return results;
  }

  async createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]> {
    const results: IGraphEdge[] = [];
    for (const input of inputs) {
      results.push(await this.createEdge(graphType, input, userId));
    }
    return results;
  }

  async getNodesByIds(nodeIds: readonly NodeId[], userId?: string): Promise<IGraphNode[]> {
    const result = await this.tx.run(
      `MATCH (n) WHERE n.nodeId IN $nodeIds AND n.isDeleted = false
       ${userId !== undefined ? 'AND n.userId = $userId' : ''}
       RETURN n`,
      { nodeId: [...nodeIds], ...(userId !== undefined ? { userId } : {}) }
    );

    return result.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));
  }

  // ── Transaction nesting (not supported) ───────────────────────────────

  async runInTransaction<T>(_fn: (txRepo: IGraphRepository) => Promise<T>): Promise<T> {
    throw new Error('Nested transactions are not supported');
  }

  // ── Traversal stubs (not needed inside commit protocol) ───────────────

  async getSiblings(
    _nodeId: NodeId,
    _query: ISiblingsQuery,
    _userId?: string
  ): Promise<ISiblingsResult> {
    throw new Error('getSiblings is not supported inside transactions');
  }

  async getCoParents(
    _nodeId: NodeId,
    _query: ICoParentsQuery,
    _userId?: string
  ): Promise<ICoParentsResult> {
    throw new Error('getCoParents is not supported inside transactions');
  }

  async getNeighborhood(
    _nodeId: NodeId,
    _query: INeighborhoodQuery,
    _userId?: string
  ): Promise<INeighborhoodResult> {
    throw new Error('getNeighborhood is not supported inside transactions');
  }

  // ── Phase 8c traversal stubs ──────────────────────────────────────────

  async getDomainSubgraph(
    _domain: string,
    _edgeTypes?: readonly GraphEdgeType[],
    _userId?: string
  ): Promise<ISubgraph> {
    throw new Error('getDomainSubgraph is not supported inside transactions');
  }

  async findArticulationPointsNative(
    _domain: string,
    _edgeTypes?: readonly GraphEdgeType[],
    _userId?: string
  ): Promise<NodeId[] | null> {
    throw new Error('findArticulationPointsNative is not supported inside transactions');
  }

  async getKnowledgeFrontier(
    _query: IFrontierQuery,
    _userId: string
  ): Promise<IKnowledgeFrontierResult> {
    throw new Error('getKnowledgeFrontier is not supported inside transactions');
  }

  async getCommonAncestors(
    _nodeIdA: NodeId,
    _nodeIdB: NodeId,
    _query: ICommonAncestorsQuery,
    _userId?: string
  ): Promise<ICommonAncestorsResult> {
    throw new Error('getCommonAncestors is not supported inside transactions');
  }
}
