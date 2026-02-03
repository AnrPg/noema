// =============================================================================
// EXPLAINABILITY BUILDER
// =============================================================================
// Builds comprehensive explanations for review session decisions.
// Surfaces "why" at every stage: scheduler, mode, deck, face.
// =============================================================================

import type {
  ResolvedReviewItem,
  ReviewItemExplainability,
  SessionExplainability,
  SchedulerStageExplanation,
  ModeStageExplanation,
  DeckStageExplanation,
  FaceStageExplanation,
  SignalContribution,
  ModeInfluenceExplanation,
  SignalAmplificationExplanation,
  PolicyModificationExplanation,
  DeckFilterExplanation,
  QueueCompositionExplanation,
  ContextIndicator,
  OrchestrationTraceId,
  ReviewItemScheduling,
  ReviewItemDeckContext,
  ResolvedFaceContext,
  SessionConstraints,
  ActiveDeckContext,
} from "../../types/review-session.types";

import type {
  ReviewCandidate,
  ModeRuntimeState,
  ModeDefinition,
} from "../../types/learning-mode.types";

import type { FaceResolutionExplainability } from "../../types/face-resolution.types";

import type { NormalizedValue } from "../../types/lkgc/foundation";

// =============================================================================
// TRACE ID GENERATOR
// =============================================================================

function generateTraceId(): OrchestrationTraceId {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as OrchestrationTraceId;
}

// =============================================================================
// EXPLAINABILITY BUILDER
// =============================================================================

/**
 * Builder for comprehensive explainability traces.
 *
 * Collects information from each stage of the orchestration pipeline
 * and builds human-readable explanations.
 */
export class ExplainabilityBuilder {
  private readonly config: ExplainabilityConfig;

  constructor(config: Partial<ExplainabilityConfig> = {}) {
    this.config = { ...DEFAULT_EXPLAINABILITY_CONFIG, ...config };
  }

  // ===========================================================================
  // SESSION EXPLAINABILITY
  // ===========================================================================

  /**
   * Build session-level explainability
   */
  buildSessionExplainability(
    modeState: ModeRuntimeState | undefined,
    activeDeck: ActiveDeckContext | undefined,
    constraints: SessionConstraints,
    queueLength: number,
    cardsByState: {
      new: number;
      learning: number;
      review: number;
      relearning: number;
    },
  ): SessionExplainability {
    const modeDef = modeState?.activeModeDefinition;

    return {
      traceId: generateTraceId(),
      summary: this.buildSessionSummary(modeDef, activeDeck, queueLength),
      details: this.buildSessionDetails(modeDef, activeDeck, constraints),
      modeInfluence: this.buildModeInfluenceExplanation(modeState),
      deckFilterExplanation: activeDeck
        ? this.buildDeckFilterExplanation(activeDeck, queueLength)
        : undefined,
      queueComposition: this.buildQueueCompositionExplanation(
        queueLength,
        cardsByState,
      ),
    };
  }

  private buildSessionSummary(
    modeDef: ModeDefinition | undefined,
    activeDeck: ActiveDeckContext | undefined,
    queueLength: number,
  ): string {
    const parts: string[] = [];

    parts.push(`Review session with ${queueLength} cards`);

    if (modeDef) {
      parts.push(`using ${modeDef.name} mode`);
    }

    if (activeDeck) {
      parts.push(`from "${activeDeck.name}" deck`);
    }

    return parts.join(" ");
  }

  private buildSessionDetails(
    modeDef: ModeDefinition | undefined,
    activeDeck: ActiveDeckContext | undefined,
    constraints: SessionConstraints,
  ): string {
    const lines: string[] = [];

    lines.push("This review session was created based on:");
    lines.push("");

    // Mode
    if (modeDef) {
      lines.push(`📚 **Learning Mode**: ${modeDef.name}`);
      lines.push(`   ${modeDef.description}`);
      lines.push("");
    }

    // Deck
    if (activeDeck) {
      lines.push(`📁 **Deck Filter**: ${activeDeck.name}`);
      lines.push(
        `   ${activeDeck.dueCards} cards due out of ${activeDeck.totalCards} total`,
      );
      lines.push("");
    }

    // Constraints
    lines.push("⚙️ **Session Settings**:");
    lines.push(`   • Maximum cards: ${constraints.maxCards}`);
    lines.push(
      `   • Time budget: ${Math.round(constraints.timeBudget / 60000)} minutes`,
    );
    if (constraints.includeNewCards) {
      lines.push(`   • New cards: up to ${constraints.maxNewCards}`);
    }
    if (constraints.faceResolutionEnabled) {
      lines.push("   • Dynamic face selection: enabled");
    }
    if (constraints.facePivotingEnabled) {
      lines.push("   • Face pivoting: enabled");
    }

    return lines.join("\n");
  }

