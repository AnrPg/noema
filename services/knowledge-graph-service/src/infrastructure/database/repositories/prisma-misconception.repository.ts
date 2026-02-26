/**
 * @noema/knowledge-graph-service — Prisma Misconception Repository
 *
 * Concrete IMisconceptionRepository backed by PostgreSQL via Prisma.
 * Handles misconception patterns, intervention templates, and
 * detection records.
 */

import type {
  ConfidenceScore,
  InterventionId,
  InterventionType,
  Metadata,
  MisconceptionPatternId,
  MisconceptionStatus,
  MisconceptionType,
  NodeId,
  UserId,
} from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type { MisconceptionPatternKind } from '@noema/types';
import { MisconceptionPatternNotFoundError } from '../../../domain/knowledge-graph-service/errors/index.js';
import type {
  IInterventionTemplate,
  IMisconceptionPattern,
  IMisconceptionRecord,
  IMisconceptionRepository,
  IRecordDetectionInput,
  IUpsertInterventionTemplateInput,
  IUpsertPatternInput,
} from '../../../domain/knowledge-graph-service/misconception.repository.js';

// ============================================================================
// Helpers
// ============================================================================

function generatePatternId(): MisconceptionPatternId {
  return `${ID_PREFIXES.MisconceptionPatternId}${nanoid()}` as MisconceptionPatternId;
}

function generateInterventionId(): InterventionId {
  return `${ID_PREFIXES.InterventionId}${nanoid()}` as InterventionId;
}

function generateDetectionId(): string {
  return `det_${nanoid()}`;
}

// ============================================================================
// PrismaMisconceptionRepository
// ============================================================================

