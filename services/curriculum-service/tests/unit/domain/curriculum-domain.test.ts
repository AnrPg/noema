import {
  CurriculumEdgeType,
  CurriculumNodeRuntimeState,
  RevisionChangeKind,
  RevisionChangeState,
} from '@noema/types';
import { describe, expect, it } from 'vitest';
import {
  CurriculumValidationError,
  computeFrontier,
  composeSessionSlice,
  rejectFrozenNodeChanges,
  shouldGenerateRevisionProposal,
  updateProgressFromEvaluation,
  validateCurriculumDag,
} from '../../../src/domain/curriculum-service/index.js';
import type { CurriculumVersionGraph } from '../../../src/domain/curriculum-service/index.js';

const graph: CurriculumVersionGraph = {
  id: 'cver_123456789012345678901' as CurriculumVersionGraph['id'],
  nodes: [
    {
      id: 'cnode_123456789012345678901' as never,
      curriculumVersionId: 'cver_123456789012345678901' as never,
      stableNodeKey: 'algebra-basics',
      ckgConceptId: 'concept_123456789012345678901' as never,
      label: 'Algebra basics',
      stabilityThreshold: 0.7,
      estimatedSessions: 2,
      traversalWeight: 2,
    },
    {
      id: 'cnode_223456789012345678901' as never,
      curriculumVersionId: 'cver_123456789012345678901' as never,
      stableNodeKey: 'linear-equations',
      ckgConceptId: 'concept_223456789012345678901' as never,
      label: 'Linear equations',
      stabilityThreshold: 0.8,
      estimatedSessions: 3,
      traversalWeight: 1,
    },
  ],
  edges: [
    {
      id: 'cedge_123456789012345678901' as never,
      curriculumVersionId: 'cver_123456789012345678901' as never,
      fromNodeId: 'cnode_123456789012345678901' as never,
      toNodeId: 'cnode_223456789012345678901' as never,
      type: CurriculumEdgeType.PREREQUISITE,
      orderingWeight: 0,
    },
  ],
};

describe('curriculum DAG validation', () => {
  it('accepts a valid anchored DAG', () => {
    expect(() => {
      validateCurriculumDag(graph);
    }).not.toThrow();
  });

  it('rejects cycles', () => {
    const cyclic = {
      ...graph,
      edges: [
        ...graph.edges,
        {
          ...graph.edges[0],
          id: 'cedge_223456789012345678901' as never,
          fromNodeId: graph.nodes[1].id,
          toNodeId: graph.nodes[0].id,
        },
      ],
    };
    expect(() => {
      validateCurriculumDag(cyclic);
    }).toThrow(CurriculumValidationError);
  });

  it('rejects nodes without a CKG anchor or proposed concept', () => {
    const unanchored = {
      ...graph,
      nodes: [{ ...graph.nodes[0], ckgConceptId: undefined, proposedConcept: undefined }],
    };
    expect(() => {
      validateCurriculumDag(unanchored);
    }).toThrow(/anchor/);
  });

  it('accepts branch-aware edge semantics in an acyclic graph', () => {
    const branchGraph: CurriculumVersionGraph = {
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          branchInfo: { pathRole: 'foundation', isMainPath: true },
        },
        {
          ...graph.nodes[1],
          id: 'cnode_323456789012345678901' as never,
          stableNodeKey: 'focus-probability',
          branchInfo: {
            pathRole: 'focus_area',
            branchGroupKey: 'branch_probability',
            branchEntryStrategy: 'learner_choice',
            isMainPath: false,
          },
        },
        {
          ...graph.nodes[1],
          id: 'cnode_423456789012345678901' as never,
          stableNodeKey: 'focus-geometry',
          branchInfo: {
            pathRole: 'focus_area',
            branchGroupKey: 'branch_geometry',
            branchEntryStrategy: 'learner_choice',
            isMainPath: false,
          },
        },
      ],
      edges: [
        {
          ...graph.edges[0],
          toNodeId: 'cnode_323456789012345678901' as never,
          type: CurriculumEdgeType.BRANCH_OPTION,
        },
        {
          ...graph.edges[0],
          id: 'cedge_223456789012345678901' as never,
          toNodeId: 'cnode_423456789012345678901' as never,
          type: CurriculumEdgeType.BRANCH_OPTION,
        },
      ],
    };

    expect(() => {
      validateCurriculumDag(branchGraph);
    }).not.toThrow();
  });
});

