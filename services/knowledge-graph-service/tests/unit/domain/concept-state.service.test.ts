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

  async markEventProcessed(input: { readonly eventId: string }): Promise<boolean> {
    if (this.processedEvents.has(input.eventId)) return false;
    this.processedEvents.add(input.eventId);
    return true;
  }

  async recordReasoningEvidence(input: IConceptReasoningEvidenceInput): Promise<void> {
    this.reasoningEvidence.push(input);
  }

  async getReasoningAverage(input: {
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
    if (evidence.length === 0) return null;
    return evidence.reduce((sum, entry) => sum + entry.reasoningQuality, 0) / evidence.length;
  }

  async getProjection(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection | null> {
    return this.projections.get(key(input.userId, input.conceptId, input.studyMode)) ?? null;
  }

  async listProjections(input: {
    readonly userId: UserId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection[]> {
    return [...this.projections.values()].filter(
      (projection) => projection.userId === input.userId && projection.studyMode === input.studyMode
    );
  }

  async upsertProjection(input: IConceptStateUpsertInput & { state: ConceptState }): Promise<{
    readonly projection: IConceptStateProjection;
    readonly previousState: ConceptState;
    readonly changed: boolean;
  }> {
    const projectionKey = key(input.userId, input.conceptId, input.studyMode);
    const existing = this.projections.get(projectionKey);
    const previousState = existing?.state ?? ConceptState.UNSTABLE;
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
        previousState !== input.state ? input.computedAt : (existing?.lastChangedAt ?? null),
      attemptsSinceStable:
        input.state === ConceptState.STABLE ? (existing?.attemptsSinceStable ?? 0) + 1 : 0,
      computedAt: input.computedAt,
      updatedAt: input.computedAt,
    };
    this.projections.set(projectionKey, projection);
    return { projection, previousState, changed: previousState !== input.state };
  }

  async appendHistory(input: IConceptStateHistoryInput): Promise<IConceptStateHistoryEntry> {
    const entry: IConceptStateHistoryEntry = {
      id: `hist_${this.history.length + 1}`,
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode: input.studyMode,
      previousState: input.previousState,
      newState: input.newState,
      fsrsStability: input.fsrsStability,
      reasoningAverage: input.reasoningAverage,
      evaluationId: input.evaluationId,
      changedAt: input.changedAt,
      createdAt: input.changedAt,
    };
    this.history.push(entry);
    return entry;
  }

  async getHistory(): Promise<IConceptStateHistoryEntry[]> {
    return this.history;
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
      getPrerequisiteConceptIds: vi.fn(async () => []),
      getConceptDomains: vi.fn(async () => new Map([[conceptId, 'math']])),
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
          newState: ConceptState.STABLE,
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
    expect(repository.history.at(-1)?.newState).toBe(ConceptState.UNSTABLE);
  });

  it('returns only unstable prerequisite gaps', async () => {
    const repository = new FakeConceptStateRepository();
    const graphPort: IConceptStateGraphPort = {
      setConceptState: vi.fn(),
      getPrerequisiteConceptIds: vi.fn(async () => [conceptId, prereqId]),
      getConceptDomains: vi.fn(async () => new Map()),
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
});
