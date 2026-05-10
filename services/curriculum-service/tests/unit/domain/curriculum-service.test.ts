import {
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumRevisionPayloadSchema,
  CurriculumLifecyclePayloadSchema,
} from '@noema/events';
import {
  CurriculumEdgeType,
  CurriculumNodeRuntimeState,
  CurriculumOriginMode,
  CurriculumVersionState,
  RevisionChangeState,
  type CurriculumId,
  type CurriculumVersionId,
  type RevisionProposalId,
  type UserId,
} from '@noema/types';
import { describe, expect, it, vi } from 'vitest';
import { CurriculumService } from '../../../src/domain/curriculum-service/curriculum.service.js';
import type { CurriculumEventPublisherPort } from '../../../src/domain/curriculum-service/event-publisher.port.js';
import type { CurriculumRepository } from '../../../src/domain/curriculum-service/curriculum.repository.js';
import type { CurriculumVersionGraph } from '../../../src/domain/curriculum-service/curriculum.types.js';

const userId = 'user_123456789012345678901' as UserId;
const curriculumId = 'curr_123456789012345678901' as CurriculumId;
const versionId = 'cver_123456789012345678901' as CurriculumVersionId;

const graph: CurriculumVersionGraph = {
  id: versionId,
  nodes: [
    {
      id: 'cnode_123456789012345678901' as never,
      curriculumVersionId: versionId,
      stableNodeKey: 'algebra-basics',
      ckgConceptId: 'concept_123456789012345678901' as never,
      label: 'Algebra basics',
      learningObjective: 'Understand basic algebra',
      stabilityThreshold: 0.8,
      estimatedSessions: 1,
      traversalWeight: 1,
    },
  ],
  edges: [],
};

function createRepository(): CurriculumRepository {
  return {
    listByUser: vi.fn(async () => []),
    create: vi.fn(async (_userId, input) => ({
      id: curriculumId,
      userId,
      title: input.title,
      goal: input.goal,
      domain: input.domain,
      originMode: input.originMode ?? CurriculumOriginMode.USER_AUTHORED,
      state: 'draft',
      metadata: {},
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      activeVersionId: undefined,
    })),
    getById: vi.fn(async () => ({
      id: curriculumId,
      userId,
      title: 'Generated curriculum',
      originMode: CurriculumOriginMode.DOCUMENT_DERIVED,
      state: 'active',
      metadata: {},
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      activeVersionId: versionId,
      activeVersion: {
        id: versionId,
        curriculumId,
        versionNumber: 1,
        state: CurriculumVersionState.ACTIVE,
        createdAt: '2026-05-03T00:00:00.000Z',
        finalizedAt: '2026-05-03T00:00:00.000Z',
        nodes: graph.nodes,
        edges: graph.edges,
      },
    })),
    getActiveVersion: vi.fn(async () => graph),
    getActiveVersionForUser: vi.fn(async () => graph),
    listProgress: vi.fn(async () => []),
    upsertProgress: vi.fn(async (input) => ({
      id: 'progress_123',
      curriculumId: input.curriculumId,
      userId: input.userId,
      stableNodeKey: input.stableNodeKey,
      runtimeState: input.runtimeState,
      evaluationCount: input.evaluationCount,
      correctStreak: input.correctStreak,
      stabilitySnapshot: input.stabilitySnapshot,
      lastSessionId: input.sessionId,
    })),
    markEvaluationEventProcessed: vi.fn(async () => true),
    saveDraftVersion: vi.fn(async () => versionId),
    finalizeVersion: vi.fn(async () => undefined),
    setFrozenNode: vi.fn(async () => undefined),
    listRevisionProposals: vi.fn(async () => []),
    decideRevisionChange: vi.fn(async () => {
      throw new Error('not implemented');
    }),
    applyRevisionProposal: vi.fn(async () => ({
      id: 'rprop_123456789012345678901' as RevisionProposalId,
      curriculumId,
      proposedFromVersionId: versionId,
      reason: 'prerequisite_gap',
      evidence: {},
      rationale: 'needs update',
      expiresAt: '2026-05-10T00:00:00.000Z',
      createdAt: '2026-05-03T00:00:00.000Z',
      appliedVersionId: versionId,
      changes: [
        {
          id: 'rchg_123456789012345678901' as never,
          proposalId: 'rprop_123456789012345678901' as RevisionProposalId,
          kind: 'relabel_node',
          payload: {},
          state: RevisionChangeState.APPROVED,
        },
      ],
    })),
    listRealignmentEvidence: vi.fn(async () => []),
    accumulateRealignmentEvidence: vi.fn(async () => ({
      id: 'evidence_123',
      curriculumId,
      stableNodeKey: 'algebra-basics',
      triggerType: 'prerequisite_gap',
      sessionIds: ['session_123456789012345678901' as never, 'session_223456789012345678901' as never],
      accumulatedWeight: 3,
      threshold: 2,
      firstSeenAt: '2026-05-03T00:00:00.000Z',
      lastSeenAt: '2026-05-03T00:00:00.000Z',
    })),
  };
}

function createPublisher() {
  const publish = vi.fn(async () => undefined);
  const publisher: CurriculumEventPublisherPort = { publish };
  return { publisher, publish };
}

function createPrismaStub() {
  return {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({}),
  } as never;
}

