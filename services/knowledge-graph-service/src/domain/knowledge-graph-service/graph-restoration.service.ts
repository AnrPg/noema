import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { EdgeId, IGraphEdge, IGraphNode, NodeId } from '@noema/types';
import type { Logger } from 'pino';

import type { AgentHintsFactory } from './agent-hints.factory.js';
import { AgentHintsBuilder } from './agent-hints.factory.js';
import { GraphSnapshotNotFoundError, ValidationError } from './errors/index.js';
import type {
  GraphRestorationScope,
  IGraphRestorationRepository,
} from './graph-restoration.repository.js';
import type { IGraphRestoreTokenRepository } from './graph-restore-token.repository.js';
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
  IExecuteGraphRestoreInput,
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
  });
}

function buildRestoreDiffFingerprint(input: {
  scope: GraphRestorationScope;
  nodeIdsToCreate: readonly string[];
  nodeIdsToUpdate: readonly string[];
  nodeIdsToDelete: readonly string[];
  edgeIdsToCreate: readonly string[];
  edgeIdsToUpdate: readonly string[];
  edgeIdsToDelete: readonly string[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        scope: input.scope,
        nodes: {
          create: [...input.nodeIdsToCreate].sort(),
          update: [...input.nodeIdsToUpdate].sort(),
          delete: [...input.nodeIdsToDelete].sort(),
        },
        edges: {
          create: [...input.edgeIdsToCreate].sort(),
          update: [...input.edgeIdsToUpdate].sort(),
          delete: [...input.edgeIdsToDelete].sort(),
        },
      })
    )
    .digest('hex');
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
    private readonly graphRestoreTokenRepository: IGraphRestoreTokenRepository,
    private readonly mutationRepository: IMutationRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly hintsFactory: AgentHintsFactory,
    private readonly options: {
      executionEnabled: boolean;
      requireConfirmationToken: boolean;
      confirmationSecret: string;
      confirmationTtlMs: number;
    },
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

  async previewRestore(
    snapshotId: string,
    actorId: string | null
  ): Promise<IServiceResult<IGraphRestorePreview>> {
    const preview = await this.buildRestorePreview(snapshotId, undefined, actorId);
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

  async executeRestore(
    snapshotId: string,
    input: IExecuteGraphRestoreInput,
    actorId: string | null
  ): Promise<IServiceResult<IGraphRestorePreview>> {
    if (!this.options.executionEnabled) {
      throw new ValidationError(
        'Graph restore execution is disabled. Enable GRAPH_RESTORE_EXECUTION_ENABLED before applying snapshots.',
        {
          confirmationToken: ['Restore execution is disabled for this environment.'],
        }
      );
    }

    const snapshot = await this.graphSnapshotRepository.getSnapshot(snapshotId);
    if (snapshot === null) {
      throw new GraphSnapshotNotFoundError(snapshotId);
    }

    const preview = await this.buildRestorePreview(snapshotId, snapshot, actorId);
    if (this.options.requireConfirmationToken) {
      if (input.confirmationToken === undefined || input.confirmationToken.trim().length === 0) {
        throw new ValidationError('confirmationToken is required to execute a graph restore', {
          confirmationToken: ['Preview the restore and resubmit the returned confirmation token.'],
        });
      }

      const validatedToken = await this.validateRestoreConfirmationToken(
        input.confirmationToken,
        preview,
        actorId,
        this.options.confirmationSecret
      );
      if (validatedToken === null) {
        throw new ValidationError('confirmationToken does not match the latest restore preview', {
          confirmationToken: [
            'The confirmation token is invalid, expired, actor-mismatched, or stale. Generate a fresh preview before restoring.',
          ],
        });
      }

      const reserved = await this.graphRestoreTokenRepository.reserveToken({
        tokenId: validatedToken.tokenId,
        snapshotId: validatedToken.snapshotId,
        actorId: validatedToken.actorId,
        summaryHash: validatedToken.summaryHash,
        expiresAt: validatedToken.expiresAt,
      });
      if (!reserved) {
        throw new ValidationError('confirmationToken does not match the latest restore preview', {
          confirmationToken: [
            'The confirmation token is invalid, expired, actor-mismatched, or stale. Generate a fresh preview before restoring.',
          ],
        });
      }

      try {
        await this.graphRestorationRepository.replaceScope(snapshot.scope, snapshot.payload);
      } catch (error) {
        await this.graphRestoreTokenRepository.releaseToken(validatedToken.tokenId);
        throw error;
      }

      try {
        await this.graphRestoreTokenRepository.consumeToken(validatedToken.tokenId);
      } catch (error) {
        this.logger.error(
          {
            snapshotId,
            tokenId: validatedToken.tokenId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Graph restore succeeded but confirmation token consumption failed'
        );
      }
    } else {
      await this.graphRestorationRepository.replaceScope(snapshot.scope, snapshot.payload);
    }

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
    snapshotRecord?: Awaited<ReturnType<IGraphSnapshotRepository['getSnapshot']>>,
    actorId?: string | null
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

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.options.confirmationTtlMs);
    return {
      snapshot: toSummary(snapshot),
      summary,
      confirmationToken: buildRestoreConfirmationToken(
        snapshot.snapshotId,
        summary,
        actorId ?? null,
        issuedAt.toISOString(),
        expiresAt.toISOString(),
        this.options.confirmationSecret
      ),
      confirmationExpiresAt: expiresAt.toISOString(),
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

    const nodeIdsToCreate: string[] = [];
    const nodeIdsToUpdate: string[] = [];
    for (const [nodeId, node] of snapshotNodes) {
      const existing = currentNodes.get(nodeId);
      if (existing === undefined) {
        nodeIdsToCreate.push(nodeId);
        continue;
      }
      if (buildNodeFingerprint(existing) !== buildNodeFingerprint(node)) {
        nodeIdsToUpdate.push(nodeId);
      }
    }

    const edgeIdsToCreate: string[] = [];
    const edgeIdsToUpdate: string[] = [];
    for (const [edgeId, edge] of snapshotEdges) {
      const existing = currentEdges.get(edgeId);
      if (existing === undefined) {
        edgeIdsToCreate.push(edgeId);
        continue;
      }
      if (buildEdgeFingerprint(existing) !== buildEdgeFingerprint(edge)) {
        edgeIdsToUpdate.push(edgeId);
      }
    }

    const nodeIdsToDelete: string[] = [];
    for (const nodeId of currentNodes.keys()) {
      if (!snapshotNodes.has(nodeId)) {
        nodeIdsToDelete.push(nodeId);
      }
    }

    const edgeIdsToDelete: string[] = [];
    for (const edgeId of currentEdges.keys()) {
      if (!snapshotEdges.has(edgeId)) {
        edgeIdsToDelete.push(edgeId);
      }
    }

    const diffFingerprint = buildRestoreDiffFingerprint({
      scope,
      nodeIdsToCreate,
      nodeIdsToUpdate,
      nodeIdsToDelete,
      edgeIdsToCreate,
      edgeIdsToUpdate,
      edgeIdsToDelete,
    });

    return {
      scope,
      currentNodeCount: current.nodes.length,
      currentEdgeCount: current.edges.length,
      snapshotNodeCount: snapshot.nodes.length,
      snapshotEdgeCount: snapshot.edges.length,
      nodesToCreate: nodeIdsToCreate.length,
      nodesToUpdate: nodeIdsToUpdate.length,
      nodesToDelete: nodeIdsToDelete.length,
      edgesToCreate: edgeIdsToCreate.length,
      edgesToUpdate: edgeIdsToUpdate.length,
      edgesToDelete: edgeIdsToDelete.length,
      diffFingerprint,
    };
  }

  private async resolveSourceCursor(scope: GraphRestorationScope): Promise<string | null> {
    if (scope.graphType === 'pkg') {
      const history = await this.operationLogRepository.getOperationHistory(scope.userId, 1, 0);
      return history.items[0]?.id ?? null;
    }

    const latest = await this.mutationRepository.getLatestCommittedMutationByAudit();
    return latest?.mutationId ?? null;
  }

  private async validateRestoreConfirmationToken(
    token: string,
    preview: IGraphRestorePreview,
    actorId: string | null,
    secret: string
  ): Promise<{
    tokenId: string;
    snapshotId: string;
    actorId: string | null;
    expiresAt: string;
    summaryHash: string;
  } | null> {
    await this.graphRestoreTokenRepository.pruneExpiredTokens(new Date().toISOString());
    const payload = parseRestoreConfirmationToken(token, secret);
    if (payload === null) {
      return null;
    }
    if (payload.snapshotId !== preview.snapshot.snapshotId) {
      return null;
    }
    if ((payload.actorId ?? null) !== actorId) {
      return null;
    }
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      return null;
    }
    if (
      payload.summaryHash !== buildRestoreSummaryHash(preview.snapshot.snapshotId, preview.summary)
    ) {
      return null;
    }

    return payload;
  }
}

