// =============================================================================
// DECK QUERY ENGINE - Core evaluation engine
// =============================================================================
// Phase 6C: Dynamic Decks as Query Views
//
// The engine evaluates deck queries and returns matching cards.
// Supports:
// - Base queries (filter predicates)
// - Combinators (union, intersection, difference, symmetric difference)
// - Nested deck references
// - Full explainability
// - Auto-update subscriptions
// =============================================================================

import type {
  // Core types
  DynamicDeckDefinition,
  DynamicDeckId,
  DeckQuery,
  DeckQueryId,
  BaseDeckQuery,
  CombinatorQuery,
  DeckReferenceQuery,
  DeckSortSpec,
  DeckSortField,
  // Evaluation types
  DeckQueryEvaluationInput,
  DeckQueryEvaluationResult,
  DeckCardResult,
  DeckEvaluationMetadata,
  DeckStatistics,
  CardState,
  // Explainability
  CardInclusionExplanation,
  InclusionExplanationId,
  InclusionReason,
  QueryNodeMatch,
  InclusionFactor,
  InclusionFactorType,
  ExclusionThreat,
  // Change types
  DeckChangePreview,
  DeckChangeEvent,
  DeckChangeCallback,
  DeckChangeSubscription,
  // Validation
  DeckQueryValidationResult,
  DeckQueryError,
  DeckQueryWarning,
  DeckQueryComplexity,
  // Custom predicates
  CustomPredicateEvaluator,
  // Dependencies
  IDeckQueryEngine,
  GraphReader,
  LkgcReader,
  PredicateId,
} from "../../types/dynamic-deck.types";
import type { CanonicalCardId } from "../../types/canonical-card.types";
import type { CategoryId } from "../../types/ecosystem.types";
import type { ParticipationId } from "../../types/multi-belonging.types";
import type { UserId } from "../../types/user.types";
import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "../../types/lkgc/foundation";

import {
  type CardEvaluationData,
  type CategoryHierarchyData,
  type FullEvaluationContext,
  type PredicateMatchResult,
  evaluateBaseQuery,
  createMatchResult,
} from "./predicate-evaluators";

// =============================================================================
// ENGINE CONFIGURATION
// =============================================================================

/**
 * Configuration for the deck query engine
 */
export interface DeckQueryEngineConfig {
  /** Default page size for results */
  readonly defaultPageSize: number;

  /** Maximum page size allowed */
  readonly maxPageSize: number;

  /** Maximum query complexity allowed */
  readonly maxComplexity: number;

  /** Maximum combinator operands */
  readonly maxCombinatorOperands: number;

  /** Maximum traversal depth for graph predicates */
  readonly maxTraversalDepth: number;

  /** Enable caching */
  readonly cacheEnabled: boolean;

  /** Cache TTL in milliseconds */
  readonly cacheTtlMs: Duration;
}

/**
 * Default engine configuration
 */
export const DEFAULT_ENGINE_CONFIG: DeckQueryEngineConfig = {
  defaultPageSize: 50,
  maxPageSize: 500,
  maxComplexity: 10,
  maxCombinatorOperands: 20,
  maxTraversalDepth: 10,
  cacheEnabled: true,
  cacheTtlMs: 60000 as Duration, // 1 minute
};

// =============================================================================
// DATA PROVIDERS - Abstraction over data sources
// =============================================================================

/**
 * Provider for card data
 */
export interface CardDataProvider {
  /** Get a single card's data */
  getCard(
    cardId: CanonicalCardId,
    userId: UserId,
  ): Promise<CardEvaluationData | undefined>;

  /** Get multiple cards */
  getCards(
    cardIds: readonly CanonicalCardId[],
    userId: UserId,
  ): Promise<readonly CardEvaluationData[]>;

  /** Get all cards for a user (for full scan queries) */
  getAllUserCards(userId: UserId): Promise<readonly CardEvaluationData[]>;

  /** Get cards by category */
  getCardsByCategory(
    categoryId: CategoryId,
    userId: UserId,
  ): Promise<readonly CardEvaluationData[]>;

  /** Get cards by categories (union) */
  getCardsByCategories(
    categoryIds: readonly CategoryId[],
    userId: UserId,
  ): Promise<readonly CardEvaluationData[]>;
}

/**
 * Provider for category hierarchy data
 */
export interface CategoryHierarchyProvider {
  /** Get full hierarchy for a user */
  getHierarchy(
    userId: UserId,
  ): Promise<ReadonlyMap<CategoryId, CategoryHierarchyData>>;

  /** Get descendants of a category */
  getDescendants(
    categoryId: CategoryId,
    userId: UserId,
  ): Promise<readonly CategoryId[]>;
}

/**
 * Provider for deck definitions
 */
