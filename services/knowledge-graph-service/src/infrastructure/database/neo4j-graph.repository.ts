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
  INodeFilter,
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
        this.logger.warn({ error: rbError }, 'Transaction rollback failed (original error will be thrown)');
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
  constructor(
    private readonly tx: neo4j.Transaction
  ) {}

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

  async updateNode(nodeId: NodeId, updates: IUpdateNodeInput, userId?: string): Promise<IGraphNode> {
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
}
