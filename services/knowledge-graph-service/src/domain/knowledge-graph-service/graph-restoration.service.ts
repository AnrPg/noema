import type { EdgeId, IGraphEdge, IGraphNode, NodeId } from '@noema/types';
import type { Logger } from 'pino';

import type { AgentHintsFactory } from './agent-hints.factory.js';
import { AgentHintsBuilder } from './agent-hints.factory.js';
import { GraphSnapshotNotFoundError } from './errors/index.js';
import type {
  GraphRestorationScope,
  IGraphRestorationRepository,
} from './graph-restoration.repository.js';
import type {
  ICreateGraphSnapshotInput,
  IGraphSnapshotListFilters,
  IGraphSnapshotRepository,
} from './graph-snapshot.repository.js';
import type {
  IGraphRestorePreview,
  IGraphRestoreScopeInput,
  IGraphRestoreSummary,
  IGraphSnapshotSummary,
  IServiceResult,
} from './knowledge-graph.service.js';
import type { IMutationRepository } from './mutation.repository.js';
import type { IPkgOperationLogRepository } from './pkg-operation-log.repository.js';

function toSummary(record: {
  snapshotId: string;
  graphType: 'pkg' | 'ckg';
  scope: GraphRestorationScope;
  nodeCount: number;
  edgeCount: number;
  schemaVersion: number;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
  sourceCursor: string | null;
}): IGraphSnapshotSummary {
  return {
    snapshotId: record.snapshotId,
    graphType: record.graphType,
    scope: record.scope,
    nodeCount: record.nodeCount,
    edgeCount: record.edgeCount,
    schemaVersion: record.schemaVersion,
    reason: record.reason,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    sourceCursor: record.sourceCursor,
  };
}

function buildNodeFingerprint(node: IGraphNode): string {
  return JSON.stringify({
    nodeType: node.nodeType,
    label: node.label,
    description: node.description,
    domain: node.domain,
    status: node.status,
    userId: node.userId,
    aliases: node.aliases,
    languages: node.languages,
    tags: node.tags,
    supportedStudyModes: node.supportedStudyModes,
    semanticHints: node.semanticHints,
    canonicalExternalRefs: node.canonicalExternalRefs,
    ontologyMappings: node.ontologyMappings,
    provenance: node.provenance,
    reviewMetadata: node.reviewMetadata,
    sourceCoverage: node.sourceCoverage,
    properties: node.properties,
    masteryLevel: node.masteryLevel,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  });
}

function buildEdgeFingerprint(edge: IGraphEdge): string {
  return JSON.stringify({
    edgeType: edge.edgeType,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    userId: edge.userId,
    weight: edge.weight,
    properties: edge.properties,
    createdAt: edge.createdAt,
  });
}

function describeScope(scope: GraphRestorationScope): string {
  if (scope.graphType === 'pkg') {
    return scope.domain === undefined
      ? `PKG for user ${scope.userId}`
      : `PKG domain "${scope.domain}" for user ${scope.userId}`;
  }

  return scope.domain === undefined ? 'full CKG' : `CKG domain "${scope.domain}"`;
}

function toScope(input: IGraphRestoreScopeInput): GraphRestorationScope {
  if (input.graphType === 'pkg') {
    return {
      graphType: 'pkg',
      userId: input.userId,
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
    };
  }

  return {
    graphType: 'ckg',
    ...(input.domain !== undefined ? { domain: input.domain } : {}),
  };
}

export class GraphRestorationService {
  private readonly logger: Logger;

