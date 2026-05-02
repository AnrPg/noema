import { StudyMode, type ConceptId, type EvaluationId, type UserId } from '@noema/types';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type { IMetacognitionRepository } from '../../domain/metacognition-service/metacognition.repository.js';
import type {
  IEvaluation,
  IReasoningAverage,
  ITrigger,
} from '../../domain/metacognition-service/types.js';

type EvaluationRecord = Awaited<ReturnType<PrismaClient['evaluation']['findUnique']>>;
type TriggerRecord = Awaited<ReturnType<PrismaClient['trigger']['findFirst']>>;

export class PrismaMetacognitionRepository implements IMetacognitionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findEvaluationByStepId(stepId: string): Promise<IEvaluation | null> {
    const record = await this.prisma.evaluation.findUnique({
      where: { stepId },
      include: { triggers: true },
    });
    return record === null
      ? null
      : this.toEvaluation(
          record,
          record.triggers.map((trigger) => trigger.id)
        );
  }

  public async createEvaluationWithTriggers(
    evaluation: IEvaluation,
    triggers: ITrigger[]
  ): Promise<{ evaluation: IEvaluation; triggers: ITrigger[] }> {
    await this.prisma.evaluation.create({
      data: {
        id: evaluation.id,
        stepId: evaluation.stepId,
        lessonPlanId: evaluation.lessonPlanId,
        sessionId: evaluation.sessionId,
        userId: evaluation.userId,
        conceptRefs: evaluation.conceptRefs,
        correct: evaluation.correct,
        selfRating: evaluation.selfRating,
        reasoningQuality: evaluation.reasoningQuality,
        confidenceSignal: evaluation.confidenceSignal,
        combinedScore: evaluation.combinedScore,
        schedulerRating: evaluation.schedulerRating,
        trace: evaluation.trace as unknown as Prisma.InputJsonValue,
        errorType: evaluation.errorType ?? null,
        misconceptionRef: evaluation.misconceptionRef ?? null,
        recommendedAction: evaluation.recommendedAction,
        responseTimeMs: evaluation.responseTimeMs ?? null,
        studyMode: evaluation.studyMode,
        transformation: evaluation.transformation ?? null,
        triggers: {
          create: triggers.map((trigger) => ({
            id: trigger.id,
            userId: trigger.userId,
            type: trigger.type,
            severity: trigger.severity,
            detectedFrom: trigger.detectedFrom,
            conceptRefs: trigger.conceptRefs,
            stepId: trigger.stepId,
            sessionId: trigger.sessionId,
            recommendedIntervention: trigger.recommendedIntervention,
            status: trigger.status,
          })),
        },
      },
    });
    return { evaluation, triggers };
  }

  public async updateReasoningAverage(params: {
    userId: UserId;
    conceptId: ConceptId;
    studyMode: StudyMode;
    evaluationId: EvaluationId;
    windowSize: number;
  }): Promise<IReasoningAverage> {
    const recent = await this.prisma.evaluation.findMany({
      where: {
        userId: params.userId,
        conceptRefs: { has: params.conceptId },
        studyMode: params.studyMode,
      },
      orderBy: { createdAt: 'desc' },
      take: params.windowSize,
    });
    const average =
      recent.reduce((total, evaluation) => total + evaluation.reasoningQuality, 0) /
      Math.max(1, recent.length);
    const record = await this.prisma.conceptReasoningAverage.upsert({
      where: {
        userId_conceptId_studyMode: {
          userId: params.userId,
          conceptId: params.conceptId,
          studyMode: params.studyMode,
        },
      },
      update: {
        average: Number(average.toFixed(4)),
        sampleCount: recent.length,
        windowSize: params.windowSize,
        latestEvaluation: params.evaluationId,
      },
      create: {
        id: `${params.userId}:${params.conceptId}:${params.studyMode}`,
        userId: params.userId,
        conceptId: params.conceptId,
        studyMode: params.studyMode,
        average: Number(average.toFixed(4)),
        sampleCount: recent.length,
        windowSize: params.windowSize,
        latestEvaluation: params.evaluationId,
      },
    });
    return {
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: record.studyMode as StudyMode,
      average: record.average,
      sampleCount: record.sampleCount,
      windowSize: record.windowSize,
      ...(record.latestEvaluation !== null
        ? { latestEvaluation: record.latestEvaluation as EvaluationId }
        : {}),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  public async getReasoningAverage(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING
  ): Promise<IReasoningAverage | null> {
    const record = await this.prisma.conceptReasoningAverage.findUnique({
      where: { userId_conceptId_studyMode: { userId, conceptId, studyMode } },
    });
    if (record === null) return null;
    return {
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: record.studyMode as StudyMode,
      average: record.average,
      sampleCount: record.sampleCount,
      windowSize: record.windowSize,
      ...(record.latestEvaluation !== null
        ? { latestEvaluation: record.latestEvaluation as EvaluationId }
        : {}),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toEvaluation(record: NonNullable<EvaluationRecord>, triggerIds: string[]): IEvaluation {
    const evaluation: IEvaluation = {
      id: record.id as IEvaluation['id'],
      stepId: record.stepId as IEvaluation['stepId'],
      lessonPlanId: record.lessonPlanId as IEvaluation['lessonPlanId'],
      sessionId: record.sessionId as IEvaluation['sessionId'],
      userId: record.userId as IEvaluation['userId'],
      conceptRefs: record.conceptRefs as IEvaluation['conceptRefs'],
      correct: record.correct,
      selfRating: record.selfRating as IEvaluation['selfRating'],
      reasoningQuality: record.reasoningQuality,
      confidenceSignal: record.confidenceSignal,
      combinedScore: record.combinedScore,
      schedulerRating: record.schedulerRating as IEvaluation['schedulerRating'],
      trace: record.trace as unknown as IEvaluation['trace'],
      ...(record.errorType !== null ? { errorType: record.errorType } : {}),
      ...(record.misconceptionRef !== null ? { misconceptionRef: record.misconceptionRef } : {}),
      triggersFired: triggerIds as IEvaluation['triggersFired'],
      recommendedAction: record.recommendedAction,
      ...(record.responseTimeMs !== null ? { responseTimeMs: record.responseTimeMs } : {}),
      studyMode: record.studyMode as IEvaluation['studyMode'],
      createdAt: record.createdAt.toISOString(),
    };
    if (record.transformation !== null) {
      evaluation.transformation = record.transformation as NonNullable<
        IEvaluation['transformation']
      >;
    }
    return evaluation;
  }
}

export type { TriggerRecord };