export class PrismaMisconceptionRepository implements IMisconceptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Pattern operations ────────────────────────────────────────────────

  async getActivePatterns(): Promise<IMisconceptionPattern[]> {
    const records = await this.prisma.misconceptionPattern.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.patternToDomain(r));
  }

  async getPatternsByType(type: MisconceptionType): Promise<IMisconceptionPattern[]> {
    const records = await this.prisma.misconceptionPattern.findMany({
      where: { misconceptionType: type as string },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.patternToDomain(r));
  }

  async getPatternById(patternId: MisconceptionPatternId): Promise<IMisconceptionPattern | null> {
    const record = await this.prisma.misconceptionPattern.findUnique({
      where: { id: patternId },
    });

    if (!record) return null;
    return this.patternToDomain(record);
  }

  async upsertPattern(
    input: IUpsertPatternInput,
    patternId?: MisconceptionPatternId
  ): Promise<IMisconceptionPattern> {
    const id = patternId ?? generatePatternId();

    const record = await this.prisma.misconceptionPattern.upsert({
      where: { id },
      create: {
        id,
        misconceptionType: input.misconceptionType as string,
        patternKind: input.kind as string,
        name: input.name,
        description: input.description,
        spec: input.config as unknown as Prisma.JsonObject,
        threshold: input.threshold,
        active: input.active ?? true,
      },
      update: {
        misconceptionType: input.misconceptionType as string,
        patternKind: input.kind as string,
        name: input.name,
        description: input.description,
        spec: input.config as unknown as Prisma.JsonObject,
        threshold: input.threshold,
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    return this.patternToDomain(record);
  }

  // ── Intervention template operations ──────────────────────────────────

  async getInterventionTemplatesByType(type: MisconceptionType): Promise<IInterventionTemplate[]> {
    const records = await this.prisma.interventionTemplate.findMany({
      where: {
        misconceptionPattern: {
          misconceptionType: type as string,
        },
      },
      include: { misconceptionPattern: { select: { misconceptionType: true } } },
      orderBy: { priority: 'asc' },
    });

    return records.map((r) => this.templateToDomainWithType(r));
  }

  async getInterventionTemplateById(
    templateId: InterventionId
  ): Promise<IInterventionTemplate | null> {
    const record = await this.prisma.interventionTemplate.findUnique({
      where: { id: templateId },
      include: { misconceptionPattern: { select: { misconceptionType: true } } },
    });

    if (!record) return null;
    return this.templateToDomainWithType(record);
  }

  async upsertInterventionTemplate(
    input: IUpsertInterventionTemplateInput,
    templateId?: InterventionId
  ): Promise<IInterventionTemplate> {
    const id = templateId ?? generateInterventionId();

    // Find the pattern for this misconception type
    const pattern = await this.prisma.misconceptionPattern.findFirst({
      where: { misconceptionType: input.misconceptionType as string },
    });

    if (!pattern) {
      throw new MisconceptionPatternNotFoundError(
        `No pattern found for misconception type: ${input.misconceptionType}`
      );
    }

    const record = await this.prisma.interventionTemplate.upsert({
      where: { id },
      create: {
        id,
        misconceptionPatternId: pattern.id,
        interventionType: input.interventionType as string,
        name: input.name,
        description: input.description,
        spec: input.config as unknown as Prisma.JsonObject,
        priority: input.priority ?? 0,
      },
      update: {
        interventionType: input.interventionType as string,
        name: input.name,
        description: input.description,
        spec: input.config as unknown as Prisma.JsonObject,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
      include: { misconceptionPattern: { select: { misconceptionType: true } } },
    });

    return this.templateToDomainWithType(record);
  }

  // ── Detection records ─────────────────────────────────────────────────

  async recordDetection(input: IRecordDetectionInput): Promise<IMisconceptionRecord> {
    const id = generateDetectionId();

    const record = await this.prisma.misconceptionDetection.create({
      data: {
        id,
        userId: input.userId as string,
        misconceptionPatternId: input.patternId as string,
        misconceptionType: input.misconceptionType as string,
        affectedNodeIds: [...input.affectedNodeIds] as string[],
        confidence: input.confidence as number,
        status: 'detected',
      },
    });

    return this.detectionToDomain(record);
  }

  async getActiveMisconceptions(userId: UserId, domain?: string): Promise<IMisconceptionRecord[]> {
    const records = await this.prisma.misconceptionDetection.findMany({
      where: {
        userId: userId as string,
        status: { not: 'resolved' },
        ...(domain !== undefined
          ? {
              misconceptionPattern: {
                misconceptionType: { startsWith: domain },
              },
            }
          : {}),
      },
      orderBy: { detectedAt: 'desc' },
    });

    return records.map((r) => this.detectionToDomain(r));
  }

  async updateMisconceptionStatus(
    detectionId: string,
    status: MisconceptionStatus
  ): Promise<IMisconceptionRecord> {
    const record = await this.prisma.misconceptionDetection.update({
      where: { id: detectionId },
      data: {
        status: status as string,
        ...(status === 'resolved' ? { resolvedAt: new Date() } : {}),
      },
    });

    return this.detectionToDomain(record);
  }

  // ==========================================================================
  // Private mappers
  // ==========================================================================

  private patternToDomain(record: {
    id: string;
    misconceptionType: string;
    patternKind: string;
    name: string;
    description: string | null;
    spec: Prisma.JsonValue;
    threshold: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): IMisconceptionPattern {
    return {
      patternId: record.id as MisconceptionPatternId,
      misconceptionType: record.misconceptionType as MisconceptionType,
      kind: record.patternKind as MisconceptionPatternKind,
      name: record.name,
      description: record.description ?? '',
      config: record.spec as unknown as Metadata,
      threshold: record.threshold,
      active: record.active,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private templateToDomainWithType(record: {
    id: string;
    interventionType: string;
    name: string;
    description: string | null;
    spec: Prisma.JsonValue;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
    misconceptionPattern: { misconceptionType: string };
  }): IInterventionTemplate {
    return {
      templateId: record.id as InterventionId,
      misconceptionType: record.misconceptionPattern.misconceptionType as MisconceptionType,
      interventionType: record.interventionType as InterventionType,
      name: record.name,
      description: record.description ?? '',
      config: record.spec as unknown as Metadata,
      priority: record.priority,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private detectionToDomain(record: {
    id: string;
    userId: string;
    misconceptionPatternId: string;
    misconceptionType: string;
    affectedNodeIds: string[];
    confidence: number;
    status: string;
    detectedAt: Date;
    resolvedAt: Date | null;
  }): IMisconceptionRecord {
    return {
      id: record.id,
      userId: record.userId as UserId,
      patternId: record.misconceptionPatternId as MisconceptionPatternId,
      misconceptionType: record.misconceptionType as MisconceptionType,
      affectedNodeIds: record.affectedNodeIds as NodeId[],
      confidence: record.confidence as ConfidenceScore,
      status: record.status as MisconceptionStatus,
      detectedAt: record.detectedAt.toISOString(),
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
    };
  }
}
