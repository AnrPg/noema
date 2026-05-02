import { describe, expect, it, vi } from 'vitest';
import type { ConceptId, StudyMode, UserId } from '@noema/types';
import { ConceptState } from '@noema/types';
import type {
  IConceptReasoningEvidenceInput,
  IConceptStateHistoryEntry,
  IConceptStateHistoryInput,
  IConceptStateProjection,
  IConceptStateRepository,
  IConceptStateUpsertInput,
} from '../../../src/domain/knowledge-graph-service/concept-state.repository.js';
import {
  ConceptStateService,
  type IConceptStateGraphPort,
} from '../../../src/domain/knowledge-graph-service/concept-state.service.js';

const userId = 'user_123456789012345678901' as UserId;
const conceptId = 'concept_12345678901234567' as ConceptId;
const prereqId = 'concept_76543210987654321' as ConceptId;
const studyMode = 'knowledge_gaining' as StudyMode;

class FakeConceptStateRepository implements IConceptStateRepository {
  readonly processedEvents = new Set<string>();
  readonly reasoningEvidence: IConceptReasoningEvidenceInput[] = [];
  readonly projections = new Map<string, IConceptStateProjection>();
  readonly history: IConceptStateHistoryEntry[] = [];

  markEventProcessed(input: { readonly eventId: string }): Promise<boolean> {
    if (this.processedEvents.has(input.eventId)) return Promise.resolve(false);
    this.processedEvents.add(input.eventId);
    return Promise.resolve(true);
  }

  recordReasoningEvidence(input: IConceptReasoningEvidenceInput): Promise<void> {
    this.reasoningEvidence.push(input);
    return Promise.resolve();
  }

