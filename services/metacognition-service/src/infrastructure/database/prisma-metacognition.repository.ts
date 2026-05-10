import { StudyMode, type ConceptId, type EvaluationId, type UserId } from '@noema/types';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type { IMetacognitionRepository } from '../../domain/metacognition-service/metacognition.repository.js';
import type {
  IEvaluation,
  IReasoningAverage,
  ITrigger,
} from '../../domain/metacognition-service/types.js';

type EvaluationRecord = Awaited<ReturnType<PrismaClient['evaluation']['findUnique']>>;
type TriggerRecord = Awaited<ReturnType<PrismaClient['metacognitiveTrigger']['findFirst']>>;

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
        selectedNodeIds: evaluation.selectedNodeIds,
        correct: evaluation.correct,
        correctnessScore: evaluation.correctnessScore,
        selfRating: evaluation.selfRating,
        reasoningQuality: evaluation.reasoningQuality,
        confidenceSignal: evaluation.confidenceSignal,
        combinedScore: evaluation.combinedScore,
        schedulerRating: evaluation.schedulerRating,
        trace: evaluation.trace as unknown as Prisma.InputJsonValue,
        errorType: evaluation.errorType ?? null,
        misconceptionRef: evaluation.misconceptionRef ?? null,
        recommendedAction: evaluation.recommendedAction ?? null,
        responseTimeMs: evaluation.responseTimeMs,
        hintRequestCount: evaluation.hintRequestCount,
        revisionCount: evaluation.revisionCount,
        studyMode: evaluation.studyMode,
        epistemicMode: evaluation.epistemicMode,
        transformation: evaluation.transformation ?? null,
        triggerIds: triggers.map((trigger) => trigger.id),
        triggers: {
          create: triggers.map((trigger) => ({
            id: trigger.id,
            userId: trigger.userId,
            type: trigger.type,
            severity: trigger.severity,
            detectedFromFrames: trigger.detectedFromFrames,
            conceptRefs: trigger.conceptRefs,
            stepId: trigger.stepId ?? null,
            sessionId: trigger.sessionId ?? null,
            misconceptionRef: trigger.misconceptionRef,
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
    const existing = await this.prisma.conceptReasoningRollup.findUnique({
      where: {
        userId_conceptId_studyMode: {
          userId: params.userId,
          conceptId: params.conceptId,
          studyMode: params.studyMode,
        },
      },
    });
    const recentEvaluationIds = [
      params.evaluationId,
      ...(existing?.recentEvaluationIds ?? []).filter((id) => id !== params.evaluationId),
    ].slice(0, params.windowSize);
    const recent = await this.prisma.evaluation.findMany({
      where: {
        id: { in: recentEvaluationIds },
        userId: params.userId,
        conceptRefs: { has: params.conceptId },
        studyMode: params.studyMode,
      },
      orderBy: { createdAt: 'desc' },
    });
    const average =
      recent.reduce((total, evaluation) => total + evaluation.reasoningQuality, 0) /
      Math.max(1, recent.length);
    const lastEvaluationAt = recent[0]?.createdAt ?? new Date();
    const record = await this.prisma.conceptReasoningRollup.upsert({
      where: {
        userId_conceptId_studyMode: {
          userId: params.userId,
          conceptId: params.conceptId,
          studyMode: params.studyMode,
        },
      },
      update: {
        averageReasoning: Number(average.toFixed(4)),
        sampleCount: recent.length,
        windowSize: params.windowSize,
        lastEvaluationAt,
        recentEvaluationIds: recent.map((evaluation) => evaluation.id),
      },
      create: {
        userId: params.userId,
        conceptId: params.conceptId,
        studyMode: params.studyMode,
        averageReasoning: Number(average.toFixed(4)),
        sampleCount: recent.length,
        windowSize: params.windowSize,
        lastEvaluationAt,
        recentEvaluationIds: recent.map((evaluation) => evaluation.id),
      },
    });
    return {
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: record.studyMode as StudyMode,
      averageReasoning: record.averageReasoning,
      sampleCount: record.sampleCount,
      windowSize: record.windowSize,
      lastEvaluationAt: record.lastEvaluationAt.toISOString(),
      recentEvaluationIds: record.recentEvaluationIds as EvaluationId[],
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  public async getReasoningAverage(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING
  ): Promise<IReasoningAverage | null> {
    const record = await this.prisma.conceptReasoningRollup.findUnique({
      where: { userId_conceptId_studyMode: { userId, conceptId, studyMode } },
    });
    if (record === null) return null;
    return {
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: record.studyMode as StudyMode,
      averageReasoning: record.averageReasoning,
      sampleCount: record.sampleCount,
      windowSize: record.windowSize,
      lastEvaluationAt: record.lastEvaluationAt.toISOString(),
      recentEvaluationIds: record.recentEvaluationIds as EvaluationId[],
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  public async findRecentEvaluations(query: {
    userId: UserId;
    conceptIds?: ConceptId[];
    studyMode?: StudyMode;
    since?: string;
    limit: number;
  }): Promise<IEvaluation[]> {
    const records = await this.prisma.evaluation.findMany({
      where: {
        userId: query.userId,
        ...(query.conceptIds !== undefined && query.conceptIds.length > 0
          ? { conceptRefs: { hasSome: query.conceptIds } }
          : {}),
        ...(query.studyMode !== undefined ? { studyMode: query.studyMode } : {}),
        ...(query.since !== undefined ? { createdAt: { gte: new Date(query.since) } } : {}),
      },
      include: { triggers: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return records.map((record) =>
      this.toEvaluation(
        record,
        record.triggers.map((trigger) => trigger.id)
      )
    );
  }

  private toEvaluation(record: NonNullable<EvaluationRecord>, triggerIds: string[]): IEvaluation {
    const evaluation: IEvaluation = {
      id: record.id as IEvaluation['id'],
      stepId: record.stepId as IEvaluation['stepId'],
      lessonPlanId: record.lessonPlanId as IEvaluation['lessonPlanId'],
      sessionId: record.sessionId as IEvaluation['sessionId'],
      userId: record.userId as IEvaluation['userId'],
      conceptRefs: record.conceptRefs as IEvaluation['conceptRefs'],
      selectedNodeIds: record.selectedNodeIds as IEvaluation['selectedNodeIds'],
      correct: record.correct,
      correctnessScore: record.correctnessScore,
      selfRating: record.selfRating as IEvaluation['selfRating'],
      reasoningQuality: record.reasoningQuality,
      confidenceSignal: record.confidenceSignal,
      combinedScore: record.combinedScore,
      schedulerRating: record.schedulerRating as IEvaluation['schedulerRating'],
      trace: record.trace as unknown as IEvaluation['trace'],
      ...(record.errorType !== null ? { errorType: record.errorType } : {}),
      ...(record.misconceptionRef !== null ? { misconceptionRef: record.misconceptionRef } : {}),
      triggersFired: (record.triggerIds.length > 0
        ? record.triggerIds
        : triggerIds) as IEvaluation['triggersFired'],
      ...(record.recommendedAction !== null ? { recommendedAction: record.recommendedAction } : {}),
      responseTimeMs: record.responseTimeMs,
      hintRequestCount: record.hintRequestCount,
      revisionCount: record.revisionCount,
      studyMode: record.studyMode as IEvaluation['studyMode'],
      epistemicMode: record.epistemicMode as IEvaluation['epistemicMode'],
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
