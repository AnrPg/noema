import type { IEventPublisher } from '@noema/events/publisher';
import {
  MetacognitionEventType,
  type IMetacognitionEvaluationRecordedPayload,
  type IMetacognitionTriggerFiredPayload,
  type IReasoningAverageUpdatedPayload,
} from '@noema/events';
import {
  SELF_RATING_TO_CONFIDENCE,
  StudyMode,
  TriggerStatus,
  type ConceptId,
  type CorrelationId,
  type EvaluationId,
  type TriggerId,
  type UserId,
} from '@noema/types';
import { customAlphabet } from 'nanoid';
import type pino from 'pino';

import { combineSignals, DEFAULT_COMBINE_SIGNAL_CONFIG } from './combine-signals.js';
import { ValidationError } from './errors.js';
import { ratingFromCombinedScore } from './fsrs-rating.js';
import type { IMetacognitionRepository } from './metacognition.repository.js';
import { RecordEvaluationInputSchema } from './metacognition.schemas.js';
import { scoreReasoningQuality } from './reasoning-quality.js';
import { evaluateTriggerRules } from './triggers/index.js';
import type {
  IEvaluation,
  IRecordEvaluationInput,
  IRecordEvaluationResult,
  ITrigger,
} from './types.js';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21);

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
}

export interface IMetacognitionServiceConfig {
  reasoningAverageWindowSize: number;
}

export class MetacognitionService {
  public constructor(
    private readonly repository: IMetacognitionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: pino.Logger,
    private readonly config: IMetacognitionServiceConfig = { reasoningAverageWindowSize: 10 }
  ) {}

  public async recordEvaluation(
    rawInput: unknown,
    context: IExecutionContext
  ): Promise<IRecordEvaluationResult> {
    const parsed = RecordEvaluationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError('Invalid evaluation payload', parsed.error.flatten());
    }

    const input = {
      ...parsed.data,
      userId: parsed.data.userId ?? context.userId,
    } as IRecordEvaluationInput;

    const existing = await this.repository.findEvaluationByStepId(input.stepId);
    if (existing !== null) {
      const studyMode = existing.studyMode;
      const reasoningAverages = await Promise.all(
        existing.conceptRefs.map((conceptId) =>
          this.repository.getReasoningAverage(existing.userId, conceptId, studyMode)
        )
      );
      return {
        evaluation: existing,
        triggers: [],
        reasoningAverages: reasoningAverages.filter((average) => average !== null),
      };
    }

    const evaluationId = input.evaluationId ?? (`eval_${nanoid()}` as EvaluationId);
    const reasoningResult = scoreReasoningQuality(input.trace);
    const confidenceSignal = SELF_RATING_TO_CONFIDENCE[input.selfRating];
    const combinedScore = combineSignals(
      reasoningResult.reasoningQuality,
      confidenceSignal,
      DEFAULT_COMBINE_SIGNAL_CONFIG
    );
    const schedulerRating = ratingFromCombinedScore(combinedScore);

    const triggerCandidates = evaluateTriggerRules({
      evaluationId,
      userId: input.userId,
      stepId: input.stepId,
      sessionId: input.sessionId,
      conceptRefs: input.conceptRefs,
      correct: input.correct,
      selfRating: input.selfRating,
      reasoningQuality: reasoningResult.reasoningQuality,
      confidenceSignal,
      combinedScore,
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      ...(input.misconceptionRef !== undefined ? { misconceptionRef: input.misconceptionRef } : {}),
      ...(input.responseTimeMs !== undefined ? { responseTimeMs: input.responseTimeMs } : {}),
      recentFailures: input.recentFailures ?? 0,
      prerequisiteGapConceptIds: input.prerequisiteGapConceptIds ?? [],
    });

    const now = new Date().toISOString();
    const studyMode = input.studyMode;
    const triggers: ITrigger[] = triggerCandidates.map((candidate) => ({
      id: `trigger_${nanoid()}` as TriggerId,
      evaluationId,
      userId: input.userId,
      type: candidate.type,
      severity: candidate.severity,
      detectedFromFrames: candidate.detectedFrom,
      conceptRefs: candidate.conceptRefs,
      stepId: input.stepId,
      sessionId: input.sessionId,
      misconceptionRef: input.misconceptionRef ?? `trigger:${candidate.type}`,
      recommendedIntervention: candidate.recommendedIntervention,
      status: TriggerStatus.OPEN,
      createdAt: now,
      updatedAt: now,
    }));

