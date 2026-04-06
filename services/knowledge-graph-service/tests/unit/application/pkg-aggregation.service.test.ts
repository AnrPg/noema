import { describe, expect, it, vi } from 'vitest';
import { KnowledgeGraphEventType } from '@noema/events';
import type {
  GraphEdgeType,
  GraphNodeType,
  IGraphEdge,
  IGraphNode,
  MutationId,
  NodeId,
  UserId,
} from '@noema/types';
import { PkgAggregationApplicationService } from '../../../src/application/knowledge-graph/aggregation/index.js';

class InMemoryGraphCrdtStatsRepository {
  readonly appliedSignals: {
    evidenceId: string;
    targetKind: 'ckg_node' | 'proposed_label';
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType: string;
    direction: 'support' | 'oppose' | 'neutral';
  }[] = [];

  applyEvidenceSignal(input: {
    evidenceId: string;
    targetKind: 'ckg_node' | 'proposed_label';
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType: string;
    direction: 'support' | 'oppose' | 'neutral';
  }) {
    this.appliedSignals.push(input);
    return Promise.resolve({
      statKey: `stat:${input.evidenceId}`,
      graphType: 'ckg' as const,
      targetKind: input.targetKind,
      targetNodeId: input.targetNodeId ?? null,
      proposedLabel: input.proposedLabel ?? null,
      evidenceType: input.evidenceType,
      supportCount: input.direction === 'support' ? 1 : 0,
      opposeCount: 0,
      neutralCount: 0,
      totalObservations: 1,
      averageConfidence: 1,
      supportCounterByReplica: { replica_test: 1 },
      opposeCounterByReplica: {},
      neutralCounterByReplica: {},
      confidenceCounterByReplica: { replica_test: 1000 },
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  listStats() {
    return Promise.resolve({ items: [], total: 0, hasMore: false });
  }
}

class InMemoryAggregationEvidenceRepository {
  private readonly records: {
    id: string;
    mutationId: MutationId | null;
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    sourceEventId: string | null;
    sourceObservedAt: string | null;
    ckgTargetNodeId: NodeId | null;
    proposedLabel: string | null;
    evidenceType: string;
    confidence: number;
    metadata: Record<string, unknown>;
    direction: 'support' | 'oppose' | 'neutral';
    recordedAt: string;
  }[] = [];

  recordEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
    confidence: number;
    metadata?: Record<string, unknown>;
    direction?: 'support' | 'oppose' | 'neutral';
    sourceEventId?: string;
    sourceObservedAt?: string;
  }) {
    const record = {
      id: `evid_${String(this.records.length + 1)}`,
      mutationId: null,
      sourceUserId: input.sourceUserId,
      sourcePkgNodeId: input.sourcePkgNodeId,
      sourceEventId: input.sourceEventId ?? null,
      sourceObservedAt: input.sourceObservedAt ?? null,
      ckgTargetNodeId: input.ckgTargetNodeId ?? null,
      proposedLabel: input.proposedLabel ?? null,
      evidenceType: input.evidenceType,
      confidence: input.confidence,
      metadata: input.metadata ?? {},
      direction: input.direction ?? 'support',
      recordedAt: new Date().toISOString(),
    };
    this.records.push(record);
    return Promise.resolve(record);
  }

  getEvidenceForTarget(ckgTargetNodeId: NodeId) {
    return Promise.resolve(
      this.records.filter((record) => record.ckgTargetNodeId === ckgTargetNodeId)
    );
  }

  getEvidenceForProposedLabel(proposedLabel: string) {
    return Promise.resolve(this.records.filter((record) => record.proposedLabel === proposedLabel));
  }

  getEvidenceCountByBand(ckgTargetNodeId: NodeId) {
    const count = this.getLatestSupportCount(
      this.records.filter((record) => record.ckgTargetNodeId === ckgTargetNodeId)
    );
    return Promise.resolve({ count, band: count >= 3 ? 'weak' : 'none' });
  }

  getEvidenceCountByProposedLabel(proposedLabel: string) {
    const count = this.getLatestSupportCount(
      this.records.filter((record) => record.proposedLabel === proposedLabel)
    );
    return Promise.resolve({ count, band: count >= 3 ? 'weak' : 'none' });
  }

  getEvidenceByUser(userId: UserId) {
    return Promise.resolve(this.records.filter((record) => record.sourceUserId === userId));
  }

  findEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
    direction?: 'support' | 'oppose' | 'neutral';
  }) {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.sourceUserId === input.sourceUserId &&
          record.sourcePkgNodeId === input.sourcePkgNodeId &&
          record.evidenceType === input.evidenceType &&
          record.direction === (input.direction ?? 'support') &&
          record.ckgTargetNodeId === (input.ckgTargetNodeId ?? null) &&
          record.proposedLabel === (input.proposedLabel ?? null)
      ) ?? null
    );
  }

  findLatestEvidenceSignal(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
  }) {
    return Promise.resolve(
      [...this.records]
        .reverse()
        .find(
          (record) =>
            record.sourceUserId === input.sourceUserId &&
            record.sourcePkgNodeId === input.sourcePkgNodeId &&
            record.evidenceType === input.evidenceType &&
            record.ckgTargetNodeId === (input.ckgTargetNodeId ?? null) &&
            record.proposedLabel === (input.proposedLabel ?? null)
        ) ?? null
    );
  }

  deleteStaleEvidence() {
    return Promise.resolve(0);
  }

  getEvidenceSummary() {
    return Promise.resolve({
      totalCount: 0,
      contributingUserCount: 0,
      directionalContributorCount: { support: 0, oppose: 0, neutral: 0 },
      averageConfidence: 0,
      confidenceDistribution: { low: 0, medium: 0, high: 0 },
      achievedBand: 'none',
      netSupportContributorCount: 0,
    });
  }

  getEvidenceSummaryByProposedLabel(proposedLabel: string) {
    const records = this.records.filter((record) => record.proposedLabel === proposedLabel);
    const latestByUser = this.getLatestByUser(records);
    const supportContributors = [...latestByUser.values()].filter(
      (record) => record.direction === 'support'
    ).length;
    const opposeContributors = [...latestByUser.values()].filter(
      (record) => record.direction === 'oppose'
    ).length;
    const neutralContributors = [...latestByUser.values()].filter(
      (record) => record.direction === 'neutral'
    ).length;
    const totalCount = records.length;
    const averageConfidence =
      totalCount === 0
        ? 0
        : records.reduce((sum, record) => sum + record.confidence, 0) / totalCount;

    return Promise.resolve({
      totalCount,
      contributingUserCount: latestByUser.size,
      directionalContributorCount: {
        support: supportContributors,
        oppose: opposeContributors,
        neutral: neutralContributors,
      },
      averageConfidence,
      confidenceDistribution: { low: 0, medium: 0, high: totalCount },
      achievedBand: supportContributors >= 3 ? 'weak' : 'none',
      netSupportContributorCount: supportContributors - opposeContributors,
    });
  }

  getLinkedMutationIds(input: { ckgTargetNodeId?: NodeId; proposedLabel?: string }) {
    return Promise.resolve([
      ...new Set(
        this.records
          .filter((record) => {
            if (record.mutationId === null) {
              return false;
            }
            if (input.ckgTargetNodeId !== undefined) {
              return record.ckgTargetNodeId === input.ckgTargetNodeId;
            }
            return record.proposedLabel === (input.proposedLabel ?? null);
          })
          .map((record) => record.mutationId!)
      ),
    ]);
  }

  linkEvidenceToMutation(input: { mutationId: MutationId; proposedLabel?: string }) {
    let updated = 0;
    for (const record of this.records) {
      if (record.mutationId === null && record.proposedLabel === (input.proposedLabel ?? null)) {
        record.mutationId = input.mutationId;
        updated++;
      }
    }
    return Promise.resolve(updated);
  }

  private getLatestByUser(
    records: {
      sourceUserId: UserId;
      direction: 'support' | 'oppose' | 'neutral';
    }[]
  ) {
    const latest = new Map<UserId, { direction: 'support' | 'oppose' | 'neutral' }>();
    for (const record of records) {
      latest.set(record.sourceUserId, { direction: record.direction });
    }
    return latest;
  }

  private getLatestSupportCount(
    records: {
      sourceUserId: UserId;
      direction: 'support' | 'oppose' | 'neutral';
    }[]
  ) {
    return [...this.getLatestByUser(records).values()].filter(
      (record) => record.direction === 'support'
    ).length;
  }
}

