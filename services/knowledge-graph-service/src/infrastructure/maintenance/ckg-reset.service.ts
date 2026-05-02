import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  ICkgMaintenancePort,
  ICkgResetInput,
  ICkgResetResult,
  ICkgSourcePurgeInput,
  ICkgSourcePurgeResult,
} from '../../application/knowledge-graph/maintenance/contracts.js';
import type { Neo4jClient } from '../database/neo4j-client.js';
import {
  mapNodeToGraphNode,
  mapRelationshipToGraphEdge,
} from '../database/neo4j-mapper.js';

const POSTGRES_CKG_TABLES = [
  'aggregation_evidence',
  'ckg_mutation_audit_log',
  'ckg_mutations',
  'ontology_parsed_batches',
  'ontology_import_checkpoints',
  'ontology_import_artifacts',
  'ontology_import_runs',
] as const;

const ONTOLOGY_SOURCE_TABLE = 'ontology_import_sources';
const CKG_CACHE_PATTERNS = [
  'ckg:*',
  'siblings:ckg:*',
  'co-parents:ckg:*',
  'neighborhood:ckg:*',
  'domain-subgraph:ckg:*',
  'common-ancestors:ckg:*',
  'centrality-degree:ckg:*',
] as const;

const AGGREGATION_STREAM_ID = 'users_aggregation';
const AGENT_STREAM_ID = 'agents';
const ADMIN_STREAM_ID = 'admin_manual';
const AGGREGATION_PROPOSER_ID = 'agent_aggregation-pipeline';

interface IResetLogger {
  info(obj: unknown, msg?: string): void;
}

interface IResolvedStreamTarget {
  normalizedStreamId: string;
  importSourceId: string | null;
  proposerFilter:
    | { kind: 'all_agents' }
    | { kind: 'aggregation_only' }
    | { kind: 'all_admin_users' }
    | null;
}

