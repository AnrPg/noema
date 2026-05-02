import {
  SchedulerLearningEventType,
  type ISchedulerConceptStateUpdatedPayload,
} from '@noema/events';
import type { IEventPublisher } from '@noema/events/publisher';
import { SchedulingAlgorithm, SchedulerQueue, SchedulerRating, StudyMode } from '@noema/types';
import { randomUUID } from 'node:crypto';
import type pino from 'pino';

import { applyFSRSEvaluation } from './algorithms/fsrs.js';
import { applyHLREvaluation } from './algorithms/hlr.js';
import { applyLeitnerEvaluation } from './algorithms/leitner.js';
import { applySM2Evaluation } from './algorithms/sm2.js';
import type { IConceptScheduleRepository } from './scheduler.repository.js';
import {
  EvaluationRecordedInputSchema,
  GetDueConceptsQuerySchema,
  GetTransformationHistoryQuerySchema,
} from './scheduler.schemas.js';
import type {
  IConceptEvaluationLog,
  IConceptScheduleResult,
  IConceptScheduleState,
  IConceptTransformationHistory,
  IDueConceptQuery,
  IExecutionContext,
  IEvaluationRecordedInput,
  SchedulerRating as LocalSchedulerRating,
} from '../../types/scheduler.types.js';

export class SchedulerService {
  public constructor(
    private readonly repository: IConceptScheduleRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: pino.Logger
  ) {}

  public async recordEvaluation(
    rawInput: unknown,
    context: IExecutionContext
  ): Promise<IConceptScheduleResult[]> {
    const parsed = EvaluationRecordedInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(`Invalid evaluation payload: ${parsed.error.message}`);
    }

    const studyMode = (parsed.data.studyMode ?? StudyMode.KNOWLEDGE_GAINING) as NonNullable<
      IEvaluationRecordedInput['studyMode']
    >;
    const input: IEvaluationRecordedInput = {
      evaluationId: parsed.data.evaluationId as IEvaluationRecordedInput['evaluationId'],
      stepId: parsed.data.stepId as IEvaluationRecordedInput['stepId'],
      sessionId: parsed.data.sessionId as IEvaluationRecordedInput['sessionId'],
      userId: parsed.data.userId as IEvaluationRecordedInput['userId'],
      conceptRefs: parsed.data.conceptRefs as IEvaluationRecordedInput['conceptRefs'],
      reasoningQuality: parsed.data.reasoningQuality,
      confidenceSignal: parsed.data.confidenceSignal,
      combinedScore: parsed.data.combinedScore,
      correct: parsed.data.correct,
      studyMode,
      ...(parsed.data.recordedAt !== undefined ? { recordedAt: parsed.data.recordedAt } : {}),
      ...(parsed.data.transformation !== undefined
        ? {
            transformation: parsed.data.transformation as NonNullable<
              IEvaluationRecordedInput['transformation']
            >,
          }
        : {}),
    };
    const reviewedAt = input.recordedAt ?? new Date().toISOString();
    const inputStudyMode = input.studyMode ?? StudyMode.KNOWLEDGE_GAINING;

    const results: IConceptScheduleResult[] = [];
    for (const conceptId of input.conceptRefs) {
      const existing = await this.repository.findState(input.userId, conceptId, inputStudyMode);
      const prior = existing ?? this.initialState(input, conceptId, reviewedAt);
      const rating = ratingFromEvaluation(input);
      const next = this.applyEvaluation(prior, input, rating, reviewedAt);

      const patch = {
        algorithm: next.algorithm,
        queue: next.queue,
        dueAt: next.dueAt,
        stability: next.stability,
        difficulty: next.difficulty,
        halfLife: next.halfLife,
        intervalDays: next.intervalDays,
        reviewCount: next.reviewCount,
        lapseCount: next.lapseCount,
        consecutiveCorrect: next.consecutiveCorrect,
        lastEvaluationId: input.evaluationId,
        lastStepId: input.stepId,
        version: prior.version + 1,
      };

      const log: IConceptEvaluationLog = {
        id: `cel_${randomUUID()}`,
        userId: input.userId,
        conceptId,
        studyMode: inputStudyMode,
        evaluationId: input.evaluationId,
        stepId: input.stepId,
        algorithm: next.algorithm,
        schedulerRating: rating,
        combinedScore: input.combinedScore,
        priorState: snapshot(prior),
        newState: snapshot({ ...prior, ...patch }),
        reviewedAt,
      };
      const transition = await this.repository.recordEvaluationTransition({
        priorState: prior,
        patch,
        log,
        ...(input.transformation !== undefined
          ? {
              transformationHistory: {
                userId: input.userId,
                conceptId,
                studyMode: inputStudyMode,
                transformation: input.transformation,
                usedAt: reviewedAt,
                evaluationId: input.evaluationId,
              },
            }
          : {}),
      });

      await this.publishConceptStateUpdated(transition.state, prior.queue, input, context);
      results.push({
        state: transition.state,
        previousQueue: prior.queue,
        log: transition.log,
        replayed: transition.replayed,
      });
    }

