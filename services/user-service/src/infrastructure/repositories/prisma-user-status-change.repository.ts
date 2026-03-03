/**
 * @noema/user-service - Prisma User Status Change Repository
 *
 * Append-only audit log repository implementation using Prisma.
 * This repository intentionally has no update or delete methods.
 */

import type { IOffsetPagination, IPaginatedResponse } from '@noema/types';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type { IUserStatusChangeRepository } from '../../domain/admin/admin.repository.js';
import type {
  IAuditLogQueryFilters,
  ICreateStatusChangeInput,
  IUserStatusChange,
  StatusChangeAction,
} from '../../types/admin.types.js';

export class PrismaUserStatusChangeRepository implements IUserStatusChangeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: ICreateStatusChangeInput): Promise<IUserStatusChange> {
    const row = await this.prisma.userStatusChange.create({
      data: {
        userId: input.userId,
        changedBy: input.changedBy,
        action: input.action,
        previousValue: input.previousValue as Prisma.InputJsonValue,
        newValue: input.newValue as Prisma.InputJsonValue,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });

    return this.toDomain(row);
  }

  async findByUser(
    userId: string,
    filters: IAuditLogQueryFilters,
    pagination: IOffsetPagination
  ): Promise<IPaginatedResponse<IUserStatusChange>> {
    const where = this.buildWhere(userId, filters);

    const [rows, total] = await Promise.all([
      this.prisma.userStatusChange.findMany({
        where,
        orderBy: { createdAt: filters.sortOrder ?? 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.userStatusChange.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total,
      hasMore: pagination.offset + pagination.limit < total,
    };
  }

  async countByUser(userId: string, filters?: IAuditLogQueryFilters): Promise<number> {
    return this.prisma.userStatusChange.count({
      where: this.buildWhere(userId, filters),
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildWhere(userId: string, filters?: IAuditLogQueryFilters): Record<string, unknown> {
    const where: Record<string, unknown> = { userId };
    if (filters?.action !== undefined) {
      where['action'] = filters.action;
    }
    return where;
  }

  private toDomain(row: {
    id: string;
    userId: string;
    changedBy: string;
    action: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string | null;
    expiresAt: Date | null;
    createdAt: Date;
  }): IUserStatusChange {
    return {
      id: row.id,
      userId: row.userId,
      changedBy: row.changedBy,
      action: row.action as StatusChangeAction,
      previousValue: row.previousValue as Record<string, unknown>,
      newValue: row.newValue as Record<string, unknown>,
      reason: row.reason,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
