import { describe, expect, it } from 'vitest';
import { GraphEdgeType, type IGraphEdge, type MutationId, type NodeId } from '@noema/types';

import { UnityInvariantStage } from '../../../src/domain/knowledge-graph-service/unity-invariants.js';

function createEdge(overrides: Partial<IGraphEdge> = {}): IGraphEdge {
  return {
    edgeId: 'edge_default',
    sourceNodeId: 'node_a' as NodeId,
    targetNodeId: 'node_b' as NodeId,
    edgeType: GraphEdgeType.RELATED_TO,
    weight: 1,
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

function createMutation(operations: unknown[]) {
  return {
    mutationId: 'mut_invariant' as MutationId,
    state: 'proposed',
    proposedBy: 'agent_test',
    version: 1,
    rationale: 'UNITY invariant test mutation',
    evidenceCount: 0,
    operations,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    recoveryAttempts: 0,
    revisionCount: 0,
    revisionFeedback: null,
  } as never;
}

describe('UnityInvariantStage', () => {
  it('rejects projected prerequisite cycles created across multiple add_edge operations', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
          rootNodeId: 'node_b' as NodeId,
        }),
      getEdgesForNode: () => Promise.resolve([]),
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'add_edge',
          sourceNodeId: 'node_a',
          targetNodeId: 'node_b',
          edgeType: GraphEdgeType.PREREQUISITE,
          weight: 1,
          rationale: 'A before B',
        },
        {
          type: 'add_edge',
          sourceNodeId: 'node_b',
          targetNodeId: 'node_a',
          edgeType: GraphEdgeType.PREREQUISITE,
          weight: 1,
          rationale: 'B before A',
        },
      ]),
      {
        correlationId: 'corr_cycle',
        shortCircuitOnError: false,
      }
    );

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNITY_INVARIANT_VIOLATION',
          metadata: expect.objectContaining({
            invariantName: 'no_circular_prerequisites',
          }),
        }),
      ])
    );
  });

  it('rejects bidirectional dependency contradictions in projected canonical edges', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
        }),
      getEdgesForNode: (nodeId: NodeId) => {
        if (nodeId === ('node_b' as NodeId)) {
          return Promise.resolve([
            createEdge({
              edgeId: 'edge_existing',
              sourceNodeId: 'node_b' as NodeId,
              targetNodeId: 'node_a' as NodeId,
              edgeType: GraphEdgeType.DEPENDS_ON,
            }),
          ]);
        }

        return Promise.resolve([] as IGraphEdge[]);
      },
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'add_edge',
          sourceNodeId: 'node_a',
          targetNodeId: 'node_b',
          edgeType: GraphEdgeType.DEPENDS_ON,
          weight: 1,
          rationale: 'A depends on B',
        },
      ]),
      {
        correlationId: 'corr_bidirectional',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            invariantName: 'no_bidirectional_dependency_pairs',
          }),
        }),
      ])
    );
  });

  it('rejects mutually exclusive relation pairs on the same canonical node pair', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
        }),
      getEdgesForNode: () => Promise.resolve([] as IGraphEdge[]),
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'add_edge',
          sourceNodeId: 'node_a',
          targetNodeId: 'node_b',
          edgeType: GraphEdgeType.PREREQUISITE,
          weight: 1,
          rationale: 'A before B',
        },
        {
          type: 'add_edge',
          sourceNodeId: 'node_b',
          targetNodeId: 'node_a',
          edgeType: GraphEdgeType.EQUIVALENT_TO,
          weight: 1,
          rationale: 'A equivalent B',
        },
      ]),
      {
        correlationId: 'corr_exclusive',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            invariantName: 'no_mutually_exclusive_relation_pairs',
          }),
        }),
      ])
    );
  });

  it('rejects split operations that do not reassign required structural edges', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
        }),
      getEdgesForNode: (nodeId: NodeId) => {
        if (nodeId === ('node_original' as NodeId)) {
          return Promise.resolve([
            createEdge({
              edgeId: 'edge_required',
              sourceNodeId: 'node_original' as NodeId,
              targetNodeId: 'node_target' as NodeId,
              edgeType: GraphEdgeType.PREREQUISITE,
            }),
          ]);
        }

        return Promise.resolve([] as IGraphEdge[]);
      },
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'split_node',
          nodeId: 'node_original',
          newNodeA: {
            label: 'Node A',
            description: '',
            nodeType: 'concept',
            properties: {},
          },
          newNodeB: {
            label: 'Node B',
            description: '',
            nodeType: 'concept',
            properties: {},
          },
          edgeReassignmentRules: [],
          rationale: 'Split without preserving required prerequisites',
        },
      ]),
      {
        correlationId: 'corr_split',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            invariantName: 'no_unassigned_required_edges_on_split',
          }),
        }),
      ])
    );
  });

  it('rejects merges that would erase required structural edges between the merged nodes', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
        }),
      getEdgesForNode: (nodeId: NodeId) => {
        if (nodeId === ('node_source' as NodeId)) {
          return Promise.resolve([
            createEdge({
              edgeId: 'edge_between_merge_nodes',
              sourceNodeId: 'node_source' as NodeId,
              targetNodeId: 'node_target' as NodeId,
              edgeType: GraphEdgeType.PREREQUISITE,
            }),
          ]);
        }

        return Promise.resolve([] as IGraphEdge[]);
      },
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'merge_nodes',
          sourceNodeId: 'node_source',
          targetNodeId: 'node_target',
          mergedProperties: {},
          rationale: 'Merge nodes that currently carry a required dependency edge',
        },
      ]),
      {
        correlationId: 'corr_merge',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            invariantName: 'no_required_structure_loss_on_merge',
          }),
        }),
      ])
    );
  });

  it('rejects merges that would create third-party bidirectional dependency conflicts', async () => {
    const stage = new UnityInvariantStage({
      getSubgraph: () =>
        Promise.resolve({
          nodes: [],
          edges: [],
        }),
      getEdgesForNode: (nodeId: NodeId) => {
        if (nodeId === ('node_source' as NodeId)) {
          return Promise.resolve([
            createEdge({
              edgeId: 'edge_source_to_external',
              sourceNodeId: 'node_source' as NodeId,
              targetNodeId: 'node_external' as NodeId,
              edgeType: GraphEdgeType.DEPENDS_ON,
            }),
          ]);
        }

        if (nodeId === ('node_target' as NodeId)) {
          return Promise.resolve([
            createEdge({
              edgeId: 'edge_external_to_target',
              sourceNodeId: 'node_external' as NodeId,
              targetNodeId: 'node_target' as NodeId,
              edgeType: GraphEdgeType.DEPENDS_ON,
            }),
          ]);
        }

        return Promise.resolve([] as IGraphEdge[]);
      },
    } as never);

    const result = await stage.validate(
      createMutation([
        {
          type: 'merge_nodes',
          sourceNodeId: 'node_source',
          targetNodeId: 'node_target',
          mergedProperties: {},
          rationale: 'Merge nodes that would create a third-party dependency contradiction',
        },
      ]),
      {
        correlationId: 'corr_merge_third_party',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            invariantName: 'no_required_structure_loss_on_merge',
            offendingEdgeType: GraphEdgeType.DEPENDS_ON,
          }),
        }),
      ])
    );
  });
});
