import { describe, expect, it, vi } from 'vitest';
import type { ManagedTransaction } from 'neo4j-driver';

import { Neo4jGraphRepository } from '../../src/infrastructure/database/neo4j-graph.repository.js';
import type { Neo4jClient } from '../../src/infrastructure/database/neo4j-client.js';

function createRecord(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  };
}

function createGraphNodeRecord(values?: Record<string, unknown>) {
  return createRecord({
    node: {
      labels: ['PkgNode', 'Concept'],
      properties: {
        nodeId: 'node_test',
        graphType: 'pkg',
        nodeType: 'concept',
        label: 'Family',
        domain: 'general',
        tags: ['family'],
        supportedStudyModes: ['language_learning'],
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        isDeleted: false,
        ...values,
      },
    },
  });
}

describe('Neo4jGraphRepository.createNode', () => {
  it('creates a new node after checking for an existing identity match', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [createGraphNodeRecord()] });
    const session = {
      executeWrite: vi.fn(async (callback: (tx: ManagedTransaction) => Promise<unknown>) =>
        callback({ run } as unknown as ManagedTransaction)
      ),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const neo4jClient = {
      getSession: vi.fn().mockReturnValue(session),
    } as unknown as Neo4jClient;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    };

    const repository = new Neo4jGraphRepository(neo4jClient, logger as never);

    const result = await repository.createNode(
      'pkg',
      {
        label: 'Family',
        nodeType: 'concept',
        domain: 'general',
        tags: ['family'],
        supportedStudyModes: ['language_learning'],
      },
      'user_test'
    );

    expect(result.nodeId).toBe('node_test');
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toContain('MATCH (existing:PkgNode)');
    expect(run.mock.calls[1]?.[0]).toContain('CREATE (created:PkgNode:Concept $props)');
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('updates an existing node when the identity match already exists', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        records: [
          createRecord({
            existing: {
              labels: ['PkgNode', 'Concept'],
              properties: {
                nodeId: 'node_existing',
              },
            },
          }),
        ],
      })
      .mockResolvedValueOnce({
        records: [createGraphNodeRecord({ nodeId: 'node_existing' })],
      });
    const session = {
      executeWrite: vi.fn(async (callback: (tx: ManagedTransaction) => Promise<unknown>) =>
        callback({ run } as unknown as ManagedTransaction)
      ),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const neo4jClient = {
      getSession: vi.fn().mockReturnValue(session),
    } as unknown as Neo4jClient;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    };

    const repository = new Neo4jGraphRepository(neo4jClient, logger as never);

    const result = await repository.createNode(
      'pkg',
      {
        label: 'Family',
        nodeType: 'concept',
        domain: 'general',
      },
      'user_test'
    );

    expect(result.nodeId).toBe('node_existing');
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toContain('MATCH (existing:PkgNode {nodeId: $existingNodeId})');
    expect(run.mock.calls[1]?.[0]).toContain('SET existing += $upsertProps');
    expect(run.mock.calls[1]?.[1]).toMatchObject({ existingNodeId: 'node_existing' });
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});
