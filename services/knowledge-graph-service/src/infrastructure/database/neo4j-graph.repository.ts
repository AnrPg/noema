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
  ICanonicalExternalRef,
  IGraphEdge,
  IGraphNode,
  INodeMasterySummary,
  IOntologyMapping,
  MasteryLevel,
  ISubgraph,
  NodeId,
  StudyMode,
  UserId,
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
  GraphRestorationScope,
  IGraphRestorationRepository,
  IGraphSnapshotPayload,
} from '../../domain/knowledge-graph-service/graph-restoration.repository.js';
import type {
  ICentralityEntry,
  ICentralityQuery,
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
import { RELATIONSHIP_TYPES } from './neo4j-schema.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * All relationship types for Cypher multi-type patterns.
 * Single source of truth: imported from neo4j-schema.ts (C1 fix).
 */
const ALL_REL_TYPES = RELATIONSHIP_TYPES;
const REMOVABLE_NODE_LABELS = [
  'Concept',
  'Occupation',
  'Skill',
  'Fact',
  'Procedure',
  'Principle',
  'Example',
  'Counterexample',
  'Misconception',
].join(':');

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

function buildPaginationClause(limit: number, offset: number): string {
  const safeLimit = Math.max(0, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  return ` SKIP ${String(safeOffset)} LIMIT ${String(safeLimit)}`;
}

function buildRestoredNodeProperties(node: IGraphNode): Record<string, unknown> {
  const props = buildNodeProperties(
    {
      label: node.label,
      nodeType: node.nodeType,
      domain: node.domain,
      ...(node.description !== undefined ? { description: node.description } : {}),
      ...(node.status !== undefined ? { status: node.status } : {}),
      ...(node.aliases !== undefined ? { aliases: node.aliases } : {}),
      ...(node.languages !== undefined ? { languages: node.languages } : {}),
      ...(node.tags !== undefined ? { tags: node.tags } : {}),
      ...(node.supportedStudyModes !== undefined
        ? { supportedStudyModes: node.supportedStudyModes }
        : {}),
      ...(node.semanticHints !== undefined ? { semanticHints: node.semanticHints } : {}),
      ...(node.canonicalExternalRefs !== undefined
        ? { canonicalExternalRefs: node.canonicalExternalRefs }
        : {}),
      ...(node.ontologyMappings !== undefined ? { ontologyMappings: node.ontologyMappings } : {}),
      ...(node.provenance !== undefined ? { provenance: node.provenance } : {}),
      ...(node.reviewMetadata !== undefined ? { reviewMetadata: node.reviewMetadata } : {}),
      ...(node.sourceCoverage !== undefined ? { sourceCoverage: node.sourceCoverage } : {}),
      properties: node.properties,
      ...(node.masteryLevel !== undefined ? { masteryLevel: node.masteryLevel } : {}),
    },
    node.nodeId,
    node.graphType,
    node.userId
  );

  props['createdAt'] = node.createdAt;
  props['updatedAt'] = node.updatedAt;
  props['isDeleted'] = false;
  props['deletedAt'] = null;
  return props;
}

function buildRestoredEdgeProperties(edge: IGraphEdge): Record<string, unknown> {
  const props = buildEdgeProperties(
    {
      edgeType: edge.edgeType,
      weight: edge.weight,
      properties: edge.properties,
    },
    edge.edgeId,
    edge.userId
  );

  props['createdAt'] = edge.createdAt;
  props['isDeleted'] = false;
  props['deletedAt'] = null;
  return props;
}

function escapeLuceneTerm(value: string): string {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1');
}

function buildFullTextSearchQuery(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (normalized === '') {
    return '""';
  }

  const terms = normalized
    .split(' ')
    .map((term) => term.trim())
    .filter((term) => term !== '')
    .slice(0, 8);
  const clauses = new Set<string>();

  clauses.add(`"${escapeLuceneTerm(normalized)}"^8`);

  for (const term of terms) {
    const escapedTerm = escapeLuceneTerm(term);
    const fuzziness = term.length >= 8 ? 2 : 1;
    clauses.add(`${escapedTerm}~${String(fuzziness)}`);
    clauses.add(`${escapedTerm}*`);
  }

  return [...clauses].join(' OR ');
}

function normalizeIdentityToken(value: string): string {
  return value.trim().toLowerCase();
}

function studyModeMasteryPropertyKey(studyMode: StudyMode): string {
  return `studyModeMastery_${studyMode}`;
}

function buildNodeMasteryExpression(alias: string, studyMode?: StudyMode): string {
  if (studyMode === undefined) {
    return `${alias}.masteryLevel`;
  }
  return `coalesce(${alias}.${studyModeMasteryPropertyKey(studyMode)}, ${alias}.masteryLevel)`;
}

function resolveNodeMasteryLevel(
  node: IGraphNode,
  studyMode?: StudyMode
): MasteryLevel | undefined {
  if (studyMode === undefined) {
    return node.masteryLevel;
  }
  const modeScopedValue = node.properties[studyModeMasteryPropertyKey(studyMode)];
  if (typeof modeScopedValue === 'number') {
    return modeScopedValue as MasteryLevel;
  }
  return node.masteryLevel;
}

function withResolvedNodeMastery(node: IGraphNode, studyMode?: StudyMode): IGraphNode {
  if (studyMode === undefined) {
    return node;
  }
  const masteryLevel = resolveNodeMasteryLevel(node, studyMode);
  return {
    ...node,
    ...(masteryLevel !== undefined ? { masteryLevel } : {}),
  };
}

function uniqueIdentityKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key) => key.trim() !== ''))];
}

function buildCanonicalExternalRefIdentityKeys(
  refs: readonly ICanonicalExternalRef[] | undefined
): string[] {
  if (refs === undefined) {
    return [];
  }

  return uniqueIdentityKeys(
    refs.map((ref) => {
      const sourceId = normalizeIdentityToken(ref.sourceId);
      const externalId = normalizeIdentityToken(ref.externalId);
      return `external_ref|${sourceId}|${externalId}`;
    })
  );
}

function buildOntologyMappingIdentityKeys(
  mappings: readonly IOntologyMapping[] | undefined
): string[] {
  if (mappings === undefined) {
    return [];
  }

  return uniqueIdentityKeys(
    mappings.flatMap((mapping) => {
      const sourceId = normalizeIdentityToken(mapping.sourceId);
      const externalId = normalizeIdentityToken(mapping.externalId);
      const mappingKind = normalizeIdentityToken(mapping.mappingKind);
      const keys = [`mapping|${sourceId}|${externalId}|${mappingKind}`];

      if (mapping.targetExternalId !== undefined && mapping.targetExternalId !== null) {
        keys.push(
          `mapping_target_external|${sourceId}|${mappingKind}|${normalizeIdentityToken(mapping.targetExternalId)}`
        );
      }

      if (mapping.targetIri !== undefined && mapping.targetIri !== null) {
        keys.push(
          `mapping_target_iri|${sourceId}|${mappingKind}|${normalizeIdentityToken(mapping.targetIri)}`
        );
      }

      return keys;
    })
  );
}

function buildFallbackNodeIdentityKey(
  graphType: string,
  input: Pick<ICreateNodeInput, 'label' | 'nodeType' | 'domain'>,
  userId?: string
): string | null {
  if (graphType !== 'ckg') {
    return null;
  }

  return [
    'fallback',
    graphType,
    normalizeIdentityToken(input.nodeType),
    normalizeIdentityToken(input.domain),
    normalizeIdentityToken(input.label),
    userId !== undefined ? normalizeIdentityToken(userId) : '',
  ].join('|');
}

