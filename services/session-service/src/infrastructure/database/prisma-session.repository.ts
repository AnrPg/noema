/**
 * @noema/session-service - Prisma Session Repository
 *
 * Implements ISessionRepository using Prisma for PostgreSQL persistence.
 * Handles mapping between Prisma enum values (UPPERCASE) and
 * domain enum values (lowercase) from @noema/types.
 */

import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  CardQueueStatus,
  HintDepth,
  LearningMode,
  Rating,
  SessionId,
  UserId,
} from '@noema/types';
import type { Logger } from 'pino';
import type {
  Prisma,
  AttemptOutcome as PrismaAttemptOutcome,
  CardQueueStatus as PrismaCardQueueStatus,
  PrismaClient,
  HintDepth as PrismaHintDepth,
  LearningMode as PrismaLearningMode,
  Rating as PrismaRating,
  SessionCohortHandshakeStatus as PrismaSessionCohortHandshakeStatus,
  SessionState as PrismaSessionState,
} from '../../../generated/prisma/index.js';

import {
  SessionNotFoundError,
  VersionConflictError,
} from '../../domain/session-service/errors/index.js';
import type { ISessionRepository } from '../../domain/session-service/session.repository.js';
import type {
  IAcceptCohortInput,
  IAttempt,
  ICommitCohortInput,
  IProposeCohortInput,
  IReviseCohortInput,
  ISession,
  ISessionCohortHandshake,
  ISessionConfig,
  ISessionFilters,
  ISessionQueueItem,
  ISessionStats,
  SessionCohortHandshakeStatus,
  SessionState
} from '../../types/index.js';

// ============================================================================
// Enum Mappers: domain (lowercase) ↔ Prisma (UPPERCASE)
// ============================================================================

function toPrismaSessionState(s: string): PrismaSessionState {
  return s.toUpperCase() as PrismaSessionState;
}

function fromPrismaSessionState(s: PrismaSessionState): SessionState {
  return s.toLowerCase() as SessionState;
}

function toPrismaLearningMode(s: string): PrismaLearningMode {
  return s.toUpperCase() as PrismaLearningMode;
}

function fromPrismaLearningMode(s: PrismaLearningMode): LearningMode {
  return s.toLowerCase() as LearningMode;
}

function toPrismaAttemptOutcome(s: string): PrismaAttemptOutcome {
  return s.toUpperCase() as PrismaAttemptOutcome;
}

function fromPrismaAttemptOutcome(s: PrismaAttemptOutcome): AttemptOutcome {
  return s.toLowerCase() as AttemptOutcome;
}

function toPrismaRating(s: string): PrismaRating {
  return s.toUpperCase() as PrismaRating;
}

function fromPrismaRating(s: PrismaRating): Rating {
  return s.toLowerCase() as Rating;
}

function toPrismaHintDepth(s: string): PrismaHintDepth {
  return s.toUpperCase() as PrismaHintDepth;
}

function fromPrismaHintDepth(s: PrismaHintDepth): HintDepth {
  return s.toLowerCase() as HintDepth;
}

function toPrismaCardQueueStatus(s: string): PrismaCardQueueStatus {
  return s.toUpperCase() as PrismaCardQueueStatus;
}

function fromPrismaCardQueueStatus(s: PrismaCardQueueStatus): CardQueueStatus {
  return s.toLowerCase() as CardQueueStatus;
}

function toPrismaSessionCohortHandshakeStatus(
  s: SessionCohortHandshakeStatus
): PrismaSessionCohortHandshakeStatus {
  return s.toUpperCase() as PrismaSessionCohortHandshakeStatus;
}

function fromPrismaSessionCohortHandshakeStatus(
  s: PrismaSessionCohortHandshakeStatus
): SessionCohortHandshakeStatus {
  return s.toLowerCase() as SessionCohortHandshakeStatus;
}