    this.logger.info(
      { evaluationId: input.evaluationId, conceptCount: results.length },
      'Updated concept schedule state from evaluation'
    );
    return results;
  }

  public async getConceptSchedule(
    userId: IExecutionContext['userId'],
    conceptId: IConceptScheduleState['conceptId'],
    studyMode: IConceptScheduleState['studyMode'] = StudyMode.KNOWLEDGE_GAINING
  ): Promise<IConceptScheduleState | null> {
    return this.repository.findState(userId, conceptId, studyMode);
  }

  public async getDueConcepts(
    rawQuery: unknown,
    context: IExecutionContext
  ): Promise<IConceptScheduleState[]> {
    const query = GetDueConceptsQuerySchema.parse(rawQuery);
    const dueQuery: IDueConceptQuery = {
      userId: context.userId,
      ...(query.studyMode !== undefined
        ? { studyMode: query.studyMode as NonNullable<IEvaluationRecordedInput['studyMode']> }
        : {}),
      ...(query.queue !== undefined
        ? { queue: query.queue as IConceptScheduleState['queue'] }
        : {}),
      asOf: query.asOf ?? new Date().toISOString(),
      limit: query.limit,
    };
    return this.repository.findDueConcepts(dueQuery);
  }

  public async getTransformationHistory(
    rawQuery: unknown,
    context: IExecutionContext,
    conceptId: IConceptScheduleState['conceptId']
  ): Promise<IConceptTransformationHistory[]> {
    const query = GetTransformationHistoryQuerySchema.parse(rawQuery);
    const historyQuery = {
      userId: context.userId,
      conceptId,
      ...(query.studyMode !== undefined
        ? { studyMode: query.studyMode as NonNullable<IEvaluationRecordedInput['studyMode']> }
        : {}),
      limit: query.limit,
    };
    return this.repository.findTransformationHistory(historyQuery);
  }

  private initialState(
    input: IEvaluationRecordedInput,
    conceptId: IConceptScheduleState['conceptId'],
    now: string
  ): IConceptScheduleState {
    return {
      userId: input.userId,
      conceptId,
      studyMode: input.studyMode ?? StudyMode.KNOWLEDGE_GAINING,
      algorithm: SchedulingAlgorithm.FSRS,
      queue: SchedulerQueue.NEW_LEARNING,
      dueAt: now,
      stability: null,
      difficulty: null,
      halfLife: null,
      intervalDays: 0,
      reviewCount: 0,
      lapseCount: 0,
      consecutiveCorrect: 0,
      lastEvaluationId: null,
      lastStepId: null,
      suspendedUntil: null,
      suspendedReason: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };
  }

  private applyEvaluation(
    prior: IConceptScheduleState,
    input: IEvaluationRecordedInput,
    rating: LocalSchedulerRating,
    reviewedAt: string
  ): IConceptScheduleState {
    const elapsedDays = daysBetween(prior.updatedAt, reviewedAt);
    const reviewCount = prior.reviewCount + 1;
    const lapseCount = rating === SchedulerRating.AGAIN ? prior.lapseCount + 1 : prior.lapseCount;
    const consecutiveCorrect = rating === SchedulerRating.AGAIN ? 0 : prior.consecutiveCorrect + 1;

    const algorithm = prior.algorithm;
    let stability = prior.stability;
    let difficulty = prior.difficulty;
    let halfLife = prior.halfLife;
    let intervalDays = prior.intervalDays;

    if (algorithm === SchedulingAlgorithm.FSRS) {
      const next = applyFSRSEvaluation({
        rating,
        elapsedDays,
        reviewCount: prior.reviewCount,
        stability,
        difficulty,
        intervalDays,
      });
      stability = next.stability;
      difficulty = next.difficulty;
      intervalDays = next.intervalDays;
    } else if (algorithm === SchedulingAlgorithm.HLR) {
      const next = applyHLREvaluation({
        rating,
        elapsedDays,
        reviewCount,
        lapseCount,
        consecutiveCorrect,
        halfLife,
        combinedScore: input.combinedScore,
      });
      halfLife = next.halfLife;
      intervalDays = next.intervalDays;
    } else if (algorithm === SchedulingAlgorithm.SM2) {
      const next = applySM2Evaluation({
        rating,
        easeFactor: difficulty,
        intervalDays,
        reviewCount: prior.reviewCount,
      });
      difficulty = next.easeFactor;
      intervalDays = next.intervalDays;
    } else {
      const next = applyLeitnerEvaluation({
        rating,
        box: halfLife,
      });
      halfLife = next.box;
      intervalDays = next.intervalDays;
    }

    const dueAt = addDays(reviewedAt, intervalDays).toISOString();
    return {
      ...prior,
      algorithm,
      queue: queueFromEvaluation(prior.queue, rating),
      dueAt,
      stability,
      difficulty,
      halfLife,
      intervalDays,
      reviewCount,
      lapseCount,
      consecutiveCorrect,
      lastEvaluationId: input.evaluationId,
      lastStepId: input.stepId,
      updatedAt: reviewedAt,
      version: prior.version + 1,
    };
  }

  private async publishConceptStateUpdated(
    state: IConceptScheduleState,
    previousQueue: IConceptScheduleState['queue'],
    input: IEvaluationRecordedInput,
    context: IExecutionContext
  ): Promise<void> {
    const payload: ISchedulerConceptStateUpdatedPayload = {
      userId: state.userId,
      conceptId: state.conceptId,
      studyMode: state.studyMode,
      previousQueue,
      queue: state.queue,
      dueAt: state.dueAt,
      evaluationId: input.evaluationId,
      stepId: input.stepId,
      reviewCount: state.reviewCount,
      intervalDays: state.intervalDays,
      ...(state.stability !== null ? { stability: state.stability } : {}),
      ...(state.halfLife !== null ? { halfLife: state.halfLife } : {}),
    };
    await this.eventPublisher.publish({
      eventType: SchedulerLearningEventType.SCHEDULER_CONCEPT_STATE_UPDATED,
      aggregateType: 'ConceptScheduleState',
      aggregateId: `${state.userId}:${state.conceptId}:${state.studyMode}`,
      payload,
      metadata: { correlationId: context.correlationId, userId: state.userId },
    });
  }
}