export interface DeckDefinitionProvider {
  /** Get a deck definition */
  getDeck(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<DynamicDeckDefinition | undefined>;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/**
 * Internal card match result with metadata
 */
interface CardMatchResult {
  readonly cardId: CanonicalCardId;
  readonly matched: boolean;
  readonly matchDetails: PredicateMatchResult[];
  readonly queryNodeMatches: QueryNodeMatch[];
  readonly matchingCategoryIds: CategoryId[];
  readonly matchingParticipationIds: ParticipationId[];
}

/**
 * Subscription entry
 */
interface SubscriptionEntry {
  readonly deckId: DynamicDeckId;
  readonly callback: DeckChangeCallback;
  active: boolean;
}

// =============================================================================
// DECK QUERY ENGINE IMPLEMENTATION
// =============================================================================

/**
 * DeckQueryEngine - Evaluates deck queries and returns matching cards
 */
export class DeckQueryEngine implements IDeckQueryEngine {
  private readonly config: DeckQueryEngineConfig;
  private readonly cardProvider: CardDataProvider;
  private readonly categoryProvider: CategoryHierarchyProvider;
  private readonly deckProvider: DeckDefinitionProvider;
  private readonly graphReader: GraphReader;
  private readonly lkgcReader: LkgcReader;

  // Plugin registries
  private readonly customPredicateEvaluators = new Map<
    string,
    CustomPredicateEvaluator
  >();

  // Subscriptions
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private subscriptionCounter = 0;

  // Cache
  private readonly cache = new Map<
    string,
    { result: DeckQueryEvaluationResult; timestamp: number }
  >();

  constructor(
    cardProvider: CardDataProvider,
    categoryProvider: CategoryHierarchyProvider,
    deckProvider: DeckDefinitionProvider,
    graphReader: GraphReader,
    lkgcReader: LkgcReader,
    config: Partial<DeckQueryEngineConfig> = {},
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.cardProvider = cardProvider;
    this.categoryProvider = categoryProvider;
    this.deckProvider = deckProvider;
    this.graphReader = graphReader;
    this.lkgcReader = lkgcReader;
  }

  // ===========================================================================
  // MAIN EVALUATION
  // ===========================================================================

  /**
   * Evaluate a deck query and return matching cards
   */
  async evaluate(
    input: DeckQueryEvaluationInput,
  ): Promise<DeckQueryEvaluationResult> {
    const startTime = Date.now();

    // Resolve query (handle deck ID vs. inline query)
    let query: DeckQuery;
    let deckId: DynamicDeckId | undefined;

    if (typeof input.query === "string") {
      // It's a deck ID
      deckId = input.query;
      const deck = await this.deckProvider.getDeck(deckId, input.userId);
      if (!deck) {
        throw new Error(`Deck not found: ${deckId}`);
      }
      query = deck.query;
    } else {
      query = input.query;
    }

    // Check cache
    const cacheKey = this.getCacheKey(
      query,
      input.userId,
      input.sortOverride,
      input.limitOverride,
    );
    if (this.config.cacheEnabled && !input.specificCardIds) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        return {
          ...cached.result,
          metadata: {
            ...cached.result.metadata,
            fromCache: true,
            cacheAgeMs: Date.now() - cached.timestamp,
          },
        };
      }
    }

    // Get evaluation context
    const categoryHierarchy = await this.categoryProvider.getHierarchy(
      input.userId,
    );

    // Determine which cards to evaluate
    let candidateCards: readonly CardEvaluationData[];
    if (input.specificCardIds && input.specificCardIds.length > 0) {
      // Only evaluate specific cards
      candidateCards = await this.cardProvider.getCards(
        input.specificCardIds,
        input.userId,
      );
    } else {
      // Get all candidate cards (optimized based on query)
      candidateCards = await this.getCandidateCards(query, input.userId);
    }

    // Evaluate each card against the query
    const matchResults: CardMatchResult[] = [];
    let predicatesEvaluated = 0;
    let graphTraversals = 0;

    for (const card of candidateCards) {
      const context: FullEvaluationContext = {
        card,
        timestamp: input.timestamp,
        categoryHierarchy,
        graphReader: this.graphReader,
        lkgcReader: this.lkgcReader,
      };

      const result = await this.evaluateQuery(query, context);
      predicatesEvaluated += result.predicatesEvaluated;
      graphTraversals += result.graphTraversals;

      matchResults.push({
        cardId: card.cardId,
        matched: result.matched,
        matchDetails: result.matchDetails,
        queryNodeMatches: result.queryNodeMatches,
        matchingCategoryIds: this.getMatchingCategories(card, query),
        matchingParticipationIds: this.getMatchingParticipations(card, query),
      });
    }

    // Filter to matched cards
    const matchedResults = matchResults.filter((r) => r.matched);

    // Get card data for sorting
    const matchedCards = candidateCards.filter((c) =>
      matchedResults.some((r) => r.cardId === c.cardId),
    );

    // Sort results
    const sortSpec = input.sortOverride ?? this.getDefaultSortSpec(query);
    const sortedCards = this.sortCards(matchedCards, sortSpec);

    // Apply limit and pagination
    const limit =
      input.limitOverride ?? input.pageSize ?? this.config.defaultPageSize;
    const startIndex = input.cursor ? this.decodeCursor(input.cursor) : 0;
    const paginatedCards = sortedCards.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < sortedCards.length;

    // Build results
    const cards: DeckCardResult[] = await Promise.all(
      paginatedCards.map(async (card, index) => {
        const matchResult = matchedResults.find(
          (r) => r.cardId === card.cardId,
        )!;

        return {
          cardId: card.cardId,
          position: startIndex + index,
          sortKeys: this.getSortKeys(card, sortSpec),
          lkgcSignals: input.includeLkgcSignals
            ? await this.lkgcReader.getSignals(card.cardId)
            : undefined,
          matchingParticipationIds: matchResult.matchingParticipationIds,
          matchingCategoryIds: matchResult.matchingCategoryIds,
          inclusion: input.includeExplainability
            ? this.buildInclusionExplanation(card, matchResult, query, deckId)
            : undefined,
        };
      }),
    );

    // Calculate statistics
    const statistics = this.calculateStatistics(matchedCards, input.timestamp);

    // Build metadata
    const metadata: DeckEvaluationMetadata = {
      evaluatedAt: input.timestamp,
      evaluationDurationMs: Date.now() - startTime,
      fromCache: false,
      complexityScore: this.calculateComplexity(query).score,
      predicatesEvaluated,
      graphTraversals,
    };

    const result: DeckQueryEvaluationResult = {
      queryId: this.getQueryId(query),
      deckId,
      cards,
      totalCount: matchedResults.length,
      nextCursor: hasMore ? this.encodeCursor(startIndex + limit) : undefined,
      hasMore,
      metadata,
      statistics,
    };

    // Update cache
    if (this.config.cacheEnabled && !input.specificCardIds) {
      this.cache.set(cacheKey, { result, timestamp: Date.now() });
    }

    return result;
  }

