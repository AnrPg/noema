/**
 * @noema/session-service - Session Repository Interface
 *
 * Abstract repository interface for session aggregate persistence.
 * Covers Session, Attempt, and SessionQueueItem entities.
 */

import type { AttemptId, CardId, SessionId, UserId } from '@noema/types';
import type { Prisma } from '../../../generated/prisma/index.js';

import type {
  IAttempt,
  ISession,
  ISessionFilters,
  ISessionQueueItem,
  SessionState,
} from '../../types/index.js';

// ============================================================================
// Session Operations
// ============================================================================

export interface ISessionRepository {
  // ---------- Session read ----------

  /** Find a session by ID. Returns null if not found. */
  findSessionById(id: SessionId): Promise<ISession | null>;

  /** Find a session by ID, throws if not found. */
  getSessionById(id: SessionId): Promise<ISession>;

  /** Find sessions for a user, optionally filtered. */
  findSessionsByUser(
    userId: UserId,
    filters?: ISessionFilters,
    limit?: number,
    offset?: number
  ): Promise<{ sessions: ISession[]; total: number }>;

  /** Find an active session for a user (at most one expected). */
  findActiveSessionForUser(userId: UserId): Promise<ISession | null>;

  /** Count sessions for a user, optionally filtered by state. */
  countSessionsByUser(
    userId: UserId,
    state?: SessionState,
    tx?: Prisma.TransactionClient
  ): Promise<number>;

  // ---------- Session write ----------

  /** Create a new session. Returns the created entity. */
  createSession(
    session: Omit<ISession, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISession>;

  /** Update an existing session with optimistic locking. */
  updateSession(
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
  ): Promise<ISession>;

  // ---------- Attempt read ----------

  /** Find an attempt by ID. Returns null if not found. */
  findAttemptById(id: AttemptId): Promise<IAttempt | null>;

  /** Find attempts for a session, ordered by sequence number. */
  findAttemptsBySession(
    sessionId: SessionId,
    limit?: number,
    offset?: number
  ): Promise<{ attempts: IAttempt[]; total: number }>;

  /** Find attempts for a specific card within a session. */
  findAttemptsByCard(sessionId: SessionId, cardId: CardId): Promise<IAttempt[]>;

  /** Count attempts in a session. */
  countAttemptsBySession(sessionId: SessionId): Promise<number>;

  /** Get the next sequence number for an attempt in a session. */
  getNextSequenceNumber(sessionId: SessionId): Promise<number>;

  // ---------- Attempt write ----------

  /** Record a new attempt. Returns the created entity. */
  createAttempt(
    attempt: Omit<IAttempt, 'createdAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<IAttempt>;

  // ---------- Queue read ----------

  /** Get all queue items for a session, ordered by position. */
  getQueueItems(sessionId: SessionId, status?: string): Promise<ISessionQueueItem[]>;

  /** Find the next pending item in the queue. */
  findNextPendingQueueItem(sessionId: SessionId): Promise<ISessionQueueItem | null>;

  /** Find a queue item by session and card. */
  findQueueItemByCard(sessionId: SessionId, cardId: CardId): Promise<ISessionQueueItem | null>;

  /** Count remaining pending items in the queue. */
  countPendingQueueItems(sessionId: SessionId): Promise<number>;

  // ---------- Queue write ----------

  /** Add initial queue items in bulk. */
  createQueueItemsBatch(
    items: Omit<ISessionQueueItem, 'createdAt' | 'updatedAt'>[],
    tx?: Prisma.TransactionClient
  ): Promise<void>;

  /** Inject a single item at a given position, shifting others down. */
  injectQueueItem(
    item: Omit<ISessionQueueItem, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISessionQueueItem>;

  /** Remove a queue item by session and card. */
  removeQueueItem(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void>;

  /** Mark a queue item as presented (status transition). */
  markQueueItemPresented(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void>;

  /** Mark a queue item as answered (status transition). */
  markQueueItemAnswered(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void>;

  /** Mark a queue item as skipped (status transition). */
  markQueueItemSkipped(
    sessionId: SessionId,
    cardId: CardId,
    tx?: Prisma.TransactionClient
  ): Promise<void>;
}

/**
 * Symbol for dependency injection.
 */
export const SESSION_REPOSITORY = Symbol.for('ISessionRepository');
