// =============================================================================
// DECK FILTER INTEGRATION
// =============================================================================
// Integrates the DeckQueryEngine with the Review Session Orchestrator.
// Provides efficient filtering of review candidates by deck membership.
// =============================================================================

import type {
  DeckEvaluationProvider,
  DeckMembershipResult,
} from "../../types/review-session.types";

import type {
  DynamicDeckId,
  DeckQueryEvaluationResult,
  DeckCardResult,
  DeckQuery,
} from "../../types/dynamic-deck.types";

import type { UserId } from "../../types/user.types";
import type { CanonicalCardId } from "../../types/canonical-card.types";
import type { Timestamp, Duration } from "../../types/lkgc/foundation";

// =============================================================================
// DECK FILTER ADAPTER
// =============================================================================

/**
 * Interface for the deck query engine (dependency injection)
 *
 * This matches the IDeckQueryEngine interface from dynamic-deck module.
 */
export interface DeckQueryEngineAdapter {
  /**
   * Evaluate a deck query
   */
  evaluate(input: {
    query?: DeckQuery;
    deckId?: DynamicDeckId;
    userId: UserId;
    timestamp: Timestamp;
    specificCardIds?: readonly CanonicalCardId[];
    includeExplainability?: boolean;
  }): Promise<DeckQueryEvaluationResult>;

  /**
   * Check if specific cards are members of a deck
   */
  checkMembership?(
    deckId: DynamicDeckId,
    cardIds: readonly CanonicalCardId[],
    userId: UserId,
  ): Promise<Map<CanonicalCardId, boolean>>;
}

/**
 * Adapter that bridges the DeckQueryEngine with the session orchestrator
 */
export class DeckFilterAdapter implements DeckEvaluationProvider {
  private readonly engine: DeckQueryEngineAdapter;
  private readonly cache: Map<string, CachedEvaluation>;
  private readonly cacheTtl: Duration;

  constructor(
    engine: DeckQueryEngineAdapter,
    options: { cacheTtl?: Duration } = {},
  ) {
    this.engine = engine;
    this.cache = new Map();
    this.cacheTtl = options.cacheTtl ?? ((5 * 60 * 1000) as Duration); // 5 minutes default
  }

  /**
   * Evaluate deck membership for a set of cards
   */
  async evaluateDeckMembership(
    deckId: DynamicDeckId,
    cardIds: readonly CanonicalCardId[],
    userId: UserId,
  ): Promise<DeckMembershipResult> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.buildCacheKey(deckId, userId);
    const cached = this.getCachedEvaluation(cacheKey);

    let deckResult: DeckQueryEvaluationResult;
    let _cacheHit = false;

    if (cached) {
      deckResult = cached;
      _cacheHit = true;
    } else {
      // Evaluate the deck
      deckResult = await this.engine.evaluate({
        deckId,
        userId,
        timestamp: Date.now() as Timestamp,
        specificCardIds: cardIds,
        includeExplainability: true,
      });

      // Cache the result
      this.setCachedEvaluation(cacheKey, deckResult);
    }

    // Build membership map
    const members = new Map<CanonicalCardId, DeckCardResult>();
    const nonMembers: CanonicalCardId[] = [];
    const _cardIdSet = new Set(cardIds as readonly string[]);

    // Index deck cards by ID
    const deckCardsById = new Map<string, DeckCardResult>();
    for (const card of deckResult.cards) {
      deckCardsById.set(card.cardId as string, card);
    }

    // Check each requested card
    for (const cardId of cardIds) {
      const deckCard = deckCardsById.get(cardId as string);
      if (deckCard) {
        members.set(cardId, deckCard);
      } else {
        nonMembers.push(cardId);
      }
    }

    const evaluationTime = Date.now() - startTime;

