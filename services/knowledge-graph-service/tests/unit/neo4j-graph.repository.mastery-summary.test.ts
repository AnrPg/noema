import { describe, expect, it, vi } from 'vitest';
import type { ManagedTransaction } from 'neo4j-driver';

import { Neo4jGraphRepository } from '../../src/infrastructure/database/neo4j-graph.repository.js';
import type { Neo4jClient } from '../../src/infrastructure/database/neo4j-client.js';

function createRecord(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  };
}

describe('Neo4jGraphRepository.getNodeMasterySummary', () => {
  it('uses separate Neo4j sessions for concurrent summary reads', async () => {
    const summaryRun = vi.fn().mockResolvedValue({
      records: [
        createRecord({
          totalNodes: 12,
          trackedNodes: 9,
          masteredNodes: 4,
          developingNodes: 3,
          emergingNodes: 2,
          untrackedNodes: 3,
          averageMastery: 0.56,
        }),
      ],
    });
    const domainRun = vi.fn().mockResolvedValue({
      records: [
        createRecord({
          domain: 'general',
          nodeCount: 12,
          trackedNodes: 9,
          masteredNodes: 4,
          averageMastery: 0.56,
        }),
      ],
    });

    const executeReadCalls: string[] = [];
    const summarySession = {
      executeRead: vi.fn(async (callback: (tx: ManagedTransaction) => Promise<unknown>) => {
        executeReadCalls.push('summary');
        return callback({ run: summaryRun } as unknown as ManagedTransaction);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const domainSession = {
      executeRead: vi.fn(async (callback: (tx: ManagedTransaction) => Promise<unknown>) => {
        executeReadCalls.push('domain');
        return callback({ run: domainRun } as unknown as ManagedTransaction);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const getSessionMock = vi
      .fn()
      .mockReturnValueOnce(summarySession)
      .mockReturnValueOnce(domainSession);
    const neo4jClient = {
      getSession: getSessionMock,
    } as unknown as Neo4jClient;
    const logger = {
      child: vi.fn().mockReturnThis(),
    };

    const repository = new Neo4jGraphRepository(neo4jClient, logger as never);

    const result = await repository.getNodeMasterySummary(
      {
        userId: 'user_test',
        graphType: 'pkg',
        studyMode: 'knowledge_gaining',
        includeDeleted: false,
      },
      0.7
    );

    expect(result.totalNodes).toBe(12);
    expect(result.strongestDomains).toHaveLength(1);
    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(summarySession.executeRead).toHaveBeenCalledTimes(1);
    expect(domainSession.executeRead).toHaveBeenCalledTimes(1);
    expect(summarySession.close).toHaveBeenCalledTimes(1);
    expect(domainSession.close).toHaveBeenCalledTimes(1);
    expect(executeReadCalls).toEqual(['summary', 'domain']);
  });
});