function buildNodeIdentityKeys(
  graphType: string,
  input: Pick<
    ICreateNodeInput,
    'label' | 'nodeType' | 'domain' | 'canonicalExternalRefs' | 'ontologyMappings'
  >,
  userId?: string
): string[] {
  const explicitKeys = uniqueIdentityKeys([
    ...buildCanonicalExternalRefIdentityKeys(input.canonicalExternalRefs),
    ...buildOntologyMappingIdentityKeys(input.ontologyMappings),
  ]);

  if (explicitKeys.length > 0) {
    return explicitKeys;
  }

  const fallbackKey = buildFallbackNodeIdentityKey(graphType, input, userId);
  return fallbackKey === null ? [] : [fallbackKey];
}

function buildNodeUpsertUpdateInput(input: ICreateNodeInput): IUpdateNodeInput {
  return {
    label: input.label,
    nodeType: input.nodeType as NonNullable<IUpdateNodeInput['nodeType']>,
    domain: input.domain,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
    ...(input.languages !== undefined ? { languages: input.languages } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.supportedStudyModes !== undefined
      ? { supportedStudyModes: input.supportedStudyModes }
      : {}),
    ...(input.semanticHints !== undefined ? { semanticHints: input.semanticHints } : {}),
    ...(input.canonicalExternalRefs !== undefined
      ? { canonicalExternalRefs: input.canonicalExternalRefs }
      : {}),
    ...(input.ontologyMappings !== undefined ? { ontologyMappings: input.ontologyMappings } : {}),
    ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
    ...(input.reviewMetadata !== undefined ? { reviewMetadata: input.reviewMetadata } : {}),
    ...(input.sourceCoverage !== undefined ? { sourceCoverage: input.sourceCoverage } : {}),
    ...(input.properties !== undefined ? { properties: input.properties } : {}),
    ...(input.masteryLevel !== undefined ? { masteryLevel: input.masteryLevel } : {}),
  };
}

// ============================================================================
// Neo4jGraphRepository
// ============================================================================

export class Neo4jGraphRepository implements IGraphRepository, IGraphRestorationRepository {
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
    const upsertProps = buildNodeUpdateProperties(buildNodeUpsertUpdateInput(input));
    const identityKeys = buildNodeIdentityKeys(graphType, input, userId);

    if (identityKeys.length > 0) {
      props['identityKeys'] = identityKeys;
      upsertProps['identityKeys'] = identityKeys;
    }

    upsertProps['isDeleted'] = false;
    upsertProps['deletedAt'] = null;

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        const identityMatchClause =
          identityKeys.length > 0
            ? 'any(key IN $identityKeys WHERE key IN coalesce(existing.identityKeys, []))'
            : 'existing.nodeId = $nodeId';
        const sharedParams = {
          nodeId,
          nodeType: input.nodeType,
          ...(identityKeys.length > 0 ? { identityKeys } : {}),
          ...(userId !== undefined ? { userId } : {}),
        };
        const existingResult = await tx.run(
          `MATCH (existing:${primaryLabel})
           WHERE existing.nodeType = $nodeType
             AND ${identityMatchClause}
             ${userId !== undefined ? 'AND existing.userId = $userId' : ''}
           RETURN existing
           LIMIT 1`,
          sharedParams
        );

        // Neo4j's record.get() is typed as any; narrow immediately after retrieval.

        const existingNodeValue = existingResult.records[0]?.get('existing') as unknown;
        const existingNode = existingNodeValue as neo4j.Node | undefined;
        if (existingNode !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const existingNodeId = existingNode.properties['nodeId'];
          return tx.run(
            `MATCH (existing:${primaryLabel} {nodeId: $existingNodeId})
             ${userId !== undefined ? 'WHERE existing.userId = $userId' : ''}
             SET existing += $upsertProps
             SET existing:${secondaryLabel}
             RETURN existing AS node`,
            {
              upsertProps,
              existingNodeId: typeof existingNodeId === 'string' ? existingNodeId : nodeId,
              ...(userId !== undefined ? { userId } : {}),
            }
          );
        }