function normalizeStreamId(streamId: string): string {
  return streamId.trim().toLowerCase();
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function collectNodeStreamIds(node: {
  canonicalExternalRefs?: Array<{ sourceId: string }>;
  ontologyMappings?: Array<{ sourceId: string }>;
  provenance?: Array<{ sourceId: string }>;
  sourceCoverage?: { contributingSourceIds?: string[] } | null;
  properties: Record<string, unknown>;
}): Set<string> {
  const streamIds = new Set<string>();

  for (const ref of node.canonicalExternalRefs ?? []) {
    streamIds.add(normalizeStreamId(ref.sourceId));
  }
  for (const mapping of node.ontologyMappings ?? []) {
    streamIds.add(normalizeStreamId(mapping.sourceId));
  }
  for (const entry of node.provenance ?? []) {
    streamIds.add(normalizeStreamId(entry.sourceId));
  }
  for (const sourceId of node.sourceCoverage?.contributingSourceIds ?? []) {
    streamIds.add(normalizeStreamId(sourceId));
  }

  const explicitStreamIds = stringArrayFromUnknown(node.properties['maintenanceStreamIds']);
  for (const streamId of explicitStreamIds) {
    streamIds.add(normalizeStreamId(streamId));
  }

  const sourceId = typeof node.properties['sourceId'] === 'string' ? node.properties['sourceId'] : null;
  if (sourceId !== null) {
    streamIds.add(normalizeStreamId(sourceId));
  }

  const ontologyImport = parseJsonRecord(node.properties['ontologyImport']);
  if (typeof ontologyImport?.['sourceId'] === 'string') {
    streamIds.add(normalizeStreamId(ontologyImport['sourceId']));
  }

  return streamIds;
}

function collectEdgeStreamIds(edge: { properties: Record<string, unknown> }): Set<string> {
  const streamIds = new Set<string>();
  for (const streamId of stringArrayFromUnknown(edge.properties['maintenanceStreamIds'])) {
    streamIds.add(normalizeStreamId(streamId));
  }
  if (typeof edge.properties['sourceId'] === 'string') {
    streamIds.add(normalizeStreamId(edge.properties['sourceId']));
  }
  return streamIds;
}

function resolveStreamTarget(streamId: string): IResolvedStreamTarget {
  const normalizedStreamId = normalizeStreamId(streamId);

  if (normalizedStreamId === AGGREGATION_STREAM_ID) {
    return {
      normalizedStreamId,
      importSourceId: null,
      proposerFilter: { kind: 'aggregation_only' },
    };
  }

  if (normalizedStreamId === AGENT_STREAM_ID) {
    return {
      normalizedStreamId,
      importSourceId: null,
      proposerFilter: { kind: 'all_agents' },
    };
  }

  if (normalizedStreamId === ADMIN_STREAM_ID) {
    return {
      normalizedStreamId,
      importSourceId: null,
      proposerFilter: { kind: 'all_admin_users' },
    };
  }

  return {
    normalizedStreamId,
    importSourceId: normalizedStreamId,
    proposerFilter: null,
  };
}

export class CkgResetService implements ICkgMaintenancePort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly neo4jClient: Neo4jClient,
    private readonly redis: Redis,
    private readonly cachePrefix: string,
    private readonly artifactRootDirectory: string,
    private readonly logger: IResetLogger
  ) {}

  async reset(input?: ICkgResetInput): Promise<ICkgResetResult> {
    const includeSources = input?.includeSources ?? false;
    const truncatedTables = await this.truncatePostgresState(includeSources);
    const deletedNeo4jCkgNodes = await this.wipeNeo4jCkg();
    await this.clearRedisCkgCache();
    await rm(this.artifactRootDirectory, { recursive: true, force: true });

    const result: ICkgResetResult = {
      includeSources,
      truncatedTables,
      deletedNeo4jCkgNodes,
      clearedCachePatterns: [...CKG_CACHE_PATTERNS],
      artifactRootDirectory: this.artifactRootDirectory,
      resetAt: new Date().toISOString(),
    };

    this.logger.info(
      {
        includeSources,
        truncatedTables,
        deletedNeo4jCkgNodes,
        artifactRootDirectory: this.artifactRootDirectory,
      },
      'Reset canonical knowledge graph contents'
    );

    return result;
  }

  async purgeBySource(input: ICkgSourcePurgeInput): Promise<ICkgSourcePurgeResult> {
    const streamTarget = resolveStreamTarget(input.streamId);
    const runRecords =
      streamTarget.importSourceId === null
        ? []
        : await this.prisma.ontologyImportRun.findMany({
            where: { sourceId: streamTarget.importSourceId },
            select: { id: true, submittedMutationIds: true },
          });

    const importRunIds = runRecords.map((record) => record.id);
    const submittedMutationIds = new Set<string>();
    for (const record of runRecords) {
      for (const mutationId of parseJsonStringArray(record.submittedMutationIds)) {
        submittedMutationIds.add(mutationId);
      }
    }

    const proposerMutationIds = await this.findMutationIdsForStream(streamTarget);
    for (const mutationId of proposerMutationIds) {
      submittedMutationIds.add(mutationId);
    }

    const mutationIds = [...submittedMutationIds];
    const graphSnapshot = await this.loadCanonicalGraphSnapshot();
    const nodesToDelete = graphSnapshot.nodes
      .filter((node) => collectNodeStreamIds(node).has(streamTarget.normalizedStreamId))
      .map((node) => node.nodeId as string);
    const directEdgeIds = new Set<string>(
      graphSnapshot.edges
        .filter((edge) => collectEdgeStreamIds(edge).has(streamTarget.normalizedStreamId))
        .map((edge) => edge.edgeId as string)
    );

    const mutationEdgeTriples = await this.collectEdgeTriplesFromMutations(mutationIds);
    for (const edge of graphSnapshot.edges) {
      const triple = `${String(edge.sourceNodeId)}|${String(edge.targetNodeId)}|${edge.edgeType}`;
      if (mutationEdgeTriples.has(triple)) {
        directEdgeIds.add(edge.edgeId as string);
      }
    }

    const deletedNeo4jCkgEdges = await this.deleteNeo4jEdges([...directEdgeIds]);
    const deletedNeo4jCkgNodes = await this.deleteNeo4jNodes(nodesToDelete);
    await this.clearRedisCkgCache();

    const artifactDirectoriesRemoved: string[] = [];
    if (streamTarget.importSourceId !== null) {
      const sourceDirectory = path.join(this.artifactRootDirectory, streamTarget.importSourceId);
      await rm(sourceDirectory, { recursive: true, force: true });
      artifactDirectoriesRemoved.push(sourceDirectory);
    }

    const deletedAggregationEvidenceCount =
      streamTarget.normalizedStreamId === AGGREGATION_STREAM_ID
        ? (
            await this.prisma.aggregationEvidence.deleteMany({
              where: { sourceUserId: { not: '' } },
            })
          ).count
        : mutationIds.length > 0
          ? (
              await this.prisma.aggregationEvidence.deleteMany({
                where: { mutationId: { in: mutationIds } },
              })
            ).count
          : 0;

    const deletedMutationCount =
      mutationIds.length > 0
        ? (
            await this.prisma.ckgMutation.deleteMany({
              where: { id: { in: mutationIds } },
            })
          ).count
        : 0;

    const deletedImportArtifactCount =
      importRunIds.length > 0
        ? (
            await this.prisma.ontologyImportArtifact.deleteMany({
              where: { runId: { in: importRunIds } },
            })
          ).count
        : 0;
    const deletedImportCheckpointCount =
      importRunIds.length > 0
        ? (
            await this.prisma.ontologyImportCheckpoint.deleteMany({
              where: { runId: { in: importRunIds } },
            })
          ).count
        : 0;
    const deletedParsedBatchCount =
      importRunIds.length > 0
        ? (
            await this.prisma.ontologyParsedBatch.deleteMany({
              where: { runId: { in: importRunIds } },
            })
          ).count
        : 0;
    const deletedImportRunCount =
      importRunIds.length > 0
        ? (
            await this.prisma.ontologyImportRun.deleteMany({
              where: { id: { in: importRunIds } },
            })
          ).count
        : 0;
    const deletedSourceRegistrationCount =
      input.includeSourceRegistration === true && streamTarget.importSourceId !== null
        ? (
            await this.prisma.ontologyImportSource.deleteMany({
              where: { id: streamTarget.importSourceId },
            })
          ).count
        : 0;

    const result: ICkgSourcePurgeResult = {
      streamId: input.streamId,
      deletedNeo4jCkgNodes,
      deletedNeo4jCkgEdges,
      deletedMutationCount,
      deletedAggregationEvidenceCount,
      deletedImportRunCount,
      deletedImportArtifactCount,
      deletedImportCheckpointCount,
      deletedParsedBatchCount,
      deletedSourceRegistrationCount,
      clearedCachePatterns: [...CKG_CACHE_PATTERNS],
      artifactDirectoriesRemoved,
      purgedAt: new Date().toISOString(),
    };

    this.logger.info(
      {
        streamId: input.streamId,
        deletedNeo4jCkgNodes,
        deletedNeo4jCkgEdges,
        deletedMutationCount,
        deletedImportRunCount,
      },
      'Purged canonical knowledge graph source stream'
    );

    return result;
  }

  private async truncatePostgresState(includeSources: boolean): Promise<string[]> {
    const tables: string[] = [...POSTGRES_CKG_TABLES];
    if (includeSources) {
      tables.push(ONTOLOGY_SOURCE_TABLE);
    }

    const sql = `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`;
    await this.prisma.$executeRawUnsafe(sql);
    return tables;
  }

  private async wipeNeo4jCkg(): Promise<number> {
    const session = this.neo4jClient.getSession();
    try {
      const countResult = await session.executeRead(async (tx) =>
        tx.run('MATCH (n:CkgNode) RETURN count(n) AS count')
      );
      const deletedNeo4jCkgNodes = Number(countResult.records[0]?.get('count') ?? 0);

      await session.executeWrite(async (tx) => {
        await tx.run('MATCH (n:CkgNode) DETACH DELETE n');
      });

      return deletedNeo4jCkgNodes;
    } finally {
      await session.close();
    }
  }

  private async loadCanonicalGraphSnapshot(): Promise<{
    nodes: ReturnType<typeof mapNodeToGraphNode>[];
    edges: ReturnType<typeof mapRelationshipToGraphEdge>[];
  }> {
    const session = this.neo4jClient.getSession();
    try {
      const nodesResult = await session.executeRead(async (tx) =>
        tx.run('MATCH (n:CkgNode) WHERE coalesce(n.isDeleted, false) = false RETURN n')
      );
      const edgesResult = await session.executeRead(async (tx) =>
        tx.run(
          `MATCH (source:CkgNode)-[r]->(target:CkgNode)
           WHERE coalesce(r.isDeleted, false) = false
             AND coalesce(source.isDeleted, false) = false
             AND coalesce(target.isDeleted, false) = false
           RETURN r, source.nodeId AS sourceNodeId, target.nodeId AS targetNodeId`
        )
      );

      return {
        nodes: nodesResult.records.map((record) => mapNodeToGraphNode(record.get('n'))),
        edges: edgesResult.records.map((record) =>
          mapRelationshipToGraphEdge(
            record.get('r'),
            record.get('sourceNodeId'),
            record.get('targetNodeId'),
            'ckg'
          )
        ),
      };
    } finally {
      await session.close();
    }
  }

  private async collectEdgeTriplesFromMutations(mutationIds: readonly string[]): Promise<Set<string>> {
    if (mutationIds.length === 0) {
      return new Set<string>();
    }

    const mutations = await this.prisma.ckgMutation.findMany({
      where: { id: { in: [...mutationIds] } },
      select: { operation: true },
    });

    const triples = new Set<string>();
    for (const mutation of mutations) {
      const operations = Array.isArray(mutation.operation) ? mutation.operation : [];
      for (const operation of operations) {
        if (
          typeof operation === 'object' &&
          operation !== null &&
          (operation as Record<string, unknown>)['type'] === 'add_edge' &&
          typeof (operation as Record<string, unknown>)['sourceNodeId'] === 'string' &&
          typeof (operation as Record<string, unknown>)['targetNodeId'] === 'string' &&
          typeof (operation as Record<string, unknown>)['edgeType'] === 'string'
        ) {
          triples.add(
            [
              (operation as Record<string, unknown>)['sourceNodeId'],
              (operation as Record<string, unknown>)['targetNodeId'],
              (operation as Record<string, unknown>)['edgeType'],
            ].join('|')
          );
        }
      }
    }

    return triples;
  }

  private async findMutationIdsForStream(streamTarget: IResolvedStreamTarget): Promise<string[]> {
    if (streamTarget.proposerFilter === null) {
      return [];
    }

    const where =
      streamTarget.proposerFilter.kind === 'aggregation_only'
        ? { createdBy: AGGREGATION_PROPOSER_ID }
        : streamTarget.proposerFilter.kind === 'all_agents'
          ? {
              createdBy: { startsWith: 'agent_' },
              NOT: { createdBy: AGGREGATION_PROPOSER_ID },
            }
          : { createdBy: { startsWith: 'user_' } };

    const records = await this.prisma.ckgMutation.findMany({
      where,
      select: { id: true },
    });

    return records.map((record) => record.id);
  }

  private async deleteNeo4jEdges(edgeIds: readonly string[]): Promise<number> {
    if (edgeIds.length === 0) {
      return 0;
    }

    const session = this.neo4jClient.getSession();
    try {
      const result = await session.executeWrite(async (tx) =>
        tx.run(
          `UNWIND $edgeIds AS edgeId
           MATCH ()-[r]->()
           WHERE r.edgeId = edgeId
           DELETE r
           RETURN count(r) AS deletedCount`,
          { edgeIds: [...edgeIds] }
        )
      );

      return Number(result.records[0]?.get('deletedCount') ?? 0);
    } finally {
      await session.close();
    }
  }

  private async deleteNeo4jNodes(nodeIds: readonly string[]): Promise<number> {
    if (nodeIds.length === 0) {
      return 0;
    }

    const session = this.neo4jClient.getSession();
    try {
      const result = await session.executeWrite(async (tx) =>
        tx.run(
          `UNWIND $nodeIds AS nodeId
           MATCH (n:CkgNode {nodeId: nodeId})
           DETACH DELETE n
           RETURN count(n) AS deletedCount`,
          { nodeIds: [...nodeIds] }
        )
      );

      return Number(result.records[0]?.get('deletedCount') ?? 0);
    } finally {
      await session.close();
    }
  }

  private async clearRedisCkgCache(): Promise<void> {
    for (const pattern of CKG_CACHE_PATTERNS) {
      await this.deleteByPattern(this.withPrefix(pattern));
    }
  }

  private withPrefix(pattern: string): string {
    return this.cachePrefix === '' ? pattern : `${this.cachePrefix}:${pattern}`;
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