  constructor(
    private readonly graphSnapshotRepository: IGraphSnapshotRepository,
    private readonly graphRestorationRepository: IGraphRestorationRepository,
    private readonly mutationRepository: IMutationRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly hintsFactory: AgentHintsFactory,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'GraphRestorationService' });
  }

  async createSnapshot(
    input: IGraphRestoreScopeInput,
    actorId: string | null
  ): Promise<IServiceResult<IGraphSnapshotSummary>> {
    const scope = toScope(input);
    const subgraph = await this.graphRestorationRepository.captureScope(scope);
    const sourceCursor = await this.resolveSourceCursor(scope);

    const createInput: ICreateGraphSnapshotInput = {
      graphType: scope.graphType,
      scope,
      payload: {
        nodes: subgraph.nodes,
        edges: subgraph.edges,
      },
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      schemaVersion: 1,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(actorId !== null ? { createdBy: actorId } : {}),
      ...(sourceCursor !== null ? { sourceCursor } : {}),
    };

    const snapshot = await this.graphSnapshotRepository.createSnapshot(createInput);
    const summary = toSummary(snapshot);

    this.logger.info(
      {
        snapshotId: summary.snapshotId,
        graphType: summary.graphType,
        scope,
        nodeCount: summary.nodeCount,
        edgeCount: summary.edgeCount,
      },
      'Graph snapshot created'
    );

    return {
      data: summary,
      agentHints: AgentHintsBuilder.create()
        .withReasoning(
          `Captured ${describeScope(scope)} at ${summary.createdAt} with ${String(summary.nodeCount)} nodes and ${String(summary.edgeCount)} edges.`
        )
        .addAction({
          action: 'preview_restore',
          description: 'Preview the impact of restoring this snapshot before applying it',
          priority: 'high',
          category: 'optimization',
        })
        .build(),
    };
  }

  async listSnapshots(
    filters: IGraphSnapshotListFilters,
    pagination: { limit: number; offset: number }
  ): Promise<IServiceResult<{ items: IGraphSnapshotSummary[]; total: number; hasMore: boolean }>> {
    const result = await this.graphSnapshotRepository.listSnapshots(
      filters,
      pagination.limit,
      pagination.offset
    );
    const total = result.total ?? result.items.length;
    const hasMore = result.hasMore;

    return {
      data: {
        items: result.items.map(toSummary),
        total,
        hasMore,
      },
      agentHints: this.hintsFactory.createListHints('graph snapshots', result.items.length, total),
    };
  }

  async previewRestore(snapshotId: string): Promise<IServiceResult<IGraphRestorePreview>> {
    const preview = await this.buildRestorePreview(snapshotId);
    return {
      data: preview,
      agentHints: AgentHintsBuilder.create()
        .withReasoning(preview.reasoning)
        .addAction({
          action: 'execute_restore',
          description: 'Apply the snapshot only after reviewing destructive changes',
          priority: preview.requiresDestructiveChanges ? 'high' : 'medium',
          category: 'optimization',
        })
        .build(),
    };
  }

  async executeRestore(snapshotId: string): Promise<IServiceResult<IGraphRestorePreview>> {
    const snapshot = await this.graphSnapshotRepository.getSnapshot(snapshotId);
    if (snapshot === null) {
      throw new GraphSnapshotNotFoundError(snapshotId);
    }

    const preview = await this.buildRestorePreview(snapshotId, snapshot);
    await this.graphRestorationRepository.replaceScope(snapshot.scope, snapshot.payload);

    this.logger.warn(
      {
        snapshotId,
        scope: snapshot.scope,
        destructive: preview.requiresDestructiveChanges,
      },
      'Graph snapshot restored'
    );

    return {
      data: preview,
      agentHints: AgentHintsBuilder.create()
        .withReasoning(
          `Restored ${describeScope(snapshot.scope)} from snapshot ${snapshotId}. ${preview.reasoning}`
        )
        .build(),
    };
  }

  private async buildRestorePreview(
    snapshotId: string,
    snapshotRecord?: Awaited<ReturnType<IGraphSnapshotRepository['getSnapshot']>>
  ): Promise<IGraphRestorePreview> {
    const snapshot = snapshotRecord ?? (await this.graphSnapshotRepository.getSnapshot(snapshotId));
    if (snapshot === null) {
      throw new GraphSnapshotNotFoundError(snapshotId);
    }

    const current = await this.graphRestorationRepository.captureScope(snapshot.scope);
    const summary = this.diffSnapshot(snapshot.scope, snapshot.payload, {
      nodes: current.nodes,
      edges: current.edges,
    });

    return {
      snapshot: toSummary(snapshot),
      summary,
      requiresDestructiveChanges:
        summary.nodesToDelete > 0 ||
        summary.edgesToDelete > 0 ||
        summary.nodesToUpdate > 0 ||
        summary.edgesToUpdate > 0,
      reasoning: `${describeScope(snapshot.scope)} restore would create ${String(summary.nodesToCreate)} node(s), update ${String(summary.nodesToUpdate)} node(s), delete ${String(summary.nodesToDelete)} node(s), create ${String(summary.edgesToCreate)} edge(s), update ${String(summary.edgesToUpdate)} edge(s), and delete ${String(summary.edgesToDelete)} edge(s).`,
    };
  }

  private diffSnapshot(
    scope: GraphRestorationScope,
    snapshot: { nodes: readonly IGraphNode[]; edges: readonly IGraphEdge[] },
    current: { nodes: readonly IGraphNode[]; edges: readonly IGraphEdge[] }
  ): IGraphRestoreSummary {
    const currentNodes = new Map<NodeId, IGraphNode>(
      current.nodes.map((node) => [node.nodeId, node])
    );
    const snapshotNodes = new Map<NodeId, IGraphNode>(
      snapshot.nodes.map((node) => [node.nodeId, node])
    );
    const currentEdges = new Map<EdgeId, IGraphEdge>(
      current.edges.map((edge) => [edge.edgeId, edge])
    );
    const snapshotEdges = new Map<EdgeId, IGraphEdge>(
      snapshot.edges.map((edge) => [edge.edgeId, edge])
    );

    let nodesToCreate = 0;
    let nodesToUpdate = 0;
    for (const [nodeId, node] of snapshotNodes) {
      const existing = currentNodes.get(nodeId);
      if (existing === undefined) {
        nodesToCreate += 1;
        continue;
      }
      if (buildNodeFingerprint(existing) !== buildNodeFingerprint(node)) {
        nodesToUpdate += 1;
      }
    }

    let edgesToCreate = 0;
    let edgesToUpdate = 0;
    for (const [edgeId, edge] of snapshotEdges) {
      const existing = currentEdges.get(edgeId);
      if (existing === undefined) {
        edgesToCreate += 1;
        continue;
      }
      if (buildEdgeFingerprint(existing) !== buildEdgeFingerprint(edge)) {
        edgesToUpdate += 1;
      }
    }

    let nodesToDelete = 0;
    for (const nodeId of currentNodes.keys()) {
      if (!snapshotNodes.has(nodeId)) {
        nodesToDelete += 1;
      }
    }

    let edgesToDelete = 0;
    for (const edgeId of currentEdges.keys()) {
      if (!snapshotEdges.has(edgeId)) {
        edgesToDelete += 1;
      }
    }

    return {
      scope,
      currentNodeCount: current.nodes.length,
      currentEdgeCount: current.edges.length,
      snapshotNodeCount: snapshot.nodes.length,
      snapshotEdgeCount: snapshot.edges.length,
      nodesToCreate,
      nodesToUpdate,
      nodesToDelete,
      edgesToCreate,
      edgesToUpdate,
      edgesToDelete,
    };
  }

  private async resolveSourceCursor(scope: GraphRestorationScope): Promise<string | null> {
    if (scope.graphType === 'pkg') {
      const history = await this.operationLogRepository.getOperationHistory(scope.userId, 1, 0);
      return history.items[0]?.id ?? null;
    }

    const committed = await this.mutationRepository.findMutations({ state: 'committed' });
    const latest = [...committed].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    )[0];
    return latest?.mutationId ?? null;
  }
}