    const evaluation: IEvaluation = {
      id: evaluationId,
      stepId: input.stepId,
      lessonPlanId: input.lessonPlanId,
      sessionId: input.sessionId,
      userId: input.userId,
      conceptRefs: input.conceptRefs,
      correct: input.correct,
      correctnessScore: input.correct ? 1 : 0,
      selfRating: input.selfRating,
      reasoningQuality: reasoningResult.reasoningQuality,
      confidenceSignal,
      combinedScore,
      schedulerRating,
      trace: input.trace,
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      ...(input.misconceptionRef !== undefined ? { misconceptionRef: input.misconceptionRef } : {}),
      triggersFired: triggers.map((trigger) => trigger.id),
      recommendedAction: this.recommendAction(triggers),
      responseTimeMs: input.responseTimeMs ?? 0,
      hintRequestCount: input.hintRequestCount ?? 0,
      revisionCount: input.revisionCount ?? 0,
      studyMode,
      epistemicMode: input.epistemicMode,
      ...(input.transformation !== undefined ? { transformation: input.transformation } : {}),
      createdAt: now,
    };

    const persisted = await this.repository.createEvaluationWithTriggers(evaluation, triggers);
    const reasoningAverages = await Promise.all(
      input.conceptRefs.map((conceptId) =>
        this.repository.updateReasoningAverage({
          userId: input.userId,
          conceptId,
          studyMode,
          evaluationId,
          windowSize: this.config.reasoningAverageWindowSize,
        })
      )
    );

    await this.publishEvents(persisted.evaluation, persisted.triggers, reasoningAverages, context);
    this.logger.info(
      {
        evaluationId,
        triggerCount: triggers.length,
        conceptCount: input.conceptRefs.length,
      },
      'Recorded metacognition evaluation'
    );

    return { ...persisted, reasoningAverages };
  }

  public async getReasoningAverage(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING
  ): Promise<ReturnType<IMetacognitionRepository['getReasoningAverage']>> {
    return this.repository.getReasoningAverage(userId, conceptId, studyMode);
  }

  private recommendAction(triggers: ITrigger[]): string {
    if (triggers.length === 0) return 'continue';
    const highest = [...triggers].sort((a, b) => b.severity - a.severity)[0];
    return highest?.recommendedIntervention ?? 'continue';
  }

  private async publishEvents(
    evaluation: IEvaluation,
    triggers: ITrigger[],
    reasoningAverages: IRecordEvaluationResult['reasoningAverages'],
    context: IExecutionContext
  ): Promise<void> {
    const evaluationPayload: IMetacognitionEvaluationRecordedPayload = {
      evaluationId: evaluation.id,
      stepId: evaluation.stepId,
      sessionId: evaluation.sessionId,
      userId: evaluation.userId,
      conceptRefs: evaluation.conceptRefs,
      reasoningQuality: evaluation.reasoningQuality,
      confidenceSignal: evaluation.confidenceSignal,
      combinedScore: evaluation.combinedScore,
      correct: evaluation.correct,
      studyMode: evaluation.studyMode,
      epistemicMode: evaluation.epistemicMode,
      ...(evaluation.transformation !== undefined
        ? { transformation: evaluation.transformation }
        : {}),
    };

    const events = [
      {
        eventType: MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED,
        aggregateType: 'Evaluation',
        aggregateId: evaluation.id,
        payload: evaluationPayload,
        metadata: { correlationId: context.correlationId, userId: evaluation.userId },
      },
      ...reasoningAverages.map((average) => {
        const payload: IReasoningAverageUpdatedPayload = {
          userId: average.userId,
          conceptId: average.conceptId,
          studyMode: average.studyMode,
          newAverage: average.averageReasoning,
          windowSize: average.windowSize,
        };
        return {
          eventType: MetacognitionEventType.REASONING_AVERAGE_UPDATED,
          aggregateType: 'ConceptReasoningRollup',
          aggregateId: `${average.userId}:${average.conceptId}:${average.studyMode}`,
          payload,
          metadata: { correlationId: context.correlationId, userId: average.userId },
        };
      }),
      ...triggers.map((trigger) => {
        const payload: IMetacognitionTriggerFiredPayload = {
          triggerId: trigger.id,
          userId: trigger.userId,
          type: trigger.type,
          severity: trigger.severity,
          conceptRefs: trigger.conceptRefs,
          stepId: trigger.stepId as NonNullable<typeof trigger.stepId>,
          sessionId: trigger.sessionId as NonNullable<typeof trigger.sessionId>,
          recommendedIntervention: trigger.recommendedIntervention,
        };
        return {
          eventType: MetacognitionEventType.METACOGNITION_TRIGGER_FIRED,
          aggregateType: 'Trigger',
          aggregateId: trigger.id,
          payload,
          metadata: { correlationId: context.correlationId, userId: trigger.userId },
        };
      }),
    ];

    await this.eventPublisher.publishBatch(events);
  }
}