  // ===========================================================================
  // QUERY EVALUATION
  // ===========================================================================

  /**
   * Evaluate a query against a card
   */
  private async evaluateQuery(
    query: DeckQuery,
    context: FullEvaluationContext,
  ): Promise<{
    matched: boolean;
    matchDetails: PredicateMatchResult[];
    queryNodeMatches: QueryNodeMatch[];
    predicatesEvaluated: number;
    graphTraversals: number;
  }> {
    switch (query.queryType) {
      case "base":
        return this.evaluateBaseQueryWrapper(query, context);

      case "union":
      case "intersection":
      case "difference":
      case "symmetric_diff":
        return this.evaluateCombinatorQuery(query, context);

      case "reference":
        return this.evaluateReferenceQuery(query, context);

      default:
        throw new Error(
          `Unknown query type: ${(query as DeckQuery).queryType}`,
        );
    }
  }

  /**
   * Evaluate a base query
   */
  private async evaluateBaseQueryWrapper(
    query: BaseDeckQuery,
    context: FullEvaluationContext,
  ): Promise<{
    matched: boolean;
    matchDetails: PredicateMatchResult[];
    queryNodeMatches: QueryNodeMatch[];
    predicatesEvaluated: number;
    graphTraversals: number;
  }> {
    const result = await evaluateBaseQuery(query, context);

    const queryNodeMatch: QueryNodeMatch = {
      queryId: query.queryId,
      label: query.label,
      queryType: "base",
      matched: result.matches,
      score: result.matches ? 1 : 0,
    };

    return {
      matched: result.matches,
      matchDetails: result.results,
      queryNodeMatches: [queryNodeMatch],
      predicatesEvaluated: result.results.length,
      graphTraversals: query.graphPredicates?.length ?? 0,
    };
  }

  /**
   * Evaluate a combinator query (union, intersection, difference, symmetric_diff)
   */
  private async evaluateCombinatorQuery(
    query: CombinatorQuery,
    context: FullEvaluationContext,
  ): Promise<{
    matched: boolean;
    matchDetails: PredicateMatchResult[];
    queryNodeMatches: QueryNodeMatch[];
    predicatesEvaluated: number;
    graphTraversals: number;
  }> {
    // Evaluate all operands
    const operandResults = await Promise.all(
      query.operands.map((operand) => this.evaluateQuery(operand, context)),
    );

    const allMatchDetails: PredicateMatchResult[] = [];
    const childMatches: QueryNodeMatch[] = [];
    let totalPredicatesEvaluated = 0;
    let totalGraphTraversals = 0;

    for (const result of operandResults) {
      allMatchDetails.push(...result.matchDetails);
      childMatches.push(...result.queryNodeMatches);
      totalPredicatesEvaluated += result.predicatesEvaluated;
      totalGraphTraversals += result.graphTraversals;
    }

    // Apply combinator logic
    const operandMatches = operandResults.map((r) => r.matched);
    let matched: boolean;

    switch (query.queryType) {
      case "union":
        // Card matches if it matches ANY operand
        matched = operandMatches.some((m) => m);
        break;

      case "intersection":
        // Card matches if it matches ALL operands
        matched = operandMatches.every((m) => m);
        break;

      case "difference":
        // Card matches if it matches first operand and NOT any subsequent operands
        matched = operandMatches[0] && !operandMatches.slice(1).some((m) => m);
        break;

      case "symmetric_diff": {
        // Card matches if it matches an odd number of operands
        const matchCount = operandMatches.filter((m) => m).length;
        matched = matchCount % 2 === 1;
        break;
      }

      default:
        matched = false;
    }

    const queryNodeMatch: QueryNodeMatch = {
      queryId: query.queryId,
      label: query.label,
      queryType: query.queryType,
      matched,
      score: matched
        ? operandResults.filter((r) => r.matched).length / operandResults.length
        : 0,
      childMatches,
    };

    return {
      matched,
      matchDetails: allMatchDetails,
      queryNodeMatches: [queryNodeMatch],
      predicatesEvaluated: totalPredicatesEvaluated,
      graphTraversals: totalGraphTraversals,
    };
  }

