import type {
  ConceptEvaluationLog as PrismaConceptEvaluationLog,
  ConceptScheduleState as PrismaConceptScheduleState,
  ConceptTransformationHistory as PrismaConceptTransformationHistory,
  Prisma,
  PrismaClient,
} from '../../../generated/prisma/index.js';
import type { IConceptScheduleRepository } from '../../domain/scheduler-service/scheduler.repository.js';
import type {
  IConceptEvaluationLog,
  IConceptSchedulePatch,
  IConceptScheduleState,
  IConceptScheduleTransitionInput,
  IConceptScheduleTransitionResult,
  IConceptTransformationHistory,
  IDueConceptQuery,
  ITransformationHistoryQuery,
  SchedulerQueue,
} from '../../types/scheduler.types.js';

export class PrismaConceptScheduleRepository implements IConceptScheduleRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findState(
    userId: IConceptScheduleState['userId'],
    conceptId: IConceptScheduleState['conceptId'],
    studyMode: IConceptScheduleState['studyMode']
  ): Promise<IConceptScheduleState | null> {
    const record = await this.prisma.conceptScheduleState.findUnique({
      where: {
        userId_conceptId_studyMode: { userId, conceptId, studyMode: toPrismaStudyMode(studyMode) },
      },
    });
    return record === null ? null : toDomainState(record);
  }

  public async upsertState(
    state: IConceptScheduleState,
    patch: IConceptSchedulePatch
  ): Promise<IConceptScheduleState> {
    const record = await this.prisma.conceptScheduleState.upsert({
      where: {
        userId_conceptId_studyMode: {
          userId: state.userId,
          conceptId: state.conceptId,
          studyMode: toPrismaStudyMode(state.studyMode),
        },
      },
      create: {
        userId: state.userId,
        conceptId: state.conceptId,
        studyMode: toPrismaStudyMode(state.studyMode),
        algorithm: toPrismaAlgorithm(patch.algorithm),
        queue: toPrismaQueue(patch.queue),
        dueAt: new Date(patch.dueAt),
        stability: patch.stability,
        difficulty: patch.difficulty,
        halfLife: patch.halfLife,
        intervalDays: patch.intervalDays,
        reviewCount: patch.reviewCount,
        lapseCount: patch.lapseCount,
        consecutiveCorrect: patch.consecutiveCorrect,
        lastEvaluationId: patch.lastEvaluationId,
        lastStepId: patch.lastStepId,
        version: patch.version,
      },
      update: {
        algorithm: toPrismaAlgorithm(patch.algorithm),
        queue: toPrismaQueue(patch.queue),
        dueAt: new Date(patch.dueAt),
        stability: patch.stability,
        difficulty: patch.difficulty,
        halfLife: patch.halfLife,
        intervalDays: patch.intervalDays,
        reviewCount: patch.reviewCount,
        lapseCount: patch.lapseCount,
        consecutiveCorrect: patch.consecutiveCorrect,
        lastEvaluationId: patch.lastEvaluationId,
        lastStepId: patch.lastStepId,
        version: { increment: 1 },
      },
    });
    return toDomainState(record);
  }

  public async createEvaluationLog(log: IConceptEvaluationLog): Promise<void> {
    await this.prisma.conceptEvaluationLog.create({
      data: {
        id: log.id,
        userId: log.userId,
        conceptId: log.conceptId,
        studyMode: toPrismaStudyMode(log.studyMode),
        evaluationId: log.evaluationId,
        stepId: log.stepId,
        algorithm: toPrismaAlgorithm(log.algorithm),
        schedulerRating: toPrismaRating(log.schedulerRating),
        combinedScore: log.combinedScore,
        priorState: log.priorState as Prisma.InputJsonObject,
        newState: log.newState as Prisma.InputJsonObject,
        reviewedAt: new Date(log.reviewedAt),
      },
    });
  }

  public async createTransformationHistory(entry: IConceptTransformationHistory): Promise<void> {
    await this.prisma.conceptTransformationHistory.create({
      data: {
        userId: entry.userId,
        conceptId: entry.conceptId,
        studyMode: toPrismaStudyMode(entry.studyMode),
        transformation: toPrismaTransformation(entry.transformation),
        usedAt: new Date(entry.usedAt),
        evaluationId: entry.evaluationId,
      },
    });
  }

  public async recordEvaluationTransition(
    input: IConceptScheduleTransitionInput
  ): Promise<IConceptScheduleTransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const studyMode = toPrismaStudyMode(input.log.studyMode);
      const existingLog = await tx.conceptEvaluationLog.findUnique({
        where: { evaluationId: input.log.evaluationId },
      });

      if (existingLog !== null) {
        const state = await tx.conceptScheduleState.findUniqueOrThrow({
          where: {
            userId_conceptId_studyMode: {
              userId: existingLog.userId,
              conceptId: existingLog.conceptId,
              studyMode: existingLog.studyMode,
            },
          },
        });
        return {
          state: toDomainState(state),
          log: toDomainLog(existingLog),
          replayed: true,
        };
      }

      const state = await tx.conceptScheduleState.upsert({
        where: {
          userId_conceptId_studyMode: {
            userId: input.priorState.userId,
            conceptId: input.priorState.conceptId,
            studyMode: toPrismaStudyMode(input.priorState.studyMode),
          },
        },
        create: {
          userId: input.priorState.userId,
          conceptId: input.priorState.conceptId,
          studyMode: toPrismaStudyMode(input.priorState.studyMode),
          algorithm: toPrismaAlgorithm(input.patch.algorithm),
          queue: toPrismaQueue(input.patch.queue),
          dueAt: new Date(input.patch.dueAt),
          stability: input.patch.stability,
          difficulty: input.patch.difficulty,
          halfLife: input.patch.halfLife,
          intervalDays: input.patch.intervalDays,
          reviewCount: input.patch.reviewCount,
          lapseCount: input.patch.lapseCount,
          consecutiveCorrect: input.patch.consecutiveCorrect,
          lastEvaluationId: input.patch.lastEvaluationId,
          lastStepId: input.patch.lastStepId,
          version: input.patch.version,
        },
        update: {
          algorithm: toPrismaAlgorithm(input.patch.algorithm),
          queue: toPrismaQueue(input.patch.queue),
          dueAt: new Date(input.patch.dueAt),
          stability: input.patch.stability,
          difficulty: input.patch.difficulty,
          halfLife: input.patch.halfLife,
          intervalDays: input.patch.intervalDays,
          reviewCount: input.patch.reviewCount,
          lapseCount: input.patch.lapseCount,
          consecutiveCorrect: input.patch.consecutiveCorrect,
          lastEvaluationId: input.patch.lastEvaluationId,
          lastStepId: input.patch.lastStepId,
          version: { increment: 1 },
        },
      });

      const createdLog = await tx.conceptEvaluationLog.create({
        data: {
          id: input.log.id,
          userId: input.log.userId,
          conceptId: input.log.conceptId,
          studyMode,
          evaluationId: input.log.evaluationId,
          stepId: input.log.stepId,
          algorithm: toPrismaAlgorithm(input.log.algorithm),
          schedulerRating: toPrismaRating(input.log.schedulerRating),
          combinedScore: input.log.combinedScore,
          priorState: input.log.priorState as Prisma.InputJsonObject,
          newState: snapshotStateForLog(state),
          reviewedAt: new Date(input.log.reviewedAt),
        },
      });

      if (input.transformationHistory !== undefined) {
        await tx.conceptTransformationHistory.create({
          data: {
            userId: input.transformationHistory.userId,
            conceptId: input.transformationHistory.conceptId,
            studyMode: toPrismaStudyMode(input.transformationHistory.studyMode),
            transformation: toPrismaTransformation(input.transformationHistory.transformation),
            usedAt: new Date(input.transformationHistory.usedAt),
            evaluationId: input.transformationHistory.evaluationId,
          },
        });
      }

      return {
        state: toDomainState(state),
        log: toDomainLog(createdLog),
        replayed: false,
      };
    });
  }

  public async findDueConcepts(query: IDueConceptQuery): Promise<IConceptScheduleState[]> {
    const records = await this.prisma.conceptScheduleState.findMany({
      where: {
        userId: query.userId,
        dueAt: { lte: new Date(query.asOf) },
        ...(query.studyMode !== undefined ? { studyMode: toPrismaStudyMode(query.studyMode) } : {}),
        ...(query.queue !== undefined ? { queue: toPrismaQueue(query.queue) } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'asc' }],
      take: query.limit,
    });
    return records.map(toDomainState);
  }

  public async findTransformationHistory(
    query: ITransformationHistoryQuery
  ): Promise<IConceptTransformationHistory[]> {
    const records = await this.prisma.conceptTransformationHistory.findMany({
      where: {
        userId: query.userId,
        conceptId: query.conceptId,
        ...(query.studyMode !== undefined ? { studyMode: toPrismaStudyMode(query.studyMode) } : {}),
      },
      orderBy: { usedAt: 'desc' },
      take: query.limit,
    });
    return records.map(toDomainTransformation);
  }
}