function createPkgNode(overrides: Partial<IGraphNode> = {}): IGraphNode {
  return {
    nodeId: 'pkg_node' as NodeId,
    graphType: 'pkg',
    nodeType: 'concept',
    label: 'Graph Theory',
    domain: 'mathematics',
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

function createCanonicalNode(overrides: Partial<IGraphNode> = {}): IGraphNode {
  return {
    nodeId: 'ckg_node' as NodeId,
    graphType: 'ckg',
    nodeType: 'concept',
    label: 'Graph Theory',
    domain: 'mathematics',
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('PkgAggregationApplicationService', () => {
  it('creates a canonical node proposal after three distinct PKG node signals converge', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const crdtRepository = new InMemoryGraphCrdtStatsRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));
    const proposeFromAggregation = vi.fn(() =>
      Promise.resolve({
        mutationId: 'mut_agg_node' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
      })
    );

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      evidenceRepository as never,
      crdtRepository as never,
      'replica_test',
      {
        proposeFromAggregation,
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    for (const userId of ['user_1', 'user_2', 'user_3'] as UserId[]) {
      await service.processPkgNodeCreated(
        {
          nodeId: `node_${userId}` as NodeId,
          userId,
          nodeType: 'concept' as GraphNodeType,
          label: 'Graph Theory',
          domain: 'mathematics',
          metadata: {},
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:00:00.000Z',
        }
      );
    }

    expect(proposeFromAggregation).toHaveBeenCalledTimes(1);
    expect(crdtRepository.appliedSignals).toHaveLength(3);
    expect(proposeFromAggregation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'add_node',
          label: 'Graph Theory',
          domain: 'mathematics',
        }),
      ],
      expect.stringContaining('Graph Theory'),
      3,
      expect.any(Object)
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_PROPOSAL_CREATED,
      })
    );
  });

  it('keeps a stable aggregateId while emitting the human proposedLabel for node-candidate events', async () => {
    const publish = vi.fn(() => Promise.resolve(undefined));

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      new InMemoryAggregationEvidenceRepository() as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_user_1',
        eventId: 'evt_user_1',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        aggregateId: 'node:graph theory:concept:mathematics',
        payload: expect.objectContaining({
          proposedLabel: 'Graph Theory',
        }),
      })
    );
  });

  it('creates a canonical edge proposal after three distinct PKG edge signals support the same relation', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const crdtRepository = new InMemoryGraphCrdtStatsRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));
    const proposeFromAggregation = vi.fn(() =>
      Promise.resolve({
        mutationId: 'mut_agg_edge' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
      })
    );

    const sourceCanonical = createCanonicalNode({
      nodeId: 'ckg_source' as NodeId,
      label: 'Graph Theory',
    });
    const targetCanonical = createCanonicalNode({
      nodeId: 'ckg_target' as NodeId,
      label: 'Combinatorics',
    });

    const service = new PkgAggregationApplicationService(
      {
        getNode: vi.fn((nodeId: NodeId) => {
          if (nodeId === ('pkg_source' as NodeId)) {
            return Promise.resolve(createPkgNode({ nodeId, label: 'Graph Theory' }));
          }
          if (nodeId === ('pkg_target' as NodeId)) {
            return Promise.resolve(createPkgNode({ nodeId, label: 'Combinatorics' }));
          }
          return Promise.resolve(null);
        }),
        findNodes: vi.fn((filter) => {
          if (filter.labelContains === 'Graph Theory') {
            return Promise.resolve([sourceCanonical]);
          }
          if (filter.labelContains === 'Combinatorics') {
            return Promise.resolve([targetCanonical]);
          }
          return Promise.resolve([]);
        }),
        findEdges: vi.fn(() => Promise.resolve([] as IGraphEdge[])),
      } as never,
      evidenceRepository as never,
      crdtRepository as never,
      'replica_test',
      {
        proposeFromAggregation,
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    for (const userId of ['user_1', 'user_2', 'user_3'] as UserId[]) {
      await service.processPkgEdgeCreated(
        {
          edgeId: `edge_${userId}` as never,
          userId,
          sourceNodeId: 'pkg_source' as NodeId,
          targetNodeId: 'pkg_target' as NodeId,
          edgeType: 'related_to' as GraphEdgeType,
          weight: 0.9,
          metadata: {},
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:00:00.000Z',
        }
      );
    }

    expect(proposeFromAggregation).toHaveBeenCalledTimes(1);
    expect(crdtRepository.appliedSignals).toHaveLength(3);
    expect(proposeFromAggregation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'add_edge',
          sourceNodeId: 'ckg_source',
          targetNodeId: 'ckg_target',
          edgeType: 'related_to',
        }),
      ],
      expect.stringContaining('related_to'),
      3,
      expect.any(Object)
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_PROPOSAL_CREATED,
      })
    );
  });

  it('re-emits aggregation proposal rejections for aggregation-authored canonical mutations', async () => {
    const publish = vi.fn(() => Promise.resolve(undefined));
    const service = new PkgAggregationApplicationService(
      {} as never,
      new InMemoryAggregationEvidenceRepository() as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        getMutation: vi.fn(() =>
          Promise.resolve({
            mutationId: 'mut_agg_001' as MutationId,
            proposedBy: 'agent_aggregation-pipeline',
          })
        ),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processAggregationMutationRejected(
      {
        mutationId: 'mut_agg_001' as MutationId,
        reason: 'Evidence insufficient after validation',
        failedStage: 'validating' as never,
        rejectedBy: 'system',
      },
      {
        correlationId: 'corr_reject',
        eventId: 'evt_reject',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_PROPOSAL_REJECTED,
        payload: expect.objectContaining({
          mutationId: 'mut_agg_001',
          reason: 'Evidence insufficient after validation',
        }),
      })
    );
  });

  it('records opposing node evidence on PKG node removal snapshots without creating proposals', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const crdtRepository = new InMemoryGraphCrdtStatsRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      evidenceRepository as never,
      crdtRepository as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgNodeRemoved(
      {
        nodeId: 'node_removed' as NodeId,
        userId: 'user_1' as UserId,
        snapshot: {
          nodeType: 'concept' as GraphNodeType,
          label: 'Graph Theory',
          domain: 'mathematics',
          metadata: {},
        },
      },
      {
        correlationId: 'corr_remove',
        eventId: 'evt_remove',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    const userEvidence = await evidenceRepository.getEvidenceByUser('user_1' as UserId);
    expect(userEvidence).toHaveLength(1);
    expect(userEvidence[0]?.direction).toBe('oppose');
    expect(crdtRepository.appliedSignals[0]?.direction).toBe('oppose');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        aggregateId: 'node:graph theory:concept:mathematics',
        payload: expect.objectContaining({
          proposedLabel: 'Graph Theory',
          direction: 'oppose',
          evidenceCount: 0,
        }),
      })
    );
  });

  it('records neutral edge evidence for small weight changes without triggering thresholds', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const crdtRepository = new InMemoryGraphCrdtStatsRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));

    const sourceCanonical = createCanonicalNode({
      nodeId: 'ckg_source' as NodeId,
      label: 'Graph Theory',
    });
    const targetCanonical = createCanonicalNode({
      nodeId: 'ckg_target' as NodeId,
      label: 'Combinatorics',
    });

    const service = new PkgAggregationApplicationService(
      {
        getEdge: vi.fn(() =>
          Promise.resolve({
            edgeId: 'edge_1',
            graphType: 'pkg',
            edgeType: 'related_to',
            sourceNodeId: 'pkg_source',
            targetNodeId: 'pkg_target',
            userId: 'user_1',
            weight: 0.55,
            properties: {},
            createdAt: '2026-04-02T10:00:00.000Z',
            updatedAt: '2026-04-02T10:00:00.000Z',
          })
        ),
        getNode: vi.fn((nodeId: NodeId) => {
          if (nodeId === ('pkg_source' as NodeId)) {
            return Promise.resolve(createPkgNode({ nodeId, label: 'Graph Theory' }));
          }
          if (nodeId === ('pkg_target' as NodeId)) {
            return Promise.resolve(createPkgNode({ nodeId, label: 'Combinatorics' }));
          }
          return Promise.resolve(null);
        }),
        findNodes: vi.fn((filter) => {
          if (filter.labelContains === 'Graph Theory') {
            return Promise.resolve([sourceCanonical]);
          }
          if (filter.labelContains === 'Combinatorics') {
            return Promise.resolve([targetCanonical]);
          }
          return Promise.resolve([]);
        }),
      } as never,
      evidenceRepository as never,
      crdtRepository as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgEdgeUpdated(
      {
        edgeId: 'edge_1' as never,
        userId: 'user_1' as UserId,
        changedFields: ['weight'],
        previousValues: { weight: 0.5 },
        newValues: { weight: 0.55 },
      },
      {
        correlationId: 'corr_edge_delta',
        eventId: 'evt_edge_delta',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    const userEvidence = await evidenceRepository.getEvidenceByUser('user_1' as UserId);
    expect(userEvidence).toHaveLength(1);
    expect(userEvidence[0]?.direction).toBe('neutral');
    expect(crdtRepository.appliedSignals[0]?.direction).toBe('neutral');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        payload: expect.objectContaining({
          direction: 'neutral',
          evidenceCount: 0,
        }),
      })
    );
  });

  it('suppresses aggregation proposals when counter-evidence outweighs the support threshold', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const crdtRepository = new InMemoryGraphCrdtStatsRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));
    const proposeFromAggregation = vi.fn(() =>
      Promise.resolve({
        mutationId: 'mut_agg_node' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
      })
    );

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      evidenceRepository as never,
      crdtRepository as never,
      'replica_test',
      {
        proposeFromAggregation,
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    for (const userId of ['user_1', 'user_2'] as UserId[]) {
      await service.processPkgNodeCreated(
        {
          nodeId: `node_${userId}` as NodeId,
          userId,
          nodeType: 'concept' as GraphNodeType,
          label: 'Graph Theory',
          domain: 'mathematics',
          metadata: {},
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:00:00.000Z',
        }
      );
    }

    for (const userId of ['user_1', 'user_2'] as UserId[]) {
      await service.processPkgNodeRemoved(
        {
          nodeId: `node_remove_${userId}` as NodeId,
          userId,
          snapshot: {
            nodeType: 'concept' as GraphNodeType,
            label: 'Graph Theory',
            domain: 'mathematics',
            metadata: {},
          },
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:00:00.000Z',
        }
      );
    }

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_user_3' as NodeId,
        userId: 'user_3' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_user_3',
        eventId: 'evt_user_3',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    expect(proposeFromAggregation).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_PROPOSAL_SUPPRESSED,
        payload: expect.objectContaining({
          reason: 'counter_evidence_outweighs_support',
          evidenceCount: 1,
        }),
      })
    );
  });

  it('reconsiders an active aggregation proposal when later counter-evidence suppresses consensus', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));
    const proposeFromAggregation = vi
      .fn()
      .mockResolvedValue({
        mutationId: 'mut_pending' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
      });
    const getMutation = vi
      .fn()
      .mockResolvedValue({
        mutationId: 'mut_pending' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
        state: 'validated',
      });
    const rejectStuckMutation = vi
      .fn()
      .mockResolvedValue({
        mutationId: 'mut_pending' as MutationId,
        proposedBy: 'agent_aggregation-pipeline',
        state: 'rejected',
      });
    const listActiveMutationsByIds = vi
      .fn()
      .mockResolvedValue([
        {
          mutationId: 'mut_pending' as MutationId,
          proposedBy: 'agent_aggregation-pipeline',
          state: 'validated',
        },
      ]);

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      evidenceRepository as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        proposeFromAggregation,
        getMutation,
        listActiveMutationsByIds,
        rejectStuckMutation,
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    for (const userId of ['user_1', 'user_2', 'user_3'] as UserId[]) {
      await service.processPkgNodeCreated(
        {
          nodeId: `node_${userId}` as NodeId,
          userId,
          nodeType: 'concept' as GraphNodeType,
          label: 'Graph Theory',
          domain: 'mathematics',
          metadata: {},
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:00:00.000Z',
        }
      );
    }

    for (const userId of ['user_1', 'user_2'] as UserId[]) {
      await service.processPkgNodeRemoved(
        {
          nodeId: `node_remove_${userId}` as NodeId,
          userId,
          snapshot: {
            nodeType: 'concept' as GraphNodeType,
            label: 'Graph Theory',
            domain: 'mathematics',
            metadata: {},
          },
        },
        {
          correlationId: `corr_${userId}`,
          eventId: `evt_${userId}`,
          timestamp: '2026-04-02T10:05:00.000Z',
        }
      );
    }

    expect(proposeFromAggregation).toHaveBeenCalledTimes(1);
    expect(rejectStuckMutation).toHaveBeenCalledWith(
      'mut_pending',
      'agent_aggregation-pipeline',
      expect.stringContaining('counter-evidence'),
      expect.any(Object)
    );
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_PROPOSAL_SUPPRESSED,
        payload: expect.objectContaining({
          reason: 'reconsidered_counter_evidence_outweighs_support',
          mutationId: 'mut_pending',
        }),
      })
    );
  });

  it('matches canonical nodes even when PKG labels differ only by repeated whitespace', async () => {
    const publish = vi.fn(() => Promise.resolve(undefined));
    const canonicalNode = createCanonicalNode({
      nodeId: 'ckg_node_existing' as NodeId,
      label: 'Graph Theory',
    });

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn((filter) => {
          if (filter.labelContains === 'Graph  Theory') {
            return Promise.resolve([canonicalNode]);
          }
          return Promise.resolve([]);
        }),
      } as never,
      new InMemoryAggregationEvidenceRepository() as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph  Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_user_1',
        eventId: 'evt_user_1',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        aggregateId: 'ckg_node_existing',
        payload: expect.objectContaining({
          ckgTargetNodeId: 'ckg_node_existing',
        }),
      })
    );
  });

  it('keeps scanning canonical candidates beyond the first search page to find an exact normalized match', async () => {
    const publish = vi.fn(() => Promise.resolve(undefined));
    const canonicalNode = createCanonicalNode({
      nodeId: 'ckg_node_late' as NodeId,
      label: 'Graph Theory',
    });

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn((_filter, limit: number, offset: number) => {
          if (limit !== 100) {
            return Promise.resolve([]);
          }
          if (offset === 0) {
            return Promise.resolve(
              Array.from({ length: 100 }, (_, index) =>
                createCanonicalNode({
                  nodeId: `ckg_noise_${String(index + 1)}` as NodeId,
                  label: `Graph Theory Variant ${String(index + 1)}`,
                })
              )
            );
          }
          if (offset === 100) {
            return Promise.resolve([canonicalNode]);
          }
          return Promise.resolve([]);
        }),
      } as never,
      new InMemoryAggregationEvidenceRepository() as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph  Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_user_1',
        eventId: 'evt_user_1',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        aggregateId: 'ckg_node_late',
        payload: expect.objectContaining({
          ckgTargetNodeId: 'ckg_node_late',
        }),
      })
    );
  });

  it('records a fresh support signal when the same PKG node returns from oppose back to support', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
    const publish = vi.fn(() => Promise.resolve(undefined));

    const service = new PkgAggregationApplicationService(
      {
        findNodes: vi.fn(() => Promise.resolve([])),
      } as never,
      evidenceRepository as never,
      new InMemoryGraphCrdtStatsRepository() as never,
      'replica_test',
      {
        proposeFromAggregation: vi.fn(),
      } as never,
      { publish } as never,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_1',
        eventId: 'evt_1',
        timestamp: '2026-04-02T10:00:00.000Z',
      }
    );

    await service.processPkgNodeRemoved(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        snapshot: {
          nodeType: 'concept' as GraphNodeType,
          label: 'Graph Theory',
          domain: 'mathematics',
          metadata: {},
        },
      },
      {
        correlationId: 'corr_2',
        eventId: 'evt_2',
        timestamp: '2026-04-02T10:01:00.000Z',
      }
    );

    await service.processPkgNodeCreated(
      {
        nodeId: 'node_1' as NodeId,
        userId: 'user_1' as UserId,
        nodeType: 'concept' as GraphNodeType,
        label: 'Graph Theory',
        domain: 'mathematics',
        metadata: {},
      },
      {
        correlationId: 'corr_3',
        eventId: 'evt_3',
        timestamp: '2026-04-02T10:02:00.000Z',
      }
    );

    const userEvidence = await evidenceRepository.getEvidenceByUser('user_1' as UserId);
    expect(userEvidence.map((record) => record.direction)).toEqual([
      'support',
      'oppose',
      'support',
    ]);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: KnowledgeGraphEventType.AGGREGATION_EVIDENCE_RECORDED,
        payload: expect.objectContaining({
          direction: 'support',
          evidenceCount: 1,
        }),
      })
    );
  });
});
