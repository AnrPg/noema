import type { IEventPublisher, IEventToPublish } from '@noema/events/publisher';
import { SchedulerQueue, StudyMode, TransformationType } from '@noema/types';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';
import type { IConceptScheduleRepository } from '../../../src/domain/scheduler-service/scheduler.repository.js';
import type {
  IConceptEvaluationLog,
  IConceptSchedulePatch,
  IConceptScheduleState,
  IConceptScheduleTransitionInput,
  IConceptScheduleTransitionResult,
  IConceptTransformationHistory,
  IDueConceptQuery,
  ITransformationHistoryQuery,
} from '../../../src/types/scheduler.types.js';

class InMemoryConceptScheduleRepository implements IConceptScheduleRepository {
  public readonly states = new Map<string, IConceptScheduleState>();
  public readonly logs: IConceptEvaluationLog[] = [];
  public readonly transformations: IConceptTransformationHistory[] = [];

  public async findState(
    userId: IConceptScheduleState['userId'],
    conceptId: IConceptScheduleState['conceptId'],
    studyMode: IConceptScheduleState['studyMode']
  ): Promise<IConceptScheduleState | null> {
    return this.states.get(key(userId, conceptId, studyMode)) ?? null;
  }

  public async upsertState(
    state: IConceptScheduleState,
    patch: IConceptSchedulePatch
  ): Promise<IConceptScheduleState> {
    const next: IConceptScheduleState = {
      ...state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(key(next.userId, next.conceptId, next.studyMode), next);
    return next;
  }

  public async createEvaluationLog(log: IConceptEvaluationLog): Promise<void> {
    this.logs.push(log);
  }

  public async createTransformationHistory(entry: IConceptTransformationHistory): Promise<void> {
    this.transformations.push(entry);
  }

  public async recordEvaluationTransition(
    input: IConceptScheduleTransitionInput
  ): Promise<IConceptScheduleTransitionResult> {
    const existing = this.logs.find(
      (log) =>
        log.evaluationId === input.log.evaluationId &&
        log.conceptId === input.log.conceptId &&
        log.studyMode === input.log.studyMode
    );
    if (existing !== undefined) {
      const state = this.states.get(
        key(input.log.userId, input.log.conceptId, input.log.studyMode)
      );
      if (state === undefined) throw new Error('Missing schedule state for replayed log');
      return { state, log: existing, replayed: true };
    }

    const state = await this.upsertState(input.priorState, input.patch);
    const log = { ...input.log, newState: snapshot(state) };
    this.logs.push(log);
    if (input.transformationHistory !== undefined) {
      this.transformations.push(input.transformationHistory);
    }
    return { state, log, replayed: false };
  }

  public async findDueConcepts(query: IDueConceptQuery): Promise<IConceptScheduleState[]> {
    return [...this.states.values()].filter(
      (state) =>
        state.userId === query.userId &&
        state.dueAt <= query.asOf &&
        (query.studyMode === undefined || state.studyMode === query.studyMode) &&
        (query.queue === undefined || state.queue === query.queue)
    );
  }

  public async findTransformationHistory(
    query: ITransformationHistoryQuery
  ): Promise<IConceptTransformationHistory[]> {
    return this.transformations.filter(
      (entry) =>
        entry.userId === query.userId &&
        entry.conceptId === query.conceptId &&
        (query.studyMode === undefined || entry.studyMode === query.studyMode)
    );
  }

  public async findEvaluationLogs(query: {
    userId: IConceptEvaluationLog['userId'];
    conceptIds?: IConceptEvaluationLog['conceptId'][];
    studyMode?: IConceptEvaluationLog['studyMode'];
    limit: number;
  }): Promise<IConceptEvaluationLog[]> {
    return this.logs
      .filter((log) => log.userId === query.userId)
      .filter((log) => query.conceptIds === undefined || query.conceptIds.includes(log.conceptId))
      .filter((log) => query.studyMode === undefined || log.studyMode === query.studyMode)
      .slice(0, query.limit);
  }
}

class InMemoryEventPublisher implements IEventPublisher {
  public readonly events: IEventToPublish[] = [];

