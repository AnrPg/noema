// =============================================================================
// CONSTELLATION CHALLENGE FEED GENERATOR
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// The Constellation Challenge Feed Generator produces suggestions for
// cross-context synthesis opportunities based on:
// 1. Cards with multiple participations (multi-belonging)
// 2. Performance divergences (different mastery across contexts)
// 3. Bridge card opportunities
// 4. Mode-specific parameters (bridge priority, challenge difficulty, etc.)
//
// This is for SYNTHESIS mode - helping users connect knowledge across contexts.
// NOT about review scheduling - about finding synthesis opportunities.
// =============================================================================

import { prisma } from "../config/database.js";
import type {
  ConstellationChallengeFeed,
  Constellation,
  ConstellationChallenge,
  ConstellationType,
  ConstellationChallengeType,
  BridgeOpportunity,
  ConstellationSuggestion,
  PerformanceDivergenceSummary,
  NavigationFeedRequest,
  ConstellationChallengeOptions,
  NavigationFeedMetadata,
  NavigationTarget,
  BridgeType,
  ConnectionType,
  NormalizedValue,
  Confidence,
  Timestamp,
  CardId,
  CategoryRelationType,
} from "@manthanein/shared";
import type {
  ParticipationRecord,
  NavigationFeedServiceConfig,
} from "./types.js";
import {
  generateFeedId,
  generateSuggestionId,
  DEFAULT_FEED_SERVICE_CONFIG,
} from "./types.js";

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_CONSTELLATION_OPTIONS: Required<ConstellationChallengeOptions> = {
  minParticipations: 2,
  minDivergence: 0.2,
  bridgeTypes: ["concept_to_concept", "context_to_context", "concept_context"],
  challengeDifficulty: 0.5,
  allowedEdgeTypes: ["prepares_for", "contrasts_with", "analogous_to"],
  maxConnectionHops: 2,
};

// =============================================================================
// CHALLENGE TEMPLATES
// =============================================================================

const CHALLENGE_TEMPLATES: Record<
  ConstellationChallengeType,
  {
    promptTemplate: string;
    alternatives: string[];
    hints: string[];
  }
> = {
  identify_common_principle: {
    promptTemplate:
      "What underlying principle connects these concepts across {contexts}?",
    alternatives: [
      "Find the common thread that ties {concepts} together.",
      "What abstraction unifies {concepts} despite their different contexts?",
    ],
    hints: [
      "Consider what problem each concept solves.",
      "Think about the structure or pattern they share.",
      "What would be lost if this principle didn't exist?",
    ],
  },
  explain_difference: {
    promptTemplate:
      "How does {concept} differ when viewed through {context1} vs {context2}?",
    alternatives: [
      "What changes about {concept} depending on the context?",
      "Compare the role of {concept} in {context1} and {context2}.",
    ],
    hints: [
      "Focus on what stays the same vs what changes.",
      "Consider the purpose in each context.",
      "What mistakes might someone make by confusing the two?",
    ],
  },
  transfer_application: {
    promptTemplate:
      "How would you apply your understanding of {concept} from {context1} to solve a problem in {context2}?",
    alternatives: [
      "Transfer your knowledge of {concept} to a new domain.",
      "Use {context1}'s approach to {concept} in {context2}.",
    ],
    hints: [
      "What worked well in the original context?",
      "What needs to be adapted?",
      "What assumptions might not transfer?",
    ],
  },
  predict_interaction: {
    promptTemplate:
      "If {concept1} from {context1} met {concept2} from {context2}, what would happen?",
    alternatives: [
      "How would {concept1} and {concept2} interact?",
      "What emergent property might arise from combining {concept1} and {concept2}?",
    ],
    hints: [
      "Think about complementary strengths and weaknesses.",
      "Consider potential conflicts or synergies.",
      "What new capability might emerge?",
    ],
  },
  synthesize_understanding: {
    promptTemplate:
      "Create a unified explanation that integrates your understanding of {concepts} across {contexts}.",
    alternatives: [
      "Write a synthesis that bridges {contexts} using {concepts}.",
      "Develop a mental model that encompasses {concepts}.",
    ],
    hints: [
      "Start with what's common, then add context-specific details.",
      "Use analogies to connect different domains.",
      "Think about how an expert would explain this.",
    ],
  },
  create_bridge: {
    promptTemplate:
      "Design a bridge card that connects {concept1} to {concept2}.",
    alternatives: [
      "Create a question that tests understanding of both {concept1} and {concept2}.",
      "Write a flashcard that requires knowledge from {context1} and {context2}.",
    ],
    hints: [
      "The question should require integrating both concepts.",
      "Make the connection non-obvious but meaningful.",
      "Consider what insight the learner should gain.",
    ],
  },
};