  private buildModeInfluenceExplanation(
    modeState: ModeRuntimeState | undefined,
  ): ModeInfluenceExplanation {
    const modeDef = modeState?.activeModeDefinition;

    const signalAmplifications: SignalAmplificationExplanation[] = [];
    const policyModifications: PolicyModificationExplanation[] = [];

    if (modeDef) {
      // Build signal amplifications from mode definition
      for (const signal of modeDef.amplifiedLkgcSignals ?? []) {
        signalAmplifications.push({
          signalType: signal,
          factor: 1.5, // Default amplification factor
          reason: `${modeDef.name} mode amplifies ${signal} signals`,
        });
      }

      // Build policy modifications from affected policies
      if (modeDef.affectedPolicies) {
        // ModePolicyAffects has boolean properties, so we list which are affected
        const policyNames: Array<{ name: string; affected: boolean }> = [
          {
            name: "reviewSelection",
            affected: modeDef.affectedPolicies.reviewSelection,
          },
          {
            name: "cardOrdering",
            affected: modeDef.affectedPolicies.cardOrdering,
          },
          {
            name: "newCardIntroduction",
            affected: modeDef.affectedPolicies.newCardIntroduction,
          },
          {
            name: "schedulingParameters",
            affected: modeDef.affectedPolicies.schedulingParameters,
          },
        ];

        for (const { name, affected } of policyNames) {
          if (affected) {
            policyModifications.push({
              policyName: name,
              modificationType: "weight_increase",
              value: 1.2,
              reason: `${modeDef.name} mode affects ${name}`,
            });
          }
        }
      }
    }

    return {
      modeName: modeDef?.name ?? "Default",
      modeType: modeDef?.systemType ?? "unknown",
      parametersUsed: modeState?.resolvedParameters ?? {},
      signalAmplifications,
      policyModifications,
    };
  }

  private buildDeckFilterExplanation(
    activeDeck: ActiveDeckContext,
    cardsAfter: number,
  ): DeckFilterExplanation {
    return {
      deckName: activeDeck.name,
      cardsBefore: activeDeck.totalCards,
      cardsAfter,
      cardsFiltered: activeDeck.totalCards - cardsAfter,
      filterCriteriaSummary: `Cards matching "${activeDeck.name}" deck query`,
    };
  }

  private buildQueueCompositionExplanation(
    total: number,
    byState: {
      new: number;
      learning: number;
      review: number;
      relearning: number;
    },
  ): QueueCompositionExplanation {
    // Estimate urgency distribution (simplified)
    const critical = Math.floor(total * 0.1);
    const high = Math.floor(total * 0.2);
    const medium = Math.floor(total * 0.5);
    const low = total - critical - high - medium;

    return {
      total,
      byState,
      byUrgency: { critical, high, medium, low },
      topFactors: [
        "Spaced repetition scheduling",
        "Mode-specific prioritization",
        "Deck membership",
      ],
    };
  }

  // ===========================================================================
  // ITEM EXPLAINABILITY
  // ===========================================================================

  /**
   * Build item-level explainability
   */
  buildItemExplainability(
    item: ResolvedReviewItem,
    modeState: ModeRuntimeState | undefined,
    faceExplainability?: FaceResolutionExplainability,
  ): ReviewItemExplainability {
    return {
      traceId: generateTraceId(),
      summary: this.buildItemSummary(item, modeState),
      details: this.buildItemDetails(item, modeState),
      schedulerStage: this.buildSchedulerStageExplanation(item.scheduling),
      modeStage: this.buildModeStageExplanation(item.candidate, modeState),
      deckStage: item.deckContext
        ? this.buildDeckStageExplanation(item.deckContext)
        : undefined,
      faceStage: this.buildFaceStageExplanation(
        item.resolvedFace,
        faceExplainability,
      ),
    };
  }

