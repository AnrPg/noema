import { describe, expect, it } from 'vitest';
import {
  GraphEdgeType,
  GraphNodeType,
  type IGraphNode,
  type MutationId,
  type NodeId,
} from '@noema/types';

import {
  OntologyReasoningService,
  OntologyReasoningStage,
  StaticOntologyArtifactProvider,
} from '../../../src/domain/knowledge-graph-service/ontology-reasoning.js';

function createNode(overrides: Partial<IGraphNode> = {}): IGraphNode {
  return {
    nodeId: 'node_default' as NodeId,
    graphType: 'ckg',
    nodeType: GraphNodeType.CONCEPT,
    label: 'Default Node',
    domain: 'mathematics',
    properties: {},
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

function createMutation(operations: unknown[]) {
  return {
    mutationId: 'mut_test' as MutationId,
    state: 'proposed',
    proposedBy: 'agent_test',
    version: 1,
    rationale: 'Ontology reasoning test mutation',
    evidenceCount: 0,
    operations,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    recoveryAttempts: 0,
    revisionCount: 0,
    revisionFeedback: null,
  } as never;
}

describe('OntologyReasoningStage', () => {
  it('blocks same-kind canonical relations when source and target live in different ontology branches', async () => {
    const stage = new OntologyReasoningStage(
      {
        getNode: (nodeId: NodeId) => {
          if (nodeId === ('node_concept' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.CONCEPT,
                label: 'Derivative',
              })
            );
          }

          if (nodeId === ('node_occupation' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.OCCUPATION,
                label: 'Mathematician',
                domain: 'careers',
              })
            );
          }

          return Promise.resolve(null);
        },
      } as never,
      new OntologyReasoningService(new StaticOntologyArtifactProvider())
    );

    const result = await stage.validate(
      createMutation([
        {
          type: 'add_edge',
          sourceNodeId: 'node_concept',
          targetNodeId: 'node_occupation',
          edgeType: GraphEdgeType.EQUIVALENT_TO,
          weight: 1,
          rationale: 'Test equivalent_to mismatch',
        },
      ]),
      {
        correlationId: 'corr_test',
        shortCircuitOnError: false,
      }
    );

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ONTOLOGICAL_CONFLICT',
          metadata: expect.objectContaining({
            artifactVersion: 'dual-graph-ontology-v1',
            reasonCategory: 'same_kind_required',
          }),
        }),
      ])
    );
  });

  it('evaluates add_edge operations against projected node retyping in the same mutation', async () => {
    const stage = new OntologyReasoningStage(
      {
        getNode: (nodeId: NodeId) => {
          if (nodeId === ('node_example' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.EXAMPLE,
                label: 'Worked Integral Example',
              })
            );
          }

          if (nodeId === ('node_target' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.CONCEPT,
                label: 'Integral Calculus',
              })
            );
          }

          return Promise.resolve(null);
        },
      } as never,
      new OntologyReasoningService(new StaticOntologyArtifactProvider())
    );

    const result = await stage.validate(
      createMutation([
        {
          type: 'update_node',
          nodeId: 'node_example',
          updates: {
            nodeType: GraphNodeType.SKILL,
          },
          rationale: 'Force a projected retype before adding an edge',
        },
        {
          type: 'add_edge',
          sourceNodeId: 'node_example',
          targetNodeId: 'node_target',
          edgeType: GraphEdgeType.PREREQUISITE,
          weight: 1,
          rationale: 'Example should not become a skill prerequisite',
        },
      ]),
      {
        correlationId: 'corr_projection',
        shortCircuitOnError: false,
      }
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ONTOLOGY_ILLEGAL_TYPE_PROMOTION',
        }),
      ])
    );
    expect(result.violations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ONTOLOGICAL_CONFLICT',
          metadata: expect.objectContaining({
            endpoint: 'source',
          }),
        }),
      ])
    );
  });

  it('emits a review warning for cross-domain equivalence even when class constraints pass', async () => {
    const stage = new OntologyReasoningStage(
      {
        getNode: (nodeId: NodeId) => {
          if (nodeId === ('node_math' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.CONCEPT,
                label: 'Field',
                domain: 'mathematics',
              })
            );
          }

          if (nodeId === ('node_linguistics' as NodeId)) {
            return Promise.resolve(
              createNode({
                nodeId,
                nodeType: GraphNodeType.CONCEPT,
                label: 'Field',
                domain: 'linguistics',
              })
            );
          }

          return Promise.resolve(null);
        },
      } as never,
      new OntologyReasoningService(new StaticOntologyArtifactProvider())
    );

    const result = await stage.validate(
      createMutation([
        {
          type: 'add_edge',
          sourceNodeId: 'node_math',
          targetNodeId: 'node_linguistics',
          edgeType: GraphEdgeType.EQUIVALENT_TO,
          weight: 1,
          rationale: 'Cross-domain equivalence should be reviewable, not silent',
        },
      ]),
      {
        correlationId: 'corr_warning',
        shortCircuitOnError: false,
      }
    );

    expect(result.passed).toBe(true);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ONTOLOGY_CROSS_DOMAIN_EQUIVALENCE',
          severity: 'warning',
        }),
      ])
    );
  });
});