// =============================================================================
// CONSTELLATION CHALLENGE FEED GENERATOR CLASS
// =============================================================================

export class ConstellationChallengeFeedGenerator {
  private config: NavigationFeedServiceConfig;

  constructor(config: Partial<NavigationFeedServiceConfig> = {}) {
    this.config = { ...DEFAULT_FEED_SERVICE_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN GENERATION METHOD
  // ===========================================================================

  /**
   * Generate a constellation challenge feed
   */
  async generate(
    request: NavigationFeedRequest,
    options?: ConstellationChallengeOptions,
  ): Promise<ConstellationChallengeFeed> {
    const startTime = Date.now();
    const resolvedOptions = this.resolveOptions(request, options);

    // Find cards with multiple participations
    const multiParticipationCards = await this.findMultiParticipationCards(
      request.userId,
      resolvedOptions.minParticipations,
    );

    // Detect performance divergences
    const divergences = await this.detectDivergences(
      request.userId,
      multiParticipationCards,
      resolvedOptions.minDivergence,
    );

    // Detect constellations (clusters of related cross-context cards)
    const constellations = await this.detectConstellations(
      request.userId,
      multiParticipationCards,
      resolvedOptions,
    );

    // Generate challenges for constellations
    const challenges = this.generateChallenges(
      constellations,
      divergences,
      resolvedOptions,
    );

    // Find bridge opportunities
    const bridgeOpportunities = await this.findBridgeOpportunities(
      request.userId,
      multiParticipationCards,
      resolvedOptions,
    );

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      challenges,
      bridgeOpportunities,
      resolvedOptions,
      request,
    );

    // Summarize divergences for the feed
    const triggeringDivergences = this.summarizeDivergences(divergences);

    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "constellation_challenge",
      constellations,
      challenges: challenges.slice(0, this.config.maxSuggestionsPerFeed),
      bridgeOpportunities: bridgeOpportunities.slice(
        0,
        this.config.maxSuggestionsPerFeed,
      ),
      suggestions: suggestions.slice(0, this.config.maxSuggestionsPerFeed),
      triggeringDivergences,
      metadata: this.createMetadata(
        request,
        resolvedOptions,
        suggestions.length,
        generationTimeMs,
      ),
    };
  }

  // ===========================================================================
  // MULTI-PARTICIPATION DETECTION
  // ===========================================================================

  /**
   * Find cards with multiple participations
   * Note: CardCategoryParticipation doesn't have userId directly, filter via card.userId
   */
  private async findMultiParticipationCards(
    userId: string,
    minParticipations: number,
  ): Promise<Map<string, ParticipationRecord[]>> {
    const participations = await prisma.cardCategoryParticipation.findMany({
      where: { card: { userId } }, // Filter by card's userId
      orderBy: { cardId: "asc" },
      include: {
        card: { select: { userId: true } },
      },
    });

    // Group by card
    const byCard = new Map<string, ParticipationRecord[]>();
    for (const p of participations) {
      const record: ParticipationRecord = {
        id: p.id,
        cardId: p.cardId,
        categoryId: p.categoryId,
        userId: p.card.userId, // Get userId from related Card
        contextMastery: p.contextMastery,
        isPrimary: p.isPrimary,
      };

      if (!byCard.has(p.cardId)) {
        byCard.set(p.cardId, []);
      }
      byCard.get(p.cardId)!.push(record);
    }

    // Filter to cards with enough participations
    const result = new Map<string, ParticipationRecord[]>();
    for (const [cardId, participations] of byCard) {
      if (participations.length >= minParticipations) {
        result.set(cardId, participations);
      }
    }

    return result;
  }

