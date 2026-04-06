import { describe, expect, it, vi } from 'vitest';

import { PkgPostWriteRecoveryService } from '../../../src/domain/knowledge-graph-service/post-write-recovery.service.js';

describe('PkgPostWriteRecoveryService', () => {
  it('uses the operation payload rather than placeholder sequence numbers for append-operation recovery dedupe', async () => {
    const repository = {
      enqueueTask: vi.fn(() => Promise.resolve()),
    };

    const service = new PkgPostWriteRecoveryService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {
        intervalMs: 1_000,
        batchSize: 10,
        maxAttempts: 3,
        retryBaseDelayMs: 100,
      },
      {
        child: vi.fn(() => ({
          error: vi.fn(),
          warn: vi.fn(),
        })),
      } as never
    );

    await service.enqueueAppendOperation('user_alpha' as never, {
      operationType: 'PkgNodeUpdated',
      sequenceNumber: 0,
      timestamp: '2026-04-03T10:00:00.000Z',
      nodeId: 'node_same',
      changedFields: [
        {
          field: 'label',
          before: 'A',
          after: 'B',
        },
      ],
    } as never);
    await service.enqueueAppendOperation('user_alpha' as never, {
      operationType: 'PkgNodeUpdated',
      sequenceNumber: 0,
      timestamp: '2026-04-03T10:00:01.000Z',
      nodeId: 'node_same',
      changedFields: [
        {
          field: 'label',
          before: 'B',
          after: 'C',
        },
      ],
    } as never);

    const firstCall = repository.enqueueTask.mock.calls[0]?.[0];
    const secondCall = repository.enqueueTask.mock.calls[1]?.[0];
    expect(firstCall?.dedupeKey).toMatch(/^op:user_alpha:PkgNodeUpdated:[a-f0-9]{64}$/);
    expect(secondCall?.dedupeKey).toMatch(/^op:user_alpha:PkgNodeUpdated:[a-f0-9]{64}$/);
    expect(firstCall?.dedupeKey).not.toBe(secondCall?.dedupeKey);
  });
});
