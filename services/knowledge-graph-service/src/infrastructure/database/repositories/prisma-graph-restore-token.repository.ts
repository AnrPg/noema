import type { PrismaClient } from '../../../../generated/prisma/index.js';

import type { IGraphRestoreTokenRepository } from '../../../domain/knowledge-graph-service/graph-restore-token.repository.js';

export class PrismaGraphRestoreTokenRepository implements IGraphRestoreTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveToken(input: {
    tokenId: string;
    snapshotId: string;
    actorId: string | null;
    summaryHash: string;
    expiresAt: string;
  }): Promise<boolean> {
    try {
      await this.prisma.graphRestoreConfirmationToken.create({
        data: {
          tokenId: input.tokenId,
          snapshotId: input.snapshotId,
          actorId: input.actorId,
          summaryHash: input.summaryHash,
          expiresAt: new Date(input.expiresAt),
          status: 'reserved',
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async consumeToken(tokenId: string): Promise<void> {
    const result = await this.prisma.graphRestoreConfirmationToken.updateMany({
      where: {
        tokenId,
        status: 'reserved',
      },
      data: {
        status: 'consumed',
        consumedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      throw new Error(
        `Restore confirmation token ${tokenId} was not reserved at consumption time.`
      );
    }
  }

  async releaseToken(tokenId: string): Promise<void> {
    await this.prisma.graphRestoreConfirmationToken.deleteMany({
      where: {
        tokenId,
        status: 'reserved',
      },
    });
  }

  async pruneExpiredTokens(now: string): Promise<number> {
    const result = await this.prisma.graphRestoreConfirmationToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now),
        },
      },
    });
    return result.count;
  }
}
