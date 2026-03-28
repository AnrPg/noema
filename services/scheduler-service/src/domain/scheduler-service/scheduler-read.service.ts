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
import type { CardId, StudyMode, UserId } from '@noema/types';

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
  ISchedulerCardFocusEntry,
  ISchedulerCardFocusSummary,
  ISchedulerCardExtendedFilters,
  ISchedulerGuidanceRecommendation,
  ISchedulerProgressSummary,
  ISchedulerCardResponse,
  ISchedulerStudyGuidanceSummary,
  ISortParams,
  SchedulerDueStatus,
  SchedulerReadinessBand,
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
  // T6.2 — Mode-scoped scheduler progress summary
  // --------------------------------------------------------------------------

  async getProgressSummary(
    userId: UserId,
    studyMode: StudyMode = 'knowledge_gaining'
  ): Promise<IServiceResult<ISchedulerProgressSummary>> {
    const cards = await this.repos.schedulerCardRepository.findByUser(userId, { studyMode });
    const summary = this.buildProgressSummary(userId, studyMode, cards);

    return {
      data: summary,
      agentHints: this.hints(
        'scheduler_progress_summary_retrieved',
        `Mode ${studyMode}: ${String(summary.dueNow)} due now, ${String(summary.matureCards)} mature, ${String(summary.totalCards)} total cards`
      ),
    };
  }

  async getCardFocusSummary(
    userId: UserId,
    studyMode: StudyMode = 'knowledge_gaining',
    limit = 5
  ): Promise<IServiceResult<ISchedulerCardFocusSummary>> {
    const cards = await this.repos.schedulerCardRepository.findByUser(userId, { studyMode });
    const summary = this.buildCardFocusSummary(userId, studyMode, cards, limit);

    return {
      data: summary,
      agentHints: this.hints(
        'scheduler_card_focus_summary_retrieved',
        `Mode ${studyMode}: ${String(summary.weakestCards.length)} fragile cards and ${String(summary.strongestCards.length)} strong cards highlighted`
      ),
    };
  }

  async getStudyGuidanceSummary(
    userId: UserId,
    studyMode: StudyMode = 'knowledge_gaining'
  ): Promise<IServiceResult<ISchedulerStudyGuidanceSummary>> {
    const cards = await this.repos.schedulerCardRepository.findByUser(userId, { studyMode });
    const progress = this.buildProgressSummary(userId, studyMode, cards);
    const focus = this.buildCardFocusSummary(userId, studyMode, cards, 3);
    const summary = this.buildStudyGuidanceSummary(userId, studyMode, progress, focus);

    return {
      data: summary,
      agentHints: this.hints(
        'scheduler_study_guidance_retrieved',
        summary.recommendations.length > 0
          ? `${summary.recommendations[0]?.headline}: ${summary.recommendations[0]?.explanation}`
          : 'No study guidance available'
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
    const filteredCards =
      input.studyMode !== undefined
        ? cards.filter((card) => card.studyMode === input.studyMode)
        : cards;

    // 2. Derive per-user average seconds per card from recent review stats
    const averageSecondsPerCard = await this.deriveAverageSecondsPerCard(input.userId);

    // 3. Build a mutable map of cardId → projected next review date
    //    The consumed-card model simulates the user reviewing each due card on
    //    its due day and projecting the next review forward by the card's interval.
    const projected = new Map<string, { nextDue: Date; interval: number; lane: string }>();
    for (const card of filteredCards) {
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
        `${String(days)}-day forecast across ${String(filteredCards.length)} reviewable cards`
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
      studyMode: card.studyMode,
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

  private buildProgressSummary(
    userId: UserId,
    studyMode: StudyMode,
    cards: ISchedulerCard[]
  ): ISchedulerProgressSummary {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);

    const activeCards = cards.filter((card) => !this.isCardSuspended(card, now));
    const trackedCards = cards.filter(
      (card) => card.reviewCount > 0 || card.lastReviewedAt !== null
    ).length;
    const dueNow = activeCards.filter((card) => new Date(card.nextReviewDate) <= now).length;
    const dueToday = activeCards.filter(
      (card) => new Date(card.nextReviewDate) <= endOfToday
    ).length;
    const overdueCards = activeCards.filter(
      (card) => new Date(card.nextReviewDate) < startOfToday
    ).length;
    const newCards = cards.filter((card) => card.state === 'new').length;
    const learningCards = cards.filter(
      (card) => card.state === 'learning' || card.state === 'relearning'
    ).length;
    const matureCards = cards.filter(
      (card) => card.state === 'review' || card.state === 'graduated'
    ).length;
    const suspendedCards = cards.filter((card) => this.isCardSuspended(card, now)).length;
    const retentionCards = cards.filter((card) => card.lane === 'retention').length;
    const calibrationCards = cards.filter((card) => card.lane === 'calibration').length;
    const fsrsCards = cards.filter((card) => card.schedulingAlgorithm === 'fsrs').length;
    const hlrCards = cards.filter((card) => card.schedulingAlgorithm === 'hlr').length;
    const sm2Cards = cards.filter((card) => card.schedulingAlgorithm === 'sm2').length;

    const recallProbabilities = activeCards
      .map((card) => this.computeRecallProbability(card))
      .filter((value): value is number => value !== null);

    const averageRecallProbability =
      recallProbabilities.length > 0
        ? recallProbabilities.reduce((sum, value) => sum + value, 0) / recallProbabilities.length
        : null;

    return {
      userId,
      studyMode,
      totalCards: cards.length,
      trackedCards,
      dueNow,
      dueToday,
      overdueCards,
      newCards,
      learningCards,
      matureCards,
      suspendedCards,
      retentionCards,
      calibrationCards,
      fsrsCards,
      hlrCards,
      sm2Cards,
      averageRecallProbability,
      strongRecallCards: recallProbabilities.filter((value) => value >= 0.85).length,
      fragileCards: recallProbabilities.filter((value) => value < 0.5).length,
    };
  }

  private buildCardFocusSummary(
    userId: UserId,
    studyMode: StudyMode,
    cards: ISchedulerCard[],
    limit: number
  ): ISchedulerCardFocusSummary {
    const now = new Date();
    const focusEntries = cards
      .filter((card) => !this.isCardSuspended(card, now))
      .map((card) => this.toFocusEntry(card, now));
    const trackedEntries = focusEntries.filter(
      (entry) => entry.reviewCount > 0 || entry.readinessBand !== 'untracked'
    );

    const weakestCards = [...trackedEntries]
      .sort((left, right) => this.compareWeakestFocusEntries(left, right))
      .slice(0, limit);

    const strongestCards = [...trackedEntries]
      .filter((entry) => entry.recallProbability !== null)
      .sort((left, right) => this.compareStrongestFocusEntries(left, right))
      .slice(0, limit);

    return {
      userId,
      studyMode,
      weakestCards,
      strongestCards,
    };
  }

  private buildStudyGuidanceSummary(
    userId: UserId,
    studyMode: StudyMode,
    progress: ISchedulerProgressSummary,
    focus: ISchedulerCardFocusSummary
  ): ISchedulerStudyGuidanceSummary {
    const recommendations: ISchedulerGuidanceRecommendation[] = [];

    if (progress.overdueCards > 0) {
      recommendations.push({
        action: 'clear_overdue',
        headline: 'Clear the overdue backlog first',
        explanation: 'Overdue cards are the main source of memory drift in this mode right now.',
        suggestedCardCount: Math.min(progress.overdueCards, 12),
        relatedCardIds: focus.weakestCards.map((card) => card.cardId),
      });
    }

    if (progress.fragileCards >= 3 || focus.weakestCards.length >= 3) {
      recommendations.push({
        action: 'reinforce_fragile_cards',
        headline: 'Reinforce fragile cards',
        explanation: 'Your biggest risk is low-confidence retention, not lack of coverage.',
        suggestedCardCount: Math.min(Math.max(progress.fragileCards, 3), 10),
        relatedCardIds: focus.weakestCards.map((card) => card.cardId),
      });
    }

    if (progress.dueToday > 0) {
      recommendations.push({
        action: 'do_scheduled_reviews',
        headline: 'Finish today’s planned reviews',
        explanation: 'The mode is healthy enough that staying on schedule is the best next step.',
        suggestedCardCount: Math.min(progress.dueToday, 10),
        relatedCardIds: focus.weakestCards.map((card) => card.cardId),
      });
    }

    if (progress.newCards > progress.matureCards || progress.totalCards === 0) {
      recommendations.push({
        action: 'build_coverage',
        headline: 'Build more tracked coverage',
        explanation:
          'You need more meaningful exposure in this mode before deeper optimization matters.',
        suggestedCardCount: Math.max(3, Math.min(progress.newCards || 5, 8)),
        relatedCardIds: [],
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        action: 'expand_confidently',
        headline: 'You have room to expand',
        explanation: 'Your current mode looks stable enough to add new material.',
        suggestedCardCount: Math.max(3, Math.min(8, progress.newCards || 3)),
        relatedCardIds: focus.strongestCards.slice(0, 2).map((card) => card.cardId),
      });
    }

    return {
      userId,
      studyMode,
      recommendations,
    };
  }

  private toFocusEntry(card: ISchedulerCard, now: Date): ISchedulerCardFocusEntry {
    const recallProbability = this.computeRecallProbability(card);
    const nextReviewDate = new Date(card.nextReviewDate);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);
    const dueStatus: SchedulerDueStatus =
      nextReviewDate < startOfToday
        ? 'overdue'
        : nextReviewDate <= endOfToday
          ? 'due_today'
          : 'upcoming';
    const daysUntilDue = Math.round((nextReviewDate.getTime() - now.getTime()) / 86_400_000);
    const readinessBand = this.classifyReadinessBand(card, recallProbability);

    return {
      cardId: card.cardId,
      studyMode: card.studyMode,
      lane: card.lane,
      state: card.state,
      schedulingAlgorithm: card.schedulingAlgorithm as 'fsrs' | 'hlr' | 'sm2',
      nextReviewDate: card.nextReviewDate,
      reviewCount: card.reviewCount,
      cardType: card.cardType,
      difficulty: card.difficulty,
      dueStatus,
      daysUntilDue,
      recallProbability,
      readinessBand,
      focusReason: this.describeFocusReason(card, recallProbability, dueStatus, readinessBand),
    };
  }

  private classifyReadinessBand(
    card: ISchedulerCard,
    recallProbability: number | null
  ): SchedulerReadinessBand {
    if (card.reviewCount === 0 || card.lastReviewedAt === null) {
      return 'untracked';
    }

    if (recallProbability === null) {
      return card.state === 'learning' || card.state === 'relearning' ? 'recovering' : 'fragile';
    }

    if (recallProbability < 0.5) {
      return 'fragile';
    }

    if (recallProbability < 0.8) {
      return 'recovering';
    }

    return 'stable';
  }

  private describeFocusReason(
    card: ISchedulerCard,
    recallProbability: number | null,
    dueStatus: SchedulerDueStatus,
    readinessBand: SchedulerReadinessBand
  ): string {
    if (dueStatus === 'overdue' && readinessBand === 'fragile') {
      return 'Overdue and fragile';
    }

    if (dueStatus === 'overdue') {
      return 'Overdue for review';
    }

    if (dueStatus === 'due_today') {
      return 'Due today';
    }

    if (readinessBand === 'untracked') {
      return 'Needs first meaningful review';
    }

    if (readinessBand === 'fragile') {
      return 'Low recall confidence';
    }

    if (readinessBand === 'recovering') {
      return card.state === 'learning' || card.state === 'relearning'
        ? 'Still consolidating'
        : 'Retention improving';
    }

    if (recallProbability !== null && recallProbability >= 0.9) {
      return 'Strong retention';
    }

    return 'Stable recall';
  }

  private compareWeakestFocusEntries(
    left: ISchedulerCardFocusEntry,
    right: ISchedulerCardFocusEntry
  ): number {
    const duePriority = { overdue: 0, due_today: 1, upcoming: 2 };
    const leftDue = duePriority[left.dueStatus];
    const rightDue = duePriority[right.dueStatus];
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    const leftRecall = left.recallProbability ?? Number.POSITIVE_INFINITY;
    const rightRecall = right.recallProbability ?? Number.POSITIVE_INFINITY;
    if (leftRecall !== rightRecall) {
      return leftRecall - rightRecall;
    }

    return new Date(left.nextReviewDate).getTime() - new Date(right.nextReviewDate).getTime();
  }

  private compareStrongestFocusEntries(
    left: ISchedulerCardFocusEntry,
    right: ISchedulerCardFocusEntry
  ): number {
    const leftRecall = left.recallProbability ?? -1;
    const rightRecall = right.recallProbability ?? -1;
    if (leftRecall !== rightRecall) {
      return rightRecall - leftRecall;
    }

    if (left.reviewCount !== right.reviewCount) {
      return right.reviewCount - left.reviewCount;
    }

    return new Date(right.nextReviewDate).getTime() - new Date(left.nextReviewDate).getTime();
  }

  private isCardSuspended(card: ISchedulerCard, now: Date): boolean {
    if (card.state === 'suspended') {
      return true;
    }

    if (card.suspendedUntil === null) {
      return false;
    }

    return new Date(card.suspendedUntil) > now;
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
