/**
 * @noema/content-service - Prisma Template Repository
 *
 * PostgreSQL implementation of ITemplateRepository using Prisma.
 */

import type {
  CardType,
  DifficultyLevel,
  IPaginatedResponse,
  JsonValue,
  NodeId,
  RemediationCardType,
  TemplateId,
  UserId,
} from '@noema/types';
import type {
  Prisma,
  CardType as PrismaCardType,
  PrismaClient,
  DifficultyLevel as PrismaDifficultyLevel,
  Template as PrismaTemplate,
  TemplateVisibility as PrismaTemplateVisibility,
} from '../../../generated/prisma/index.js';
import { VersionConflictError } from '../../domain/content-service/errors/index.js';
import type { ITemplateRepository } from '../../domain/content-service/template.repository.js';
import type {
  ICreateTemplateInput,
  ITemplate,
  ITemplateQuery,
  ITemplateSummary,
  IUpdateTemplateInput,
  TemplateVisibility,
} from '../../types/content.types.js';

// ============================================================================
// Enum Mapping Helpers
// ============================================================================

function toDbCardType(cardType: string): PrismaCardType {
  return cardType.toUpperCase().replace(/-/g, '_') as PrismaCardType;
}

function fromDbCardType(dbCardType: PrismaCardType): CardType | RemediationCardType {
  return dbCardType.toLowerCase().replace(/_/g, '-') as CardType | RemediationCardType;
}

function toDbDifficulty(difficulty: string): PrismaDifficultyLevel {
  return difficulty.toUpperCase() as PrismaDifficultyLevel;
}

function fromDbDifficulty(dbDifficulty: PrismaDifficultyLevel): DifficultyLevel {
  return dbDifficulty.toLowerCase() as DifficultyLevel;
}

function toDbVisibility(visibility: string): PrismaTemplateVisibility {
  return visibility.toUpperCase() as PrismaTemplateVisibility;
}

function fromDbVisibility(dbVisibility: PrismaTemplateVisibility): TemplateVisibility {
  return dbVisibility.toLowerCase() as TemplateVisibility;
}

// ============================================================================
// Domain Mapping
// ============================================================================

function toDomain(row: PrismaTemplate): ITemplate {
  return {
    id: row.id as TemplateId,
    userId: row.userId as UserId,
    name: row.name,
    description: row.description,
    cardType: fromDbCardType(row.cardType),
    content: (row.content ?? { front: '', back: '' }) as ITemplate['content'],
    difficulty: fromDbDifficulty(row.difficulty),
    knowledgeNodeIds: row.knowledgeNodeIds as NodeId[],
    tags: row.tags,
    metadata: row.metadata as Record<string, JsonValue>,
    visibility: fromDbVisibility(row.visibility),
    usageCount: row.usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdBy: row.createdBy ?? '',
    updatedBy: row.updatedBy ?? '',
    version: row.version,
  };
}

function toSummary(row: PrismaTemplate): ITemplateSummary {
  return {
    id: row.id as TemplateId,
    userId: row.userId as UserId,
    name: row.name,
    description: row.description,
    cardType: fromDbCardType(row.cardType),
    difficulty: fromDbDifficulty(row.difficulty),
    visibility: fromDbVisibility(row.visibility),
    usageCount: row.usageCount,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

// ============================================================================
// Implementation
// ============================================================================

export class PrismaTemplateRepository implements ITemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: TemplateId): Promise<ITemplate | null> {
    const row = await this.prisma.template.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toDomain(row) : null;
  }

  async findByIdForUser(id: TemplateId, userId: UserId): Promise<ITemplate | null> {
    const row = await this.prisma.template.findFirst({
      where: { id, userId, deletedAt: null },
    });
    return row ? toDomain(row) : null;
  }

  async query(
    query: ITemplateQuery,
    userId: UserId
  ): Promise<IPaginatedResponse<ITemplateSummary>> {
    const where = this.buildWhereClause(query, userId);
    const orderBy = this.buildOrderBy(query);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    const [rows, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      items: rows.map(toSummary),
      total,
      hasMore: offset + rows.length < total,
    };
  }

  async create(
    input: ICreateTemplateInput & { id: TemplateId; userId: UserId }
  ): Promise<ITemplate> {
    const row = await this.prisma.template.create({
      data: {
        id: input.id,
        userId: input.userId,
        name: input.name,
        description: input.description ?? null,
        cardType: toDbCardType(input.cardType),
        content: input.content as unknown as Prisma.JsonObject,
        difficulty: toDbDifficulty(input.difficulty ?? 'intermediate'),
        knowledgeNodeIds: input.knowledgeNodeIds as string[],
        tags: input.tags ?? [],
        metadata: (input.metadata ?? {}) as unknown as Prisma.JsonObject,
        visibility: toDbVisibility(input.visibility ?? 'private'),
        createdBy: input.userId,
        updatedBy: input.userId,
      },
    });
    return toDomain(row);
  }

  async update(id: TemplateId, input: IUpdateTemplateInput, version: number): Promise<ITemplate> {
    const data: Prisma.TemplateUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.content !== undefined) data.content = input.content as unknown as Prisma.JsonObject;
    if (input.difficulty !== undefined) data.difficulty = toDbDifficulty(input.difficulty);
    if (input.knowledgeNodeIds !== undefined)
      data.knowledgeNodeIds = input.knowledgeNodeIds as string[];
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.metadata !== undefined)
      data.metadata = input.metadata as unknown as Prisma.JsonObject;
    if (input.visibility !== undefined) data.visibility = toDbVisibility(input.visibility);

    data.version = { increment: 1 };

    try {
      const row = await this.prisma.template.update({
        where: { id, version },
        data,
      });
      return toDomain(row);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        throw new VersionConflictError(version, -1);
      }
      throw error;
    }
  }

  async incrementUsageCount(id: TemplateId): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  async softDelete(id: TemplateId, version: number): Promise<void> {
    try {
      await this.prisma.template.update({
        where: { id, version },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        throw new VersionConflictError(version, -1);
      }
      throw error;
    }
  }

  async hardDelete(id: TemplateId): Promise<void> {
    await this.prisma.template.delete({ where: { id } });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildWhereClause(query: ITemplateQuery, userId: UserId): Prisma.TemplateWhereInput {
    const where: Prisma.TemplateWhereInput = { deletedAt: null };

    // Non-admin: own templates + public templates
    // The service layer handles admin bypass via the userId param
    where.OR = [
      { userId },
      { visibility: 'PUBLIC' as PrismaTemplateVisibility },
      { visibility: 'SHARED' as PrismaTemplateVisibility },
    ];

    if (query.cardTypes !== undefined && query.cardTypes.length > 0) {
      where.cardType = { in: query.cardTypes.map(toDbCardType) };
    }

    if (query.visibility !== undefined) {
      where.visibility = toDbVisibility(query.visibility);
      // If filtering by visibility, remove the OR clause
      delete where.OR;
      where.userId = userId;
    }

    if (query.tags !== undefined && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    if (query.search !== undefined && query.search !== '') {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { description: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }

    return where;
  }

  private buildOrderBy(query: ITemplateQuery): Prisma.TemplateOrderByWithRelationInput {
    const field = query.sortBy ?? 'createdAt';
    const order = query.sortOrder ?? 'desc';

    const fieldMap: Record<string, string> = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      usageCount: 'usageCount',
      name: 'name',
    };

    return { [fieldMap[field] ?? 'createdAt']: order };
  }
}
