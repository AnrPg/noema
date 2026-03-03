/**
 * @noema/scheduler-service — Phase 3 Read-Only Service
 *
 * Provides read endpoints for scheduler card state, review history, review stats,
 * and multi-day forecast. This service has NO side effects — it does not publish
 * events, commit schedules, or modify state.
 *
 * Separation rationale (ADR-0050):
 *  - The write-oriented SchedulerService (1 373 LOC) handles plan/commit/propose workflows.
 *  - SchedulerReadService handles paginated reads and projections.
 *  - Keeps the dependency graph narrow: no IEventPublisher, no provenance repo.
 */

import type { IAgentHints } from '@noema/contracts';
import type { CardId, UserId } from '@noema/types';

import type {
  IForecastDay,
  IForecastInput,
  IForecastLaneCounts,
  IForecastResponse,
  IPaginationParams,
  IReview,
  IReviewExtendedFilters,
  IReviewStatsResponse,
  ISchedulerCard,
  ISchedulerCardExtendedFilters,
  ISchedulerCardResponse,
  ISortParams,
} from '../../types/scheduler.types.js';
import { DEFAULT_FSRS_WEIGHTS, FSRSModel } from './algorithms/fsrs.js';
import type { IReviewRepository, ISchedulerCardRepository } from './scheduler.repository.js';

// ============================================================================
// Types
// ============================================================================

export interface ISchedulerReadRepositories {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
}

export interface IServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}

// ============================================================================
// Constants
// ============================================================================

/** Default seconds per card for forecast time estimation. */
const DEFAULT_SECONDS_PER_CARD = 90;

/**
 * A shared FSRS model instance used solely for computing recall probability
 * via the forgetting curve. It never mutates card state.
 */
const fsrsModel = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

// ============================================================================
// Service
// ============================================================================

export class SchedulerReadService {
  constructor(private readonly repos: ISchedulerReadRepositories) {}

  // --------------------------------------------------------------------------
  // T3.1 — Single card state
  // --------------------------------------------------------------------------

  async getSchedulerCard(
    userId: UserId,
    cardId: CardId
  ): Promise<IServiceResult<ISchedulerCardResponse>> {
    const card = await this.repos.schedulerCardRepository.findByCard(userId, cardId);
    if (card === null) {
      throw new Error(`Scheduler card not found for cardId=${cardId}, userId=${userId}`);
    }

    const response = this.toCardResponse(card, true);

    return {
      data: response,
      agentHints: this.hints(
        'scheduler_card_retrieved',
        `Card ${cardId} is in ${card.lane} lane, state=${card.state}, interval=${String(card.interval)}d`
      ),
    };
  }

  // --------------------------------------------------------------------------
  // T3.1 — Paginated card list
  // --------------------------------------------------------------------------

  async listSchedulerCards(
    userId: UserId,
    filters: ISchedulerCardExtendedFilters,
    pagination: IPaginationParams,
    sort: ISortParams<'nextReviewDate' | 'stability' | 'difficulty' | 'reviewCount' | 'createdAt'>
  ): Promise<
    IServiceResult<{
      cards: ISchedulerCardResponse[];
      total: number;
    }>
  > {
    const [cards, total] = await Promise.all([
      this.repos.schedulerCardRepository.findByUserPaginated(userId, filters, pagination, sort),
      this.repos.schedulerCardRepository.countByUserFiltered(userId, filters),
    ]);

    // List endpoint omits inline recall probability per spec (performance).
    const cardResponses = cards.map((card) => this.toCardResponse(card, false));

    return {
      data: { cards: cardResponses, total },
      agentHints: this.hints(
        'scheduler_cards_listed',
        `Returned ${String(cardResponses.length)} of ${String(total)} cards`
      ),
    };
  }

  // --------------------------------------------------------------------------
  // T3.2 — Paginated review history
  // --------------------------------------------------------------------------