describe('frontier and slice composition', () => {
  it('unlocks downstream nodes only when prerequisites are completed or skipped', () => {
    const locked = computeFrontier(graph, []);
    expect(locked.map((node) => node.stableNodeKey)).toEqual(['algebra-basics']);

    const unlocked = computeFrontier(graph, [
      {
        stableNodeKey: 'algebra-basics',
        runtimeState: CurriculumNodeRuntimeState.COMPLETED,
        evaluationCount: 3,
        correctStreak: 2,
      },
    ]);
    expect(unlocked.map((node) => node.stableNodeKey)).toEqual(['linear-equations']);
  });

  it('prefers in-progress maintenance before bounded novelty', () => {
    const frontier = graph.nodes;
    const slice = composeSessionSlice(
      frontier,
      [
        {
          stableNodeKey: 'linear-equations',
          runtimeState: CurriculumNodeRuntimeState.IN_PROGRESS,
          evaluationCount: 1,
          correctStreak: 1,
        },
      ],
      [],
      { maxNewNodes: 1, maxNodes: 2 }
    );
    expect(slice.selectedNodes.map((node) => node.stableNodeKey)).toEqual([
      'linear-equations',
      'algebra-basics',
    ]);
  });

  it('prefers the learner active branch and returns branch slice metadata', () => {
    const frontier = [
      {
        ...graph.nodes[0],
        stableNodeKey: 'probability-path',
        branchInfo: {
          pathRole: 'focus_area',
          branchGroupKey: 'branch_probability',
          branchEntryStrategy: 'learner_choice',
          isMainPath: false,
        },
      },
      {
        ...graph.nodes[1],
        stableNodeKey: 'geometry-path',
        traversalWeight: 5,
        branchInfo: {
          pathRole: 'focus_area',
          branchGroupKey: 'branch_geometry',
          branchEntryStrategy: 'learner_choice',
          isMainPath: false,
        },
      },
    ];
    const slice = composeSessionSlice(
      frontier,
      [],
      [],
      { maxNewNodes: 2, maxNodes: 2, preferredBranchGroupKeys: ['branch_geometry'] },
      [
        {
          branchGroupKey: 'branch_geometry',
          selectedPathRole: 'focus_area',
          selectedNodeKey: 'geometry-path',
          selectionSource: 'learner_progress',
          selectedAt: '2026-05-09T10:00:00.000Z',
          lastConfirmedAt: '2026-05-09T10:00:00.000Z',
          driftState: 'on_path',
        },
      ]
    );

    expect(slice.selectedNodes[0]?.stableNodeKey).toBe('geometry-path');
    expect(slice.selectedBranchGroupKeys).toContain('branch_geometry');
    expect(slice.branchDecisionState).toBe('on_path');
    expect(slice.selectionReason).toMatch(/preferred branch/i);
  });
});

describe('progress and realignment policy', () => {
  it('completes only when stability, exposure, and streak thresholds pass', () => {
    const progress = updateProgressFromEvaluation({
      node: graph.nodes[0],
      correct: true,
      stabilitySnapshot: 0.8,
      sessionId: 'session_123456789012345678901' as never,
      policy: { minExposureSessions: 3, minCorrectStreak: 2 },
      existing: {
        stableNodeKey: 'algebra-basics',
        runtimeState: CurriculumNodeRuntimeState.IN_PROGRESS,
        evaluationCount: 2,
        correctStreak: 1,
      },
    });
    expect(progress.runtimeState).toBe(CurriculumNodeRuntimeState.COMPLETED);
  });

  it('requires eligible cross-session evidence before revision proposal generation', () => {
    expect(
      shouldGenerateRevisionProposal({
        triggerType: 'prerequisite_gap',
        accumulatedWeight: 3,
        threshold: 2,
        sessionIds: ['s1'],
      })
    ).toBe(false);
    expect(
      shouldGenerateRevisionProposal({
        triggerType: 'prerequisite_gap',
        accumulatedWeight: 3,
        threshold: 2,
        sessionIds: ['s1', 's2'],
      })
    ).toBe(true);
    expect(
      shouldGenerateRevisionProposal({
        triggerType: 'fatigue_detected',
        accumulatedWeight: 3,
        threshold: 2,
        sessionIds: ['s1', 's2'],
      })
    ).toBe(false);
  });

  it('auto-rejects revision changes touching frozen nodes', () => {
    const [change] = rejectFrozenNodeChanges(
      [
        {
          id: 'rchg_123456789012345678901',
          kind: RevisionChangeKind.RELABEL_NODE,
          payload: { stableNodeKey: 'algebra-basics' },
          state: RevisionChangeState.PENDING,
        },
      ],
      ['algebra-basics']
    );
    expect(change?.state).toBe(RevisionChangeState.REJECTED);
    expect(change?.rejectionReason).toBe('node_frozen');
  });
});