function buildRestoreConfirmationToken(
  snapshotId: string,
  summary: IGraphRestoreSummary,
  actorId: string | null,
  issuedAt: string,
  expiresAt: string,
  secret: string
): string {
  const payload = {
    tokenId: randomUUID(),
    snapshotId,
    actorId,
    issuedAt,
    expiresAt,
    summaryHash: buildRestoreSummaryHash(snapshotId, summary),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function parseRestoreConfirmationToken(
  token: string,
  secret: string
): {
  tokenId: string;
  snapshotId: string;
  actorId: string | null;
  expiresAt: string;
  summaryHash: string;
} | null {
  const [encodedPayload, providedSignature] = token.split('.');
  if (
    encodedPayload === undefined ||
    encodedPayload.length === 0 ||
    providedSignature === undefined ||
    providedSignature.length === 0
  ) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: {
    tokenId?: string;
    snapshotId?: string;
    actorId?: string | null;
    expiresAt?: string;
    summaryHash?: string;
  };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      tokenId?: string;
      snapshotId?: string;
      actorId?: string | null;
      expiresAt?: string;
      summaryHash?: string;
    };
  } catch {
    return null;
  }

  if (
    payload.tokenId === undefined ||
    payload.snapshotId === undefined ||
    payload.expiresAt === undefined ||
    payload.summaryHash === undefined
  ) {
    return null;
  }

  return {
    tokenId: payload.tokenId,
    snapshotId: payload.snapshotId,
    actorId: payload.actorId ?? null,
    expiresAt: payload.expiresAt,
    summaryHash: payload.summaryHash,
  };
}

function buildRestoreSummaryHash(snapshotId: string, summary: IGraphRestoreSummary): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        snapshotId,
        scope: summary.scope,
        diffFingerprint: summary.diffFingerprint,
      })
    )
    .digest('hex');
}
