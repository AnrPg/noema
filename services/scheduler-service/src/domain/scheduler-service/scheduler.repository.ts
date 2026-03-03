/**
 * @noema/scheduler-service - Scheduler Repository Interface
 *
 * Abstract repository interface for scheduler aggregate persistence.
 * Covers SchedulerCard, Review, and CalibrationData entities.
 */

import type { CardId, UserId } from '@noema/types';
import type {
  ICalibrationData,
  IPaginationParams,
  IReview,
  IReviewExtendedFilters,
  IReviewFilters,
  IReviewStatsResponse,
  ISchedulerCard,
  ISchedulerCardExtendedFilters,
  ISchedulerCardFilters,
  ISortParams,
  SchedulerCardState,
  SchedulerLane,
} from '../../types/scheduler.types.js';

export type ScheduleProvenanceKind =
  | 'dual-lane-plan'
  | 'review-window-proposal'
  | 'session-candidate-proposal'
  | 'single-card-commit'
  | 'batch-card-commit';

export interface IProposalProvenanceInput {
  proposalId: string;
  decisionId: string;
  userId: UserId;
  policyVersion: string;
  correlationId: string;
  sessionId?: string | undefined;
  sessionRevision: number;
  kind: ScheduleProvenanceKind;
  payload: Record<string, unknown>;
}

export interface ICommitProvenanceInput {
  commitId: string;
  proposalId?: string | undefined;
  decisionId: string;
  userId: UserId;
  policyVersion: string;
  correlationId: string;
  sessionId?: string | undefined;
  sessionRevision: number;
  kind: ScheduleProvenanceKind;
  accepted: number;
  rejected: number;
  payload: Record<string, unknown>;
}

export interface ICohortLineageInput {
  id: string;
  userId: UserId;
  proposalId?: string | undefined;
  decisionId: string;
  sessionId?: string | undefined;
  sessionRevision: number;
  operationKind: ScheduleProvenanceKind;
  selectedCardIds: CardId[];
  excludedCardIds: CardId[];
  metadata: Record<string, unknown>;
}

// ============================================================================
// SchedulerCard Operations
// ============================================================================

export interface ISchedulerCardRepository {
  // ---------- Read ----------

  /** Find a scheduler card by user/card identity. Returns null if not found. */
  findByCard(userId: UserId, cardId: CardId): Promise<ISchedulerCard | null>;

  /** Find a scheduler card by user/card identity, throws if not found. */
  getByCard(userId: UserId, cardId: CardId): Promise<ISchedulerCard>;

  /** Find scheduler cards for a user. */
  findByUser(userId: UserId, filters?: ISchedulerCardFilters): Promise<ISchedulerCard[]>;

  /** Find cards due for review before a given date. */
  findDueCards(
    userId: UserId,
    beforeDate: Date,
    limit?: number,
    lane?: SchedulerLane
  ): Promise<ISchedulerCard[]>;

  /** Find cards by lane. */
  findByLane(userId: UserId, lane: SchedulerLane, limit?: number): Promise<ISchedulerCard[]>;

  /** Find cards by state. */
  findByState(userId: UserId, state: SchedulerCardState, limit?: number): Promise<ISchedulerCard[]>;

  /** Count scheduler cards for a user. */
  count(userId: UserId, filters?: ISchedulerCardFilters): Promise<number>;

  /** Count cards due for review. */
  countDue(userId: UserId, beforeDate: Date, lane?: SchedulerLane): Promise<number>;

  // ---------- Write ----------

  /** Create a new scheduler card. */
  create(card: Omit<ISchedulerCard, 'createdAt' | 'updatedAt'>): Promise<ISchedulerCard>;

  /** Update an existing scheduler card with optimistic locking. */
  update(
    userId: UserId,
    cardId: CardId,
    data: Partial<
      Pick<
        ISchedulerCard,
        | 'lane'
        | 'stability'
        | 'difficultyParameter'
        | 'halfLife'
        | 'interval'
        | 'nextReviewDate'
        | 'lastReviewedAt'
        | 'reviewCount'
        | 'lapseCount'
        | 'consecutiveCorrect'
        | 'schedulingAlgorithm'
        | 'state'
        | 'suspendedUntil'
        | 'suspendedReason'
      >
    >,
    expectedVersion: number
  ): Promise<ISchedulerCard>;

  /** Delete a scheduler card. */
  delete(userId: UserId, cardId: CardId): Promise<void>;

  /** Delete all scheduler cards for a user (GDPR erasure). */
  deleteByUser(userId: UserId): Promise<number>;

  /** Batch create scheduler cards for efficiency. */
  createBatch(cards: Omit<ISchedulerCard, 'createdAt' | 'updatedAt'>[]): Promise<ISchedulerCard[]>;

  // ---------- Phase 3: Paginated Read ----------

  /** Find scheduler cards with pagination, extended filters, and sorting. */
  findByUserPaginated(
    userId: UserId,
    filters: ISchedulerCardExtendedFilters,
    pagination: IPaginationParams,
    sort: ISortParams<'nextReviewDate' | 'stability' | 'difficulty' | 'reviewCount' | 'createdAt'>
  ): Promise<ISchedulerCard[]>;

  /** Count scheduler cards matching extended filters (for pagination metadata). */
  countByUserFiltered(userId: UserId, filters: ISchedulerCardExtendedFilters): Promise<number>;

  /** Find all reviewable cards for forecast computation. */
  findReviewableByUser(userId: UserId): Promise<ISchedulerCard[]>;
}

// ============================================================================
// Review Operations
// ============================================================================