describe('CurriculumService event contracts', () => {
  it('emits curriculum.version.activated for generated curricula', async () => {
    const repository = createRepository();
    const { publisher, publish } = createPublisher();
    const service = new CurriculumService(
      repository,
      { getConceptStates: vi.fn(async () => []) },
      publisher,
      createPrismaStub(),
      undefined,
      { validateCurriculumVersion: vi.fn(async () => ({ accepted: true, validationId: 'guard_123' })) },
      undefined
    );

    await service.generateCurriculum(userId, {
      goal: 'Master algebra',
      title: 'Algebra',
      rootConceptIds: ['concept_123456789012345678901' as never],
    });

    expect(publish).toHaveBeenCalledWith(
      'curriculum.version.activated',
      expect.objectContaining({
        curriculumId,
        curriculumVersionId: versionId,
        userId,
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
      })
    );

    CurriculumLifecyclePayloadSchema.parse(publish.mock.calls[0]?.[1]);
  });

  it('emits canonical progress, revision, and evidence payloads', async () => {
    const repository = createRepository();
    const { publisher, publish } = createPublisher();
    const service = new CurriculumService(
      repository,
      { getConceptStates: vi.fn(async () => []) },
      publisher,
      createPrismaStub()
    );

    await service.recordEvaluation(userId, curriculumId, {
      stableNodeKey: 'algebra-basics',
      correct: true,
      sessionId: 'session_123456789012345678901' as never,
      stabilitySnapshot: 0.9,
    });
    await service.applyRevisionProposal({
      userId,
      curriculumId,
      proposalId: 'rprop_123456789012345678901' as RevisionProposalId,
    });
    await service.recordRealignmentEvidence(userId, curriculumId, {
      stableNodeKey: 'algebra-basics',
      triggerType: 'prerequisite_gap',
      sessionId: 'session_123456789012345678901' as never,
    });

    expect(publish).toHaveBeenNthCalledWith(
      1,
      'curriculum.progress.updated',
      expect.objectContaining({
        curriculumId,
        curriculumVersionId: versionId,
        stableNodeKey: 'algebra-basics',
        evaluationCount: 1,
        correctStreak: 1,
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
      })
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      'curriculum.revision.applied',
      expect.objectContaining({
        curriculumId,
        proposalId: 'rprop_123456789012345678901',
        appliedVersionId: versionId,
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
      })
    );
    expect(publish).toHaveBeenNthCalledWith(
      3,
      'curriculum.realignment.evidence_accumulated',
      expect.objectContaining({
        curriculumId,
        stableNodeKey: 'algebra-basics',
        accumulatedWeight: 3,
        threshold: 2,
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
      })
    );

    CurriculumProgressUpdatedPayloadSchema.parse(publish.mock.calls[0]?.[1]);
    CurriculumRevisionPayloadSchema.parse(publish.mock.calls[1]?.[1]);
    CurriculumEvidenceAccumulatedPayloadSchema.parse(publish.mock.calls[2]?.[1]);
  });

  it('does not apply duplicate evaluation events twice', async () => {
    const repository = createRepository();
    vi.mocked(repository.listProgress).mockResolvedValue([
      {
        id: 'progress_123',
        curriculumId,
        userId,
        stableNodeKey: 'algebra-basics',
        runtimeState: 'in_progress',
        evaluationCount: 1,
        correctStreak: 1,
        lastSessionId: 'session_123456789012345678901' as never,
      },
    ]);
    vi.mocked(repository.markEvaluationEventProcessed).mockResolvedValue(false);
    const { publisher, publish } = createPublisher();
    const service = new CurriculumService(
      repository,
      { getConceptStates: vi.fn(async () => []) },
      publisher,
      createPrismaStub()
    );

    const result = await service.recordEvaluation(userId, curriculumId, {
      stableNodeKey: 'algebra-basics',
      correct: true,
      sessionId: 'session_123456789012345678901' as never,
      evaluationId: 'eval_123456789012345678901' as never,
    });

    expect(result.evaluationCount).toBe(1);
    expect(repository.upsertProgress).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects active versions with unsupported edge types', async () => {
    const repository = createRepository();
    vi.mocked(repository.getActiveVersion).mockResolvedValue({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'cnode_223456789012345678901' as never,
          curriculumVersionId: versionId,
          stableNodeKey: 'linear-equations',
          ckgConceptId: 'concept_223456789012345678901' as never,
          label: 'Linear equations',
          learningObjective: 'Solve linear equations',
          stabilityThreshold: 0.8,
          estimatedSessions: 1,
          traversalWeight: 2,
        },
      ],
      edges: [
        {
          id: 'cedge_123456789012345678901' as never,
          curriculumVersionId: versionId,
          fromNodeId: graph.nodes[0].id,
          toNodeId: 'cnode_223456789012345678901' as never,
          type: CurriculumEdgeType.RELATED_TO,
          orderingWeight: 0,
        },
      ],
    });

    const service = new CurriculumService(
      repository,
      { getConceptStates: vi.fn(async () => []) },
      undefined,
      createPrismaStub(),
      undefined,
      undefined
    );

    await expect(service.validateActiveVersion(curriculumId)).rejects.toThrow(
      /unsupported edge types/i
    );
  });
});