  public async publish(event: IEventToPublish): Promise<void> {
    this.events.push(event);
  }

  public async publishBatch(events: IEventToPublish[]): Promise<void> {
    this.events.push(...events);
  }
}

describe('SchedulerService concept-first loop', () => {
  const userId = 'user_123456789012345678901';
  const sessionId = 'session_123456789012345678901';
  const conceptA = 'concept_123456789012345678901';
  const conceptB = 'concept_abcdefabcdefabcdefabc';
  const conceptC = 'concept_ABCDEFGHIJKLMNO123456';

  it('transitions one concept through new learning, reinforcement, and repair', async () => {
    const repository = new InMemoryConceptScheduleRepository();
    const publisher = new InMemoryEventPublisher();
    const service = new SchedulerService(repository, publisher, pino({ enabled: false }));
    const context = {
      userId,
      correlationId: 'correlation_test',
    } as const;

    const base = {
      stepId: 'step_123456789012345678901',
      sessionId,
      userId: context.userId,
      conceptRefs: [conceptC],
      reasoningQuality: 0.8,
      confidenceSignal: 0.8,
      combinedScore: 0.8,
      correct: true,
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      recordedAt: '2026-05-02T10:00:00.000Z',
    };

    const first = await service.recordEvaluation(
      {
        ...base,
        evaluationId: 'eval_123456789012345678901',
        transformation: TransformationType.RECALL,
      },
      context
    );
    expect(first[0]?.previousQueue).toBe(SchedulerQueue.NEW_LEARNING);
    expect(first[0]?.state.queue).toBe(SchedulerQueue.REINFORCEMENT);

    const second = await service.recordEvaluation(
      {
        ...base,
        evaluationId: 'eval_abcdefabcdefabcdefabc',
        stepId: 'step_abcdefabcdefabcdefabc',
        recordedAt: '2026-05-03T10:00:00.000Z',
        transformation: TransformationType.EXPLANATION,
      },
      context
    );
    expect(second[0]?.state.queue).toBe(SchedulerQueue.REINFORCEMENT);

    const third = await service.recordEvaluation(
      {
        ...base,
        evaluationId: 'eval_ABCDEFGHIJKLMNO123456',
        stepId: 'step_ABCDEFGHIJKLMNO123456',
        correct: false,
        reasoningQuality: 0.2,
        combinedScore: 0.2,
        recordedAt: '2026-05-04T10:00:00.000Z',
        transformation: TransformationType.COMPARISON,
      },
      context
    );
    expect(third[0]?.state.queue).toBe(SchedulerQueue.REPAIR);
    expect(repository.logs).toHaveLength(3);
    expect(repository.transformations.map((entry) => entry.transformation)).toEqual([
      TransformationType.RECALL,
      TransformationType.EXPLANATION,
      TransformationType.COMPARISON,
    ]);
    expect(publisher.events).toHaveLength(3);
    expect(publisher.events.at(-1)?.eventType).toBe('scheduler.concept_state.updated');
  });

  it('replays duplicate evaluations without advancing state twice', async () => {
    const repository = new InMemoryConceptScheduleRepository();
    const publisher = new InMemoryEventPublisher();
    const service = new SchedulerService(repository, publisher, pino({ enabled: false }));
    const context = {
      userId,
      correlationId: 'correlation_test',
    } as const;

    const input = {
      evaluationId: 'eval_123456789012345678901',
      stepId: 'step_123456789012345678901',
      sessionId,
      userId: context.userId,
      conceptRefs: [conceptC],
      reasoningQuality: 0.8,
      confidenceSignal: 0.8,
      combinedScore: 0.8,
      correct: true,
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      transformation: TransformationType.RECALL,
      recordedAt: '2026-05-02T10:00:00.000Z',
    };

    const first = await service.recordEvaluation(input, context);
    const replay = await service.recordEvaluation(input, context);

    expect(first[0]?.replayed).toBe(false);
    expect(replay[0]?.replayed).toBe(true);
    expect(repository.logs).toHaveLength(1);
    expect(repository.transformations).toHaveLength(1);
    expect(replay[0]?.state.reviewCount).toBe(first[0]?.state.reviewCount);
  });

  it('updates each referenced concept from one evaluation without sharing logs', async () => {
    const repository = new InMemoryConceptScheduleRepository();
    const publisher = new InMemoryEventPublisher();
    const service = new SchedulerService(repository, publisher, pino({ enabled: false }));
    const context = {
      userId,
      correlationId: 'correlation_test',
    } as const;

    const results = await service.recordEvaluation(
      {
        evaluationId: 'eval_123456789012345678901',
        stepId: 'step_123456789012345678901',
        sessionId,
        userId: context.userId,
        conceptRefs: [conceptA, conceptB],
        reasoningQuality: 0.8,
        confidenceSignal: 0.8,
        combinedScore: 0.8,
        correct: true,
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        transformation: TransformationType.RECALL,
        recordedAt: '2026-05-02T10:00:00.000Z',
      },
      context
    );

    expect(results).toHaveLength(2);
    expect(repository.logs.map((log) => log.conceptId).sort()).toEqual([conceptA, conceptB]);
    expect(repository.transformations.map((entry) => entry.conceptId).sort()).toEqual([
      conceptA,
      conceptB,
    ]);
    expect(publisher.events).toHaveLength(2);
  });

  it('does not write transformation history when metadata is absent', async () => {
    const repository = new InMemoryConceptScheduleRepository();
    const publisher = new InMemoryEventPublisher();
    const service = new SchedulerService(repository, publisher, pino({ enabled: false }));
    const context = {
      userId,
      correlationId: 'correlation_test',
    } as const;

    const results = await service.recordEvaluation(
      {
        evaluationId: 'eval_123456789012345678901',
        stepId: 'step_123456789012345678901',
        sessionId,
        userId: context.userId,
        conceptRefs: [conceptC],
        reasoningQuality: 0.8,
        confidenceSignal: 0.8,
        combinedScore: 0.8,
        correct: true,
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        recordedAt: '2026-05-02T10:00:00.000Z',
      },
      context
    );

    expect(results[0]?.state.conceptId).toBe(conceptC);
    expect(repository.logs).toHaveLength(1);
    expect(repository.transformations).toHaveLength(0);
  });

  it('projects calibration cadence and drill history without raw drill records', async () => {
    const repository = new InMemoryConceptScheduleRepository();
    const publisher = new InMemoryEventPublisher();
    const service = new SchedulerService(repository, publisher, pino({ enabled: false }));
    const context = {
      userId,
      correlationId: 'correlation_test',
    } as const;

    await service.recordEvaluation(
      {
        evaluationId: 'eval_123456789012345678901',
        stepId: 'step_123456789012345678901',
        sessionId,
        userId: context.userId,
        conceptRefs: [conceptC],
        reasoningQuality: 0.2,
        confidenceSignal: 0.9,
        combinedScore: 0.2,
        correct: false,
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        recordedAt: '2026-05-02T10:00:00.000Z',
      },
      context
    );

    const projection = await service.getConceptCalibrationProjection(
      context.userId,
      conceptC,
      StudyMode.KNOWLEDGE_GAINING
    );
    const drills = await service.getPriorCalibrationDrillHistory(context, {
      conceptIds: [conceptC],
      studyMode: StudyMode.KNOWLEDGE_GAINING,
    });
    const cadence = await service.getInterventionCadenceState(context, {
      conceptIds: [conceptC],
      surfaces: ['calibration_coach'],
    });

    expect(projection.scheduleProjectionText).toContain('repair queue');
    expect(drills.lastDrillOutcomeText).toContain('again');
    expect(cadence.coachingFrequencyBudgetText).toContain('two notes per session');
  });
});

function key(userId: string, conceptId: string, studyMode: string): string {
  return `${userId}:${conceptId}:${studyMode}`;
}

function snapshot(state: IConceptScheduleState): Record<string, unknown> {
  return {
    queue: state.queue,
    dueAt: state.dueAt,
    reviewCount: state.reviewCount,
    lapseCount: state.lapseCount,
    consecutiveCorrect: state.consecutiveCorrect,
    intervalDays: state.intervalDays,
  };
}
