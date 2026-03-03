/**
 * @noema/user-service - Prisma Session Repository
 *
 * Read-only session queries for admin login history inspection,
 * plus session revocation for admin moderation actions.
 */

import type { IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { ISessionRepository } from '../../domain/admin/admin.repository.js';
import type { IUserSession } from '../../types/admin.types.js';

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUser(
    userId: string,
    filters: { status?: 'active' | 'expired' | 'revoked' | 'all' },
    pagination: IOffsetPagination,
    sort: { sortBy: 'createdAt' | 'expiresAt'; sortOrder: 'asc' | 'desc' }
  ): Promise<IPaginatedResponse<IUserSession>> {
    const where = this.buildWhere(userId, filters);

    // Map sortBy to Prisma column names
    const orderByField = sort.sortBy === 'createdAt' ? 'startedAt' : 'lastActiveAt';

    const [rows, total] = await Promise.all([
      this.prisma.userSession.findMany({
        where,
        orderBy: { [orderByField]: sort.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.userSession.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total,
      hasMore: pagination.offset + pagination.limit < total,
    };
  }

  async countByUser(
    userId: string,
    filters?: { status?: 'active' | 'expired' | 'revoked' | 'all' }
  ): Promise<number> {
    return this.prisma.userSession.count({
      where: this.buildWhere(userId, filters),
    });
  }

  async endAllByUser(userId: UserId): Promise<number> {
    const now = new Date();

    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        endedAt: null, // Only end active sessions
      },
      data: {
        endedAt: now,
      },
    });

    return result.count;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildWhere(
    userId: string,
    filters?: { status?: 'active' | 'expired' | 'revoked' | 'all' }
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { userId };
    const now = new Date();

    if (filters?.status !== undefined && filters.status !== 'all') {
      switch (filters.status) {
        case 'active':
          // Not ended
          where['endedAt'] = null;
          break;
        case 'expired':
          // Ended but not by revocation — we treat sessions with endedAt as
          // either expired or revoked. Since UserSession doesn't have a
          // revokedAt field (only endedAt), we use lastActiveAt heuristic:
          // if endedAt is close to lastActiveAt, it's natural expiry.
          // For simplicity, treat all ended sessions as "expired" unless
          // they were ended significantly before lastActiveAt updates.
          // Note: A more precise approach would require a revokedAt column.
          where['endedAt'] = { not: null, lte: now };
          break;
        case 'revoked':
          // For now, we cannot cleanly distinguish revoked vs expired
          // without a separate column. Return ended sessions (same as expired).
          where['endedAt'] = { not: null };
          break;
      }
    }

    return where;
  }

  private toDomain(row: {
    id: string;
    userId: string;
    deviceId: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    startedAt: Date;
    lastActiveAt: Date;
    endedAt: Date | null;
  }): IUserSession {
    return {
      id: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      startedAt: row.startedAt,
      lastActiveAt: row.lastActiveAt,
      endedAt: row.endedAt,
    };
  }
}
