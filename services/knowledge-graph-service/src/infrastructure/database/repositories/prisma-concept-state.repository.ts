import type { ConceptId, ConceptState, EvaluationId, StudyMode, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../../generated/prisma/index.js';
import type {
  IConceptReasoningEvidenceInput,
  IConceptStateHistoryEntry,
  IConceptStateHistoryInput,
  IConceptStateProjection,
  IConceptStateRepository,
  IConceptStateUpsertInput,
} from '../../../domain/knowledge-graph-service/concept-state.repository.js';

type PrismaStudyMode = 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING';
type PrismaConceptState = 'STABLE' | 'UNSTABLE';

function toPrismaStudyMode(studyMode: StudyMode): PrismaStudyMode {
  return studyMode === 'language_learning' ? 'LANGUAGE_LEARNING' : 'KNOWLEDGE_GAINING';
}

function fromPrismaStudyMode(studyMode: PrismaStudyMode): StudyMode {
  return studyMode === 'LANGUAGE_LEARNING' ? 'language_learning' : 'knowledge_gaining';
}

function toPrismaConceptState(state: ConceptState): PrismaConceptState {
  return state === 'stable' ? 'STABLE' : 'UNSTABLE';
}

function fromPrismaConceptState(state: PrismaConceptState): ConceptState {
  return state === 'STABLE' ? 'stable' : 'unstable';
}

export class PrismaConceptStateRepository implements IConceptStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markEventProcessed(input: {
    readonly eventId: string;
    readonly eventType: string;
    readonly userId?: UserId;
    readonly conceptId?: ConceptId;
    readonly studyMode?: StudyMode;
    readonly correlationId?: string;
  }): Promise<boolean> {
    try {
      await this.prisma.conceptStateEventInbox.create({
        data: {
          eventId: input.eventId,
          eventType: input.eventType,
          ...(input.userId !== undefined ? { userId: input.userId as string } : {}),
          ...(input.conceptId !== undefined ? { conceptId: input.conceptId as string } : {}),
          ...(input.studyMode !== undefined
            ? { studyMode: toPrismaStudyMode(input.studyMode) }
            : {}),
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async recordReasoningEvidence(input: IConceptReasoningEvidenceInput): Promise<void> {
    await this.prisma.conceptReasoningEvidence.upsert({
      where: {
        userId_conceptId_studyMode_evaluationId: {
          userId: input.userId as string,
          conceptId: input.conceptId as string,
          studyMode: toPrismaStudyMode(input.studyMode),
          evaluationId: input.evaluationId as string,
        },
      },
      create: {
        id: `cre_${nanoid()}`,
        userId: input.userId as string,
        conceptId: input.conceptId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
        evaluationId: input.evaluationId as string,
        stepId: input.stepId,
        reasoningQuality: input.reasoningQuality,
        evaluatedAt: new Date(input.evaluatedAt),
      },
      update: {
        stepId: input.stepId,
        reasoningQuality: input.reasoningQuality,
        evaluatedAt: new Date(input.evaluatedAt),
      },
    });
  }

  async getReasoningAverage(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly windowSize: number;
  }): Promise<number | null> {
    const records = await this.prisma.conceptReasoningEvidence.findMany({
      where: {
        userId: input.userId as string,
        conceptId: input.conceptId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
      },
      orderBy: { evaluatedAt: 'desc' },
      take: input.windowSize,
      select: { reasoningQuality: true },
    });
    if (records.length === 0) return null;
    return records.reduce((sum, record) => sum + record.reasoningQuality, 0) / records.length;
  }

  async getProjection(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection | null> {
    const record = await this.prisma.conceptStateProjection.findUnique({
      where: {
        userId_conceptId_studyMode: {
          userId: input.userId as string,
          conceptId: input.conceptId as string,
          studyMode: toPrismaStudyMode(input.studyMode),
        },
      },
    });
    return record === null ? null : this.toProjection(record);
  }

  async listProjections(input: {
    readonly userId: UserId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection[]> {
    const records = await this.prisma.conceptStateProjection.findMany({
      where: {
        userId: input.userId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => this.toProjection(record));
  }

  async upsertProjection(
    input: IConceptStateUpsertInput & { readonly state: ConceptState }
  ): Promise<{
    readonly projection: IConceptStateProjection;
    readonly previousState: ConceptState;
    readonly changed: boolean;
  }> {
    const existing = await this.getProjection(input);
    const previousState = existing?.state ?? 'unstable';
    const changed = previousState !== input.state;
    const computedAt = new Date(input.computedAt);
    const attemptsSinceStable =
      input.state === 'stable' ? (existing?.attemptsSinceStable ?? 0) + (changed ? 0 : 1) : 0;

    const record = await this.prisma.conceptStateProjection.upsert({
      where: {
        userId_conceptId_studyMode: {
          userId: input.userId as string,
          conceptId: input.conceptId as string,
          studyMode: toPrismaStudyMode(input.studyMode),
        },
      },
      create: {
        userId: input.userId as string,
        conceptId: input.conceptId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
        state: toPrismaConceptState(input.state),
        fsrsStability: input.fsrsStability,
        reasoningAverage: input.reasoningAverage,
        evidenceWindow: input.evidenceWindow,
        lastEvaluationId: input.lastEvaluationId as string | null,
        lastChangedAt: computedAt,
        attemptsSinceStable,
        computedAt,
      },
      update: {
        state: toPrismaConceptState(input.state),
        fsrsStability: input.fsrsStability,
        reasoningAverage: input.reasoningAverage,
        evidenceWindow: input.evidenceWindow,
        lastEvaluationId: input.lastEvaluationId as string | null,
        ...(changed ? { lastChangedAt: computedAt } : {}),
        attemptsSinceStable,
        computedAt,
      },
    });

    return { projection: this.toProjection(record), previousState, changed };
  }

  async appendHistory(input: IConceptStateHistoryInput): Promise<IConceptStateHistoryEntry> {
    const record = await this.prisma.conceptStateHistory.create({
      data: {
        id: `csh_${nanoid()}`,
        userId: input.userId as string,
        conceptId: input.conceptId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
        previousState: toPrismaConceptState(input.previousState),
        newState: toPrismaConceptState(input.newState),
        fsrsStability: input.fsrsStability,
        reasoningAverage: input.reasoningAverage,
        evaluationId: input.evaluationId as string | null,
        changedAt: new Date(input.changedAt),
      },
    });
    return this.toHistory(record);
  }

  async getHistory(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly limit: number;
  }): Promise<IConceptStateHistoryEntry[]> {
    const records = await this.prisma.conceptStateHistory.findMany({
      where: {
        userId: input.userId as string,
        conceptId: input.conceptId as string,
        studyMode: toPrismaStudyMode(input.studyMode),
      },
      orderBy: { changedAt: 'desc' },
      take: input.limit,
    });
    return records.map((record) => this.toHistory(record));
  }

  private toProjection(record: {
    userId: string;
    conceptId: string;
    studyMode: PrismaStudyMode;
    state: PrismaConceptState;
    fsrsStability: number | null;
    reasoningAverage: number | null;
    evidenceWindow: number;
    lastEvaluationId: string | null;
    lastChangedAt: Date | null;
    attemptsSinceStable: number;
    computedAt: Date;
    updatedAt: Date;
  }): IConceptStateProjection {
    return {
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: fromPrismaStudyMode(record.studyMode),
      state: fromPrismaConceptState(record.state),
      fsrsStability: record.fsrsStability,
      reasoningAverage: record.reasoningAverage,
      evidenceWindow: record.evidenceWindow,
      lastEvaluationId: record.lastEvaluationId as EvaluationId | null,
      lastChangedAt: record.lastChangedAt?.toISOString() ?? null,
      attemptsSinceStable: record.attemptsSinceStable,
      computedAt: record.computedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toHistory(record: {
    id: string;
    userId: string;
    conceptId: string;
    studyMode: PrismaStudyMode;
    previousState: PrismaConceptState;
    newState: PrismaConceptState;
    fsrsStability: number | null;
    reasoningAverage: number | null;
    evaluationId: string | null;
    changedAt: Date;
    createdAt: Date;
  }): IConceptStateHistoryEntry {
    return {
      id: record.id,
      userId: record.userId as UserId,
      conceptId: record.conceptId as ConceptId,
      studyMode: fromPrismaStudyMode(record.studyMode),
      previousState: fromPrismaConceptState(record.previousState),
      newState: fromPrismaConceptState(record.newState),
      fsrsStability: record.fsrsStability,
      reasoningAverage: record.reasoningAverage,
      evaluationId: record.evaluationId as EvaluationId | null,
      changedAt: record.changedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