  getReasoningAverage(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly windowSize: number;
  }): Promise<number | null> {
    const evidence = this.reasoningEvidence
      .filter(
        (entry) =>
          entry.userId === input.userId &&
          entry.conceptId === input.conceptId &&
          entry.studyMode === input.studyMode
      )
      .slice(-input.windowSize);
    if (evidence.length === 0) return Promise.resolve(null);
    return Promise.resolve(
      evidence.reduce((sum, entry) => sum + entry.reasoningQuality, 0) / evidence.length
    );
  }

  getProjection(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection | null> {
    return Promise.resolve(
      this.projections.get(key(input.userId, input.conceptId, input.studyMode)) ?? null
    );
  }

  listProjections(input: {
    readonly userId: UserId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection[]> {
    return Promise.resolve(
      [...this.projections.values()].filter(
        (projection) =>
          projection.userId === input.userId && projection.studyMode === input.studyMode
      )
    );
  }

  listRecomputeCandidates(input: {
    readonly staleBefore: string;
    readonly limit: number;
  }): Promise<IConceptStateProjection[]> {
    return Promise.resolve(
      [...this.projections.values()]
        .filter((projection) => projection.computedAt < input.staleBefore)
        .slice(0, input.limit)
    );
  }

  upsertProjection(input: IConceptStateUpsertInput & { state: ConceptState }): Promise<{
    readonly projection: IConceptStateProjection;
    readonly fromState: ConceptState;
    readonly changed: boolean;
  }> {
    const projectionKey = key(input.userId, input.conceptId, input.studyMode);
    const existing = this.projections.get(projectionKey);
    const fromState = existing?.state ?? ConceptState.UNSTABLE;
    const projection: IConceptStateProjection = {
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode: input.studyMode,
      state: input.state,
      fsrsStability: input.fsrsStability,
      reasoningAverage: input.reasoningAverage,
      evidenceWindow: input.evidenceWindow,
      lastEvaluationId: input.lastEvaluationId,
      lastChangedAt:
        fromState !== input.state ? input.computedAt : (existing?.lastChangedAt ?? null),
      attemptsSinceStable:
        input.state === ConceptState.STABLE ? (existing?.attemptsSinceStable ?? 0) + 1 : 0,
      computedAt: input.computedAt,
      updatedAt: input.computedAt,
    };
    this.projections.set(projectionKey, projection);
    return Promise.resolve({ projection, fromState, changed: fromState !== input.state });
  }

  appendHistory(input: IConceptStateHistoryInput): Promise<IConceptStateHistoryEntry> {
    const entry: IConceptStateHistoryEntry = {
      id: `hist_${String(this.history.length + 1)}`,
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode: input.studyMode,
      fromState: input.fromState,
      toState: input.toState,
      triggeredBy: input.triggeredBy,
      fsrsStability: input.fsrsStability,
      reasoningAverage: input.reasoningAverage,
      evaluationId: input.evaluationId,
      changedAt: input.changedAt,
      createdAt: input.changedAt,
    };
    this.history.push(entry);
    return Promise.resolve(entry);
  }

  getHistory(): Promise<IConceptStateHistoryEntry[]> {
    return Promise.resolve(this.history);
  }
}

function key(user: UserId, concept: ConceptId, mode: StudyMode): string {
  return `${user}:${concept}:${mode}`;
}

describe('ConceptStateService', () => {
  it('derives stable only when FSRS stability and reasoning average pass thresholds', async () => {
    const repository = new FakeConceptStateRepository();
    const graphPort: IConceptStateGraphPort = {
      setConceptState: vi.fn(),
      getPrerequisiteConceptIds: vi.fn(() => Promise.resolve([])),
      getConceptDomains: vi.fn(() => Promise.resolve(new Map([[conceptId, 'math']]))),
    };
    const publisher = { publish: vi.fn(), publishBatch: vi.fn() };
    const service = new ConceptStateService(repository, graphPort, publisher, {
      S_RET: 21,
      R_REAS: 0.6,
      N_REASONING_WINDOW: 3,
    });

    await service.recompute({
      userId,
      conceptId,
      studyMode,
      evaluationId: 'eval_1' as never,
      stepId: 'step_1',
      reasoningQuality: 0.9,
      fsrsStability: 22,
      eventId: 'event_1',
      eventType: 'metacognition.evaluation.recorded',
    });

    const stableProjection = await service.getProjection({ userId, conceptId, studyMode });
    expect(stableProjection?.state).toBe(ConceptState.STABLE);
    expect(repository.history).toHaveLength(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'knowledge_graph.concept_state.changed',
        payload: expect.objectContaining({
          toState: ConceptState.STABLE,
          triggeredBy: 'evaluation',
          studyMode,
        }),
      })
    );

    await service.recompute({
      userId,
      conceptId,
      studyMode,
      evaluationId: 'eval_2' as never,
      stepId: 'step_2',
      reasoningQuality: 0.1,
      fsrsStability: 22,
      eventId: 'event_2',
      eventType: 'metacognition.evaluation.recorded',
    });

    const regressedProjection = await service.getProjection({ userId, conceptId, studyMode });
    expect(regressedProjection?.state).toBe(ConceptState.UNSTABLE);
    expect(repository.history.at(-1)?.toState).toBe(ConceptState.UNSTABLE);
  });

  it('returns only unstable prerequisite gaps', async () => {
    const repository = new FakeConceptStateRepository();
    const graphPort: IConceptStateGraphPort = {
      setConceptState: vi.fn(),
      getPrerequisiteConceptIds: vi.fn(() => Promise.resolve([conceptId, prereqId])),
      getConceptDomains: vi.fn(() => Promise.resolve(new Map())),
    };
    const service = new ConceptStateService(repository, graphPort, {
      publish: vi.fn(),
      publishBatch: vi.fn(),
    });

    await repository.upsertProjection({
      userId,
      conceptId,
      studyMode,
      state: ConceptState.STABLE,
      fsrsStability: 40,
      reasoningAverage: 0.8,
      evidenceWindow: 10,
      lastEvaluationId: null,
      computedAt: new Date().toISOString(),
    });
    await repository.upsertProjection({
      userId,
      conceptId: prereqId,
      studyMode,
      state: ConceptState.UNSTABLE,
      fsrsStability: 40,
      reasoningAverage: 0.2,
      evidenceWindow: 10,
      lastEvaluationId: null,
      computedAt: new Date().toISOString(),
    });

    const gaps = await service.getPrerequisiteGaps({ userId, conceptId, studyMode });
    expect(gaps.map((gap) => gap.conceptId)).toEqual([prereqId]);
  });

  it('periodically recomputes stale projections without requiring a new event', async () => {
    const repository = new FakeConceptStateRepository();
    const graphPort: IConceptStateGraphPort = {
      setConceptState: vi.fn(),
      getPrerequisiteConceptIds: vi.fn(() => Promise.resolve([])),
      getConceptDomains: vi.fn(() => Promise.resolve(new Map())),
    };
    const service = new ConceptStateService(
      repository,
      graphPort,
      { publish: vi.fn(), publishBatch: vi.fn() },
      { S_RET: 21, R_REAS: 0.6, N_REASONING_WINDOW: 3 }
    );

    await repository.upsertProjection({
      userId,
      conceptId,
      studyMode,
      state: ConceptState.UNSTABLE,
      fsrsStability: 30,
      reasoningAverage: null,
      evidenceWindow: 3,
      lastEvaluationId: null,
      computedAt: '2026-04-30T00:00:00.000Z',
    });
    await repository.recordReasoningEvidence({
      userId,
      conceptId,
      studyMode,
      evaluationId: 'eval_1' as never,
      stepId: 'step_1',
      reasoningQuality: 0.9,
      evaluatedAt: '2026-05-01T00:00:00.000Z',
    });

    const result = await service.recomputeStale({
      staleBefore: '2026-05-02T00:00:00.000Z',
      limit: 10,
    });

    expect(result).toEqual({ checked: 1, changed: 1 });
    expect((await service.getProjection({ userId, conceptId, studyMode }))?.state).toBe(
      ConceptState.STABLE
    );
  });
});