export interface IReviewRepository {
  // ---------- Read ----------

  /** Find a review by ID. Returns null if not found. */
  findById(id: string): Promise<IReview | null>;

  /** Find reviews for a card, ordered by reviewedAt desc. */
  findByCard(cardId: CardId, limit?: number): Promise<IReview[]>;

  /** Find reviews for a user within a time range. */
  findByUser(userId: UserId, filters?: IReviewFilters): Promise<IReview[]>;

  /** Find reviews for a session. */
  findBySession(sessionId: string): Promise<IReview[]>;

  /** Find a review by attempt ID for idempotent ingestion. */
  findByAttemptId(attemptId: string): Promise<IReview | null>;

  /** Count reviews for a card. */
  countByCard(cardId: CardId): Promise<number>;

  /** Count reviews for a user within a time range. */
  countByUser(userId: UserId, startDate?: Date, endDate?: Date): Promise<number>;

  // ---------- Write ----------

  /** Create a new review record. */
  create(review: Omit<IReview, 'createdAt'>): Promise<IReview>;

  /** Batch create reviews for efficiency. */
  createBatch(reviews: Omit<IReview, 'createdAt'>[]): Promise<IReview[]>;

  /** Delete a single review. */
  delete(id: string): Promise<void>;

  /** Delete all reviews for a user (GDPR erasure). */
  deleteByUser(userId: UserId): Promise<number>;

  // ---------- Phase 3: Paginated Read + Aggregation ----------

  /** Find reviews with pagination, extended filters, and sorting. */
  findByUserPaginated(
    userId: UserId,
    filters: IReviewExtendedFilters,
    pagination: IPaginationParams,
    sort: ISortParams<'reviewedAt' | 'responseTime' | 'rating'>
  ): Promise<IReview[]>;

  /** Count reviews matching extended filters (for pagination metadata). */
  countByUserFiltered(userId: UserId, filters: IReviewExtendedFilters): Promise<number>;

  /** Aggregate review statistics for a user with optional filters. */
  aggregateStats(
    userId: UserId,
    filters: IReviewExtendedFilters
  ): Promise<Omit<IReviewStatsResponse, 'reviewsByDay'>>;

  /** Get daily review counts for a user within a date range. */
  reviewsByDay(
    userId: UserId,
    filters: IReviewExtendedFilters
  ): Promise<Array<{ date: string; count: number }>>;
}

// ============================================================================
// CalibrationData Operations
// ============================================================================

export interface ICalibrationDataRepository {
  // ---------- Read ----------

  /** Find calibration data by ID. Returns null if not found. */
  findById(id: string): Promise<ICalibrationData | null>;

  /** Find calibration data for a specific card. */
  findByCard(userId: UserId, cardId: CardId): Promise<ICalibrationData | null>;

  /** Find calibration data for a card type (type-level calibration). */
  findByCardType(userId: UserId, cardType: string): Promise<ICalibrationData | null>;

  /** Find all calibration data for a user. */
  findByUser(userId: UserId): Promise<ICalibrationData[]>;

  // ---------- Write ----------

  /** Create new calibration data. */
  create(data: Omit<ICalibrationData, 'createdAt' | 'updatedAt'>): Promise<ICalibrationData>;

  /** Update existing calibration data. */
  update(
    id: string,
    data: Partial<
      Pick<ICalibrationData, 'parameters' | 'sampleCount' | 'confidenceScore' | 'lastTrainedAt'>
    >
  ): Promise<ICalibrationData>;

  /** Upsert calibration data (create or update). */
  upsert(
    userId: UserId,
    cardId: CardId | null,
    cardType: string | null,
    data: Partial<
      Pick<ICalibrationData, 'parameters' | 'sampleCount' | 'confidenceScore' | 'lastTrainedAt'>
    >
  ): Promise<ICalibrationData>;

  /** Delete calibration data. */
  delete(id: string): Promise<void>;

  /** Delete all calibration data for a user (GDPR erasure). */
  deleteByUser(userId: UserId): Promise<number>;
}

export interface ISchedulerProvenanceRepository {
  recordProposal(input: IProposalProvenanceInput): Promise<void>;
  recordCommit(input: ICommitProvenanceInput): Promise<void>;
  recordCohortLineage(input: ICohortLineageInput): Promise<void>;
}

export type HandshakeState = 'proposed' | 'accepted' | 'revised' | 'committed';

export interface IConsumerLinkage {
  correlationId: string;
  proposalId?: string;
  decisionId?: string;
  sessionId?: string;
  sessionRevision?: number;
  userId?: UserId;
}

export interface IInboxClaimInput {
  idempotencyKey: string;
  eventType: string;
  streamMessageId?: string;
  linkage: IConsumerLinkage;
  payload: Record<string, unknown>;
}

export interface IHandshakeTransitionInput {
  state: HandshakeState;
  eventType: string;
  streamMessageId?: string;
  linkage: IConsumerLinkage;
  metadata?: Record<string, unknown>;
}

export interface IInboxClaimResult {
  status: 'claimed' | 'duplicate_processed' | 'duplicate_inflight';
}

export interface ISchedulerEventReliabilityRepository {
  claimInbox(input: IInboxClaimInput): Promise<IInboxClaimResult>;
  markInboxProcessed(idempotencyKey: string): Promise<void>;
  markInboxFailed(idempotencyKey: string, errorMessage: string): Promise<void>;
  readLatestSessionRevision(sessionId: string, proposalId: string): Promise<number | null>;
  applyHandshakeTransition(input: IHandshakeTransitionInput): Promise<void>;
}
