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

class InMemoryAggregationEvidenceRepository {
  private readonly records: {
    id: string;
    mutationId: MutationId | null;
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId: NodeId | null;
    proposedLabel: string | null;
    evidenceType: string;
    confidence: number;
    metadata: Record<string, unknown>;
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
  }) {
    const record = {
      id: `evid_${String(this.records.length + 1)}`,
      mutationId: null,
      sourceUserId: input.sourceUserId,
      sourcePkgNodeId: input.sourcePkgNodeId,
      ckgTargetNodeId: input.ckgTargetNodeId ?? null,
      proposedLabel: input.proposedLabel ?? null,
      evidenceType: input.evidenceType,
      confidence: input.confidence,
      metadata: input.metadata ?? {},
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
    const count = new Set(
      this.records
        .filter((record) => record.ckgTargetNodeId === ckgTargetNodeId)
        .map((record) => record.sourceUserId)
    ).size;
    return Promise.resolve({ count, band: count >= 3 ? 'weak' : 'none' });
  }

  getEvidenceCountByProposedLabel(proposedLabel: string) {
    const count = new Set(
      this.records
        .filter((record) => record.proposedLabel === proposedLabel)
        .map((record) => record.sourceUserId)
    ).size;
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
  }) {
    return Promise.resolve(
      this.records.find(
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
      averageConfidence: 0,
      confidenceDistribution: { low: 0, medium: 0, high: 0 },
      achievedBand: 'none',
    });
  }

  getEvidenceSummaryByProposedLabel() {
    return Promise.resolve({
      totalCount: 0,
      contributingUserCount: 0,
      averageConfidence: 0,
      confidenceDistribution: { low: 0, medium: 0, high: 0 },
      achievedBand: 'none',
    });
  }

  linkEvidenceToMutation(input: { mutationId: MutationId; proposedLabel?: string }) {
    let updated = 0;
    for (const record of this.records) {
      if (record.proposedLabel === (input.proposedLabel ?? null) && record.mutationId === null) {
        record.mutationId = input.mutationId;
        updated++;
      }
    }
    return Promise.resolve(updated);
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

  it('creates a canonical edge proposal after three distinct PKG edge signals support the same relation', async () => {
    const evidenceRepository = new InMemoryAggregationEvidenceRepository();
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
});