    return {
      members,
      nonMembers,
      metadata: {
        evaluationTimeMs: evaluationTime,
        predicatesEvaluated: deckResult.metadata?.predicatesEvaluated ?? 0,
      },
    };
  }

  /**
   * Get full deck evaluation
   */
  async evaluateDeck(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<DeckQueryEvaluationResult> {
    // Check cache
    const cacheKey = this.buildCacheKey(deckId, userId);
    const cached = this.getCachedEvaluation(cacheKey);

    if (cached) {
      return cached;
    }

    // Evaluate
    const result = await this.engine.evaluate({
      deckId,
      userId,
      timestamp: Date.now() as Timestamp,
      includeExplainability: true,
    });

    // Cache
    this.setCachedEvaluation(cacheKey, result);

    return result;
  }

  /**
   * Invalidate cache for a deck
   */
  invalidateCache(deckId?: DynamicDeckId, userId?: UserId): void {
    if (deckId && userId) {
      const key = this.buildCacheKey(deckId, userId);
      this.cache.delete(key);
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private buildCacheKey(deckId: DynamicDeckId, userId: UserId): string {
    return `${deckId}:${userId}`;
  }

  private getCachedEvaluation(key: string): DeckQueryEvaluationResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCachedEvaluation(
    key: string,
    result: DeckQueryEvaluationResult,
  ): void {
    this.cache.set(key, {
      result,
      cachedAt: Date.now() as Timestamp,
      expiresAt: (Date.now() + this.cacheTtl) as Timestamp,
    });
  }
}

/** Cached evaluation entry */
interface CachedEvaluation {
  result: DeckQueryEvaluationResult;
  cachedAt: Timestamp;
  expiresAt: Timestamp;
}

// =============================================================================
// OPTIMIZED MEMBERSHIP CHECKER
// =============================================================================

/**
 * Optimized deck membership checker for large candidate lists.
 *
 * Uses batch operations and early termination to efficiently
 * filter large sets of review candidates by deck membership.
 */
export class OptimizedDeckMembershipChecker {
  private readonly provider: DeckEvaluationProvider;

  constructor(provider: DeckEvaluationProvider) {
    this.provider = provider;
  }

  /**
   * Filter candidates by deck membership
   *
   * @param deckId - Deck to check membership against
   * @param candidates - Candidates to filter (with cardId property)
   * @param userId - User ID
   * @param options - Filtering options
   */
  async filterByDeckMembership<T extends { cardId: CanonicalCardId | string }>(
    deckId: DynamicDeckId,
    candidates: readonly T[],
    userId: UserId,
    options: {
      /** Stop after finding this many members */
      earlyStopCount?: number;
      /** Process in batches of this size */
      batchSize?: number;
      /** Include deck position in result */
      includePosition?: boolean;
    } = {},
  ): Promise<DeckFilterResult<T>> {
    const {
      earlyStopCount,
      batchSize = 100,
      includePosition = false,
    } = options;

    if (candidates.length === 0) {
      return {
        members: [],
        filtered: [],
        membershipMap: new Map(),
      };
    }

    // Extract card IDs
    const cardIds = candidates.map((c) => c.cardId as CanonicalCardId);

    // For small sets, check all at once
    if (candidates.length <= batchSize) {
      return this.checkBatch(
        deckId,
        candidates,
        cardIds,
        userId,
        includePosition,
      );
    }

    // For large sets, process in batches with early stop
    const members: T[] = [];
    const filtered: T[] = [];
    const membershipMap = new Map<CanonicalCardId, DeckMemberInfo>();

    let processed = 0;
    while (processed < candidates.length) {
      // Check early stop
      if (earlyStopCount && members.length >= earlyStopCount) {
        // Mark remaining as filtered (unknown membership)
        for (let i = processed; i < candidates.length; i++) {
          filtered.push(candidates[i]);
        }
        break;
      }

      // Get next batch
      const batchEnd = Math.min(processed + batchSize, candidates.length);
      const batchCandidates = candidates.slice(processed, batchEnd);
      const batchCardIds = cardIds.slice(processed, batchEnd);

      // Check batch
      const batchResult = await this.provider.evaluateDeckMembership(
        deckId,
        batchCardIds,
        userId,
      );

      // Process results
      for (let i = 0; i < batchCandidates.length; i++) {
        const candidate = batchCandidates[i];
        const cardId = batchCardIds[i];
        const deckCard = batchResult.members.get(cardId);

        if (deckCard) {
          members.push(candidate);
          membershipMap.set(cardId, {
            isMember: true,
            position: deckCard.position,
            matchingCategories: deckCard.matchingCategoryIds,
          });
        } else {
          filtered.push(candidate);
          membershipMap.set(cardId, { isMember: false });
        }
      }

      processed = batchEnd;
    }

    return { members, filtered, membershipMap };
  }

  private async checkBatch<T extends { cardId: CanonicalCardId | string }>(
    deckId: DynamicDeckId,
    candidates: readonly T[],
    cardIds: readonly CanonicalCardId[],
    userId: UserId,
    includePosition: boolean,
  ): Promise<DeckFilterResult<T>> {
    const result = await this.provider.evaluateDeckMembership(
      deckId,
      cardIds,
      userId,
    );

    const members: T[] = [];
    const filtered: T[] = [];
    const membershipMap = new Map<CanonicalCardId, DeckMemberInfo>();

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const cardId = cardIds[i];
      const deckCard = result.members.get(cardId);

      if (deckCard) {
        members.push(candidate);
        membershipMap.set(cardId, {
          isMember: true,
          position: includePosition ? deckCard.position : undefined,
          matchingCategories: deckCard.matchingCategoryIds,
        });
      } else {
        filtered.push(candidate);
        membershipMap.set(cardId, { isMember: false });
      }
    }

    return { members, filtered, membershipMap };
  }
}

/**
 * Result of deck membership filtering
 */
export interface DeckFilterResult<T> {
  /** Candidates that are members of the deck */
  readonly members: T[];

  /** Candidates that are not members */
  readonly filtered: T[];

  /** Membership info by card ID */
  readonly membershipMap: Map<CanonicalCardId, DeckMemberInfo>;
}

/**
 * Membership info for a card
 */
export interface DeckMemberInfo {
  /** Is the card a member */
  readonly isMember: boolean;

  /** Position in deck (if member) */
  readonly position?: number;

  /** Matching category IDs (if member) */
  readonly matchingCategories?: readonly string[];
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a deck filter adapter
 */
export function createDeckFilterAdapter(
  engine: DeckQueryEngineAdapter,
  options?: { cacheTtl?: Duration },
): DeckEvaluationProvider {
  return new DeckFilterAdapter(engine, options);
}

/**
 * Create an optimized membership checker
 */
export function createMembershipChecker(
  provider: DeckEvaluationProvider,
): OptimizedDeckMembershipChecker {
  return new OptimizedDeckMembershipChecker(provider);
}
