/**
 * @noema/scheduler-service - Prisma Calibration Data Repository
 */

import type { CardId, StudyMode, UserId } from '@noema/types';
import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  CalibrationData as PrismaCalibrationData,
  PrismaClient,
  StudyMode as PrismaStudyMode,
} from '../../../generated/prisma/index.js';
import type { ICalibrationDataRepository } from '../../domain/scheduler-service/scheduler.repository.js';
import type { ICalibrationData } from '../../types/scheduler.types.js';

function toDomain(row: PrismaCalibrationData): ICalibrationData {
  return {
    id: row.id,
    userId: row.userId as UserId,
    studyMode: row.studyMode.toLowerCase() as StudyMode,
    cardId: row.cardId as CardId | null,
    cardType: row.cardType,
    parameters: row.parameters as Record<string, unknown>,
    sampleCount: row.sampleCount,
    confidenceScore: row.confidenceScore,
    lastTrainedAt: row.lastTrainedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toInputJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toNullableDate(value: string | null): Date | null {
  if (value === null || value === '') {
    return null;
  }
  return new Date(value);
}

function buildCalibrationId(): string {
  return `cal_${randomUUID()}`;
}

function toPrismaStudyMode(studyMode: StudyMode): PrismaStudyMode {
  return studyMode.toUpperCase() as PrismaStudyMode;
}

function normalizeStudyMode(studyMode?: StudyMode): StudyMode {
  return studyMode ?? 'knowledge_gaining';
}

export class PrismaCalibrationDataRepository implements ICalibrationDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ICalibrationData | null> {
    const data = await this.prisma.calibrationData.findUnique({ where: { id } });
    return data ? toDomain(data) : null;
  }

  async findByCard(
    userId: UserId,
    cardId: CardId,
    studyMode?: StudyMode
  ): Promise<ICalibrationData | null> {
    const data = await this.prisma.calibrationData.findUnique({
      where: {
        userId_cardId_studyMode: {
          userId,
          cardId,
          studyMode: toPrismaStudyMode(normalizeStudyMode(studyMode)),
        },
      },
    });
    return data ? toDomain(data) : null;
  }

  async findByCardType(
    userId: UserId,
    cardType: string,
    studyMode?: StudyMode
  ): Promise<ICalibrationData | null> {
    const data = await this.prisma.calibrationData.findFirst({
      where: {
        userId,
        studyMode: toPrismaStudyMode(normalizeStudyMode(studyMode)),
        cardType,
        cardId: null,
      },
    });
    return data ? toDomain(data) : null;
  }

  async findByUser(userId: UserId, studyMode?: StudyMode): Promise<ICalibrationData[]> {
    const data = await this.prisma.calibrationData.findMany({
      where: {
        userId,
        studyMode: toPrismaStudyMode(normalizeStudyMode(studyMode)),
      },
    });
    return data.map(toDomain);
  }

  async create(data: Omit<ICalibrationData, 'createdAt' | 'updatedAt'>): Promise<ICalibrationData> {
    const createData: Prisma.CalibrationDataUncheckedCreateInput = {
      id: data.id,
      userId: data.userId,
      studyMode: toPrismaStudyMode(data.studyMode),
      cardId: data.cardId,
      cardType: data.cardType,
      parameters: toInputJsonValue(data.parameters),
      sampleCount: data.sampleCount,
      confidenceScore: data.confidenceScore,
      lastTrainedAt: toNullableDate(data.lastTrainedAt),
    };

    const created = await this.prisma.calibrationData.create({
      data: createData,
    });
    return toDomain(created);
  }

  async update(
    id: string,
    data: Partial<
      Pick<ICalibrationData, 'parameters' | 'sampleCount' | 'confidenceScore' | 'lastTrainedAt'>
    >
  ): Promise<ICalibrationData> {
    const updateData: Prisma.CalibrationDataUpdateInput = {};

    if (data.parameters !== undefined) {
      updateData.parameters = toInputJsonValue(data.parameters);
    }
    if (data.sampleCount !== undefined) {
      updateData.sampleCount = data.sampleCount;
    }
    if (data.confidenceScore !== undefined) {
      updateData.confidenceScore = data.confidenceScore;
    }
    if (data.lastTrainedAt !== undefined) {
      updateData.lastTrainedAt = toNullableDate(data.lastTrainedAt);
    }

    const updated = await this.prisma.calibrationData.update({
      where: { id },
      data: updateData,
    });

    return toDomain(updated);
  }

  async upsert(
    userId: UserId,
    cardId: CardId | null,
    cardType: string | null,
    studyMode: StudyMode,
    data: Partial<
      Pick<ICalibrationData, 'parameters' | 'sampleCount' | 'confidenceScore' | 'lastTrainedAt'>
    >
  ): Promise<ICalibrationData> {
    // If card-specific, use the unique constraint
    if (cardId !== null) {
      const upsertCreateData: Prisma.CalibrationDataUncheckedCreateInput = {
        id: buildCalibrationId(),
        userId,
        studyMode: toPrismaStudyMode(studyMode),
        cardId,
        cardType,
        parameters: toInputJsonValue(data.parameters ?? {}),
        sampleCount: data.sampleCount ?? 0,
        confidenceScore: data.confidenceScore ?? 0.5,
        lastTrainedAt: toNullableDate(data.lastTrainedAt ?? null),
      };

      const upsertUpdateData: Prisma.CalibrationDataUpdateInput = {};
      if (data.parameters !== undefined) {
        upsertUpdateData.parameters = toInputJsonValue(data.parameters);
      }
      if (data.sampleCount !== undefined) {
        upsertUpdateData.sampleCount = data.sampleCount;
      }
      if (data.confidenceScore !== undefined) {
        upsertUpdateData.confidenceScore = data.confidenceScore;
      }
      if (data.lastTrainedAt !== undefined) {
        upsertUpdateData.lastTrainedAt = toNullableDate(data.lastTrainedAt);
      }

      const upserted = await this.prisma.calibrationData.upsert({
        where: {
          userId_cardId_studyMode: {
            userId,
            cardId,
            studyMode: toPrismaStudyMode(studyMode),
          },
        },
        create: upsertCreateData,
        update: upsertUpdateData,
      });
      return toDomain(upserted);
    }

    // For type-level, find or create
    const existing = await this.prisma.calibrationData.findFirst({
      where: { userId, studyMode: toPrismaStudyMode(studyMode), cardType, cardId: null },
    });

    if (existing) {
      return this.update(existing.id, data);
    }

    return this.create({
      id: buildCalibrationId(),
      userId,
      studyMode,
      cardId: null,
      cardType,
      parameters: data.parameters ?? {},
      sampleCount: data.sampleCount ?? 0,
      confidenceScore: data.confidenceScore ?? 0.5,
      lastTrainedAt: data.lastTrainedAt ?? null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.calibrationData.delete({ where: { id } });
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const result = await this.prisma.calibrationData.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