  private buildItemSummary(
    item: ResolvedReviewItem,
    modeState: ModeRuntimeState | undefined,
  ): string {
    const parts: string[] = [];

    // Urgency
    parts.push(
      `${item.scheduling.urgency.charAt(0).toUpperCase() + item.scheduling.urgency.slice(1)} priority card`,
    );

    // Mode
    if (modeState?.activeModeDefinition) {
      parts.push(`selected by ${modeState.activeModeDefinition.name} mode`);
    }

    // State
    if (item.scheduling.isNew) {
      parts.push("(new card)");
    } else if (item.scheduling.daysOverdue > 0) {
      parts.push(`(${item.scheduling.daysOverdue} days overdue)`);
    }

    return parts.join(" ");
  }

  private buildItemDetails(
    item: ResolvedReviewItem,
    modeState: ModeRuntimeState | undefined,
  ): string {
    const lines: string[] = [];

    lines.push("This card was selected because:");
    lines.push("");

    // Scheduling reason
    if (item.scheduling.isNew) {
      lines.push("📘 **New Card**: Ready for introduction into your learning");
    } else {
      lines.push(
        `📅 **Due Date**: ${item.scheduling.daysOverdue > 0 ? `${item.scheduling.daysOverdue} days overdue` : "Due for review"}`,
      );
      lines.push(
        `📊 **Memory Strength**: ${Math.round(item.scheduling.retrievability * 100)}% recall probability`,
      );
    }
    lines.push("");

    // Mode reason
    if (modeState?.activeModeDefinition) {
      lines.push(
        `🎯 **Mode Priority**: ${(item.candidate.priorityScore * 100).toFixed(0)}% match for ${modeState.activeModeDefinition.name} mode`,
      );
    }
    lines.push("");

    // Face reason
    lines.push(`👁️ **Face Selected**: "${item.resolvedFace.face.name}"`);
    lines.push(
      `   ${item.resolvedFace.isDefaultFace ? "Default face" : "Context-adapted face"}`,
    );

    return lines.join("\n");
  }

  private buildSchedulerStageExplanation(
    scheduling: ReviewItemScheduling,
  ): SchedulerStageExplanation {
    return {
      dueDateReason: scheduling.isNew
        ? "New card ready for introduction"
        : scheduling.daysOverdue > 0
          ? `Card is ${scheduling.daysOverdue} days overdue for review`
          : "Card is due for review today",
      stabilityExplanation: `Memory stability is ${scheduling.stability.toFixed(2)} (${this.interpretStability(scheduling.stability)})`,
      retrievabilityExplanation: `Estimated recall probability is ${Math.round(scheduling.retrievability * 100)}% (${this.interpretRetrievability(scheduling.retrievability)})`,
      intervalPrediction: this.buildIntervalPrediction(scheduling),
    };
  }

  private interpretStability(stability: number): string {
    if (stability < 0.5) return "fragile memory";
    if (stability < 2) return "developing memory";
    if (stability < 10) return "established memory";
    if (stability < 30) return "strong memory";
    return "very strong memory";
  }

  private interpretRetrievability(retrievability: NormalizedValue): string {
    if (retrievability < 0.3) return "likely forgotten";
    if (retrievability < 0.5) return "uncertain recall";
    if (retrievability < 0.7) return "moderate confidence";
    if (retrievability < 0.9) return "good recall";
    return "excellent recall";
  }

  private buildIntervalPrediction(scheduling: ReviewItemScheduling): string {
    if (scheduling.isNew) {
      return "First review will establish initial memory strength";
    }

    return "Next interval depends on your rating: Again resets, Good extends, Easy maximizes interval";
  }

  private buildModeStageExplanation(
    candidate: ReviewCandidate,
    modeState: ModeRuntimeState | undefined,
  ): ModeStageExplanation {
    const signalContributions: SignalContribution[] = [];

    // Extract signal contributions from scoring
    if (candidate.scoring.signalContributions) {
      for (const [signal, value] of Object.entries(
        candidate.scoring.signalContributions,
      )) {
        signalContributions.push({
          signalName: signal,
          contribution: value as number,
          interpretation: this.interpretSignalContribution(
            signal,
            value as number,
          ),
        });
      }
    }

    return {
      modeName: modeState?.activeModeDefinition?.name ?? "Default",
      priorityScore: candidate.priorityScore as NormalizedValue,
      scoringBreakdown: candidate.scoring,
      signalContributions,
    };
  }