  /**
   * Evaluate a reference query (reference to another deck)
   */
  private async evaluateReferenceQuery(
    query: DeckReferenceQuery,
    context: FullEvaluationContext,
  ): Promise<{
    matched: boolean;
    matchDetails: PredicateMatchResult[];
    queryNodeMatches: QueryNodeMatch[];
    predicatesEvaluated: number;
    graphTraversals: number;
  }> {
    // Get the referenced deck
    const referencedDeck = await this.deckProvider.getDeck(
      query.deckId,
      context.card.cardId as unknown as UserId, // TODO: Need to pass userId through context
    );

    if (!referencedDeck) {
      return {
        matched: false,
        matchDetails: [
          createMatchResult(
            false,
            `Referenced deck not found: ${query.deckId}`,
          ),
        ],
        queryNodeMatches: [
          {
            queryId: query.queryId,
            label: query.label,
            queryType: "reference",
            matched: false,
            score: 0,
          },
        ],
        predicatesEvaluated: 0,
        graphTraversals: 0,
      };
    }

    // Evaluate the referenced deck's query
    const result = await this.evaluateQuery(referencedDeck.query, context);

    const queryNodeMatch: QueryNodeMatch = {
      queryId: query.queryId,
      label: query.label ?? `ref:${referencedDeck.name}`,
      queryType: "reference",
      matched: result.matched,
      score: result.matched ? 1 : 0,
      childMatches: result.queryNodeMatches,
    };

    return {
      matched: result.matched,
      matchDetails: result.matchDetails,
      queryNodeMatches: [queryNodeMatch],
      predicatesEvaluated: result.predicatesEvaluated,
      graphTraversals: result.graphTraversals,
    };
  }

  // ===========================================================================
  // CARD INCLUSION EXPLAINABILITY
  // ===========================================================================