  // ===========================================================================
  // DIVERGENCE DETECTION
  // ===========================================================================

  /**
   * Detect performance divergences
   */
  private async detectDivergences(
    userId: string,
    multiParticipationCards: Map<string, ParticipationRecord[]>,
    minDivergence: number,
  ): Promise<Map<string, PerformanceDivergenceDetail>> {
    const divergences = new Map<string, PerformanceDivergenceDetail>();

    for (const [cardId, participations] of multiParticipationCards) {
      if (participations.length < 2) continue;

      // Find best and worst performing contexts
      const sorted = [...participations].sort(
        (a, b) => b.contextMastery - a.contextMastery,
      );

      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const spread = best.contextMastery - worst.contextMastery;

      if (spread >= minDivergence) {
        divergences.set(cardId, {
          cardId,
          bestContextId: best.categoryId,
          bestMastery: best.contextMastery,
          worstContextId: worst.categoryId,
          worstMastery: worst.contextMastery,
          spread,
          allContexts: participations.map((p) => ({
            categoryId: p.categoryId,
            mastery: p.contextMastery,
          })),
        });
      }
    }

    return divergences;
  }

  // ===========================================================================
  // CONSTELLATION DETECTION
  // ===========================================================================

  /**
   * Detect constellations - clusters of related cross-context cards
   */
  private async detectConstellations(
    userId: string,
    multiParticipationCards: Map<string, ParticipationRecord[]>,
    _options: Required<ConstellationChallengeOptions>, // Reserved for future constellation filtering
  ): Promise<Constellation[]> {
    const constellations: Constellation[] = [];
    const usedCards = new Set<string>();

    // Group cards by shared contexts
    const contextGroups = this.groupBySharedContexts(multiParticipationCards);

    for (const [contextKey, cardIds] of contextGroups) {
      if (cardIds.length < 2) continue;

      const categoryIds = contextKey.split("|");
      if (categoryIds.length < 2) continue;

      // Skip if cards already used
      if (cardIds.some((id) => usedCards.has(id))) continue;

      // Determine constellation type
      const constellationType = this.determineConstellationType(
        cardIds,
        multiParticipationCards,
      );

      // Fetch existing bridge cards
      const bridgeCardIds = await this.fetchBridgeCards(userId, cardIds);

      // Compute connection strength
      const connectionStrength = this.computeConnectionStrength(
        cardIds,
        multiParticipationCards,
      );

      // Compute synthesis progress (placeholder - would need actual synthesis notes)
      const synthesisProgress = 0 as NormalizedValue;

      constellations.push({
        id: `constellation_${cardIds.slice(0, 3).join("_")}`,
        cardIds: cardIds as CardId[],
        categoryIds,
        constellationType,
        centralTheme: await this.inferTheme(categoryIds),
        connectionStrength,
        synthesisProgress,
        bridgeCardIds: bridgeCardIds as CardId[],
      });

      // Mark cards as used
      cardIds.forEach((id) => usedCards.add(id));

      // Limit constellation count
      if (constellations.length >= this.config.maxConstellationSize) break;
    }

    return constellations;
  }