        return tx.run(
          `CREATE (created:${primaryLabel}:${secondaryLabel} $props) RETURN created AS node`,
          {
            props,
          }
        );
      });

      const node = result.records[0]?.get('node') as neo4j.Node | undefined;
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
    const nextNodeTypeLabel =
      updates.nodeType !== undefined ? nodeTypeToLabel(updates.nodeType) : null;

    const existingNode = await this.getNode(nodeId, userId);
    if (existingNode === null) {
      throw new NodeNotFoundError(nodeId);
    }

    const nextCanonicalExternalRefs =
      updates.canonicalExternalRefs ?? existingNode.canonicalExternalRefs;
    const nextOntologyMappings = updates.ontologyMappings ?? existingNode.ontologyMappings;
    const nextNodeIdentityInput = {
      label: updates.label ?? existingNode.label,
      nodeType: updates.nodeType ?? existingNode.nodeType,
      domain: updates.domain ?? existingNode.domain,
      ...(nextCanonicalExternalRefs !== undefined
        ? { canonicalExternalRefs: nextCanonicalExternalRefs }
        : {}),
      ...(nextOntologyMappings !== undefined ? { ontologyMappings: nextOntologyMappings } : {}),
    };
    const identityKeys = buildNodeIdentityKeys(
      existingNode.graphType,
      nextNodeIdentityInput,
      userId
    );
    if (
      updates.label !== undefined ||
      updates.nodeType !== undefined ||
      updates.domain !== undefined ||
      updates.canonicalExternalRefs !== undefined ||
      updates.ontologyMappings !== undefined
    ) {
      updateProps['identityKeys'] = identityKeys;
    }

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})
           ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
           SET n += $updateProps
           ${nextNodeTypeLabel !== null ? `REMOVE n:${REMOVABLE_NODE_LABELS} SET n:${nextNodeTypeLabel}` : ''}
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
        // Soft-delete connected edges first to prevent orphaned references
        await tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r]-(m)
           ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
           SET r.isDeleted = true, r.deletedAt = $deletedAt, r.updatedAt = $deletedAt`,
          {
            nodeId,
            deletedAt: new Date().toISOString(),
            ...(userId !== undefined ? { userId } : {}),
          }
        );

        // Then soft-delete the node itself
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

      this.logger.debug({ nodeId }, 'Node and connected edges soft-deleted');
    } catch (error) {
      this.translateNeo4jError(error, 'deleteNode', { nodeId });
    } finally {
      await session.close();
    }
  }

  async findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]> {
    if (this.shouldUseFullTextNodeSearch(filter)) {
      return this.findNodesFullText(filter, limit, offset);
    }

    const { whereClauses, params } = this.buildNodeFilterClauses(filter);
    const labelFilter = this.buildLabelFilter(filter);
    const orderClause = this.buildNodeSortClause(filter);
    const paginationClause = buildPaginationClause(limit, offset);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n${labelFilter})
           ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
           RETURN n
           ORDER BY ${orderClause}
           ${paginationClause}`,
          params
        );
      });

      return result.records.map((r) =>
        withResolvedNodeMastery(mapNodeToGraphNode(r.get('n') as neo4j.Node), filter.studyMode)
      );
    } finally {
      await session.close();
    }
  }

  async countNodes(filter: INodeFilter): Promise<number> {
    if (this.shouldUseFullTextNodeSearch(filter)) {
      return this.countNodesFullText(filter);
    }

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

  async getNodeMasterySummary(
    filter: INodeFilter,
    masteryThreshold: MasteryLevel
  ): Promise<INodeMasterySummary> {
    const { whereClauses, params } = this.buildNodeFilterClauses(filter);
    const labelFilter = this.buildLabelFilter(filter);
    const summarySession = this.neo4j.getSession();
    const domainSession = this.neo4j.getSession();
    const threshold = masteryThreshold as number;
    const masteryExpr = buildNodeMasteryExpression('n', filter.studyMode);
    const baseParams = {
      ...params,
      masteryThreshold: threshold,
      developingThreshold: 0.4,
    };

    try {
      const [summaryResult, domainResult] = await Promise.all([
        summarySession.executeRead(async (tx: ManagedTransaction) =>
          tx.run(
            `MATCH (n${labelFilter})
             ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
             RETURN
               count(n) AS totalNodes,
               count(CASE WHEN ${masteryExpr} IS NOT NULL THEN 1 END) AS trackedNodes,
               count(CASE WHEN ${masteryExpr} >= $masteryThreshold THEN 1 END) AS masteredNodes,
               count(
                 CASE
                   WHEN ${masteryExpr} IS NOT NULL
                    AND ${masteryExpr} < $masteryThreshold
                    AND ${masteryExpr} >= $developingThreshold
                   THEN 1
                 END
               ) AS developingNodes,
               count(
                 CASE
                   WHEN ${masteryExpr} IS NOT NULL
                    AND ${masteryExpr} < $developingThreshold
                   THEN 1
                 END
               ) AS emergingNodes,
               count(CASE WHEN ${masteryExpr} IS NULL THEN 1 END) AS untrackedNodes,
               coalesce(avg(${masteryExpr}), 0.0) AS averageMastery`,
            baseParams
          )
        ),
        domainSession.executeRead(async (tx: ManagedTransaction) =>
          tx.run(
            `MATCH (n${labelFilter})
             ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
             WITH coalesce(n.domain, 'general') AS domain,
                  count(n) AS nodeCount,
                  count(CASE WHEN ${masteryExpr} IS NOT NULL THEN 1 END) AS trackedNodes,
                  count(CASE WHEN ${masteryExpr} >= $masteryThreshold THEN 1 END) AS masteredNodes,
                  coalesce(avg(${masteryExpr}), 0.0) AS averageMastery
             RETURN domain, nodeCount, trackedNodes, masteredNodes, averageMastery`,
            baseParams
          )
        ),
      ]);

      const summaryRecord = summaryResult.records[0];
      const domainBreakdown = domainResult.records.map((record) => ({
        domain: String(record.get('domain')),
        nodeCount: toJsNumber(record.get('nodeCount')),
        trackedNodes: toJsNumber(record.get('trackedNodes')),
        masteredNodes: toJsNumber(record.get('masteredNodes')),
        averageMastery: toJsNumber(record.get('averageMastery')),
      }));
      const strongestDomains = [...domainBreakdown]
        .sort((a, b) => {
          const masteryDifference = b.averageMastery - a.averageMastery;
          if (masteryDifference !== 0) {
            return masteryDifference;
          }
          return b.nodeCount - a.nodeCount;
        })
        .slice(0, 3);
      const weakestDomains = [...domainBreakdown]
        .sort((a, b) => {
          const masteryDifference = a.averageMastery - b.averageMastery;
          if (masteryDifference !== 0) {
            return masteryDifference;
          }
          return b.nodeCount - a.nodeCount;
        })
        .slice(0, 3);

      return {
        userId: (filter.userId ?? '') as UserId,
        studyMode: filter.studyMode ?? 'knowledge_gaining',
        ...(filter.domain !== undefined ? { domain: filter.domain } : {}),
        masteryThreshold,
        totalNodes: summaryRecord !== undefined ? toJsNumber(summaryRecord.get('totalNodes')) : 0,
        trackedNodes:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('trackedNodes')) : 0,
        masteredNodes:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('masteredNodes')) : 0,
        developingNodes:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('developingNodes')) : 0,
        emergingNodes:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('emergingNodes')) : 0,
        untrackedNodes:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('untrackedNodes')) : 0,
        averageMastery:
          summaryRecord !== undefined ? toJsNumber(summaryRecord.get('averageMastery')) : 0,
        strongestDomains,
        weakestDomains,
      };
    } finally {
      await Promise.allSettled([summarySession.close(), domainSession.close()]);
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
    const edgeUpsertProps: Record<string, unknown> = {
      ...edgeProps,
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
    };
    delete edgeUpsertProps['edgeId'];
    delete edgeUpsertProps['createdAt'];

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (source {nodeId: $sourceNodeId, isDeleted: false})
           MATCH (target {nodeId: $targetNodeId, isDeleted: false})
           MERGE (source)-[r:${relType}]->(target)
           ON CREATE SET r = $edgeProps,
                         r.updatedAt = $updatedAt,
                         r.isDeleted = false
           ON MATCH SET r += $edgeUpsertProps
           SET r.edgeId = coalesce(r.edgeId, $edgeId)
           SET r.createdAt = coalesce(r.createdAt, $createdAt)
           RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                  source.graphType AS sourceGraphType`,
          {
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
            edgeProps,
            edgeUpsertProps,
            edgeId,
            createdAt: edgeProps['createdAt'],
            updatedAt: edgeUpsertProps['updatedAt'],
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
             AND coalesce(r.isDeleted, false) = false
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
             AND coalesce(r.isDeleted, false) = false
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

    const whereClauses: string[] = ['coalesce(r.isDeleted, false) = false'];
    const params: Record<string, unknown> = {};

    if (filter.sourceNodeId !== undefined) {
      whereClauses.push('source.nodeId = $sourceNodeId');
      params['sourceNodeId'] = filter.sourceNodeId;
    }
    if (filter.targetNodeId !== undefined) {
      whereClauses.push('target.nodeId = $targetNodeId');
      params['targetNodeId'] = filter.targetNodeId;
    }
    if (filter.nodeId !== undefined) {
      whereClauses.push('(source.nodeId = $nodeId OR target.nodeId = $nodeId)');
      params['nodeId'] = filter.nodeId;
    }
    if (filter.userId !== undefined) {
      whereClauses.push('r.userId = $userId');
      params['userId'] = filter.userId;
    }
    if (filter.studyMode !== undefined) {
      whereClauses.push(
        '(source.supportedStudyModes IS NULL OR size(source.supportedStudyModes) = 0 OR $studyMode IN source.supportedStudyModes)'
      );
      whereClauses.push(
        '(target.supportedStudyModes IS NULL OR size(target.supportedStudyModes) = 0 OR $studyMode IN target.supportedStudyModes)'
      );
      params['studyMode'] = filter.studyMode;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Neo4j on this setup does not accept parameterized SKIP/LIMIT.
    let paginationClause = '';
    if (offset !== undefined && offset > 0) {
      paginationClause += ` SKIP ${String(Math.trunc(offset))}`;
    }
    if (limit !== undefined) {
      paginationClause += ` LIMIT ${String(Math.trunc(limit))}`;
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

  async getEdgesForNode(
    nodeId: NodeId,
    direction: EdgeDirection,
    _userId?: string
  ): Promise<IGraphEdge[]> {
    const relTypePattern = ALL_REL_TYPES.join('|');

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        // For 'both', we need to determine direction per relationship
        if (direction === 'both') {
          return tx.run(
            `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r:${relTypePattern}]-(other {isDeleted: false})
             WHERE coalesce(r.isDeleted, false) = false
             RETURN r, startNode(r).nodeId AS sourceId, endNode(r).nodeId AS targetId,
                    n.graphType AS graphType`,
            { nodeId }
          );
        }

        if (direction === 'inbound') {
          return tx.run(
            `MATCH (source {isDeleted: false})-[r:${relTypePattern}]->(n {nodeId: $nodeId, isDeleted: false})
             WHERE coalesce(r.isDeleted, false) = false
             RETURN r, source.nodeId AS sourceId, n.nodeId AS targetId,
                    source.graphType AS graphType`,
            { nodeId }
          );
        }

        // outbound
        return tx.run(
          `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r:${relTypePattern}]->(target {isDeleted: false})
           WHERE coalesce(r.isDeleted, false) = false
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

  async countEdges(filter: IEdgeFilter): Promise<number> {
    const relTypes =
      filter.edgeType !== undefined ? edgeTypeToRelType(filter.edgeType) : ALL_REL_TYPES.join('|');

    const whereClauses: string[] = ['coalesce(r.isDeleted, false) = false'];
    const params: Record<string, unknown> = {};

    if (filter.sourceNodeId !== undefined) {
      whereClauses.push('source.nodeId = $sourceNodeId');
      params['sourceNodeId'] = filter.sourceNodeId;
    }
    if (filter.targetNodeId !== undefined) {
      whereClauses.push('target.nodeId = $targetNodeId');
      params['targetNodeId'] = filter.targetNodeId;
    }
    if (filter.nodeId !== undefined) {
      whereClauses.push('(source.nodeId = $nodeId OR target.nodeId = $nodeId)');
      params['nodeId'] = filter.nodeId;
    }
    if (filter.userId !== undefined) {
      whereClauses.push('r.userId = $userId');
      params['userId'] = filter.userId;
    }
    if (filter.studyMode !== undefined) {
      whereClauses.push(
        '(source.supportedStudyModes IS NULL OR size(source.supportedStudyModes) = 0 OR $studyMode IN source.supportedStudyModes)'
      );
      whereClauses.push(
        '(target.supportedStudyModes IS NULL OR size(target.supportedStudyModes) = 0 OR $studyMode IN target.supportedStudyModes)'
      );
      params['studyMode'] = filter.studyMode;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (source)-[r:${relTypes}]->(target)
           ${whereStr}
           RETURN count(r) AS total`,
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

  async getEdgesForNodes(
    nodeIds: readonly NodeId[],
    filter?: IEdgeFilter,
    userId?: string
  ): Promise<IGraphEdge[]> {
    if (nodeIds.length === 0) return [];

    const relTypePattern =
      filter?.edgeType !== undefined ? edgeTypeToRelType(filter.edgeType) : ALL_REL_TYPES.join('|');

    const whereClauses: string[] = [
      '(source.nodeId IN $nodeIds OR target.nodeId IN $nodeIds)',
      'source.isDeleted = false',
      'target.isDeleted = false',
      'coalesce(r.isDeleted, false) = false',
    ];
    const params: Record<string, unknown> = { nodeIds: [...nodeIds] };

    if (userId !== undefined) {
      whereClauses.push('r.userId = $userId');
      params['userId'] = userId;
    }
    if (filter?.studyMode !== undefined) {
      whereClauses.push(
        '(source.supportedStudyModes IS NULL OR size(source.supportedStudyModes) = 0 OR $studyMode IN source.supportedStudyModes)'
      );
      whereClauses.push(
        '(target.supportedStudyModes IS NULL OR size(target.supportedStudyModes) = 0 OR $studyMode IN target.supportedStudyModes)'
      );
      params['studyMode'] = filter.studyMode;
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (source)-[r:${relTypePattern}]->(target)
           ${whereStr}
           RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
                  source.graphType AS graphType`,
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
           WHERE n.isDeleted = false
             AND ancestor.isDeleted = false
             AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
             ${userFilter}
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
           WHERE n.isDeleted = false
             AND descendant.isDeleted = false
             AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
             ${userFilter}
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
    userId?: string,
    maxDepth?: number
  ): Promise<IGraphNode[]> {
    return this.findFilteredShortestPath(
      fromNodeId,
      toNodeId,
      undefined,
      undefined,
      userId,
      maxDepth
    );
  }

  async findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    nodeTypeFilter?: readonly string[],
    userId?: string,
    maxDepth?: number
  ): Promise<IGraphNode[]> {
    const relPattern = buildRelTypePattern(edgeTypeFilter);
    const params: Record<string, unknown> = { fromNodeId, toNodeId };
    const depthRange = maxDepth !== undefined ? `*..${String(maxDepth)}` : '*';

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
           MATCH path = shortestPath((from)-[:${relPattern}${depthRange}]-(to))
           WHERE all(x IN nodes(path) WHERE x.isDeleted = false)
             AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
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
             AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
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
      const nodeLabelsMap = new Map<string, string[]>();
      for (const node of nodes) {
        const graphNode = mapNodeToGraphNode(node);
        const identity = node.identity.toString();
        nodeIdMap.set(identity, graphNode.nodeId);
        nodeLabelsMap.set(identity, node.labels);
      }

      const relMappings = rels.map((rel) => ({
        rel,
        sourceNodeId: nodeIdMap.get(rel.start.toString()) ?? ('' as NodeId),
        targetNodeId: nodeIdMap.get(rel.end.toString()) ?? ('' as NodeId),
        graphType: inferGraphType(nodeLabelsMap.get(rel.start.toString()) ?? []),
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
                AND coalesce(r1.isDeleted, false) = false
                ${userId !== undefined ? 'AND origin.userId = $userId AND hop1.userId = $userId' : ''}
              WITH origin, hop1, r1, type(r1) AS firstEdgeType,
                   CASE WHEN startNode(r1) = origin THEN 'outbound' ELSE 'inbound' END AS dir
              OPTIONAL MATCH path = (hop1)-[*1..${String(remainingHops)}]-(further)
              WHERE all(n IN nodes(path) WHERE n.isDeleted = false)
                AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
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
               AND all(rel IN relationships(path) WHERE coalesce(rel.isDeleted, false) = false)
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
                  AND coalesce(r.isDeleted, false) = false
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
    } catch (err) {
      this.gdsAvailable = false;
      this.logger.info({ err }, 'Neo4j GDS not available — using application-code algorithms');
    } finally {
      await session.close();
    }

    return this.gdsAvailable;
  }

  async getDomainSubgraph(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    studyMode?: StudyMode,
    userId?: string
  ): Promise<ISubgraph> {
    const relPattern = buildRelTypePattern(edgeTypes);
    const userFilter = userId !== undefined ? 'AND n.userId = $userId' : '';
    const edgeUserFilter =
      userId !== undefined ? 'AND a.userId = $userId AND b.userId = $userId' : '';
    const studyModeNodeFilter =
      studyMode !== undefined
        ? 'AND (n.supportedStudyModes IS NULL OR size(n.supportedStudyModes) = 0 OR $studyMode IN n.supportedStudyModes)'
        : '';
    const studyModeEdgeFilter =
      studyMode !== undefined
        ? 'AND (a.supportedStudyModes IS NULL OR size(a.supportedStudyModes) = 0 OR $studyMode IN a.supportedStudyModes) AND (b.supportedStudyModes IS NULL OR size(b.supportedStudyModes) = 0 OR $studyMode IN b.supportedStudyModes)'
        : '';

    const session = this.neo4j.getSession();
    try {
      // Fetch all nodes in the domain
      const nodesResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (n {domain: $domain})
           WHERE n.isDeleted = false ${userFilter} ${studyModeNodeFilter}
           RETURN n`,
          {
            domain,
            ...(userId !== undefined ? { userId } : {}),
            ...(studyMode !== undefined ? { studyMode } : {}),
          }
        );
      });

      const nodes = nodesResult.records.map((r) =>
        withResolvedNodeMastery(mapNodeToGraphNode(r.get('n') as neo4j.Node), studyMode)
      );

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
             AND coalesce(r.isDeleted, false) = false
             AND a.nodeId IN $nodeIds AND b.nodeId IN $nodeIds
             ${edgeUserFilter}
             ${studyModeEdgeFilter}
           RETURN r, a.nodeId AS sourceId, b.nodeId AS targetId,
                  CASE WHEN any(l IN labels(a) WHERE l STARTS WITH 'Pkg') THEN 'pkg' ELSE 'ckg' END AS graphType`,
          {
            domain,
            nodeIds,
            ...(userId !== undefined ? { userId } : {}),
            ...(studyMode !== undefined ? { studyMode } : {}),
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
    studyMode?: StudyMode,
    userId?: string
  ): Promise<NodeId[] | null> {
    const gdsAvailable = await this.checkGdsAvailability();
    if (!gdsAvailable) return null;

    const relPattern = buildRelTypePattern(edgeTypes);
    const userFilter = userId !== undefined ? 'AND n.userId = $userId' : '';
    const studyModeNodeFilter =
      studyMode !== undefined
        ? 'AND (n.supportedStudyModes IS NULL OR size(n.supportedStudyModes) = 0 OR $studyMode IN n.supportedStudyModes)'
        : '';
    const studyModeRelFilter =
      studyMode !== undefined
        ? 'AND (a.supportedStudyModes IS NULL OR size(a.supportedStudyModes) = 0 OR $studyMode IN a.supportedStudyModes) AND (b.supportedStudyModes IS NULL OR size(b.supportedStudyModes) = 0 OR $studyMode IN b.supportedStudyModes)'
        : '';

    const session = this.neo4j.getSession();
    const graphName = `bridge_analysis_${domain}_${String(Date.now())}`;

    try {
      // Project the domain subgraph into GDS
      const nodeQuery = `MATCH (n {domain: $domain}) WHERE n.isDeleted = false ${userFilter} ${studyModeNodeFilter} RETURN id(n) AS id`;
      const relQuery = `MATCH (a {domain: $domain})-[r:${relPattern}]->(b {domain: $domain})
                        WHERE a.isDeleted = false AND b.isDeleted = false
                          AND coalesce(r.isDeleted, false) = false
                          ${userId !== undefined ? 'AND a.userId = $userId AND b.userId = $userId' : ''}
                          ${studyModeRelFilter}
                        RETURN id(a) AS source, id(b) AS target`;

      await session.executeWrite(async (tx: ManagedTransaction) => {
        return tx.run(
          `CALL gds.graph.project.cypher($graphName, $nodeQuery, $relQuery, {
             parameters: { domain: $domain ${userId !== undefined ? ', userId: $userId' : ''}${studyMode !== undefined ? ', studyMode: $studyMode' : ''} }
           })`,
          {
            graphName,
            nodeQuery,
            relQuery,
            domain,
            ...(userId !== undefined ? { userId } : {}),
            ...(studyMode !== undefined ? { studyMode } : {}),
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
      } catch (err) {
        this.logger.debug({ err, graphName }, 'GDS graph cleanup failed — ignored');
      }
      await session.close();
    }
  }

  async getKnowledgeFrontier(
    query: IFrontierQuery,
    userId: string
  ): Promise<IKnowledgeFrontierResult> {
    const session = this.neo4j.getSession();
    const nodeMasteryExpr = buildNodeMasteryExpression('node', query.studyMode);
    const prereqMasteryExpr = buildNodeMasteryExpression('prereq', query.studyMode);
    const studyModeNodeFilter =
      query.studyMode !== undefined
        ? 'AND (node.supportedStudyModes IS NULL OR size(node.supportedStudyModes) = 0 OR $studyMode IN node.supportedStudyModes)'
        : '';
    const studyModePrereqFilter =
      query.studyMode !== undefined
        ? 'AND (prereq.supportedStudyModes IS NULL OR size(prereq.supportedStudyModes) = 0 OR $studyMode IN prereq.supportedStudyModes)'
        : '';
    try {
      // Main frontier query: find unmastered nodes with at least one mastered prerequisite
      const frontierResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (node:PkgNode {userId: $userId, domain: $domain})
           WHERE node.isDeleted = false
             ${studyModeNodeFilter}
             AND (${nodeMasteryExpr} IS NULL OR ${nodeMasteryExpr} < $threshold)
           OPTIONAL MATCH (node)-[:PREREQUISITE]->(prereq:PkgNode {userId: $userId})
           WHERE prereq.isDeleted = false
             ${studyModePrereqFilter}
           WITH node,
                collect(prereq) AS prereqs,
                [p IN collect(prereq) WHERE ${prereqMasteryExpr.replaceAll('prereq', 'p')} >= $threshold] AS masteredPrereqs
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
            ...(query.studyMode !== undefined ? { studyMode: query.studyMode } : {}),
          }
        );
      });

      // Build frontier nodes
      const frontier = frontierResult.records.map((rec) => {
        const node = withResolvedNodeMastery(
          mapNodeToGraphNode(rec.get('node') as neo4j.Node),
          query.studyMode
        );
        const masteredCount = (rec.get('masteredCount') as Integer).toNumber();
        const totalPrereqs = (rec.get('totalPrereqs') as Integer).toNumber();
        const readinessScore = rec.get('readinessScore') as number;

        const masteredPrereqNodes = query.includePrerequisites
          ? (rec.get('masteredPrereqs') as neo4j.Node[]).map((entry) =>
              withResolvedNodeMastery(mapNodeToGraphNode(entry), query.studyMode)
            )
          : undefined;

        // Compute average mastery of prerequisites
        const masteredPrereqs = rec.get('masteredPrereqs') as neo4j.Node[];
        const avgMastery =
          masteredPrereqs.length > 0
            ? masteredPrereqs.reduce((sum, p) => {
                const ml: unknown =
                  query.studyMode !== undefined
                    ? (p.properties[studyModeMasteryPropertyKey(query.studyMode)] ??
                      p.properties['masteryLevel'])
                    : p.properties['masteryLevel'];
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
                sum(CASE WHEN ${buildNodeMasteryExpression('n', query.studyMode)} >= $threshold THEN 1 ELSE 0 END) AS mastered,
                sum(CASE WHEN ${buildNodeMasteryExpression('n', query.studyMode)} IS NULL OR ${buildNodeMasteryExpression('n', query.studyMode)} < $threshold THEN 1 ELSE 0 END) AS unmastered
           RETURN total, mastered, unmastered`,
          {
            userId,
            domain: query.domain,
            threshold: query.masteryThreshold,
            ...(query.studyMode !== undefined ? { studyMode: query.studyMode } : {}),
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
    const nodeUserFilter = userId !== undefined ? 'AND a.userId = $userId' : '';
    const ancestorUserFilter =
      userId !== undefined
        ? 'AND ancestor.userId = $userId AND ancestor.isDeleted = false'
        : 'AND ancestor.isDeleted = false';

    const session = this.neo4j.getSession();
    try {
      // Fetch both query nodes
      const nodesResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH (a) WHERE a.nodeId IN [$nodeIdA, $nodeIdB] AND a.isDeleted = false ${nodeUserFilter}
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
        const emptyNode = (id: NodeId): IGraphNode =>
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
           WHERE coalesce(r.isDeleted, false) = false
           RETURN count(r) > 0 AS connected`,
          { nodeIdA, nodeIdB }
        );
      });
      const directlyConnected = directResult.records[0]?.get('connected') === true;

      // Find ancestors of both nodes and compute intersection
      const ancestorsResult = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `MATCH pathA = (a {nodeId: $nodeIdA})-[:${relPattern}*1..${String(query.maxDepth)}]->(ancestorA)
           WHERE a.isDeleted = false
             AND all(rel IN relationships(pathA) WHERE coalesce(rel.isDeleted, false) = false)
           ${ancestorUserFilter.replace('ancestor', 'ancestorA')}
           WITH collect(DISTINCT {nodeId: ancestorA.nodeId, node: ancestorA, depth: length(pathA)}) AS ancestorsA

           MATCH pathB = (b {nodeId: $nodeIdB})-[:${relPattern}*1..${String(query.maxDepth)}]->(ancestorB)
           WHERE b.isDeleted = false
             AND all(rel IN relationships(pathB) WHERE coalesce(rel.isDeleted, false) = false)
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
      const minCombinedDepth = allCommonAncestors[0]?.combinedDepth ?? Infinity;
      const lowestCommonAncestors = allCommonAncestors
        .filter((a) => a.combinedDepth === minCombinedDepth)
        .map((a) => a.node);

      // Compute paths from A and B to the first LCA
      let pathFromA: IGraphNode[] = [];
      let pathFromB: IGraphNode[] = [];

      const lcaFirst = lowestCommonAncestors[0];
      if (lcaFirst !== undefined) {
        const lcaNodeId = lcaFirst.nodeId;

        const pathsResult = await session.executeRead(async (tx: ManagedTransaction) => {
          return tx.run(
            `OPTIONAL MATCH pathA = shortestPath((a {nodeId: $nodeIdA})-[:${relPattern}*1..${String(query.maxDepth)}]->(lca {nodeId: $lcaNodeId}))
             WHERE pathA IS NULL OR all(rel IN relationships(pathA) WHERE coalesce(rel.isDeleted, false) = false)
             WITH [n IN nodes(pathA) | n] AS nodesA
             OPTIONAL MATCH pathB = shortestPath((b {nodeId: $nodeIdB})-[:${relPattern}*1..${String(query.maxDepth)}]->(lca2 {nodeId: $lcaNodeId}))
             WHERE pathB IS NULL OR all(rel IN relationships(pathB) WHERE coalesce(rel.isDeleted, false) = false)
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
  // Phase 8d – Degree Centrality
  // ==========================================================================

  async getDegreeCentrality(query: ICentralityQuery, userId?: string): Promise<ICentralityEntry[]> {
    const primaryLabel = userId !== undefined ? 'PkgNode' : 'CkgNode';
    const relPattern = buildRelTypePattern(query.edgeTypes);

    const cypher = `
      MATCH (n:${primaryLabel} {domain: $domain})
      WHERE n.isDeleted = false
      ${userId !== undefined ? 'AND n.userId = $userId' : ''}
      OPTIONAL MATCH (n)<-[rIn:${relPattern}]-()
      WHERE coalesce(rIn.isDeleted, false) = false
      OPTIONAL MATCH (n)-[rOut:${relPattern}]->()
      WHERE coalesce(rOut.isDeleted, false) = false
      WITH n, count(DISTINCT rIn) AS inDeg, count(DISTINCT rOut) AS outDeg
      RETURN n, inDeg, outDeg, (inDeg + outDeg) AS totalDeg
      ORDER BY totalDeg DESC
      LIMIT $topK
    `;

    const params: Record<string, unknown> = { domain: query.domain, topK: neo4j.int(query.topK) };
    if (userId !== undefined) {
      params['userId'] = userId;
    }

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(cypher, params);
      });

      return result.records.map((record, index) => {
        const node = mapNodeToGraphNode(record.get('n') as neo4j.Node);
        const inDeg = (record.get('inDeg') as { toNumber(): number }).toNumber();
        const outDeg = (record.get('outDeg') as { toNumber(): number }).toNumber();
        return {
          node,
          score: inDeg + outDeg,
          rank: index + 1,
          degreeBreakdown: { inDegree: inDeg, outDegree: outDeg },
        } satisfies ICentralityEntry;
      });
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Phase 8e – Ontological Guardrails: findConflictingEdges
  // ==========================================================================

  async findConflictingEdges(
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    edgeTypes: readonly GraphEdgeType[]
  ): Promise<IGraphEdge[]> {
    if (edgeTypes.length === 0) return [];

    // Build relationship type pattern from the requested edge types.
    // We check both directions: (source)-[r]->(target) OR (target)-[r]->(source)
    // because ontological conflicts are direction-agnostic.
    const relTypePattern = edgeTypes.map((t) => edgeTypeToRelType(t)).join('|');

    const cypher = `
      MATCH (a {nodeId: $nodeA})-[r:${relTypePattern}]-(b {nodeId: $nodeB})
      WHERE coalesce(r.isDeleted, false) = false
      RETURN r, startNode(r).nodeId AS sourceId, endNode(r).nodeId AS targetId,
             a.graphType AS graphType
    `;

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(cypher, {
          nodeA: sourceNodeId as string,
          nodeB: targetNodeId as string,
        });
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

  private shouldUseFullTextNodeSearch(filter: INodeFilter): boolean {
    return filter.searchMode === 'fulltext' && filter.labelContains !== undefined;
  }

  private getNodeFullTextIndexName(filter: INodeFilter): string | null {
    if (filter.graphType === 'pkg') return 'pkgnode_fulltext';
    if (filter.graphType === 'ckg') return 'ckgnode_fulltext';
    return null;
  }

  private async findNodesFullText(
    filter: INodeFilter,
    limit: number,
    offset: number
  ): Promise<IGraphNode[]> {
    const indexName = this.getNodeFullTextIndexName(filter);
    const searchTerm = filter.labelContains;
    if (indexName === null || searchTerm === undefined) {
      return [];
    }

    const { whereClauses, params } = this.buildNodeFilterClauses(filter, {
      includeLabelContains: false,
    });
    const orderClause = this.buildNodeSortClause(filter, { scoreAlias: 'score' });
    const paginationClause = buildPaginationClause(limit, offset);

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `CALL db.index.fulltext.queryNodes($indexName, $searchQuery) YIELD node AS n, score
           ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
           RETURN n, score
           ORDER BY ${orderClause}
           ${paginationClause}`,
          {
            ...params,
            indexName,
            searchQuery: buildFullTextSearchQuery(searchTerm),
          }
        );
      });

      return result.records.map((record) => mapNodeToGraphNode(record.get('n') as neo4j.Node));
    } finally {
      await session.close();
    }
  }

  private async countNodesFullText(filter: INodeFilter): Promise<number> {
    const indexName = this.getNodeFullTextIndexName(filter);
    const searchTerm = filter.labelContains;
    if (indexName === null || searchTerm === undefined) {
      return 0;
    }

    const { whereClauses, params } = this.buildNodeFilterClauses(filter, {
      includeLabelContains: false,
    });

    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return tx.run(
          `CALL db.index.fulltext.queryNodes($indexName, $searchQuery) YIELD node AS n, score
           ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
           RETURN count(DISTINCT n) AS total`,
          {
            ...params,
            indexName,
            searchQuery: buildFullTextSearchQuery(searchTerm),
          }
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

  /**
   * Build dynamic WHERE clauses and parameters from an INodeFilter.
   */
  private buildNodeFilterClauses(
    filter: INodeFilter,
    options: {
      includeLabelContains?: boolean;
    } = {}
  ): {
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

    if (options.includeLabelContains !== false && filter.labelContains !== undefined) {
      whereClauses.push('toLower(n.label) CONTAINS toLower($labelContains)');
      params['labelContains'] = filter.labelContains;
    }

    if (filter.studyMode !== undefined) {
      whereClauses.push(
        '(n.supportedStudyModes IS NULL OR size(n.supportedStudyModes) = 0 OR $studyMode IN n.supportedStudyModes)'
      );
      params['studyMode'] = filter.studyMode;
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

  /**
   * Build an ORDER BY fragment from an INodeFilter.
   * Keeps null mastery values at the end for mastery-centric ordering.
   */
  private buildNodeSortClause(
    filter: INodeFilter,
    options: {
      scoreAlias?: string;
    } = {}
  ): string {
    const direction = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const masteryExpr = buildNodeMasteryExpression('n', filter.studyMode);
    const scoreAlias = options.scoreAlias ?? 'score';

    switch (filter.sortBy) {
      case 'relevance':
        return `${scoreAlias} ${direction}, n.updatedAt DESC, n.createdAt DESC`;
      case 'label':
        return `toLower(n.label) ${direction}, n.createdAt DESC`;
      case 'updatedAt':
        return `n.updatedAt ${direction}, n.createdAt DESC`;
      case 'masteryLevel':
        return `CASE WHEN ${masteryExpr} IS NULL THEN 1 ELSE 0 END ASC, ${masteryExpr} ${direction}, n.updatedAt DESC`;
      case 'createdAt':
      default:
        if (filter.searchMode === 'fulltext') {
          return `${scoreAlias} DESC, n.createdAt ${direction}`;
        }
        return `n.createdAt ${direction}`;
    }
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

  async captureScope(scope: GraphRestorationScope): Promise<ISubgraph> {
    if (scope.domain !== undefined) {
      return this.getDomainSubgraph(
        scope.domain,
        undefined,
        undefined,
        scope.graphType === 'pkg' ? scope.userId : undefined
      );
    }

    const filter = {
      graphType: scope.graphType,
      includeDeleted: false,
      ...(scope.graphType === 'pkg' ? { userId: scope.userId } : {}),
    };
    const total = await this.countNodes(filter);
    const nodes = total === 0 ? [] : await this.findNodes(filter, total, 0);
    const nodeIds = nodes.map((node) => node.nodeId);
    const edges =
      nodeIds.length === 0
        ? []
        : await this.getEdgesForNodes(
            nodeIds,
            undefined,
            scope.graphType === 'pkg' ? scope.userId : undefined
          );

    return {
      nodes,
      edges: [...new Map(edges.map((edge) => [edge.edgeId, edge])).values()],
    };
  }

  async replaceScope(scope: GraphRestorationScope, snapshot: IGraphSnapshotPayload): Promise<void> {
    const current = await this.captureScope(scope);
    const nodeIdsToDelete = current.nodes.map((node) => node.nodeId as string);
    const session = this.neo4j.getSession();

    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        if (nodeIdsToDelete.length > 0) {
          await tx.run(
            `UNWIND $nodeIds AS nodeId
             MATCH (n {nodeId: nodeId})
             OPTIONAL MATCH (n)-[r]-()
             DELETE r, n`,
            { nodeIds: nodeIdsToDelete }
          );
        }

        for (const node of snapshot.nodes) {
          const primaryLabel = graphTypeToLabel(node.graphType);
          const secondaryLabel = nodeTypeToLabel(node.nodeType);
          await tx.run(`CREATE (n:${primaryLabel}:${secondaryLabel} $props)`, {
            props: buildRestoredNodeProperties(node),
          });
        }

        for (const edge of snapshot.edges) {
          const relType = edgeTypeToRelType(edge.edgeType);
          await tx.run(
            `MATCH (source {nodeId: $sourceNodeId})
             MATCH (target {nodeId: $targetNodeId})
             CREATE (source)-[r:${relType}]->(target)
             SET r = $props`,
            {
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
              props: buildRestoredEdgeProperties(edge),
            }
          );
        }
      });
    } catch (error) {
      this.translateNeo4jError(error, 'replaceScope', {
        graphType: scope.graphType,
        ...(scope.graphType === 'pkg' ? { userId: scope.userId } : {}),
        ...(scope.domain !== undefined ? { domain: scope.domain } : {}),
      });
    } finally {
      await session.close();
    }
  }
}

// ============================================================================
// Utility
// ============================================================================

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
    const upsertProps = buildNodeUpdateProperties(buildNodeUpsertUpdateInput(input));
    const identityKeys = buildNodeIdentityKeys(graphType, input, userId);

    if (identityKeys.length > 0) {
      props['identityKeys'] = identityKeys;
      upsertProps['identityKeys'] = identityKeys;
    }

    upsertProps['isDeleted'] = false;
    upsertProps['deletedAt'] = null;

    const result = await this.tx.run(
      `OPTIONAL MATCH (existing:${primaryLabel})
       WHERE existing.nodeType = $nodeType
         AND ${
           identityKeys.length > 0
             ? 'any(key IN $identityKeys WHERE key IN coalesce(existing.identityKeys, []))'
             : 'existing.nodeId = $nodeId'
         }
         ${userId !== undefined ? 'AND existing.userId = $userId' : ''}
       WITH existing
       CALL {
         WITH existing
         WHERE existing IS NULL
         CREATE (created:${primaryLabel}:${secondaryLabel} $props)
         RETURN created AS node
         UNION
         WITH existing
         SET existing += $upsertProps
         SET existing:${secondaryLabel}
         RETURN existing AS node
       }
       RETURN node`,
      {
        props,
        upsertProps,
        nodeId,
        nodeType: input.nodeType,
        ...(identityKeys.length > 0 ? { identityKeys } : {}),
        ...(userId !== undefined ? { userId } : {}),
      }
    );

    const node = result.records[0]?.get('node') as neo4j.Node | undefined;
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
    const nextNodeTypeLabel =
      updates.nodeType !== undefined ? nodeTypeToLabel(updates.nodeType) : null;
    const existingNode = await this.getNode(nodeId, userId);
    if (existingNode === null) {
      throw new NodeNotFoundError(nodeId);
    }

    const nextCanonicalExternalRefs =
      updates.canonicalExternalRefs ?? existingNode.canonicalExternalRefs;
    const nextOntologyMappings = updates.ontologyMappings ?? existingNode.ontologyMappings;
    const nextNodeIdentityInput = {
      label: updates.label ?? existingNode.label,
      nodeType: updates.nodeType ?? existingNode.nodeType,
      domain: updates.domain ?? existingNode.domain,
      ...(nextCanonicalExternalRefs !== undefined
        ? { canonicalExternalRefs: nextCanonicalExternalRefs }
        : {}),
      ...(nextOntologyMappings !== undefined ? { ontologyMappings: nextOntologyMappings } : {}),
    };
    if (
      updates.label !== undefined ||
      updates.nodeType !== undefined ||
      updates.domain !== undefined ||
      updates.canonicalExternalRefs !== undefined ||
      updates.ontologyMappings !== undefined
    ) {
      updateProps['identityKeys'] = buildNodeIdentityKeys(
        existingNode.graphType,
        nextNodeIdentityInput,
        userId
      );
    }

    const result = await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       SET n += $updateProps
       ${nextNodeTypeLabel !== null ? `REMOVE n:${REMOVABLE_NODE_LABELS} SET n:${nextNodeTypeLabel}` : ''}
       RETURN n`,
      { nodeId, updateProps, ...(userId !== undefined ? { userId } : {}) }
    );

    const record = result.records[0];
    if (!record) throw new NodeNotFoundError(nodeId);
    return mapNodeToGraphNode(record.get('n') as neo4j.Node);
  }

  async deleteNode(nodeId: NodeId, userId?: string): Promise<void> {
    // Soft-delete connected edges first to prevent orphaned references
    await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r]-(m)
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       SET r.isDeleted = true, r.deletedAt = $deletedAt, r.updatedAt = $deletedAt`,
      { nodeId, deletedAt: new Date().toISOString(), ...(userId !== undefined ? { userId } : {}) }
    );

    // Then soft-delete the node itself
    const result = await this.tx.run(
      `MATCH (n {nodeId: $nodeId, isDeleted: false})
       ${userId !== undefined ? 'WHERE n.userId = $userId' : ''}
       SET n.isDeleted = true, n.deletedAt = $deletedAt, n.updatedAt = $deletedAt
       RETURN n`,
      { nodeId, deletedAt: new Date().toISOString(), ...(userId !== undefined ? { userId } : {}) }
    );

    if (result.records.length === 0) throw new NodeNotFoundError(nodeId);
  }

  findNodes(_filter: INodeFilter, _limit: number, _offset: number): Promise<IGraphNode[]> {
    throw new Error('findNodes is not supported within a transaction context');
  }

  countNodes(_filter: INodeFilter): Promise<number> {
    throw new Error('countNodes is not supported within a transaction context');
  }

  getNodeMasterySummary(
    _filter: INodeFilter,
    _masteryThreshold: MasteryLevel
  ): Promise<INodeMasterySummary> {
    throw new Error('getNodeMasterySummary is not supported within a transaction context');
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
    const edgeUpsertProps: Record<string, unknown> = {
      ...edgeProps,
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
    };
    delete edgeUpsertProps['edgeId'];
    delete edgeUpsertProps['createdAt'];

    const result = await this.tx.run(
      `MATCH (source {nodeId: $sourceNodeId, isDeleted: false})
       MATCH (target {nodeId: $targetNodeId, isDeleted: false})
       MERGE (source)-[r:${relType}]->(target)
       ON CREATE SET r = $edgeProps,
                     r.updatedAt = $updatedAt,
                     r.isDeleted = false
       ON MATCH SET r += $edgeUpsertProps
       SET r.edgeId = coalesce(r.edgeId, $edgeId)
       SET r.createdAt = coalesce(r.createdAt, $createdAt)
       RETURN r, source.nodeId AS sourceId, target.nodeId AS targetId,
              source.graphType AS sourceGraphType`,
      {
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        edgeProps,
        edgeUpsertProps,
        edgeId,
        createdAt: edgeProps['createdAt'],
        updatedAt: edgeUpsertProps['updatedAt'],
      }
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
         AND coalesce(r.isDeleted, false) = false
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
         AND coalesce(r.isDeleted, false) = false
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

  findEdges(_filter: IEdgeFilter): Promise<IGraphEdge[]> {
    throw new Error('findEdges is not supported within a transaction context');
  }

  countEdges(_filter: IEdgeFilter): Promise<number> {
    throw new Error('countEdges is not supported within a transaction context');
  }

  async getEdgesForNode(
    nodeId: NodeId,
    direction: EdgeDirection,
    _userId?: string
  ): Promise<IGraphEdge[]> {
    const relTypePattern = ALL_REL_TYPES.join('|');
    let query: string;

    switch (direction) {
      case 'outbound':
        query = `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r:${relTypePattern}]->(target {isDeleted: false})
                 WHERE coalesce(r.isDeleted, false) = false
                 RETURN r, n.nodeId AS sourceId, target.nodeId AS targetId, labels(n) AS srcLabels`;
        break;
      case 'inbound':
        query = `MATCH (source {isDeleted: false})-[r:${relTypePattern}]->(n {nodeId: $nodeId, isDeleted: false})
                 WHERE coalesce(r.isDeleted, false) = false
                 RETURN r, source.nodeId AS sourceId, n.nodeId AS targetId, labels(source) AS srcLabels`;
        break;
      default:
        query = `MATCH (n {nodeId: $nodeId, isDeleted: false})-[r:${relTypePattern}]-(other {isDeleted: false})
                 WHERE coalesce(r.isDeleted, false) = false
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

  getEdgesForNodes(
    _nodeIds: readonly NodeId[],
    _filter?: IEdgeFilter,
    _userId?: string
  ): Promise<IGraphEdge[]> {
    throw new Error('getEdgesForNodes is not supported within a transaction context');
  }

  // ── Traversal (not needed in transaction context, stubs) ──────────────

  getAncestors(): Promise<IGraphNode[]> {
    throw new Error('getAncestors is not supported within a transaction context');
  }

  getDescendants(): Promise<IGraphNode[]> {
    throw new Error('getDescendants is not supported within a transaction context');
  }

  findShortestPath(): Promise<IGraphNode[]> {
    throw new Error('findShortestPath is not supported within a transaction context');
  }

  findFilteredShortestPath(): Promise<IGraphNode[]> {
    throw new Error('findFilteredShortestPath is not supported within a transaction context');
  }

  getSubgraph(): Promise<ISubgraph> {
    throw new Error('getSubgraph is not supported within a transaction context');
  }

  detectCycles(): Promise<NodeId[]> {
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
      { nodeIds: [...nodeIds], ...(userId !== undefined ? { userId } : {}) }
    );

    return result.records.map((r) => mapNodeToGraphNode(r.get('n') as neo4j.Node));
  }

  // ── Transaction nesting (not supported) ───────────────────────────────

  runInTransaction<T>(_fn: (txRepo: IGraphRepository) => Promise<T>): Promise<T> {
    throw new Error('Nested transactions are not supported');
  }

  // ── Traversal stubs (not needed inside commit protocol) ───────────────

  getSiblings(_nodeId: NodeId, _query: ISiblingsQuery, _userId?: string): Promise<ISiblingsResult> {
    throw new Error('getSiblings is not supported inside transactions');
  }

  getCoParents(
    _nodeId: NodeId,
    _query: ICoParentsQuery,
    _userId?: string
  ): Promise<ICoParentsResult> {
    throw new Error('getCoParents is not supported inside transactions');
  }

  getNeighborhood(
    _nodeId: NodeId,
    _query: INeighborhoodQuery,
    _userId?: string
  ): Promise<INeighborhoodResult> {
    throw new Error('getNeighborhood is not supported inside transactions');
  }

  // ── Phase 8c traversal stubs ──────────────────────────────────────────

  getDomainSubgraph(
    _domain: string,
    _edgeTypes?: readonly GraphEdgeType[],
    _studyMode?: StudyMode,
    _userId?: string
  ): Promise<ISubgraph> {
    throw new Error('getDomainSubgraph is not supported inside transactions');
  }

  findArticulationPointsNative(
    _domain: string,
    _edgeTypes?: readonly GraphEdgeType[],
    _studyMode?: StudyMode,
    _userId?: string
  ): Promise<NodeId[] | null> {
    throw new Error('findArticulationPointsNative is not supported inside transactions');
  }

  getKnowledgeFrontier(_query: IFrontierQuery, _userId: string): Promise<IKnowledgeFrontierResult> {
    throw new Error('getKnowledgeFrontier is not supported inside transactions');
  }

  getCommonAncestors(
    _nodeIdA: NodeId,
    _nodeIdB: NodeId,
    _query: ICommonAncestorsQuery,
    _userId?: string
  ): Promise<ICommonAncestorsResult> {
    throw new Error('getCommonAncestors is not supported inside transactions');
  }

  // ── Phase 8d traversal stubs ──────────────────────────────────────────

  getDegreeCentrality(_query: ICentralityQuery, _userId?: string): Promise<ICentralityEntry[]> {
    throw new Error('getDegreeCentrality is not supported inside transactions');
  }

  // ── Phase 8e ontological guardrails stubs ─────────────────────────────

  findConflictingEdges(
    _sourceNodeId: NodeId,
    _targetNodeId: NodeId,
    _edgeTypes: readonly GraphEdgeType[]
  ): Promise<IGraphEdge[]> {
    throw new Error('findConflictingEdges is not supported inside transactions');
  }
}