  private interpretSignalContribution(signal: string, value: number): string {
    const direction =
      value > 0 ? "increased" : value < 0 ? "decreased" : "neutral";
    const magnitude = Math.abs(value) > 0.5 ? "significantly" : "slightly";

    return `${signal} ${magnitude} ${direction} priority`;
  }

  private buildDeckStageExplanation(
    deckContext: ReviewItemDeckContext,
  ): DeckStageExplanation {
    return {
      deckName: `Deck ${deckContext.deckId}`,
      inclusionReason: "Card matches deck query criteria",
      matchedPredicates: deckContext.inclusionExplanation
        ? [deckContext.inclusionExplanation.summary]
        : ["Deck membership verified"],
    };
  }

  private buildFaceStageExplanation(
    resolvedFace: ResolvedFaceContext,
    faceExplainability?: FaceResolutionExplainability,
  ): FaceStageExplanation {
    const scaffoldingApplied: string[] = [];

    // Extract scaffolding
    if (resolvedFace.scaffolding) {
      const totalHints =
        (resolvedFace.scaffolding.preRevealedHints?.length ?? 0) +
        (resolvedFace.scaffolding.additionalHints?.length ?? 0);
      if (totalHints > 0) {
        scaffoldingApplied.push(`${totalHints} hints available`);
      }
      if (resolvedFace.scaffolding.autoRevealOnStruggle) {
        scaffoldingApplied.push("Auto-reveal on struggle enabled");
      }
    }

    return {
      selectedFaceName: resolvedFace.face.name,
      selectionReason: resolvedFace.isDefaultFace
        ? "Default face selected (no context-specific rules matched)"
        : `Selected based on ${faceExplainability?.matchedRules?.length ?? 0} matching rules`,
      rulesMatched: faceExplainability?.matchedRules?.length ?? 0,
      scaffoldingApplied,
      fullExplainability: faceExplainability,
    };
  }

  // ===========================================================================
  // CONTEXT INDICATORS
  // ===========================================================================

  /**
   * Build context indicators for a review item
   */
  buildContextIndicators(
    candidate: ReviewCandidate,
    scheduling: ReviewItemScheduling,
    deckContext: ReviewItemDeckContext | undefined,
    resolvedFace: ResolvedFaceContext,
    modeState: ModeRuntimeState | undefined,
  ): ContextIndicator[] {
    const indicators: ContextIndicator[] = [];

    // Urgency indicator
    this.addUrgencyIndicator(indicators, scheduling);

    // New card indicator
    this.addNewCardIndicator(indicators, scheduling);

    // Overdue indicator
    this.addOverdueIndicator(indicators, scheduling);

    // Mode indicator
    this.addModeIndicator(indicators, candidate, modeState);

    // Deck indicator
    this.addDeckIndicator(indicators, deckContext);

    // Mastery indicator
    this.addMasteryIndicator(indicators, scheduling);

    // Relearning indicator
    this.addRelearningIndicator(indicators, scheduling);

    // Face adapted indicator
    this.addFaceAdaptedIndicator(indicators, resolvedFace);

    // Sort by importance
    return this.sortIndicatorsByImportance(indicators);
  }

  private addUrgencyIndicator(
    indicators: ContextIndicator[],
    scheduling: ReviewItemScheduling,
  ): void {
    if (scheduling.urgency === "critical" || scheduling.urgency === "high") {
      indicators.push({
        type: "urgency",
        icon: scheduling.urgency === "critical" ? "🔴" : "🟠",
        label: scheduling.urgency === "critical" ? "Critical" : "High Priority",
        description: this.getUrgencyDescription(scheduling),
        importance: "primary",
        colorHint: scheduling.urgency === "critical" ? "#dc2626" : "#f97316",
      });
    }
  }

  private getUrgencyDescription(scheduling: ReviewItemScheduling): string {
    if (scheduling.daysOverdue > 7) {
      return `Significantly overdue (${scheduling.daysOverdue} days)`;
    }
    if (scheduling.daysOverdue > 0) {
      return `Overdue by ${scheduling.daysOverdue} days`;
    }
    if (scheduling.retrievability < 0.3) {
      return "Memory strength is low";
    }
    return "Due for review";
  }

