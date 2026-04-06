import { describe, expect, it, vi } from 'vitest';
import type { Metadata, MutationId, MutationState } from '@noema/types';

import { CkgMutationPipeline } from '../../../src/domain/knowledge-graph-service/ckg-mutation-pipeline.js';
import {
  buildProofModel,
  DeterministicProofRunner,
  type IProofResult,
  ProofRolloutMode,
} from '../../../src/domain/knowledge-graph-service/proof-stage.js';
import type { IOntologyArtifact } from '../../../src/domain/knowledge-graph-service/ontology-reasoning.js';

function createMutation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    mutationId: 'mut_proofstageaaaaaaaaaaaa' as MutationId,
    state: 'validated',
    proposedBy: 'agent_proof_tester',
    version: 1,
    rationale: 'Proof stage test mutation',
    evidenceCount: 2,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    recoveryAttempts: 0,
    revisionCount: 0,
    revisionFeedback: null,
    operations: [
      {
        type: 'update_node',
        nodeId: 'node_alphaaaaaaaaaaaaaaaa',
        updates: {
          label: 'Alpha',
        },
        rationale: 'Rename alpha',
      },
    ] as Metadata[],
    ...overrides,
  } as never;
}

function createContext() {
  return {
    userId: 'user_proofstageaaaaaaaaaaa' as never,
    correlationId: 'corr_proofstageaaaaaaaaaa' as never,
    roles: ['system'],
  };
}

function createPipelineHarness(
  mode: ProofRolloutMode,
  proofRunner?: { runProof: ReturnType<typeof vi.fn> }
) {
  let currentMutation = createMutation();
  let currentVersion = 1;

  const mutationRepository = {
    transitionStateWithAudit: vi.fn(
      (
        mutationId: MutationId,
        newState: MutationState,
        _expectedVersion: number,
        auditEntry: { fromState: MutationState; toState: MutationState }
      ) => {
        currentVersion += 1;
        currentMutation = {
          ...currentMutation,
          mutationId,
          state: newState,
          version: currentVersion,
          updatedAt: '2026-04-02T10:10:00.000Z',
        } as never;

        return Promise.resolve({
          mutation: currentMutation,
          audit: {
            mutationId,
            fromState: auditEntry.fromState,
            toState: auditEntry.toState,
            performedBy: 'system',
            timestamp: '2026-04-02T10:10:00.000Z',
          },
        });
      }
    ),
    updateMutationFields: vi.fn(() => Promise.resolve(currentMutation)),
  };

  const eventPublisher = {
    publish: vi.fn(() => Promise.resolve(undefined)),
  };

  const graphRepository = {
    getNode: vi.fn(() => Promise.resolve(null)),
    getEdgesForNodes: vi.fn(() => Promise.resolve([])),
  };

  const pipeline = new CkgMutationPipeline(
    mutationRepository as never,
    graphRepository as never,
    {} as never,
    eventPublisher as never,
    {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as never,
    mode,
    (proofRunner ?? { runProof: vi.fn() }) as never
  );

  return {
    pipeline,
    mutationRepository,
    eventPublisher,
    graphRepository,
  };
}

describe('DeterministicProofRunner', () => {
  it('fails duplicate structural operations instead of auto-approving them', async () => {
    const mutation = createMutation({
      operations: [
        {
          type: 'remove_node',
          nodeId: 'node_alphaaaaaaaaaaaaaaaa',
          rationale: 'Remove duplicate alpha',
        },
        {
          type: 'remove_node',
          nodeId: 'node_alphaaaaaaaaaaaaaaaa',
          rationale: 'Remove duplicate alpha again',
        },
      ] as Metadata[],
    });
    const operations = mutation.operations as never;
    const runner = new DeterministicProofRunner();

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(mutation, operations),
      createContext(),
      ProofRolloutMode.HARD_BLOCK
    );

    expect(result.passed).toBe(false);
    expect(result.enforcement).toBe('rejected');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROOF_DUPLICATE_OPERATION_FINGERPRINT',
        }),
      ])
    );
  });

  it('detects projected dependency cycles that only appear after combining current graph state and new operations', async () => {
    const mutation = createMutation({
      operations: [
        {
          type: 'add_edge',
          edgeType: 'prerequisite',
          sourceNodeId: 'node_c',
          targetNodeId: 'node_a',
          weight: 1,
          rationale: 'Close the dependency loop',
        },
      ] as Metadata[],
    });
    const operations = mutation.operations as never;
    const runner = new DeterministicProofRunner();

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(mutation, operations, {
        nodes: [
          { nodeId: 'node_a', nodeType: 'concept', domain: 'math' },
          { nodeId: 'node_b', nodeType: 'concept', domain: 'math' },
          { nodeId: 'node_c', nodeType: 'concept', domain: 'math' },
        ],
        edges: [
          {
            edgeId: 'edge_ab',
            edgeType: 'prerequisite',
            sourceNodeId: 'node_a',
            targetNodeId: 'node_b',
          },
          {
            edgeId: 'edge_bc',
            edgeType: 'prerequisite',
            sourceNodeId: 'node_b',
            targetNodeId: 'node_c',
          },
        ],
      }),
      createContext(),
      ProofRolloutMode.HARD_BLOCK
    );

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROOF_DEPENDENCY_CYCLE',
        }),
      ])
    );
  });

  it('fails projected ontology violations in the proof model, not only structural witnesses', async () => {
    const mutation = createMutation({
      operations: [
        {
          type: 'add_edge',
          edgeType: 'subskill_of',
          sourceNodeId: 'node_fact',
          targetNodeId: 'node_concept',
          weight: 1,
          rationale: 'Incorrectly type a fact as a skill relation',
        },
      ] as Metadata[],
    });
    const operations = mutation.operations as never;
    const runner = new DeterministicProofRunner();

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(mutation, operations, {
        nodes: [
          { nodeId: 'node_fact', nodeType: 'fact', domain: 'math' },
          { nodeId: 'node_concept', nodeType: 'concept', domain: 'math' },
        ],
        edges: [],
      }),
      createContext(),
      ProofRolloutMode.HARD_BLOCK
    );

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROOF_ONTOLOGY_CONFLICT',
        }),
      ])
    );
  });

  it('uses the supplied active ontology artifact rather than the baked-in default', async () => {
    const mutation = createMutation({
      operations: [
        {
          type: 'add_edge',
          edgeType: 'subskill_of',
          sourceNodeId: 'node_fact',
          targetNodeId: 'node_concept',
          weight: 1,
          rationale: 'Allow this relation under a custom ontology artifact',
        },
      ] as Metadata[],
    });
    const operations = mutation.operations as never;
    const runner = new DeterministicProofRunner();
    const permissiveArtifact: IOntologyArtifact = {
      version: 'test-ontology',
      nodeClassHierarchy: {
        concept: ['knowledge_entity', 'concept_bearing', 'abstraction'],
        fact: ['knowledge_entity', 'skill_like'],
        skill: ['knowledge_entity', 'skill_like'],
        procedure: ['knowledge_entity', 'concept_bearing', 'process_like'],
        principle: ['knowledge_entity', 'concept_bearing', 'rule_like'],
        example: ['knowledge_entity', 'instance_like', 'example_like'],
        misconception: ['knowledge_entity', 'diagnostic_like'],
        exercise: ['knowledge_entity', 'diagnostic_like'],
        occupation: ['knowledge_entity', 'role_like'],
      } as never,
      disjointNodeClasses: [],
      edgeConstraints: {
        subskill_of: {
          edgeType: 'subskill_of' as never,
          sourceClasses: ['skill_like'],
          targetClasses: ['concept_bearing', 'skill_like'],
          sameKindRequired: false,
        },
      } as never,
      illegalRetypings: [],
    };

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(
        mutation,
        operations,
        {
          nodes: [
            { nodeId: 'node_fact', nodeType: 'fact', domain: 'math' },
            { nodeId: 'node_concept', nodeType: 'concept', domain: 'math' },
          ],
          edges: [],
        },
        permissiveArtifact
      ),
      createContext(),
      ProofRolloutMode.HARD_BLOCK
    );

    expect(result.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PROOF_ONTOLOGY_CONFLICT' })])
    );
  });
});

