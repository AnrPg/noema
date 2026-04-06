import { describe, expect, it, vi } from 'vitest';
import {
  GraphEdgeType,
  GraphNodeType,
  type IGraphEdge,
  type IGraphNode,
  type UserId,
} from '@noema/types';

import { AgentHintsFactory } from '../../../src/domain/knowledge-graph-service/agent-hints.factory.js';
import type { IExecutionContext } from '../../../src/domain/knowledge-graph-service/execution-context.js';
import { PkgWriteService } from '../../../src/domain/knowledge-graph-service/pkg-write.service.js';
import { MockGraphRepository } from '../../helpers/mock-graph-repository.js';

function createLoggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as never;
}

function createContext(userId: UserId): IExecutionContext {
  return {
    userId,
    correlationId: 'corr_pkg_write_test' as never,
    roles: ['user'],
  };
}

function createService(graphRepository: MockGraphRepository) {
  const eventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
  };
  const operationLogRepository = {
    appendOperation: vi.fn().mockResolvedValue(undefined),
  };
  const metricsStalenessRepository = {
    markStale: vi.fn().mockResolvedValue(undefined),
  };
  const postWriteRecoveryService = {
    enqueueAppendOperation: vi.fn().mockResolvedValue(undefined),
    enqueuePublish: vi.fn().mockResolvedValue(undefined),
    enqueueMetricsStale: vi.fn().mockResolvedValue(undefined),
  };

  const service = new PkgWriteService(
    graphRepository,
    operationLogRepository as never,
    metricsStalenessRepository as never,
    eventPublisher as never,
    postWriteRecoveryService as never,
    new AgentHintsFactory(),
    createLoggerMock()
  );

  return {
    service,
    eventPublisher,
  };
}

function createSeedNode(overrides: Partial<IGraphNode>): IGraphNode {
  return {
    nodeId: 'node_aaaaaaaaaaaaaaaaaaaaa' as never,
    graphType: 'pkg',
    nodeType: GraphNodeType.CONCEPT,
    label: 'Seed Node',
    domain: 'seed',
    userId: 'user_seed' as never,
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

function createSeedEdge(overrides: Partial<IGraphEdge>): IGraphEdge {
  return {
    edgeId: 'edge_aaaaaaaaaaaaaaaaaaaaa' as never,
    graphType: 'pkg',
    edgeType: GraphEdgeType.IS_A,
    sourceNodeId: 'node_aaaaaaaaaaaaaaaaaaaaa' as never,
    targetNodeId: 'node_bbbbbbbbbbbbbbbbbbbbb' as never,
    userId: 'user_seed' as never,
    weight: 1 as never,
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('PkgWriteService advisory warnings', () => {
  it('returns duplicate advisories for near-identical node labels and publishes them on pkg.node.created', async () => {
    const graphRepository = new MockGraphRepository();
    const userId = 'user_pkg_advisory' as UserId;
    const existingNode = await graphRepository.createNode(
      'pkg',
      {
        label: 'Derivative',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'mathematics',
      },
      userId
    );
    const { service, eventPublisher } = createService(graphRepository);

    const result = await service.createNode(
      userId,
      {
        label: 'Derivative',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'mathematics',
      },
      createContext(userId)
    );

    expect(result.agentHints.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'duplicate',
          relatedIds: [existingNode.nodeId],
        }),
      ])
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pkg.node.created',
        payload: expect.objectContaining({
          advisories: expect.arrayContaining([
            expect.objectContaining({
              type: 'duplicate',
            }),
          ]),
        }),
      })
    );
  });

  it('falls back to a bounded domain sweep for duplicate labels when probe search misses formatting variants', async () => {
    const graphRepository = new MockGraphRepository();
    const userId = 'user_pkg_advisory_fallback' as UserId;
    const existingNode = await graphRepository.createNode(
      'pkg',
      {
        label: 'Graph QL',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'computer-science',
      },
      userId
    );
    const { service } = createService(graphRepository);

    const result = await service.createNode(
      userId,
      {
        label: 'GraphQL',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'computer-science',
      },
      createContext(userId)
    );

    expect(result.agentHints.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'duplicate',
          relatedIds: [existingNode.nodeId],
        }),
      ])
    );
  });

  it('returns ontological conflict advisories for PKG edges without blocking the write', async () => {
    const graphRepository = new MockGraphRepository();
    const userId = 'user_pkg_edge_conflict' as UserId;
    const sourceNode = createSeedNode({
      nodeId: 'node_aaaaaaaaaaaaaaaaaaaaa' as never,
      label: 'Kidney',
      domain: 'biology',
      userId,
    });
    const targetNode = createSeedNode({
      nodeId: 'node_bbbbbbbbbbbbbbbbbbbbb' as never,
      label: 'Organ',
      domain: 'biology',
      userId,
    });
    const conflictingEdge = createSeedEdge({
      edgeId: 'edge_bbbbbbbbbbbbbbbbbbbbb' as never,
      sourceNodeId: sourceNode.nodeId,
      targetNodeId: targetNode.nodeId,
      edgeType: GraphEdgeType.IS_A,
      userId,
    });
    graphRepository.seed([sourceNode, targetNode], [conflictingEdge]);

    const { service, eventPublisher } = createService(graphRepository);

    const result = await service.createEdge(
      userId,
      {
        sourceNodeId: sourceNode.nodeId,
        targetNodeId: targetNode.nodeId,
        edgeType: GraphEdgeType.PART_OF,
      },
      createContext(userId)
    );

    expect(result.data.edgeType).toBe(GraphEdgeType.PART_OF);
    expect(result.agentHints.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'conflict',
          severity: 'medium',
        }),
      ])
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pkg.edge.created',
        payload: expect.objectContaining({
          advisories: expect.arrayContaining([
            expect.objectContaining({
              type: 'conflict',
            }),
          ]),
        }),
      })
    );
  });

  it('surfaces advisory warnings on pkg.edge.updated events as well as the direct response', async () => {
    const graphRepository = new MockGraphRepository();
    const userId = 'user_pkg_edge_update' as UserId;

    const sourceNode = await graphRepository.createNode(
      'pkg',
      {
        label: 'Neuron',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'biology',
      },
      userId
    );
    const targetNode = await graphRepository.createNode(
      'pkg',
      {
        label: 'Signal',
        nodeType: GraphNodeType.CONCEPT,
        domain: 'biology',
      },
      userId
    );
    const edge = await graphRepository.createEdge(
      'pkg',
      {
        sourceNodeId: sourceNode.nodeId,
        targetNodeId: targetNode.nodeId,
        edgeType: GraphEdgeType.RELATED_TO,
      },
      userId
    );

    const { service, eventPublisher } = createService(graphRepository);

    const result = await service.updateEdge(
      userId,
      edge.edgeId,
      {
        weight: 0.7 as never,
      },
      createContext(userId)
    );

    expect(result.agentHints.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'validation',
          severity: 'low',
        }),
      ])
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pkg.edge.updated',
        payload: expect.objectContaining({
          advisories: expect.arrayContaining([
            expect.objectContaining({
              type: 'validation',
              severity: 'low',
            }),
          ]),
        }),
      })
    );
  });
});