  /**
   * Group cards by their shared context combinations
   */
  private groupBySharedContexts(
    multiParticipationCards: Map<string, ParticipationRecord[]>,
  ): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const [cardId, participations] of multiParticipationCards) {
      const contextIds = participations.map((p) => p.categoryId).sort();
      // Create a key for each pair of contexts
      for (let i = 0; i < contextIds.length; i++) {
        for (let j = i + 1; j < contextIds.length; j++) {
          const key = `${contextIds[i]}|${contextIds[j]}`;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(cardId);
        }
      }
    }

    // Sort by group size (largest first)
    return new Map(
      [...groups.entries()].sort((a, b) => b[1].length - a[1].length),
    );
  }

  /**
   * Determine the type of constellation
   */
  private determineConstellationType(
    cardIds: string[],
    multiParticipationCards: Map<string, ParticipationRecord[]>,
  ): ConstellationType {
    // Analyze participation patterns to determine type
    // This is a simplified heuristic

    // Check if cards share many contexts (semantic cluster)
    const contextCounts = new Map<string, number>();
    for (const cardId of cardIds) {
      const participations = multiParticipationCards.get(cardId) || [];
      for (const p of participations) {
        contextCounts.set(
          p.categoryId,
          (contextCounts.get(p.categoryId) || 0) + 1,
        );
      }
    }

    const maxOverlap = Math.max(...contextCounts.values());
    const overlapRatio = maxOverlap / cardIds.length;

    if (overlapRatio >= 0.8) {
      return "semantic_cluster";
    }
    if (overlapRatio >= 0.5) {
      return "application_family";
    }

    // Check for contrast patterns (would need more data)
    return "analogical_chain";
  }

  /**
   * Compute connection strength for a constellation
   */
  private computeConnectionStrength(
    cardIds: string[],
    multiParticipationCards: Map<string, ParticipationRecord[]>,
  ): NormalizedValue {
    if (cardIds.length < 2) return 0 as NormalizedValue;

    // Based on shared contexts and mastery similarity
    let sharedContexts = 0;
    let totalPairs = 0;

    for (let i = 0; i < cardIds.length; i++) {
      for (let j = i + 1; j < cardIds.length; j++) {
        const contexts1 = new Set(
          (multiParticipationCards.get(cardIds[i]) || []).map(
            (p) => p.categoryId,
          ),
        );
        const contexts2 = new Set(
          (multiParticipationCards.get(cardIds[j]) || []).map(
            (p) => p.categoryId,
          ),
        );

        const shared = [...contexts1].filter((c) => contexts2.has(c)).length;
        sharedContexts += shared;
        totalPairs++;
      }
    }

    const avgShared = totalPairs > 0 ? sharedContexts / totalPairs : 0;
    return Math.min(1, avgShared / 3) as NormalizedValue; // Normalize to ~3 shared contexts = max
  }

  /**
   * Infer a theme for the constellation
   */
  private async inferTheme(categoryIds: string[]): Promise<string> {
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { name: true },
    });

    return categories.map((c) => c.name).join(" ∩ ");
  }

  /**
   * Fetch bridge cards for a set of cards
   */
  private async fetchBridgeCards(
    userId: string,
    cardIds: string[],
  ): Promise<string[]> {
    const bridges = await prisma.bridgeCard.findMany({
      where: {
        userId,
        OR: [
          { sourceCardId: { in: cardIds } },
          { targetCardId: { in: cardIds } },
        ],
        status: "active",
      },
      select: { cardId: true },
    });

    return bridges.map((b) => b.cardId);
  }

  // ===========================================================================
  // CHALLENGE GENERATION
  // ===========================================================================

  /**
   * Generate challenges for constellations
   */
  private generateChallenges(
    constellations: Constellation[],
    divergences: Map<string, PerformanceDivergenceDetail>,
    options: Required<ConstellationChallengeOptions>,
  ): ConstellationChallenge[] {
    const challenges: ConstellationChallenge[] = [];

    for (const constellation of constellations) {
      // Select appropriate challenge type based on constellation
      const challengeType = this.selectChallengeType(
        constellation,
        divergences,
      );
      const template = CHALLENGE_TEMPLATES[challengeType];

      // Generate prompt with substitutions
      const prompt = this.fillTemplate(template.promptTemplate, constellation);
      const alternativePrompts = template.alternatives.map((t) =>
        this.fillTemplate(t, constellation),
      );

      // Compute difficulty
      const difficulty = this.computeChallengeDifficulty(
        constellation,
        challengeType,
        options,
      );

      // Estimate time
      const estimatedTimeMinutes = this.estimateChallengeTime(challengeType);

      challenges.push({
        id: `challenge_${constellation.id}`,
        constellation,
        challengeType,
        prompt,
        alternativePrompts,
        hints: template.hints,
        involvedCardIds: constellation.cardIds,
        involvedCategoryIds: constellation.categoryIds,
        difficulty,
        estimatedTimeMinutes,
        learningOutcome: this.describeLearningOutcome(challengeType),
      });
    }

    // Sort by difficulty matching user's preference
    return challenges.sort((a, b) => {
      const diffA = Math.abs(a.difficulty - options.challengeDifficulty);
      const diffB = Math.abs(b.difficulty - options.challengeDifficulty);
      return diffA - diffB;
    });
  }

  /**
   * Select the most appropriate challenge type
   */
  private selectChallengeType(
    constellation: Constellation,
    divergences: Map<string, PerformanceDivergenceDetail>,
  ): ConstellationChallengeType {
    // Check if any card has significant divergence
    const hasDivergence = constellation.cardIds.some(
      (id) => divergences.has(id) && (divergences.get(id)?.spread || 0) >= 0.3,
    );

    if (hasDivergence) {
      return "explain_difference";
    }

    // Select based on constellation type
    switch (constellation.constellationType) {
      case "semantic_cluster":
        return "identify_common_principle";
      case "analogical_chain":
        return "transfer_application";
      case "contrast_set":
        return "explain_difference";
      case "application_family":
        return "synthesize_understanding";
      default:
        return constellation.bridgeCardIds.length === 0
          ? "create_bridge"
          : "synthesize_understanding";
    }
  }

  /**
   * Fill template with constellation data
   */
  private fillTemplate(template: string, constellation: Constellation): string {
    // Simple template substitution
    return template
      .replace("{concepts}", `these ${constellation.cardIds.length} concepts`)
      .replace("{concept}", "this concept")
      .replace("{concept1}", "the first concept")
      .replace("{concept2}", "the second concept")
      .replace("{contexts}", constellation.centralTheme)
      .replace("{context1}", "the first context")
      .replace("{context2}", "the second context");
  }

  /**
   * Compute challenge difficulty
   */
  private computeChallengeDifficulty(
    constellation: Constellation,
    challengeType: ConstellationChallengeType,
    _options: Required<ConstellationChallengeOptions>, // Reserved for difficulty tuning
  ): NormalizedValue {
    let difficulty = 0.5;

    // More cards = harder
    difficulty += Math.min(constellation.cardIds.length / 10, 0.2);

    // More contexts = harder
    difficulty += Math.min(constellation.categoryIds.length / 5, 0.15);

    // Challenge type difficulty
    const typeDifficulty: Record<ConstellationChallengeType, number> = {
      identify_common_principle: 0.4,
      explain_difference: 0.5,
      transfer_application: 0.6,
      predict_interaction: 0.7,
      synthesize_understanding: 0.8,
      create_bridge: 0.6,
    };
    difficulty = (difficulty + typeDifficulty[challengeType]) / 2;

    return Math.min(1, Math.max(0, difficulty)) as NormalizedValue;
  }

  /**
   * Estimate time for a challenge
   */
  private estimateChallengeTime(
    challengeType: ConstellationChallengeType,
  ): number {
    const estimates: Record<ConstellationChallengeType, number> = {
      identify_common_principle: 5,
      explain_difference: 5,
      transfer_application: 10,
      predict_interaction: 10,
      synthesize_understanding: 15,
      create_bridge: 10,
    };
    return estimates[challengeType];
  }

  /**
   * Describe the learning outcome
   */
  private describeLearningOutcome(
    challengeType: ConstellationChallengeType,
  ): string {
    const outcomes: Record<ConstellationChallengeType, string> = {
      identify_common_principle:
        "Recognize deep structural similarities across domains",
      explain_difference: "Understand how context shapes concept application",
      transfer_application: "Apply knowledge flexibly to new situations",
      predict_interaction:
        "Anticipate emergent properties from concept combinations",
      synthesize_understanding:
        "Build integrated mental models spanning contexts",
      create_bridge: "Explicitly articulate cross-context connections",
    };
    return outcomes[challengeType];
  }

  // ===========================================================================
  // BRIDGE OPPORTUNITY DETECTION
  // ===========================================================================

  /**
   * Find bridge card opportunities
   */
  private async findBridgeOpportunities(
    userId: string,
    multiParticipationCards: Map<string, ParticipationRecord[]>,
    options: Required<ConstellationChallengeOptions>,
  ): Promise<BridgeOpportunity[]> {
    const opportunities: BridgeOpportunity[] = [];

    // Find cards without existing bridge cards
    const cardsWithBridges = await this.fetchCardsWithBridges(userId);

    for (const [cardId, participations] of multiParticipationCards) {
      if (cardsWithBridges.has(cardId)) continue;
      if (participations.length < 2) continue;

      // Generate bridge opportunities between contexts
      for (let i = 0; i < participations.length; i++) {
        for (let j = i + 1; j < participations.length; j++) {
          const p1 = participations[i];
          const p2 = participations[j];

          // Determine bridge type
          const bridgeType = this.determineBridgeType(p1, p2);
          if (!options.bridgeTypes.includes(bridgeType)) continue;

          // Compute confidence based on mastery levels
          const confidence = this.computeBridgeConfidence(p1, p2);

          opportunities.push({
            id: `bridge_opp_${cardId}_${p1.categoryId}_${p2.categoryId}`,
            bridgeType,
            sourceCardId: cardId as CardId,
            sourceCategoryId: p1.categoryId,
            targetCategoryId: p2.categoryId,
            connectionType: "equivalent" as ConnectionType, // Simplified
            confidence,
            rationale: `Card appears in both contexts with different mastery levels`,
            learningValue:
              "Understanding the connection strengthens knowledge in both contexts",
          });
        }
      }

      // Limit opportunities
      if (opportunities.length >= this.config.maxSuggestionsPerFeed * 2) break;
    }

    // Sort by confidence
    return opportunities.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Fetch cards that already have bridge cards
   */
  private async fetchCardsWithBridges(userId: string): Promise<Set<string>> {
    const bridges = await prisma.bridgeCard.findMany({
      where: { userId, status: "active" },
      select: { sourceCardId: true, targetCardId: true },
    });

    const cardIds = new Set<string>();
    for (const b of bridges) {
      if (b.sourceCardId) cardIds.add(b.sourceCardId);
      if (b.targetCardId) cardIds.add(b.targetCardId);
    }

    return cardIds;
  }

  /**
   * Determine bridge type from participations
   * TODO: Implement logic based on semantic roles and context relationships
   */
  private determineBridgeType(
    _p1: ParticipationRecord, // Reserved for semantic role analysis
    _p2: ParticipationRecord, // Reserved for semantic role analysis
  ): BridgeType {
    // Simplified logic - context_to_context is most common
    return "context_to_context";
  }

  /**
   * Compute bridge confidence
   */
  private computeBridgeConfidence(
    p1: ParticipationRecord,
    p2: ParticipationRecord,
  ): Confidence {
    // Higher confidence if there's significant mastery difference (learning opportunity)
    const masteryDiff = Math.abs(p1.contextMastery - p2.contextMastery);
    const avgMastery = (p1.contextMastery + p2.contextMastery) / 2;

    // Good candidates: decent mastery + some divergence
    return Math.min(1, avgMastery * 0.6 + masteryDiff * 0.4) as Confidence;
  }

  // ===========================================================================
  // SUGGESTION GENERATION
  // ===========================================================================

  /**
   * Generate suggestions from challenges and bridge opportunities
   */
  private generateSuggestions(
    challenges: ConstellationChallenge[],
    bridgeOpportunities: BridgeOpportunity[],
    options: Required<ConstellationChallengeOptions>,
    request: NavigationFeedRequest,
  ): ConstellationSuggestion[] {
    const suggestions: ConstellationSuggestion[] = [];

    // Add challenge-based suggestions
    for (const challenge of challenges) {
      const priority = this.computeChallengePriority(challenge, options);

      suggestions.push({
        id: generateSuggestionId(),
        type: "synthesis_opportunity",
        target: {
          type: "category",
          categoryId: challenge.involvedCategoryIds[0],
        } as NavigationTarget,
        challenge,
        priority,
        reason: `Synthesis opportunity: ${challenge.learningOutcome}`,
        learningValue: challenge.learningOutcome,
        difficulty: challenge.difficulty,
        explainabilityTraceId: request.includeExplainability
          ? `trace_challenge_${challenge.id}`
          : undefined,
      });
    }

    // Add bridge-based suggestions
    for (const bridge of bridgeOpportunities) {
      const priority = (bridge.confidence * 0.8) as NormalizedValue;

      suggestions.push({
        id: generateSuggestionId(),
        type: "bridge",
        target: {
          type: "category",
          categoryId: bridge.sourceCategoryId || bridge.targetCategoryId || "",
        } as NavigationTarget,
        bridgeOpportunity: bridge,
        priority,
        reason: bridge.rationale,
        learningValue: bridge.learningValue,
        difficulty: 0.5 as NormalizedValue, // Default for bridges
        explainabilityTraceId: request.includeExplainability
          ? `trace_bridge_${bridge.id}`
          : undefined,
      });
    }

    // Sort by priority
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Compute priority for a challenge
   */
  private computeChallengePriority(
    challenge: ConstellationChallenge,
    options: Required<ConstellationChallengeOptions>,
  ): NormalizedValue {
    // Priority based on:
    // 1. How well difficulty matches preference
    // 2. Number of cards involved (more = more valuable)
    // 3. Existing synthesis progress (less = more needed)

    const difficultyMatch =
      1 - Math.abs(challenge.difficulty - options.challengeDifficulty);
    const cardCountBonus = Math.min(challenge.involvedCardIds.length / 5, 0.3);
    const progressBonus = 1 - challenge.constellation.synthesisProgress;

    return Math.min(
      1,
      difficultyMatch * 0.4 + cardCountBonus + progressBonus * 0.3,
    ) as NormalizedValue;
  }

  /**
   * Summarize divergences for the feed
   */
  private summarizeDivergences(
    divergences: Map<string, PerformanceDivergenceDetail>,
  ): PerformanceDivergenceSummary[] {
    const summaries: PerformanceDivergenceSummary[] = [];

    for (const [cardId, detail] of divergences) {
      const severity =
        detail.spread >= 0.5
          ? "critical"
          : detail.spread >= 0.3
            ? "significant"
            : detail.spread >= 0.2
              ? "moderate"
              : "minor";

      summaries.push({
        cardId: cardId as CardId,
        bestContextId: detail.bestContextId,
        worstContextId: detail.worstContextId,
        spread: detail.spread,
        severity,
      });
    }

    // Sort by spread (most divergent first)
    return summaries.sort((a, b) => b.spread - a.spread);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Resolve options with defaults and mode parameters
   */
  private resolveOptions(
    request: NavigationFeedRequest,
    options?: ConstellationChallengeOptions,
  ): Required<ConstellationChallengeOptions> {
    const modeParams = request.modeParameters || {};
    const thresholds =
      (modeParams.synthesis_prompt_thresholds as Record<string, number>) || {};

    return {
      minParticipations:
        options?.minParticipations ??
        thresholds.min_participations ??
        DEFAULT_CONSTELLATION_OPTIONS.minParticipations,
      minDivergence:
        options?.minDivergence ??
        thresholds.min_divergence ??
        DEFAULT_CONSTELLATION_OPTIONS.minDivergence,
      bridgeTypes:
        options?.bridgeTypes ?? DEFAULT_CONSTELLATION_OPTIONS.bridgeTypes,
      challengeDifficulty:
        options?.challengeDifficulty ??
        (modeParams.challenge_difficulty as number) ??
        DEFAULT_CONSTELLATION_OPTIONS.challengeDifficulty,
      allowedEdgeTypes:
        options?.allowedEdgeTypes ??
        (modeParams.allowed_edge_types_for_paths as
          | CategoryRelationType[]
          | undefined) ??
        DEFAULT_CONSTELLATION_OPTIONS.allowedEdgeTypes,
      maxConnectionHops:
        options?.maxConnectionHops ??
        DEFAULT_CONSTELLATION_OPTIONS.maxConnectionHops,
    };
  }

  /**
   * Create feed metadata
   */
  private createMetadata(
    request: NavigationFeedRequest,
    options: Required<ConstellationChallengeOptions>,
    suggestionCount: number,
    generationTimeMs: number,
  ): NavigationFeedMetadata {
    return {
      modeId: request.modeId,
      parametersUsed: options as Record<string, unknown>,
      generatedAt: Date.now() as Timestamp,
      ttlMs: this.config.cacheTtlMs,
      suggestionCount,
      generationTimeMs,
    };
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface PerformanceDivergenceDetail {
  cardId: string;
  bestContextId: string;
  bestMastery: number;
  worstContextId: string;
  worstMastery: number;
  spread: number;
  allContexts: { categoryId: string; mastery: number }[];
}
