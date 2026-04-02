import { describe, expect, it, vi } from 'vitest';

import { AgentHintsFactory } from '../../../src/domain/knowledge-graph-service/agent-hints.factory.js';
import { GraphRestorationService } from '../../../src/domain/knowledge-graph-service/graph-restoration.service.js';

function createNode(id: string, label: string) {
  return {
    nodeId: id,
    graphType: 'pkg',
    nodeType: 'concept',
    label,
    domain: 'biology',
    userId: 'user_123',
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
  } as const;
}

function createEdge(id: string, sourceNodeId: string, targetNodeId: string) {
  return {
    edgeId: id,
    graphType: 'pkg',
    edgeType: 'prerequisite',
    sourceNodeId,
    targetNodeId,
    userId: 'user_123',
    weight: 1,
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
  } as const;
}

describe('GraphRestorationService', () => {
  it('creates snapshots with a source cursor and current graph payload', async () => {
    const graphSnapshotRepository = {
      createSnapshot: vi.fn((input) =>
        Promise.resolve({
          snapshotId: 'gsnap_1',
          graphType: input.graphType,
          scope: input.scope,
          nodeCount: input.nodeCount,
          edgeCount: input.edgeCount,
          schemaVersion: input.schemaVersion,
          reason: input.reason ?? null,
          createdAt: '2026-04-02T12:00:00.000Z',
          createdBy: input.createdBy ?? null,
          sourceCursor: input.sourceCursor ?? null,
          payload: input.payload,
        })
      ),
    };
    const graphRestorationRepository = {
      captureScope: vi.fn(() =>
        Promise.resolve({
          nodes: [createNode('node_1', 'Cell')],
          edges: [],
        })
      ),
    };
    const mutationRepository = {
      findMutations: vi.fn(() => Promise.resolve([])),
    };
    const operationLogRepository = {
      getOperationHistory: vi.fn(() =>
        Promise.resolve({
          items: [{ id: 'oplog_1' }],
          total: 1,
          hasMore: false,
        })
      ),
    };

    const service = new GraphRestorationService(
      graphSnapshotRepository as never,
      graphRestorationRepository as never,
      mutationRepository as never,
      operationLogRepository as never,
      new AgentHintsFactory(),
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    const result = await service.createSnapshot(
      {
        graphType: 'pkg',
        userId: 'user_123' as never,
        domain: 'biology',
        reason: 'checkpoint before restore test',
      },
      'admin_1'
    );

    expect(graphRestorationRepository.captureScope).toHaveBeenCalledOnce();
    expect(operationLogRepository.getOperationHistory).toHaveBeenCalledWith('user_123', 1, 0);
    expect(graphSnapshotRepository.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        graphType: 'pkg',
        sourceCursor: 'oplog_1',
        nodeCount: 1,
      })
    );
    expect(result.data.snapshotId).toBe('gsnap_1');
  });

  it('computes restore diffs and executes replacement against the captured scope', async () => {
    const snapshot = {
      snapshotId: 'gsnap_2',
      graphType: 'pkg' as const,
      scope: { graphType: 'pkg' as const, userId: 'user_123' as never, domain: 'biology' },
      nodeCount: 1,
      edgeCount: 0,
      schemaVersion: 1,
      reason: null,
      createdAt: '2026-04-02T12:00:00.000Z',
      createdBy: 'admin_1',
      sourceCursor: 'oplog_2',
      payload: {
        nodes: [createNode('node_1', 'Cell')],
        edges: [],
      },
    };

    const graphSnapshotRepository = {
      getSnapshot: vi.fn(() => Promise.resolve(snapshot)),
    };
    const graphRestorationRepository = {
      captureScope: vi.fn(() =>
        Promise.resolve({
          nodes: [createNode('node_1', 'Cell membrane'), createNode('node_2', 'Mitosis')],
          edges: [createEdge('edge_1', 'node_1', 'node_2')],
        })
      ),
      replaceScope: vi.fn(() => Promise.resolve(undefined)),
    };

    const service = new GraphRestorationService(
      graphSnapshotRepository as never,
      graphRestorationRepository as never,
      { findMutations: vi.fn(() => Promise.resolve([])) } as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    const preview = await service.previewRestore('gsnap_2');
    expect(preview.data.summary.nodesToUpdate).toBe(1);
    expect(preview.data.summary.nodesToDelete).toBe(1);
    expect(preview.data.summary.edgesToDelete).toBe(1);

    const restored = await service.executeRestore('gsnap_2');
    expect(graphRestorationRepository.replaceScope).toHaveBeenCalledWith(
      snapshot.scope,
      snapshot.payload
    );
    expect(restored.data.requiresDestructiveChanges).toBe(true);
  });
});