// ============================================================================
// Row → Domain Mappers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSessionDomain(row: any): ISession {
  return {
    id: row.id as SessionId,
    userId: row.userId as UserId,
    deckQueryId: row.deckQueryId,
    state: fromPrismaSessionState(row.state),
    learningMode: fromPrismaLearningMode(row.learningMode),
    teachingApproach: row.teachingApproach,
    schedulingAlgorithm: row.schedulingAlgorithm,
    loadoutId: row.loadoutId ?? null,
    loadoutArchetype: row.loadoutArchetype ?? null,
    forceLevel: row.forceLevel ?? null,
    config: (row.config ?? {}) as ISessionConfig,
    stats: (row.stats ?? {}) as ISessionStats,
    initialQueueSize: row.initialQueueSize,
    pauseCount: row.pauseCount,
    totalPausedDurationMs: row.totalPausedDurationMs,
    lastPausedAt: row.lastPausedAt?.toISOString() ?? null,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    terminationReason: row.terminationReason ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAttemptDomain(row: any): IAttempt {
  return {
    id: row.id as AttemptId,
    sessionId: row.sessionId as SessionId,
    cardId: row.cardId as CardId,
    userId: row.userId as UserId,
    sequenceNumber: row.sequenceNumber,
    outcome: fromPrismaAttemptOutcome(row.outcome),
    rating: fromPrismaRating(row.rating),
    ratingValue: row.ratingValue,
    responseTimeMs: row.responseTimeMs,
    dwellTimeMs: row.dwellTimeMs,
    timeToFirstInteractionMs: row.timeToFirstInteractionMs ?? null,
    confidenceBefore: row.confidenceBefore ?? null,
    confidenceAfter: row.confidenceAfter ?? null,
    calibrationDelta: row.calibrationDelta ?? null,
    wasRevisedBeforeCommit: row.wasRevisedBeforeCommit,
    revisionCount: row.revisionCount,
    hintRequestCount: row.hintRequestCount,
    hintDepthReached: fromPrismaHintDepth(row.hintDepthReached),
    contextSnapshot: row.contextSnapshot,
    priorSchedulingState: row.priorSchedulingState ?? null,
    traceId: row.traceId ?? null,
    diagnosisId: row.diagnosisId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQueueItemDomain(row: any): ISessionQueueItem {
  return {
    id: row.id,
    sessionId: row.sessionId as SessionId,
    cardId: row.cardId as CardId,
    position: row.position,
    status: fromPrismaCardQueueStatus(row.status),
    injectedBy: row.injectedBy ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCohortHandshakeDomain(row: any): ISessionCohortHandshake {
  return {
    id: row.id,
    sessionId: row.sessionId as SessionId,
    proposalId: row.proposalId,
    decisionId: row.decisionId,
    revision: row.revision,
    status: fromPrismaSessionCohortHandshakeStatus(row.status),
    candidateCardIds: row.candidateCardIds as CardId[],
    acceptedCardIds: (row.acceptedCardIds as CardId[] | null) ?? null,
    rejectedCardIds: (row.rejectedCardIds as CardId[] | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================================
// Prisma Repository Implementation
// ============================================================================

export class PrismaSessionRepository implements ISessionRepository {
  constructor(
    private readonly prisma: PrismaClient,
    _logger: Logger
  ) {
    // Logger available for future debug tracing
  }

  private db(tx?: Prisma.TransactionClient): PrismaClient | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  // ---------- Session read ----------

  async findSessionById(id: SessionId): Promise<ISession | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? toSessionDomain(row) : null;
  }

  async getSessionById(id: SessionId): Promise<ISession> {
    const session = await this.findSessionById(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  async findSessionsByUser(
    userId: UserId,
    filters?: ISessionFilters,
    limit = 20,
    offset = 0
  ): Promise<{ sessions: ISession[]; total: number }> {
    const where: Record<string, unknown> = { userId };
    if (filters?.state) {
      where['state'] = toPrismaSessionState(filters.state);
    }
    if (filters?.learningMode) {
      where['learningMode'] = toPrismaLearningMode(filters.learningMode);
    }

    const [rows, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.session.count({ where }),
    ]);

    return { sessions: rows.map(toSessionDomain), total };
  }

  async findActiveSessionForUser(userId: UserId): Promise<ISession | null> {
    const row = await this.prisma.session.findFirst({
      where: { userId, state: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
    return row ? toSessionDomain(row) : null;
  }

  async countSessionsByUser(
    userId: UserId,
    state?: SessionState,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const where: Record<string, unknown> = { userId };
    if (state) {
      where['state'] = toPrismaSessionState(state);
    }
    return this.db(tx).session.count({ where });
  }

  // ---------- Session write ----------

  async createSession(
    session: Omit<ISession, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISession> {
    const row = await this.db(tx).session.create({
      data: {
        id: session.id,
        userId: session.userId,
        deckQueryId: session.deckQueryId,
        state: toPrismaSessionState(session.state),
        learningMode: toPrismaLearningMode(session.learningMode),
        teachingApproach: session.teachingApproach,
        schedulingAlgorithm: session.schedulingAlgorithm,
        loadoutId: session.loadoutId,
        loadoutArchetype: session.loadoutArchetype,
        forceLevel: session.forceLevel,
        config: session.config as object,
        stats: session.stats as object,
        initialQueueSize: session.initialQueueSize,
        pauseCount: session.pauseCount,
        totalPausedDurationMs: session.totalPausedDurationMs,
        lastPausedAt: session.lastPausedAt ? new Date(session.lastPausedAt) : null,
        startedAt: new Date(session.startedAt),
        lastActivityAt: new Date(session.lastActivityAt),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
        terminationReason: session.terminationReason,
        version: session.version,
      },
    });
    return toSessionDomain(row);
  }

  async updateSession(
    id: SessionId,
    data: Partial<
      Pick<
        ISession,
        | 'state'
        | 'learningMode'
        | 'teachingApproach'
        | 'loadoutId'
        | 'loadoutArchetype'
        | 'forceLevel'
        | 'stats'
        | 'pauseCount'
        | 'totalPausedDurationMs'
        | 'lastPausedAt'
        | 'lastActivityAt'
        | 'completedAt'
        | 'terminationReason'
      >
    >,
    expectedVersion: number,
    tx?: Prisma.TransactionClient
  ): Promise<ISession> {
    // Build update payload with enum mapping
    const update: Record<string, unknown> = { version: { increment: 1 } };

    if (data.state !== undefined) update['state'] = toPrismaSessionState(data.state);
    if (data.learningMode !== undefined)
      update['learningMode'] = toPrismaLearningMode(data.learningMode);
    if (data.teachingApproach !== undefined) update['teachingApproach'] = data.teachingApproach;
    if (data.loadoutId !== undefined) update['loadoutId'] = data.loadoutId;
    if (data.loadoutArchetype !== undefined) update['loadoutArchetype'] = data.loadoutArchetype;
    if (data.forceLevel !== undefined) update['forceLevel'] = data.forceLevel;
    if (data.stats !== undefined) update['stats'] = data.stats as object;
    if (data.pauseCount !== undefined) update['pauseCount'] = data.pauseCount;
    if (data.totalPausedDurationMs !== undefined)
      update['totalPausedDurationMs'] = data.totalPausedDurationMs;
    if (data.lastPausedAt !== undefined) {
      update['lastPausedAt'] = data.lastPausedAt ? new Date(data.lastPausedAt) : null;
    }
    if (data.lastActivityAt !== undefined) update['lastActivityAt'] = new Date(data.lastActivityAt);
    if (data.completedAt !== undefined) {
      update['completedAt'] = data.completedAt ? new Date(data.completedAt) : null;
    }
    if (data.terminationReason !== undefined) update['terminationReason'] = data.terminationReason;

    try {
      const row = await this.db(tx).session.update({
        where: { id, version: expectedVersion },
        data: update,
      });
      return toSessionDomain(row);
    } catch (error: unknown) {
      // Prisma P2025: Record to update not found (version mismatch)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2025'
      ) {
        throw new VersionConflictError(expectedVersion, expectedVersion + 1);
      }
      throw error;
    }
  }

  // ---------- Attempt read ----------

  async findAttemptById(id: AttemptId): Promise<IAttempt | null> {
    const row = await this.prisma.attempt.findUnique({ where: { id } });
    return row ? toAttemptDomain(row) : null;
  }

  async findAttemptsBySession(
    sessionId: SessionId,
    limit = 50,
    offset = 0
  ): Promise<{ attempts: IAttempt[]; total: number }> {
    const where = { sessionId };
    const [rows, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        orderBy: { sequenceNumber: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.attempt.count({ where }),
    ]);
    return { attempts: rows.map(toAttemptDomain), total };
  }

  async findAttemptsByCard(sessionId: SessionId, cardId: CardId): Promise<IAttempt[]> {
    const rows = await this.prisma.attempt.findMany({
      where: { sessionId, cardId },
      orderBy: { sequenceNumber: 'asc' },
    });
    return rows.map(toAttemptDomain);
  }

  async countAttemptsBySession(sessionId: SessionId): Promise<number> {
    return this.prisma.attempt.count({ where: { sessionId } });
  }

  async getNextSequenceNumber(sessionId: SessionId): Promise<number> {
    const maxResult = await this.prisma.attempt.aggregate({
      where: { sessionId },
      _max: { sequenceNumber: true },
    });
    return (maxResult._max.sequenceNumber ?? 0) + 1;
  }

  // ---------- Attempt write ----------

  async createAttempt(
    attempt: Omit<IAttempt, 'createdAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<IAttempt> {
    const row = await this.db(tx).attempt.create({
      data: {
        id: attempt.id,
        sessionId: attempt.sessionId,
        cardId: attempt.cardId,
        userId: attempt.userId,
        sequenceNumber: attempt.sequenceNumber,
        outcome: toPrismaAttemptOutcome(attempt.outcome),
        rating: toPrismaRating(attempt.rating),
        ratingValue: attempt.ratingValue,
        responseTimeMs: attempt.responseTimeMs,
        dwellTimeMs: attempt.dwellTimeMs,
        timeToFirstInteractionMs: attempt.timeToFirstInteractionMs,
        confidenceBefore: attempt.confidenceBefore,
        confidenceAfter: attempt.confidenceAfter,
        calibrationDelta: attempt.calibrationDelta,
        wasRevisedBeforeCommit: attempt.wasRevisedBeforeCommit,
        revisionCount: attempt.revisionCount,
        hintRequestCount: attempt.hintRequestCount,
        hintDepthReached: toPrismaHintDepth(attempt.hintDepthReached),
        contextSnapshot: attempt.contextSnapshot as object,
        priorSchedulingState: (attempt.priorSchedulingState as object) ?? undefined,
        traceId: attempt.traceId,
        diagnosisId: attempt.diagnosisId,
      },
    });
    return toAttemptDomain(row);
  }

  // ---------- Queue read ----------

  async getQueueItems(sessionId: SessionId, status?: string): Promise<ISessionQueueItem[]> {
    const where: Record<string, unknown> = { sessionId };
    if (status) {
      where['status'] = toPrismaCardQueueStatus(status);
    }
    const rows = await this.prisma.sessionQueueItem.findMany({
      where,
      orderBy: { position: 'asc' },
    });
    return rows.map(toQueueItemDomain);
  }

  async findNextPendingQueueItem(sessionId: SessionId): Promise<ISessionQueueItem | null> {
    const row = await this.prisma.sessionQueueItem.findFirst({
      where: { sessionId, status: 'PENDING' },
      orderBy: { position: 'asc' },
    });
    return row ? toQueueItemDomain(row) : null;
  }

  async findQueueItemByCard(
    sessionId: SessionId,
    cardId: CardId
  ): Promise<ISessionQueueItem | null> {
    const row = await this.prisma.sessionQueueItem.findUnique({
      where: { sessionId_cardId: { sessionId, cardId } },
    });
    return row ? toQueueItemDomain(row) : null;
  }

  async countPendingQueueItems(sessionId: SessionId): Promise<number> {
    return this.prisma.sessionQueueItem.count({
      where: { sessionId, status: 'PENDING' },
    });
  }

  // ---------- Queue write ----------

  async createQueueItemsBatch(
    items: Omit<ISessionQueueItem, 'createdAt' | 'updatedAt'>[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    if (items.length === 0) return;

    await this.db(tx).sessionQueueItem.createMany({
      data: items.map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        cardId: item.cardId,
        position: item.position,
        status: toPrismaCardQueueStatus(item.status),
        injectedBy: item.injectedBy,
        reason: item.reason,
      })),
    });
  }

  async injectQueueItem(
    item: Omit<ISessionQueueItem, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionQueueItem> {
    // Shift existing items at >= position down by 1
    await this.db(tx).sessionQueueItem.updateMany({
      where: {
        sessionId: item.sessionId,
        position: { gte: item.position },
        status: 'PENDING',
      },
      data: { position: { increment: 1 } },
    });

    const row = await this.db(tx).sessionQueueItem.create({
      data: {
        id: item.id,
        sessionId: item.sessionId,
        cardId: item.cardId,
        position: item.position,
        status: toPrismaCardQueueStatus(item.status),
        injectedBy: item.injectedBy,
        reason: item.reason,
      },
    });
    return toQueueItemDomain(row);
  }

  async removeQueueItem(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.db(tx).sessionQueueItem.delete({
      where: { sessionId_cardId: { sessionId, cardId } },
    });
  }

  async markQueueItemPresented(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.db(tx).sessionQueueItem.update({
      where: { sessionId_cardId: { sessionId, cardId } },
      data: { status: 'PRESENTED' },
    });
  }

  async markQueueItemAnswered(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.db(tx).sessionQueueItem.update({
      where: { sessionId_cardId: { sessionId, cardId } },
      data: { status: 'COMPLETED' },
    });
  }

  async markQueueItemSkipped(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.db(tx).sessionQueueItem.update({
      where: { sessionId_cardId: { sessionId, cardId } },
      data: { status: 'SKIPPED' },
    });
  }

  async replacePendingQueueItems(
    sessionId: SessionId,
    committedCardIds: CardId[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.db(tx).sessionQueueItem.deleteMany({
      where: {
        sessionId,
        status: {
          in: ['PENDING', 'PRESENTED', 'INJECTED'],
        },
      },
    });

    if (committedCardIds.length === 0) {
      return;
    }

    await this.db(tx).sessionQueueItem.createMany({
      data: committedCardIds.map((cardId, index) => ({
        id: crypto.randomUUID(),
        sessionId,
        cardId,
        position: index,
        status: 'PENDING',
        injectedBy: 'cohort_commit',
        reason: 'Materialized from committed cohort handshake',
      })),
      skipDuplicates: true,
    });
  }

  async findLatestCohortHandshake(
    sessionId: SessionId,
    proposalId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionCohortHandshake | null> {
    const row = await this.db(tx).sessionCohortHandshake.findFirst({
      where: { sessionId, proposalId },
      orderBy: { revision: 'desc' },
    });
    return row ? toCohortHandshakeDomain(row) : null;
  }

  async findCohortHandshake(
    sessionId: SessionId,
    proposalId: string,
    revision: number,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionCohortHandshake | null> {
    const row = await this.db(tx).sessionCohortHandshake.findUnique({
      where: {
        sessionId_proposalId_revision: {
          sessionId,
          proposalId,
          revision,
        },
      },
    });

    return row ? toCohortHandshakeDomain(row) : null;
  }

  async createCohortHandshake(
    sessionId: SessionId,
    input: IProposeCohortInput | IReviseCohortInput,
    status: SessionCohortHandshakeStatus,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionCohortHandshake> {
    const row = await this.db(tx).sessionCohortHandshake.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        proposalId: input.linkage.proposalId,
        decisionId: input.linkage.decisionId,
        revision: 'newRevision' in input ? input.newRevision : input.revision,
        status: toPrismaSessionCohortHandshakeStatus(status),
        candidateCardIds: input.candidateCardIds as unknown as object,
        acceptedCardIds: null,
        rejectedCardIds: null,
        metadata: (input.metadata ?? {}) as object,
      },
    });

    return toCohortHandshakeDomain(row);
  }

  async updateCohortHandshake(
    sessionId: SessionId,
    proposalId: string,
    revision: number,
    expectedStatus: SessionCohortHandshakeStatus,
    input: IAcceptCohortInput | ICommitCohortInput,
    nextStatus: SessionCohortHandshakeStatus,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionCohortHandshake> {
    const updated = await this.db(tx).sessionCohortHandshake.updateMany({
      where: {
        sessionId,
        proposalId,
        revision,
        status: toPrismaSessionCohortHandshakeStatus(expectedStatus),
      },
      data: {
        status: toPrismaSessionCohortHandshakeStatus(nextStatus),
        acceptedCardIds: input.acceptedCardIds as unknown as object,
        rejectedCardIds: input.rejectedCardIds as unknown as object,
        metadata: (input.metadata ?? {}) as object,
      },
    });

    if (updated.count !== 1) {
      throw new VersionConflictError(revision, revision + 1);
    }

    const row = await this.db(tx).sessionCohortHandshake.findUnique({
      where: {
        sessionId_proposalId_revision: {
          sessionId,
          proposalId,
          revision,
        },
      },
    });

    if (!row) {
      throw new SessionNotFoundError(sessionId);
    }

    return toCohortHandshakeDomain(row);
  }
}
