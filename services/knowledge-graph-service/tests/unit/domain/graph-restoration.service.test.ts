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
  const createTokenRepository = () => {
    const reservations = new Set<string>();
    return {
      reserveToken: vi.fn((input: { tokenId: string; expiresAt: string }) => {
        if (new Date(input.expiresAt).getTime() < Date.now()) {
          return Promise.resolve(false);
        }
        if (reservations.has(input.tokenId)) {
          return Promise.resolve(false);
        }
        reservations.add(input.tokenId);
        return Promise.resolve(true);
      }),
      consumeToken: vi.fn(() => Promise.resolve(undefined)),
      releaseToken: vi.fn((tokenId: string) => {
        reservations.delete(tokenId);
        return Promise.resolve(undefined);
      }),
      pruneExpiredTokens: vi.fn(() => Promise.resolve(0)),
    };
  };

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
      getLatestMutationByState: vi.fn(() => Promise.resolve(null)),
      getLatestCommittedMutationByAudit: vi.fn(() => Promise.resolve(null)),
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
      createTokenRepository() as never,
      mutationRepository as never,
      operationLogRepository as never,
      new AgentHintsFactory(),
      {
        executionEnabled: false,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
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

  it('computes restore diffs, returns a confirmation token, and requires that token to execute', async () => {
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
    const tokenRepository = createTokenRepository();

    const service = new GraphRestorationService(
      graphSnapshotRepository as never,
      graphRestorationRepository as never,
      tokenRepository as never,
      {
        getLatestMutationByState: vi.fn(() => Promise.resolve(null)),
        getLatestCommittedMutationByAudit: vi.fn(() => Promise.resolve(null)),
      } as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      {
        executionEnabled: true,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    const preview = await service.previewRestore('gsnap_2', null);
    expect(preview.data.summary.nodesToUpdate).toBe(1);
    expect(preview.data.summary.nodesToDelete).toBe(1);
    expect(preview.data.summary.edgesToDelete).toBe(1);
    expect(preview.data.confirmationToken).toContain('.');
    expect(preview.data.confirmationExpiresAt).toMatch(/2026|20\d{2}/);

    const restored = await service.executeRestore('gsnap_2', {
      confirmationToken: preview.data.confirmationToken,
    }, null);
    expect(graphRestorationRepository.replaceScope).toHaveBeenCalledWith(
      snapshot.scope,
      snapshot.payload
    );
    expect(tokenRepository.reserveToken).toHaveBeenCalledOnce();
    expect(tokenRepository.consumeToken).toHaveBeenCalledOnce();
    expect(restored.data.requiresDestructiveChanges).toBe(true);

    await expect(
      service.executeRestore(
        'gsnap_2',
        {
          confirmationToken: preview.data.confirmationToken,
        },
        null
      )
    ).rejects.toThrow(/does not match/);
  });

  it('rejects restore execution when the confirmation token is missing or stale', async () => {
    const snapshot = {
      snapshotId: 'gsnap_3',
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

    const graphRestorationRepository = {
      captureScope: vi.fn(() =>
        Promise.resolve({
          nodes: [],
          edges: [],
        })
      ),
      replaceScope: vi.fn(() => Promise.resolve(undefined)),
    };
    const tokenRepository = createTokenRepository();

    const service = new GraphRestorationService(
      {
        getSnapshot: vi.fn(() => Promise.resolve(snapshot)),
      } as never,
      graphRestorationRepository as never,
      tokenRepository as never,
      {
        getLatestMutationByState: vi.fn(() => Promise.resolve(null)),
        getLatestCommittedMutationByAudit: vi.fn(() => Promise.resolve(null)),
      } as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      {
        executionEnabled: true,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    await expect(service.executeRestore('gsnap_3', {}, null)).rejects.toThrow(
      /confirmationToken is required/
    );
    await expect(
      service.executeRestore('gsnap_3', { confirmationToken: 'stale-token' }, null)
    ).rejects.toThrow(/does not match/);
    expect(graphRestorationRepository.replaceScope).not.toHaveBeenCalled();
    expect(tokenRepository.reserveToken).not.toHaveBeenCalled();
  });

  it('invalidates a preview token when the restore diff changes without changing the raw counts', async () => {
    const snapshot = {
      snapshotId: 'gsnap_diff',
      graphType: 'pkg' as const,
      scope: { graphType: 'pkg' as const, userId: 'user_123' as never, domain: 'biology' },
      nodeCount: 2,
      edgeCount: 0,
      schemaVersion: 1,
      reason: null,
      createdAt: '2026-04-02T12:00:00.000Z',
      createdBy: 'admin_1',
      sourceCursor: 'oplog_4',
      payload: {
        nodes: [createNode('node_1', 'Cell'), createNode('node_2', 'Mitosis')],
        edges: [],
      },
    };

    const graphRestorationRepository = {
      captureScope: vi
        .fn()
        .mockResolvedValueOnce({
          nodes: [createNode('node_1', 'Cell membrane'), createNode('node_3', 'DNA')],
          edges: [],
        })
        .mockResolvedValueOnce({
          nodes: [createNode('node_1', 'Cell membrane'), createNode('node_4', 'RNA')],
          edges: [],
        })
        .mockResolvedValueOnce({
          nodes: [createNode('node_1', 'Cell membrane'), createNode('node_4', 'RNA')],
          edges: [],
        }),
      replaceScope: vi.fn(() => Promise.resolve(undefined)),
    };
    const tokenRepository = createTokenRepository();

    const service = new GraphRestorationService(
      {
        getSnapshot: vi.fn(() => Promise.resolve(snapshot)),
      } as never,
      graphRestorationRepository as never,
      tokenRepository as never,
      {
        getLatestMutationByState: vi.fn(() => Promise.resolve(null)),
        getLatestCommittedMutationByAudit: vi.fn(() => Promise.resolve(null)),
      } as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      {
        executionEnabled: true,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    const firstPreview = await service.previewRestore('gsnap_diff', 'admin_1');
    const secondPreview = await service.previewRestore('gsnap_diff', 'admin_1');

    expect(firstPreview.data.summary.nodesToCreate).toBe(1);
    expect(secondPreview.data.summary.nodesToCreate).toBe(1);
    expect(firstPreview.data.summary.nodesToDelete).toBe(1);
    expect(secondPreview.data.summary.nodesToDelete).toBe(1);
    expect(firstPreview.data.summary.diffFingerprint).not.toBe(
      secondPreview.data.summary.diffFingerprint
    );

    await expect(
      service.executeRestore(
        'gsnap_diff',
        { confirmationToken: firstPreview.data.confirmationToken },
        'admin_1'
      )
    ).rejects.toThrow(/does not match/);
  });

  it('returns success without releasing the token when restore succeeds but token consumption fails', async () => {
    const snapshot = {
      snapshotId: 'gsnap_5',
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

    const graphRestorationRepository = {
      captureScope: vi.fn(() =>
        Promise.resolve({
          nodes: [],
          edges: [],
        })
      ),
      replaceScope: vi.fn(() => Promise.resolve(undefined)),
    };
    const tokenRepository = createTokenRepository();
    tokenRepository.consumeToken.mockRejectedValueOnce(new Error('database unavailable'));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const service = new GraphRestorationService(
      {
        getSnapshot: vi.fn(() => Promise.resolve(snapshot)),
      } as never,
      graphRestorationRepository as never,
      tokenRepository as never,
      {
        getLatestMutationByState: vi.fn(() => Promise.resolve(null)),
        getLatestCommittedMutationByAudit: vi.fn(() => Promise.resolve(null)),
      } as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      {
        executionEnabled: true,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
      { child: vi.fn(() => logger) } as never
    );

    const preview = await service.previewRestore('gsnap_5', null);
    const restored = await service.executeRestore(
      'gsnap_5',
      { confirmationToken: preview.data.confirmationToken },
      null
    );

    expect(restored.data.snapshot.snapshotId).toBe('gsnap_5');
    expect(graphRestorationRepository.replaceScope).toHaveBeenCalledOnce();
    expect(tokenRepository.releaseToken).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId: 'gsnap_5',
      }),
      'Graph restore succeeded but confirmation token consumption failed'
    );
  });

  it('resolves the latest committed CKG cursor without loading every committed mutation', async () => {
    const mutationRepository = {
      getLatestMutationByState: vi.fn(() =>
        Promise.resolve({
          mutationId: 'mut_latest',
        })
      ),
      getLatestCommittedMutationByAudit: vi.fn(() =>
        Promise.resolve({
          mutationId: 'mut_latest',
        })
      ),
    };

    const service = new GraphRestorationService(
      {
        createSnapshot: vi.fn((input) =>
          Promise.resolve({
            snapshotId: 'gsnap_4',
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
      } as never,
      {
        captureScope: vi.fn(() =>
          Promise.resolve({
            nodes: [],
            edges: [],
          })
        ),
      } as never,
      createTokenRepository() as never,
      mutationRepository as never,
      {
        getOperationHistory: vi.fn(() => Promise.resolve({ items: [], total: 0, hasMore: false })),
      } as never,
      new AgentHintsFactory(),
      {
        executionEnabled: false,
        requireConfirmationToken: true,
        confirmationSecret: 'test-restore-secret',
        confirmationTtlMs: 60_000,
      },
      { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })) } as never
    );

    const result = await service.createSnapshot(
      {
        graphType: 'ckg',
        domain: 'biology',
      },
      'admin_1'
    );

    expect(mutationRepository.getLatestCommittedMutationByAudit).toHaveBeenCalledOnce();
    expect(result.data.sourceCursor).toBe('mut_latest');
  });
});
