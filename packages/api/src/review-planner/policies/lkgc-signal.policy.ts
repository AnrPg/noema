// =============================================================================
// LKGC SIGNAL POLICY
// =============================================================================
// Processes LKGC metacognitive signals for ranking influences
// This is the bridge between the LKGC system and review ranking
// =============================================================================

import type {
  ReviewPolicy,
  ReviewPolicyType,
  PolicyExecutionContext,
  PolicyFactorResult,
  PolicyWeights,
  PolicyValidationResult,
  SchedulerCandidateOutput,
  RankingFactor,
  ReviewPolicyId,
  LearningModeId,
  LkgcSignalType,
} from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Configuration for LKGC signal processing
 */
export interface LkgcSignalPolicyConfig {
  /** Signals to process and their base weights */
  readonly signalWeights: Partial<Record<LkgcSignalType, number>>;

  /** Minimum confidence to consider a signal */
  readonly minConfidence: number;

  /** Scale factor for signal contributions */
  readonly scaleFactor: number;
}

const DEFAULT_LKGC_SIGNAL_CONFIG: LkgcSignalPolicyConfig = {
  signalWeights: {
    // Memory signals
    stability: -0.1, // Higher stability = lower urgency
    retrievability: -0.3, // Higher retrievability = lower urgency
    difficulty: 0.1, // Higher difficulty = slight boost
    half_life: -0.05, // Longer half-life = lower urgency

    // Volatility signals
    volatility: 0.15, // Higher volatility = higher priority
    confidence_variance: 0.1, // More variance = needs attention
    performance_trend: -0.1, // Improving = lower priority

    // Risk signals
    forgetting_risk: 0.4, // High risk = high priority
    interference_risk: 0.2, // Risk of confusion
    overdue_pressure: 0.3, // Already captured but reinforced

    // Progress signals
    mastery_level: -0.1, // Higher mastery = lower urgency
    learning_velocity: -0.05, // Fast learning = lower urgency
    synthesis_depth: 0.1, // Deeper synthesis = boost for synthesis mode

    // Structural signals
    structural_maturity: -0.05, // Mature knowledge = lower urgency
    prerequisite_completion: -0.15, // Completed prereqs = stable
    blocking_gap: 0.3, // Gaps block progress = priority
  },
  minConfidence: 0.3,
  scaleFactor: 1.0,
};

/**
 * LKGC signal policy - processes metacognitive signals
 *
 * Converts LKGC signals into ranking factors:
 * - Memory stability/risk signals
 * - Volatility and confidence signals
 * - Progress and mastery signals
 * - Structural signals
 */
export class LkgcSignalPolicy implements ReviewPolicy {
  readonly id = "policy:lkgc_signals" as ReviewPolicyId;
  readonly name = "LKGC Signals";
  readonly description =
    "Processes LKGC metacognitive signals to influence review ranking";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "lkgc_signal";
  readonly applicableModes: readonly LearningModeId[] = []; // All modes
  readonly compositionPriority = 15; // After category hooks

  private config: LkgcSignalPolicyConfig;

  constructor(config?: Partial<LkgcSignalPolicyConfig>) {
    this.config = {
      ...DEFAULT_LKGC_SIGNAL_CONFIG,
      signalWeights: {
        ...DEFAULT_LKGC_SIGNAL_CONFIG.signalWeights,
        ...config?.signalWeights,
      },
      minConfidence:
        config?.minConfidence ?? DEFAULT_LKGC_SIGNAL_CONFIG.minConfidence,
      scaleFactor:
        config?.scaleFactor ?? DEFAULT_LKGC_SIGNAL_CONFIG.scaleFactor,
    };
  }