  async listReviews(
    userId: UserId,
    filters: IReviewExtendedFilters,
    pagination: IPaginationParams,
    sort: ISortParams<'reviewedAt' | 'responseTime' | 'rating'>
  ): Promise<
    IServiceResult<{
      reviews: IReview[];
      total: number;
    }>
  > {
    const [reviews, total] = await Promise.all([
      this.repos.reviewRepository.findByUserPaginated(userId, filters, pagination, sort),
      this.repos.reviewRepository.countByUserFiltered(userId, filters),
    ]);

    return {
      data: { reviews, total },
      agentHints: this.hints(
        'reviews_listed',
        `Returned ${String(reviews.length)} of ${String(total)} reviews`
      ),
    };
  }

  // --------------------------------------------------------------------------
  // T3.2 — Aggregated review statistics
  // --------------------------------------------------------------------------

  async getReviewStats(
    userId: UserId,
    filters: IReviewExtendedFilters
  ): Promise<IServiceResult<IReviewStatsResponse>> {
    const [stats, dailyCounts] = await Promise.all([
      this.repos.reviewRepository.aggregateStats(userId, filters),
      this.repos.reviewRepository.reviewsByDay(userId, filters),
    ]);

    const response: IReviewStatsResponse = {
      ...stats,
      reviewsByDay: dailyCounts,
    };

    return {
      data: response,
      agentHints: this.hints(
        'review_stats_retrieved',
        `${String(stats.totalReviews)} total reviews, avg response ${String(stats.averageResponseTimeMs ?? 'N/A')}ms`
      ),
    };
  }

  // --------------------------------------------------------------------------
  // T3.3 — Multi-day forecast (consumed-card model)
  // --------------------------------------------------------------------------

  async generateForecast(input: IForecastInput): Promise<IServiceResult<IForecastResponse>> {
    const days = input.days ?? 7;
    const includeOverdue = input.includeOverdue ?? true;

    // 1. Fetch all reviewable cards for the user
    const cards = await this.repos.schedulerCardRepository.findReviewableByUser(input.userId);

    // 2. Derive per-user average seconds per card from recent review stats
    const averageSecondsPerCard = await this.deriveAverageSecondsPerCard(input.userId);

    // 3. Build a mutable map of cardId → projected next review date
    //    The consumed-card model simulates the user reviewing each due card on
    //    its due day and projecting the next review forward by the card's interval.
    const projected = new Map<string, { nextDue: Date; interval: number; lane: string }>();
    for (const card of cards) {
      projected.set(card.cardId, {
        nextDue: new Date(card.nextReviewDate),
        interval: Math.max(1, card.interval),
        lane: card.lane,
      });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const forecastDays: IForecastDay[] = [];

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const dayStart = new Date(startOfToday.getTime() + dayOffset * 86_400_000);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);

      const retention: IForecastLaneCounts = { newDue: 0, overdue: 0, total: 0 };
      const calibration: IForecastLaneCounts = { newDue: 0, overdue: 0, total: 0 };

      // Collect cards due on or before this day
      const consumedThisDay: string[] = [];

      for (const [cardId, entry] of projected) {
        const isDue = entry.nextDue <= dayEnd;

        // Skip overdue cards on day 0 if includeOverdue is false
        if (dayOffset === 0 && !includeOverdue && entry.nextDue < startOfToday) {
          continue;
        }

        if (!isDue) continue;

        const lane = entry.lane === 'calibration' ? calibration : retention;
        const isOverdue = entry.nextDue < dayStart;

        if (isOverdue) {
          lane.overdue += 1;
        } else {
          lane.newDue += 1;
        }
        lane.total += 1;

        consumedThisDay.push(cardId);
      }

      // "Consume" reviewed cards: project their next due date forward by interval
      for (const cardId of consumedThisDay) {
        const entry = projected.get(cardId);
        if (entry === undefined) continue;

        const nextDue = new Date(dayEnd.getTime() + entry.interval * 86_400_000);
        projected.set(cardId, { ...entry, nextDue });
      }

      const combined: IForecastLaneCounts = {
        newDue: retention.newDue + calibration.newDue,
        overdue: retention.overdue + calibration.overdue,
        total: retention.total + calibration.total,
      };

      forecastDays.push({
        date: dayStart.toISOString().split('T')[0] ?? dayStart.toISOString(),
        retention,
        calibration,
        combined,
        estimatedMinutes: Math.round((combined.total * averageSecondsPerCard) / 60),
      });
    }