function toDomainState(record: PrismaConceptScheduleState): IConceptScheduleState {
  return {
    userId: record.userId as IConceptScheduleState['userId'],
    conceptId: record.conceptId as IConceptScheduleState['conceptId'],
    studyMode: fromPrismaStudyMode(record.studyMode),
    algorithm: record.algorithm.toLowerCase() as IConceptScheduleState['algorithm'],
    queue: fromPrismaQueue(record.queue),
    dueAt: record.dueAt.toISOString(),
    stability: record.stability,
    difficulty: record.difficulty,
    halfLife: record.halfLife,
    intervalDays: record.intervalDays,
    reviewCount: record.reviewCount,
    lapseCount: record.lapseCount,
    consecutiveCorrect: record.consecutiveCorrect,
    lastEvaluationId: record.lastEvaluationId,
    lastStepId: record.lastStepId as IConceptScheduleState['lastStepId'],
    suspendedUntil: record.suspendedUntil?.toISOString() ?? null,
    suspendedReason: record.suspendedReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

function toDomainTransformation(
  record: PrismaConceptTransformationHistory
): IConceptTransformationHistory {
  return {
    userId: record.userId as IConceptTransformationHistory['userId'],
    conceptId: record.conceptId as IConceptTransformationHistory['conceptId'],
    studyMode: fromPrismaStudyMode(record.studyMode),
    transformation: fromPrismaTransformation(record.transformation),
    usedAt: record.usedAt.toISOString(),
    evaluationId: record.evaluationId as IConceptTransformationHistory['evaluationId'],
  };
}

function toDomainLog(record: PrismaConceptEvaluationLog): IConceptEvaluationLog {
  return {
    id: record.id,
    userId: record.userId as IConceptEvaluationLog['userId'],
    conceptId: record.conceptId as IConceptEvaluationLog['conceptId'],
    studyMode: fromPrismaStudyMode(record.studyMode),
    evaluationId: record.evaluationId as IConceptEvaluationLog['evaluationId'],
    stepId: record.stepId as IConceptEvaluationLog['stepId'],
    algorithm: record.algorithm.toLowerCase() as IConceptEvaluationLog['algorithm'],
    schedulerRating: record.schedulerRating.toLowerCase() as IConceptEvaluationLog['schedulerRating'],
    combinedScore: record.combinedScore,
    priorState: record.priorState as Record<string, unknown>,
    newState: record.newState as Record<string, unknown>,
    reviewedAt: record.reviewedAt.toISOString(),
  };
}

function snapshotStateForLog(record: PrismaConceptScheduleState): Prisma.InputJsonObject {
  return {
    userId: record.userId,
    conceptId: record.conceptId,
    studyMode: fromPrismaStudyMode(record.studyMode),
    algorithm: record.algorithm.toLowerCase(),
    queue: fromPrismaQueue(record.queue),
    dueAt: record.dueAt.toISOString(),
    stability: record.stability,
    difficulty: record.difficulty,
    halfLife: record.halfLife,
    intervalDays: record.intervalDays,
    reviewCount: record.reviewCount,
    lapseCount: record.lapseCount,
    consecutiveCorrect: record.consecutiveCorrect,
    lastEvaluationId: record.lastEvaluationId,
    lastStepId: record.lastStepId,
    version: record.version,
  };
}

function toPrismaStudyMode(
  studyMode: IConceptScheduleState['studyMode']
): 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING' {
  return studyMode === 'language_learning' ? 'LANGUAGE_LEARNING' : 'KNOWLEDGE_GAINING';
}

function fromPrismaStudyMode(studyMode: string): IConceptScheduleState['studyMode'] {
  return studyMode === 'LANGUAGE_LEARNING' ? 'language_learning' : 'knowledge_gaining';
}

function toPrismaAlgorithm(
  algorithm: IConceptScheduleState['algorithm']
): 'FSRS' | 'HLR' | 'SM2' | 'LEITNER' {
  return algorithm.toUpperCase() as 'FSRS' | 'HLR' | 'SM2' | 'LEITNER';
}

function toPrismaQueue(queue: SchedulerQueue): 'NEW_LEARNING' | 'REINFORCEMENT' | 'REPAIR' {
  return queue.toUpperCase() as 'NEW_LEARNING' | 'REINFORCEMENT' | 'REPAIR';
}

function fromPrismaQueue(queue: string): SchedulerQueue {
  return queue.toLowerCase() as SchedulerQueue;
}

function toPrismaRating(
  rating: IConceptEvaluationLog['schedulerRating']
): 'AGAIN' | 'HARD' | 'GOOD' | 'EASY' {
  return rating.toUpperCase() as 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
}

function toPrismaTransformation(
  transformation: IConceptTransformationHistory['transformation']
): 'RECALL' | 'EXPLANATION' | 'COMPARISON' | 'APPLICATION' | 'PERTURBATION' | 'ERROR_DETECTION' {
  return transformation.toUpperCase() as
    | 'RECALL'
    | 'EXPLANATION'
    | 'COMPARISON'
    | 'APPLICATION'
    | 'PERTURBATION'
    | 'ERROR_DETECTION';
}

function fromPrismaTransformation(
  transformation: string
): IConceptTransformationHistory['transformation'] {
  return transformation.toLowerCase() as IConceptTransformationHistory['transformation'];
}