function ratingFromEvaluation(input: IEvaluationRecordedInput): LocalSchedulerRating {
  if (!input.correct || input.combinedScore < 0.3 || input.reasoningQuality < 0.3) {
    return SchedulerRating.AGAIN;
  }
  if (input.combinedScore < 0.5) return SchedulerRating.HARD;
  if (input.combinedScore > 0.85 && input.reasoningQuality > 0.7) return SchedulerRating.EASY;
  return SchedulerRating.GOOD;
}

function queueFromEvaluation(
  priorQueue: IConceptScheduleState['queue'],
  rating: LocalSchedulerRating
): IConceptScheduleState['queue'] {
  if (rating === SchedulerRating.AGAIN) return SchedulerQueue.REPAIR;
  if (priorQueue === SchedulerQueue.NEW_LEARNING) return SchedulerQueue.REINFORCEMENT;
  return SchedulerQueue.REINFORCEMENT;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / 86_400_000);
}

function addDays(fromIso: string, days: number): Date {
  const date = new Date(fromIso);
  date.setTime(date.getTime() + Math.max(0, days) * 86_400_000);
  return date;
}

function snapshot(state: IConceptScheduleState): Record<string, unknown> {
  return {
    queue: state.queue,
    algorithm: state.algorithm,
    dueAt: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    halfLife: state.halfLife,
    intervalDays: state.intervalDays,
    reviewCount: state.reviewCount,
    lapseCount: state.lapseCount,
    consecutiveCorrect: state.consecutiveCorrect,
    version: state.version,
  };
}