  async computeFactors(
    candidates: readonly SchedulerCandidateOutput[],
    _context: PolicyExecutionContext,
  ): Promise<PolicyFactorResult> {
    const startTime = Date.now();
    const factorsByCandidateId = new Map<string, readonly RankingFactor[]>();

    for (const candidate of candidates) {
      const factors: RankingFactor[] = [];
      const signals = candidate.lkgcSignals;

      // Process each configured signal
      for (const [signalType, baseWeight] of Object.entries(
        this.config.signalWeights,
      )) {
        const signal = signals[signalType as LkgcSignalType];

        // Skip if signal not present or confidence too low
        if (!signal || signal.confidence < this.config.minConfidence) {
          continue;
        }

        const weight = baseWeight * this.config.scaleFactor;
        const contribution = signal.normalizedValue * weight;
        const typedSignalType = signalType as LkgcSignalType;

        factors.push({
          id: generateFactorId(),
          name: this.formatSignalName(typedSignalType),
          description: this.getSignalDescription(
            typedSignalType,
            signal.normalizedValue,
          ),
          rawValue: signal.normalizedValue,
          weight,
          contribution,
          source: "lkgc_signal",
          lkgcSignal: typedSignalType,
          visualIndicator: this.getVisualIndicator(contribution),
          impactDescription: this.getImpactDescription(
            typedSignalType,
            signal.normalizedValue,
            contribution,
          ),
        });
      }

      factorsByCandidateId.set(candidate.cardId, factors);
    }

    return {
      factorsByCandidateId,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        candidatesProcessed: candidates.length,
        factorsGenerated: Array.from(factorsByCandidateId.values()).reduce(
          (sum, factors) => sum + factors.length,
          0,
        ),
      },
    };
  }

  getWeights(_context: PolicyExecutionContext): PolicyWeights {
    return {
      factorWeights: Object.fromEntries(
        Object.entries(this.config.signalWeights).map(([k, v]) => [
          k,
          v * this.config.scaleFactor,
        ]),
      ),
      policyWeight: 0.5,
    };
  }

  canExecute(_context: PolicyExecutionContext): PolicyValidationResult {
    return { canExecute: true };
  }

  private formatSignalName(signal: LkgcSignalType): string {
    return signal
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private getSignalDescription(signal: LkgcSignalType, value: number): string {
    const percentage = (value * 100).toFixed(0);

    const descriptions: Partial<Record<LkgcSignalType, string>> = {
      stability: `Memory stability: ${percentage}%`,
      retrievability: `Current recall probability: ${percentage}%`,
      difficulty: `Content difficulty: ${percentage}%`,
      forgetting_risk: `Forgetting risk: ${percentage}%`,
      volatility: `Memory volatility: ${percentage}%`,
      mastery_level: `Mastery level: ${percentage}%`,
      prerequisite_completion: `Prerequisites completed: ${percentage}%`,
      blocking_gap: `Knowledge gap severity: ${percentage}%`,
      synthesis_depth: `Synthesis depth: ${percentage}%`,
      interference_risk: `Interference risk: ${percentage}%`,
    };

    return (
      descriptions[signal] || `${this.formatSignalName(signal)}: ${percentage}%`
    );
  }

  private getVisualIndicator(
    contribution: number,
  ): "boost" | "penalty" | "neutral" {
    if (contribution > 0.05) return "boost";
    if (contribution < -0.05) return "penalty";
    return "neutral";
  }

  private getImpactDescription(
    signal: LkgcSignalType,
    value: number,
    contribution: number,
  ): string {
    const direction =
      contribution > 0
        ? "increases"
        : contribution < 0
          ? "decreases"
          : "neutral effect on";
    const strength =
      Math.abs(contribution) > 0.1
        ? "significantly"
        : Math.abs(contribution) > 0.03
          ? "moderately"
          : "slightly";

    const impactDescriptions: Partial<Record<LkgcSignalType, () => string>> = {
      forgetting_risk: () =>
        value > 0.7
          ? "High forgetting risk - review soon to prevent loss"
          : value > 0.4
            ? "Moderate forgetting risk"
            : "Low forgetting risk",

      stability: () =>
        value > 0.7
          ? "Stable memory - less urgent"
          : value < 0.3
            ? "Unstable memory - needs reinforcement"
            : "Moderate stability",

      retrievability: () =>
        value > 0.8
          ? "Easy to recall - can wait"
          : value < 0.5
            ? "Recall difficulty - review recommended"
            : "Moderate recall ability",

      blocking_gap: () =>
        value > 0.5
          ? "Knowledge gap blocking progress - prioritize"
          : "Minor gaps present",

      mastery_level: () =>
        value > 0.8
          ? "Well mastered - maintenance review"
          : value < 0.4
            ? "Not yet mastered - needs practice"
            : "Developing mastery",

      volatility: () =>
        value > 0.6
          ? "Volatile memory - frequent review helpful"
          : "Stable learning pattern",

      prerequisite_completion: () =>
        value > 0.9
          ? "Prerequisites complete - ready for advanced"
          : value < 0.5
            ? "Missing prerequisites"
            : "Building foundation",
    };

    const specificDesc = impactDescriptions[signal];
    if (specificDesc) {
      return specificDesc();
    }

    return `${this.formatSignalName(signal)} ${strength} ${direction} priority`;
  }
}

/**
 * Create LKGC signal policy with config
 */
export function createLkgcSignalPolicy(
  config?: Partial<LkgcSignalPolicyConfig>,
): LkgcSignalPolicy {
  return new LkgcSignalPolicy(config);
}