  private addNewCardIndicator(
    indicators: ContextIndicator[],
    scheduling: ReviewItemScheduling,
  ): void {
    if (scheduling.isNew) {
      indicators.push({
        type: "new",
        icon: "✨",
        label: "New Card",
        description: "First time learning this card",
        importance: "primary",
        colorHint: "#22c55e",
      });
    }
  }

  private addOverdueIndicator(
    indicators: ContextIndicator[],
    scheduling: ReviewItemScheduling,
  ): void {
    if (
      scheduling.daysOverdue > 0 &&
      !scheduling.isNew &&
      scheduling.urgency !== "critical" &&
      scheduling.urgency !== "high"
    ) {
      indicators.push({
        type: "overdue",
        icon: "⏰",
        label: `${scheduling.daysOverdue}d Overdue`,
        description: `Review was due ${scheduling.daysOverdue} days ago`,
        importance: "secondary",
        colorHint: "#ef4444",
      });
    }
  }

  private addModeIndicator(
    indicators: ContextIndicator[],
    candidate: ReviewCandidate,
    modeState: ModeRuntimeState | undefined,
  ): void {
    if (modeState && candidate.scoring.modeModifier > 0.5) {
      indicators.push({
        type: "mode",
        icon: modeState.activeModeDefinition.icon,
        label: modeState.activeModeDefinition.name,
        description: `Prioritized by ${modeState.activeModeDefinition.name} learning mode`,
        importance: "secondary",
      });
    }
  }

  private addDeckIndicator(
    indicators: ContextIndicator[],
    deckContext: ReviewItemDeckContext | undefined,
  ): void {
    if (deckContext) {
      indicators.push({
        type: "deck",
        icon: "📚",
        label: "In Deck",
        description: `Position ${deckContext.positionInDeck} in selected deck`,
        importance: "tertiary",
      });
    }
  }

  private addMasteryIndicator(
    indicators: ContextIndicator[],
    scheduling: ReviewItemScheduling,
  ): void {
    if (!scheduling.isNew && scheduling.retrievability < 0.5) {
      indicators.push({
        type: "mastery",
        icon: "📉",
        label: "Low Retention",
        description: `Memory strength at ${Math.round(scheduling.retrievability * 100)}%`,
        importance: "secondary",
        colorHint: "#f59e0b",
      });
    }
  }

  private addRelearningIndicator(
    indicators: ContextIndicator[],
    scheduling: ReviewItemScheduling,
  ): void {
    if (scheduling.state === "relearning") {
      indicators.push({
        type: "lapse",
        icon: "🔄",
        label: "Relearning",
        description: "Recovering from a recent lapse",
        importance: "secondary",
        colorHint: "#8b5cf6",
      });
    }
  }

  private addFaceAdaptedIndicator(
    indicators: ContextIndicator[],
    resolvedFace: ResolvedFaceContext,
  ): void {
    if (!resolvedFace.isDefaultFace) {
      indicators.push({
        type: "face_adapted",
        icon: "🎭",
        label: "Adapted Face",
        description: `Showing "${resolvedFace.face.name}" face based on context`,
        importance: "tertiary",
      });
    }
  }

  private sortIndicatorsByImportance(
    indicators: ContextIndicator[],
  ): ContextIndicator[] {
    const importanceOrder: Record<string, number> = {
      primary: 0,
      secondary: 1,
      tertiary: 2,
    };

    return indicators.sort(
      (a, b) =>
        (importanceOrder[a.importance] ?? 3) -
        (importanceOrder[b.importance] ?? 3),
    );
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for explainability
 */
export interface ExplainabilityConfig {
  /** Include full mode details */
  readonly includeFullModeDetails: boolean;

  /** Include signal contributions */
  readonly includeSignalContributions: boolean;

  /** Include deck predicates */
  readonly includeDeckPredicates: boolean;

  /** Include face rules */
  readonly includeFaceRules: boolean;

  /** Maximum context indicators */
  readonly maxContextIndicators: number;
}

/**
 * Default configuration
 */
export const DEFAULT_EXPLAINABILITY_CONFIG: ExplainabilityConfig = {
  includeFullModeDetails: true,
  includeSignalContributions: true,
  includeDeckPredicates: true,
  includeFaceRules: true,
  maxContextIndicators: 5,
};

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an explainability builder
 */
export function createExplainabilityBuilder(
  config?: Partial<ExplainabilityConfig>,
): ExplainabilityBuilder {
  return new ExplainabilityBuilder(config);
}