describe('CkgMutationPipeline proof-stage rollout modes', () => {
  it('records failing proof diagnostics in observe-only mode and still transitions to proven', async () => {
    const proofRunner = {
      runProof: vi.fn(
        (): Promise<IProofResult> =>
          Promise.resolve({
            mode: ProofRolloutMode.OBSERVE_ONLY,
            status: 'failed',
            passed: false,
            engineVersion: 'proof-test-engine',
            artifactRef: 'proof://observe-only',
            checkedInvariants: ['spec_observe_only'],
            findings: [
              {
                code: 'PROOF_OBSERVE_ONLY',
                message: 'Observe-only diagnostic',
                severity: 'error',
                reviewable: false,
              },
            ],
            failureExplanation: 'Observe-only diagnostic',
            modelSummary: {},
            executedAt: '2026-04-02T10:11:00.000Z',
            autoApproved: false,
            enforcement: 'observe_only',
          })
      ),
    };
    const { pipeline, mutationRepository } = createPipelineHarness(
      ProofRolloutMode.OBSERVE_ONLY,
      proofRunner
    );

    const result = await (
      pipeline as unknown as {
        runProofStage: (
          mutation: ReturnType<typeof createMutation>,
          context: ReturnType<typeof createContext>
        ) => Promise<ReturnType<typeof createMutation>>;
      }
    ).runProofStage(createMutation(), createContext());

    expect(result.state).toBe('proven');
    expect(proofRunner.runProof).toHaveBeenCalled();
    expect(mutationRepository.updateMutationFields).toHaveBeenCalledWith(
      'mut_proofstageaaaaaaaaaaaa',
      expect.objectContaining({
        proofResult: expect.objectContaining({
          mode: 'observe_only',
          status: 'failed',
          enforcement: 'observe_only',
        }),
      })
    );
  });

  it('routes reviewable proof findings to pending_review in soft-block mode', async () => {
    const proofRunner = {
      runProof: vi.fn(
        (): Promise<IProofResult> =>
          Promise.resolve({
            mode: ProofRolloutMode.SOFT_BLOCK,
            status: 'failed',
            passed: false,
            engineVersion: 'proof-test-engine',
            artifactRef: 'proof://soft-block',
            checkedInvariants: ['spec_soft_block'],
            findings: [
              {
                code: 'PROOF_COMPLEX_STRUCTURAL_REWRITE',
                message: 'Needs review',
                severity: 'warning',
                reviewable: true,
              },
            ],
            failureExplanation: 'Needs review',
            modelSummary: {},
            executedAt: '2026-04-02T10:12:00.000Z',
            autoApproved: false,
            enforcement: 'pending_review',
          })
      ),
    };
    const { pipeline } = createPipelineHarness(ProofRolloutMode.SOFT_BLOCK, proofRunner);

    const result = await (
      pipeline as unknown as {
        runProofStage: (
          mutation: ReturnType<typeof createMutation>,
          context: ReturnType<typeof createContext>
        ) => Promise<ReturnType<typeof createMutation>>;
      }
    ).runProofStage(createMutation(), createContext());

    expect(result.state).toBe('pending_review');
  });

  it('allows reviewer-approved proof findings to continue without re-entering pending_review', async () => {
    const proofRunner = {
      runProof: vi.fn(
        (): Promise<IProofResult> =>
          Promise.resolve({
            mode: ProofRolloutMode.SOFT_BLOCK,
            status: 'failed',
            passed: false,
            engineVersion: 'proof-test-engine',
            artifactRef: 'proof://soft-block-approved',
            checkedInvariants: ['spec_soft_block'],
            findings: [
              {
                code: 'PROOF_COMPLEX_STRUCTURAL_REWRITE',
                message: 'Needs review',
                severity: 'warning',
                reviewable: true,
              },
            ],
            failureExplanation: 'Needs review',
            modelSummary: {},
            executedAt: '2026-04-02T10:12:00.000Z',
            autoApproved: false,
            enforcement: 'pending_review',
          })
      ),
    };
    const { pipeline, mutationRepository } = createPipelineHarness(
      ProofRolloutMode.SOFT_BLOCK,
      proofRunner
    );

    const result = await (
      pipeline as unknown as {
        runProofStage: (
          mutation: ReturnType<typeof createMutation>,
          context: ReturnType<typeof createContext>,
          options: { approvedProofReview: boolean }
        ) => Promise<ReturnType<typeof createMutation>>;
      }
    ).runProofStage(createMutation(), createContext(), { approvedProofReview: true });

    expect(result.state).toBe('proven');
    expect(mutationRepository.updateMutationFields).toHaveBeenCalledWith(
      'mut_proofstageaaaaaaaaaaaa',
      expect.objectContaining({
        proofResult: expect.objectContaining({
          autoApproved: true,
          enforcement: 'observe_only',
        }),
      })
    );
  });

  it('rejects failed proof checks in hard-block mode and emits a rejection event', async () => {
    const proofRunner = {
      runProof: vi.fn(
        (): Promise<IProofResult> =>
          Promise.resolve({
            mode: ProofRolloutMode.HARD_BLOCK,
            status: 'failed',
            passed: false,
            engineVersion: 'proof-test-engine',
            artifactRef: 'proof://hard-block',
            checkedInvariants: ['spec_hard_block'],
            findings: [
              {
                code: 'PROOF_DUPLICATE_OPERATION_FINGERPRINT',
                message: 'Hard-block failure',
                severity: 'error',
                reviewable: false,
              },
            ],
            failureExplanation: 'Hard-block failure',
            modelSummary: {},
            executedAt: '2026-04-02T10:13:00.000Z',
            autoApproved: false,
            enforcement: 'rejected',
          })
      ),
    };
    const { pipeline, eventPublisher, mutationRepository } = createPipelineHarness(
      ProofRolloutMode.HARD_BLOCK,
      proofRunner
    );

    const result = await (
      pipeline as unknown as {
        runProofStage: (
          mutation: ReturnType<typeof createMutation>,
          context: ReturnType<typeof createContext>
        ) => Promise<ReturnType<typeof createMutation>>;
      }
    ).runProofStage(createMutation(), createContext());

    expect(result.state).toBe('rejected');
    expect(mutationRepository.updateMutationFields).toHaveBeenCalledWith(
      'mut_proofstageaaaaaaaaaaaa',
      expect.objectContaining({
        proofResult: expect.objectContaining({
          mode: 'hard_block',
          enforcement: 'rejected',
        }),
        rejectionReason: 'Hard-block failure',
      })
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ckg.mutation.rejected',
        payload: expect.objectContaining({
          failedStage: 'proving',
        }),
      })
    );
  });
});