    return {
      data: {
        days: forecastDays,
        generatedAt: new Date().toISOString(),
        model: 'consumed',
        averageSecondsPerCard,
      },
      agentHints: this.hints(
        'forecast_generated',
        `${String(days)}-day forecast across ${String(cards.length)} reviewable cards`
      ),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Map a domain ISchedulerCard to the API response shape.
   *
   * @param card       - The stored scheduler card
   * @param withRecall - Whether to compute currentRecallProbability inline.
   *                     The single-card endpoint sets this true; the list endpoint
   *                     sets it false for performance (spec requirement).
   */
  private toCardResponse(card: ISchedulerCard, withRecall: boolean): ISchedulerCardResponse {
    let currentRecallProbability: number | null = null;

    if (withRecall) {
      currentRecallProbability = this.computeRecallProbability(card);
    }

    return {
      cardId: card.cardId,
      userId: card.userId,
      lane: card.lane,
      state: card.state,
      schedulingAlgorithm: card.schedulingAlgorithm as 'fsrs' | 'hlr' | 'sm2',
      stability: card.stability,
      difficulty: card.difficultyParameter,
      interval: card.interval,
      halfLife: card.halfLife,
      currentRecallProbability,
      nextReviewDate: card.nextReviewDate,
      lastReviewedAt: card.lastReviewedAt,
      reviewCount: card.reviewCount,
      lapseCount: card.lapseCount,
      consecutiveCorrect: card.consecutiveCorrect,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  /**
   * Compute recall probability for a given card.
   *
   *  - FSRS lane: `FSRSModel.forgettingCurve(elapsedDays, stability)`
   *  - HLR lane:  `2^(-elapsedDays / halfLife)`   (simplified closed-form)
   *  - SM2 / fallback: null (no formula available without additional parameters)
   */
  private computeRecallProbability(card: ISchedulerCard): number | null {
    const elapsedDays = this.elapsedDaysSinceLastReview(card);
    if (elapsedDays === null) return null;

    if (card.schedulingAlgorithm === 'fsrs' && card.stability !== null && card.stability > 0) {
      return fsrsModel.forgettingCurve(elapsedDays, card.stability);
    }

    if (card.schedulingAlgorithm === 'hlr' && card.halfLife !== null && card.halfLife > 0) {
      return Math.pow(2, -elapsedDays / card.halfLife);
    }

    // SM2 or insufficient parameters
    return null;
  }

  /**
   * Calculate days elapsed since the card was last reviewed.
   * Returns null if the card has never been reviewed.
   */
  private elapsedDaysSinceLastReview(card: ISchedulerCard): number | null {
    if (card.lastReviewedAt === null) return null;

    const lastReview = new Date(card.lastReviewedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastReview.getTime();
    return Math.max(0, diffMs / 86_400_000);
  }

  /**
   * Derive a per-user average seconds-per-card from the last 30 days of review
   * data. Falls back to DEFAULT_SECONDS_PER_CARD (90s) when no data exists.
   */
  private async deriveAverageSecondsPerCard(userId: UserId): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const stats = await this.repos.reviewRepository.aggregateStats(userId, {
      startDate: thirtyDaysAgo,
    });

    if (stats.totalReviews === 0 || stats.averageResponseTimeMs === null) {
      return DEFAULT_SECONDS_PER_CARD;
    }

    // Convert ms → seconds, clamp to reasonable bounds [5s, 600s]
    const avgSeconds = stats.averageResponseTimeMs / 1000;
    return Math.max(5, Math.min(600, avgSeconds));
  }

  /**
   * Build a standardised agentHints payload.
   * Mirrors SchedulerService.defaultHints() for consistency.
   */
  private hints(action: string, reasoning: string): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action,
          description: reasoning,
          priority: 'high',
        },
      ],
      relatedResources: [],
      confidence: 1,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
      preferenceAlignment: [],
      reasoning,
    };
  }
}
