/**
 * @noema/scheduler-service - Scheduler Repository Interface
 *
 * Abstract repository interface for scheduler aggregate persistence.
 * Covers SchedulerCard, Review, and CalibrationData entities.
 */

import type { CardId, UserId } from '@noema/types';
import type {
  ICalibrationData,
  IReview,
  IReviewFilters,
  ISchedulerCard,
  ISchedulerCardFilters,
  SchedulerCardState,
  SchedulerLane,
} from '../../types/scheduler.types.js';

// ============================================================================
// SchedulerCard Operations
// ============================================================================

export interface ISchedulerCardRepository {
  // ---------- Read ----------

  /** Find a scheduler card by ID. Returns null if not found. */
  findById(cardId: CardId): Promise<ISchedulerCard | null>;

  /** Find a scheduler card by ID, throws if not found. */
  getById(cardId: CardId): Promise<ISchedulerCard>;

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
  delete(cardId: CardId): Promise<void>;

  /** Batch create scheduler cards for efficiency. */
  createBatch(cards: Omit<ISchedulerCard, 'createdAt' | 'updatedAt'>[]): Promise<ISchedulerCard[]>;
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
}