  /**
   * Explain why a specific card is/isn't in a deck
   */
  async explainCardInclusion(
    cardId: CanonicalCardId,
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<CardInclusionExplanation | null> {
    const deck = await this.deckProvider.getDeck(deckId, userId);
    if (!deck) {
      return null;
    }

    const card = await this.cardProvider.getCard(cardId, userId);
    if (!card) {
      return null;
    }

    const categoryHierarchy = await this.categoryProvider.getHierarchy(userId);
    const context: FullEvaluationContext = {
      card,
      timestamp: Date.now() as Timestamp,
      categoryHierarchy,
      graphReader: this.graphReader,
      lkgcReader: this.lkgcReader,
    };

    const result = await this.evaluateQuery(deck.query, context);
    const matchResult: CardMatchResult = {
      cardId,
      matched: result.matched,
      matchDetails: result.matchDetails,
      queryNodeMatches: result.queryNodeMatches,
      matchingCategoryIds: this.getMatchingCategories(card, deck.query),
      matchingParticipationIds: this.getMatchingParticipations(
        card,
        deck.query,
      ),
    };

    return this.buildInclusionExplanation(
      card,
      matchResult,
      deck.query,
      deckId,
    );
  }

  /**
   * Build a full inclusion explanation
   */
  private buildInclusionExplanation(
    card: CardEvaluationData,
    matchResult: CardMatchResult,
    query: DeckQuery,
    deckId?: DynamicDeckId,
  ): CardInclusionExplanation {
    const reasoningChain: InclusionReason[] = matchResult.matchDetails.map(
      (detail) => ({
        predicateId: detail.predicateId ?? ("unknown" as PredicateId),
        description: detail.explanation,
        matchedValue: detail.actualValue,
        expectedValue: detail.expectedValue,
        confidence: detail.confidence,
      }),
    );

    const contributingFactors = this.extractContributingFactors(matchResult);
    const exclusionThreats = this.identifyExclusionThreats(card, query);

    return {
      explanationId:
        `expl-${card.cardId}-${Date.now()}` as InclusionExplanationId,
      cardId: card.cardId,
      deckId: deckId ?? ("inline" as DynamicDeckId),
      confidence: matchResult.matched
        ? (1.0 as Confidence)
        : (0.0 as Confidence),
      summary: this.generateSummary(matchResult),
      reasoningChain,
      matchedQueryNodes: matchResult.queryNodeMatches,
      contributingFactors,
      exclusionThreats,
    };
  }

  /**
   * Extract contributing factors from match results
   */
  private extractContributingFactors(
    matchResult: CardMatchResult,
  ): InclusionFactor[] {
    const factors: InclusionFactor[] = [];

    if (matchResult.matchingCategoryIds.length > 0) {
      factors.push({
        factorType: "category_membership",
        description: `Card is in ${matchResult.matchingCategoryIds.length} matching category(ies)`,
        weight: 1.0,
        evidence: matchResult.matchingCategoryIds,
      });
    }

    // Extract other factors from match details
    for (const detail of matchResult.matchDetails) {
      if (detail.matched) {
        const factorType = this.inferFactorType(detail.explanation);
        if (factorType) {
          factors.push({
            factorType,
            description: detail.explanation,
            weight: detail.confidence,
            evidence: detail.actualValue,
          });
        }
      }
    }

    return factors;
  }

  /**
   * Infer factor type from explanation text
   */
  private inferFactorType(explanation: string): InclusionFactorType | null {
    const lower = explanation.toLowerCase();
    if (lower.includes("tag")) return "tag_match";
    if (lower.includes("state")) return "state_match";
    if (lower.includes("lkgc") || lower.includes("signal"))
      return "lkgc_signal";
    if (
      lower.includes("graph") ||
      lower.includes("edge") ||
      lower.includes("neighbor")
    )
      return "graph_relation";
    if (
      lower.includes("temporal") ||
      lower.includes("reviewed") ||
      lower.includes("created")
    )
      return "temporal_match";
    if (
      lower.includes("difficulty") ||
      lower.includes("mastery") ||
      lower.includes("stability")
    )
      return "numeric_range";
    return null;
  }

  /**
   * Identify potential exclusion threats
   */
  private identifyExclusionThreats(
    card: CardEvaluationData,
    query: DeckQuery,
  ): ExclusionThreat[] {
    const threats: ExclusionThreat[] = [];

    // Check if mastery is approaching exclusion range
    if (query.queryType === "base" && query.masteryRange) {
      const { min, max } = query.masteryRange;
      if (min !== undefined && card.mastery < min + 0.1) {
        threats.push({
          threat: `Mastery (${card.mastery.toFixed(2)}) is close to minimum threshold (${min})`,
          proximity: ((min + 0.1 - card.mastery) / 0.1) as NormalizedValue,
          predicateId: "mastery" as PredicateId,
        });
      }
      if (max !== undefined && card.mastery > max - 0.1) {
        threats.push({
          threat: `Mastery (${card.mastery.toFixed(2)}) is close to maximum threshold (${max})`,
          proximity: ((card.mastery - (max - 0.1)) / 0.1) as NormalizedValue,
          predicateId: "mastery" as PredicateId,
        });
      }
    }

    return threats;
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(matchResult: CardMatchResult): string {
    if (matchResult.matched) {
      const categoryCount = matchResult.matchingCategoryIds.length;
      return `Card is included because it matches ${categoryCount} category filter(s) and passes all ${matchResult.matchDetails.length} predicate(s).`;
    } else {
      const failedPredicate = matchResult.matchDetails.find((d) => !d.matched);
      return `Card is excluded: ${failedPredicate?.explanation ?? "Unknown reason"}`;
    }
  }

  // ===========================================================================
  // PREVIEW & VALIDATION
  // ===========================================================================

  /**
   * Preview what cards would be affected by a query change
   */
  async previewQueryChange(
    deckId: DynamicDeckId,
    newQuery: DeckQuery,
    userId: UserId,
  ): Promise<DeckChangePreview> {
    const deck = await this.deckProvider.getDeck(deckId, userId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    const timestamp = Date.now() as Timestamp;

    // Evaluate current query
    const currentResult = await this.evaluate({
      query: deck.query,
      userId,
      timestamp,
      includeExplainability: false,
      includeLkgcSignals: false,
    });
    const currentCardIds = new Set(currentResult.cards.map((c) => c.cardId));

    // Evaluate new query
    const newResult = await this.evaluate({
      query: newQuery,
      userId,
      timestamp,
      includeExplainability: false,
      includeLkgcSignals: false,
    });
    const newCardIds = new Set(newResult.cards.map((c) => c.cardId));

    // Calculate differences
    const cardsToAdd = [...newCardIds].filter((id) => !currentCardIds.has(id));
    const cardsToRemove = [...currentCardIds].filter(
      (id) => !newCardIds.has(id),
    );

    // Position changes (cards in both but with different positions)
    const cardsToReorder: CanonicalCardId[] = [];
    for (const currentCard of currentResult.cards) {
      const newCard = newResult.cards.find(
        (c) => c.cardId === currentCard.cardId,
      );
      if (newCard && newCard.position !== currentCard.position) {
        cardsToReorder.push(currentCard.cardId);
      }
    }

    return {
      deckId,
      cardsToAdd,
      cardsToRemove,
      cardsToReorder,
      netChange: cardsToAdd.length - cardsToRemove.length,
      newStatistics: newResult.statistics,
    };
  }

  /**
   * Get deck statistics without full evaluation
   */
  async getStatistics(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<DeckStatistics> {
    const result = await this.evaluate({
      query: deckId,
      userId,
      timestamp: Date.now() as Timestamp,
      pageSize: 1, // Minimal page
      includeExplainability: false,
      includeLkgcSignals: false,
    });

    return result.statistics;
  }

  /**
   * Validate a deck query
   */
  validateQuery(query: DeckQuery): DeckQueryValidationResult {
    const errors: DeckQueryError[] = [];
    const warnings: DeckQueryWarning[] = [];

    this.validateQueryNode(query, [], errors, warnings);

    const complexity = this.calculateComplexity(query);

    if (complexity.score > this.config.maxComplexity) {
      errors.push({
        code: "COMPLEXITY_EXCEEDED",
        message: `Query complexity ${complexity.score} exceeds maximum ${this.config.maxComplexity}`,
        path: "$",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      complexity,
    };
  }

  /**
   * Validate a single query node
   */
  private validateQueryNode(
    query: DeckQuery,
    path: string[],
    errors: DeckQueryError[],
    warnings: DeckQueryWarning[],
  ): void {
    const pathStr = path.join(".");

    switch (query.queryType) {
      case "base":
        // Validate base query
        if (!query.queryId) {
          errors.push({
            code: "MISSING_QUERY_ID",
            message: "Base query missing queryId",
            path: pathStr || "$",
          });
        }

        // Warn about overly broad queries
        if (
          !query.includeCategoryIds?.length &&
          !query.includeTagsAny?.length &&
          !query.includeTagsAll?.length &&
          !query.cardStates?.length &&
          !query.cardTypes?.length
        ) {
          warnings.push({
            code: "BROAD_QUERY",
            message: "Query has no filters and may match many cards",
            path: pathStr || "$",
            suggestion: "Add category, tag, or state filters to narrow results",
          });
        }
        break;

      case "union":
      case "intersection":
      case "difference":
      case "symmetric_diff":
        // Validate combinator
        if (!query.operands || query.operands.length === 0) {
          errors.push({
            code: "EMPTY_COMBINATOR",
            message: `${query.queryType} combinator has no operands`,
            path: pathStr || "$",
          });
        }

        if (
          query.operands &&
          query.operands.length > this.config.maxCombinatorOperands
        ) {
          errors.push({
            code: "TOO_MANY_OPERANDS",
            message: `Combinator has ${query.operands.length} operands, max is ${this.config.maxCombinatorOperands}`,
            path: pathStr || "$",
          });
        }

        // Recursively validate operands
        if (query.operands) {
          for (let i = 0; i < query.operands.length; i++) {
            this.validateQueryNode(
              query.operands[i],
              [...path, `operands[${i}]`],
              errors,
              warnings,
            );
          }
        }
        break;

      case "reference":
        if (!query.deckId) {
          errors.push({
            code: "MISSING_DECK_REFERENCE",
            message: "Reference query missing deckId",
            path: pathStr || "$",
          });
        }
        break;
    }
  }

  /**
   * Calculate query complexity
   */
  calculateComplexity(query: DeckQuery): DeckQueryComplexity {
    let predicateCount = 0;
    let graphTraversalCount = 0;
    let maxTraversalDepth = 0;
    let combinatorCount = 0;

    const analyzeNode = (node: DeckQuery): void => {
      switch (node.queryType) {
        case "base":
          // Count predicates
          predicateCount += this.countPredicates(node);
          graphTraversalCount += node.graphPredicates?.length ?? 0;

          // Find max traversal depth
          if (node.graphPredicates) {
            for (const pred of node.graphPredicates) {
              if ("maxDepth" in pred && pred.maxDepth !== undefined) {
                maxTraversalDepth = Math.max(maxTraversalDepth, pred.maxDepth);
              }
            }
          }
          break;

        case "union":
        case "intersection":
        case "difference":
        case "symmetric_diff":
          combinatorCount++;
          for (const operand of node.operands) {
            analyzeNode(operand);
          }
          break;

        case "reference":
          // Reference queries add complexity
          predicateCount += 1;
          break;
      }
    };

    analyzeNode(query);

    const score = Math.min(
      10,
      Math.ceil(
        predicateCount * 0.5 +
          graphTraversalCount * 2 +
          maxTraversalDepth * 0.5 +
          combinatorCount * 1,
      ),
    );

    const estimatedTimeMs = Math.ceil(
      predicateCount * 1 + graphTraversalCount * 50 + combinatorCount * 5,
    );

    const performanceWarnings: string[] = [];
    if (graphTraversalCount > 5) {
      performanceWarnings.push("Many graph traversals may slow evaluation");
    }
    if (maxTraversalDepth > 5) {
      performanceWarnings.push("Deep graph traversals may be slow");
    }
    if (combinatorCount > 3) {
      performanceWarnings.push("Nested combinators increase complexity");
    }

    return {
      score,
      predicateCount,
      graphTraversalCount,
      maxTraversalDepth,
      combinatorCount,
      estimatedTimeMs,
      performanceWarnings,
    };
  }

  /**
   * Count predicates in a base query
   */
  private countPredicates(query: BaseDeckQuery): number {
    let count = 0;

    if (query.includeCategoryIds?.length) count++;
    if (query.excludeCategoryIds?.length) count++;
    if (query.semanticRoles?.length) count++;
    if (query.provenanceTypes?.length) count++;
    if (query.includeTagsAny?.length) count++;
    if (query.includeTagsAll?.length) count++;
    if (query.excludeTags?.length) count++;
    if (query.cardStates?.length) count++;
    if (query.cardTypes?.length) count++;
    if (query.isDue !== undefined) count++;
    if (query.isSuspended !== undefined) count++;
    if (query.isLeech !== undefined) count++;
    if (query.difficultyRange) count++;
    if (query.stabilityRange) count++;
    if (query.masteryRange) count++;
    if (query.reviewCountRange) count++;
    if (query.lapseCountRange) count++;
    if (query.createdWithin) count++;
    if (query.lastReviewedWithin) count++;
    if (query.dueWithin) count++;
    if (query.notReviewedFor) count++;
    count += query.lkgcPredicates?.length ?? 0;
    count += query.graphPredicates?.length ?? 0;
    count += query.customPredicates?.length ?? 0;

    return count;
  }

  // ===========================================================================
  // PLUGIN REGISTRATION
  // ===========================================================================

  /**
   * Register a custom predicate evaluator
   */
  registerPredicateEvaluator(
    pluginId: string,
    predicateType: string,
    evaluator: CustomPredicateEvaluator,
  ): void {
    const key = `${pluginId}:${predicateType}`;
    this.customPredicateEvaluators.set(key, evaluator);
  }

  // ===========================================================================
  // CHANGE SUBSCRIPTIONS
  // ===========================================================================

  /**
   * Subscribe to deck changes
   */
  subscribeToChanges(
    deckId: DynamicDeckId,
    callback: DeckChangeCallback,
  ): DeckChangeSubscription {
    const subscriptionId = `sub-${++this.subscriptionCounter}`;

    const entry: SubscriptionEntry = {
      deckId,
      callback,
      active: true,
    };

    this.subscriptions.set(subscriptionId, entry);

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(subscriptionId);
      },
      get active() {
        return entry.active;
      },
    };
  }

  /**
   * Notify subscribers of a deck change
   */
  notifyChange(event: DeckChangeEvent): void {
    for (const entry of this.subscriptions.values()) {
      if (entry.active && entry.deckId === event.deckId) {
        try {
          entry.callback(event);
        } catch (error) {
          console.error("Error in deck change callback:", error);
        }
      }
    }
  }

  /**
   * Invalidate cache for a deck
   */
  invalidateCache(deckId: DynamicDeckId): void {
    for (const key of this.cache.keys()) {
      if (key.includes(deckId)) {
        this.cache.delete(key);
      }
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Get candidate cards for a query (optimized card fetching)
   */
  private async getCandidateCards(
    query: DeckQuery,
    userId: UserId,
  ): Promise<readonly CardEvaluationData[]> {
    // For base queries with category filters, only fetch cards from those categories
    if (query.queryType === "base" && query.includeCategoryIds?.length) {
      return this.cardProvider.getCardsByCategories(
        query.includeCategoryIds,
        userId,
      );
    }

    // For combinators, merge candidates from all operands
    if (
      query.queryType === "union" ||
      query.queryType === "intersection" ||
      query.queryType === "difference" ||
      query.queryType === "symmetric_diff"
    ) {
      const allCandidates = await Promise.all(
        query.operands.map((op) => this.getCandidateCards(op, userId)),
      );

      // Union of all candidates
      const cardIds = new Set<CanonicalCardId>();
      for (const candidates of allCandidates) {
        for (const card of candidates) {
          cardIds.add(card.cardId);
        }
      }

      // Fetch all unique cards
      return this.cardProvider.getCards([...cardIds], userId);
    }

    // Default: fetch all user cards
    return this.cardProvider.getAllUserCards(userId);
  }

  /**
   * Get the query ID from a query
   */
  private getQueryId(query: DeckQuery): DeckQueryId {
    return query.queryId ?? (`generated-${Date.now()}` as DeckQueryId);
  }

  /**
   * Get the default sort spec from a query
   */
  private getDefaultSortSpec(_query: DeckQuery): DeckSortSpec {
    return {
      fields: [{ field: "due_date", direction: "asc" }],
    };
  }

  /**
   * Sort cards according to sort spec
   */
  private sortCards(
    cards: readonly CardEvaluationData[],
    sortSpec: DeckSortSpec,
  ): CardEvaluationData[] {
    const sorted = [...cards];

    sorted.sort((a, b) => {
      for (const field of sortSpec.fields) {
        const comparison = this.compareByField(a, b, field);
        if (comparison !== 0) {
          return field.direction === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });

    return sorted;
  }

  /**
   * Compare two cards by a sort field
   */
  private compareByField(
    a: CardEvaluationData,
    b: CardEvaluationData,
    field: DeckSortField,
  ): number {
    const getValue = (
      card: CardEvaluationData,
    ): number | string | undefined => {
      switch (field.field) {
        case "due_date":
          return card.dueAt;
        case "created_at":
          return card.createdAt;
        case "updated_at":
          return card.updatedAt;
        case "last_reviewed_at":
          return card.lastReviewedAt;
        case "difficulty":
          return card.difficulty;
        case "stability":
          return card.stability;
        case "retrievability":
          return card.retrievability;
        case "mastery":
          return card.mastery;
        case "review_count":
          return card.reviewCount;
        case "lapse_count":
          return card.lapseCount;
        case "random":
          return Math.random();
        default:
          return 0;
      }
    };

    const aVal = getValue(a);
    const bVal = getValue(b);

    if (aVal === undefined && bVal === undefined) return 0;
    if (aVal === undefined) return 1;
    if (bVal === undefined) return -1;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  }

  /**
   * Get sort key values for a card
   */
  private getSortKeys(
    card: CardEvaluationData,
    sortSpec: DeckSortSpec,
  ): Record<string, unknown> {
    const keys: Record<string, unknown> = {};

    for (const field of sortSpec.fields) {
      switch (field.field) {
        case "due_date":
          keys.dueDate = card.dueAt;
          break;
        case "difficulty":
          keys.difficulty = card.difficulty;
          break;
        case "mastery":
          keys.mastery = card.mastery;
          break;
        // Add more as needed
      }
    }

    return keys;
  }

  /**
   * Get matching categories for a card
   */
  private getMatchingCategories(
    card: CardEvaluationData,
    query: DeckQuery,
  ): CategoryId[] {
    if (query.queryType === "base" && query.includeCategoryIds) {
      const includedSet = new Set(query.includeCategoryIds);
      return card.participations
        .filter((p) => includedSet.has(p.categoryId))
        .map((p) => p.categoryId);
    }
    return card.participations.map((p) => p.categoryId);
  }

  /**
   * Get matching participations for a card
   */
  private getMatchingParticipations(
    card: CardEvaluationData,
    query: DeckQuery,
  ): ParticipationId[] {
    if (query.queryType === "base" && query.includeCategoryIds) {
      const includedSet = new Set(query.includeCategoryIds);
      return card.participations
        .filter((p) => includedSet.has(p.categoryId))
        .map((p) => p.participationId);
    }
    return card.participations.map((p) => p.participationId);
  }

  /**
   * Calculate statistics for matched cards
   */
  private calculateStatistics(
    cards: readonly CardEvaluationData[],
    timestamp: Timestamp,
  ): DeckStatistics {
    const cardsByState: Record<CardState, number> = {
      new: 0,
      learning: 0,
      review: 0,
      relearning: 0,
      mastered: 0,
      suspended: 0,
    };

    let dueNow = 0;
    let dueToday = 0;
    let totalDifficulty = 0;
    let totalMastery = 0;
    const categoryIds = new Set<CategoryId>();

    const todayEnd = new Date(timestamp);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndTimestamp = todayEnd.getTime() as Timestamp;

    for (const card of cards) {
      cardsByState[card.state] = (cardsByState[card.state] || 0) + 1;

      if (card.dueAt && card.dueAt <= timestamp) {
        dueNow++;
      }
      if (card.dueAt && card.dueAt <= todayEndTimestamp) {
        dueToday++;
      }

      totalDifficulty += card.difficulty;
      totalMastery += card.mastery;

      for (const p of card.participations) {
        categoryIds.add(p.categoryId);
      }
    }

    return {
      totalCards: cards.length,
      dueNow,
      dueToday,
      newCards: cardsByState.new,
      learningCards: cardsByState.learning + cardsByState.relearning,
      reviewCards: cardsByState.review,
      avgDifficulty: cards.length > 0 ? totalDifficulty / cards.length : 0,
      avgMastery: cards.length > 0 ? totalMastery / cards.length : 0,
      cardsByState,
      categoryCount: categoryIds.size,
    };
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(
    query: DeckQuery,
    userId: UserId,
    sortOverride?: DeckSortSpec,
    limitOverride?: number,
  ): string {
    return JSON.stringify({
      query,
      userId,
      sortOverride,
      limitOverride,
    });
  }

  /**
   * Encode pagination cursor
   */
  private encodeCursor(offset: number): string {
    return Buffer.from(`offset:${offset}`).toString("base64");
  }

  /**
   * Decode pagination cursor
   */
  private decodeCursor(cursor: string): number {
    const decoded = Buffer.from(cursor, "base64").toString();
    const match = decoded.match(/^offset:(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a deck query engine with default configuration
 */
export function createDeckQueryEngine(
  cardProvider: CardDataProvider,
  categoryProvider: CategoryHierarchyProvider,
  deckProvider: DeckDefinitionProvider,
  graphReader: GraphReader,
  lkgcReader: LkgcReader,
  config?: Partial<DeckQueryEngineConfig>,
): DeckQueryEngine {
  return new DeckQueryEngine(
    cardProvider,
    categoryProvider,
    deckProvider,
    graphReader,
    lkgcReader,
    config,
  );
}
