// =============================================================================
// MODE MODIFIER POLICY
// =============================================================================
// Applies mode-specific adjustments to candidate ranking
// Different modes have different priorities and preferences
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
  ModeModifierPolicyConfig,
  ReviewPolicyId,
  LearningModeId,
  LkgcSignalType,
} from "@manthanein/shared";
import { DEFAULT_GOAL_DRIVEN_CONFIG } from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Mode modifier policy - applies mode-specific ranking adjustments
 *
 * Factors computed:
 * - LKGC signal modifiers (mode-specific)
 * - Depth preference (deep vs shallow categories)
 * - New card rate adjustment
 * - Serendipity injection
 * - Strictness factor (how strictly to follow priority)
 */
export class ModeModifierPolicy implements ReviewPolicy {
  readonly id: ReviewPolicyId;
  readonly name: string;
  readonly description: string;
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "mode_modifier";
  readonly applicableModes: readonly LearningModeId[];
  readonly compositionPriority = 10; // After base urgency

  private config: ModeModifierPolicyConfig;
  private modeId: LearningModeId;

  constructor(
    modeId: LearningModeId,
    config?: Partial<ModeModifierPolicyConfig>,
    applicableModes?: readonly LearningModeId[],
  ) {
    this.modeId = modeId;
    this.id = `policy:mode_modifier:${modeId}` as ReviewPolicyId;
    this.name = `Mode Modifier (${modeId})`;
    this.description = `Applies ${modeId} mode-specific ranking adjustments`;
    this.applicableModes = applicableModes || [modeId];
    this.config = {
      ...DEFAULT_GOAL_DRIVEN_CONFIG,
      ...config,
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

      // 1. LKGC signal modifiers
      for (const [signalType, modifierValue] of Object.entries(
        this.config.signalModifiers,
      )) {
        const modifier = modifierValue as number;
        const typedSignalType = signalType as LkgcSignalType;
        const signal = candidate.lkgcSignals[typedSignalType];
        if (signal) {
          const contribution = signal.normalizedValue * modifier;
          factors.push({
            id: generateFactorId(),
            name: `${this.formatSignalName(typedSignalType)} Signal`,
            description: `${signalType} influence on ranking`,
            rawValue: signal.normalizedValue,
            weight: modifier,
            contribution,
            source: "lkgc_signal",
            lkgcSignal: typedSignalType,
            visualIndicator:
              contribution > 0
                ? "boost"
                : contribution < 0
                  ? "penalty"
                  : "neutral",
            impactDescription: this.describeSignalImpact(
              typedSignalType,
              signal.normalizedValue,
              modifier,
            ),
          });
        }
      }

      // 2. Depth preference
      if (candidate.categoryMetadata) {
        const depth = candidate.categoryMetadata.depth;
        const maxDepth = 5; // Assume max depth of 5
        const normalizedDepth = depth / maxDepth;

        // depthPreference: -1 = prefer deep, +1 = prefer shallow
        const depthScore =
          this.config.depthPreference > 0
            ? 1 - normalizedDepth // Prefer shallow
            : normalizedDepth; // Prefer deep

        const depthContribution =
          depthScore * Math.abs(this.config.depthPreference) * 0.1;

        factors.push({
          id: generateFactorId(),
          name: "Depth Preference",
          description: `Category at depth ${depth}`,
          rawValue: depthScore,
          weight: Math.abs(this.config.depthPreference) * 0.1,
          contribution: depthContribution,
          source: "mode_policy",
          visualIndicator: depthContribution > 0.05 ? "boost" : "neutral",
          impactDescription:
            this.config.depthPreference > 0
              ? depth <= 2
                ? "Shallow category - mode prefers overview"
                : "Deep category - mode prefers breadth"
              : depth >= 3
                ? "Deep category - mode prefers depth"
                : "Shallow category",
        });
      }

      // 3. New card rate adjustment
      if (candidate.schedulerData.state === "new") {
        const newCardFactor = this.config.newCardRate - 0.5; // Center at 0
        factors.push({
          id: generateFactorId(),
          name: "New Card Rate",
          description: `Mode new card introduction rate: ${(this.config.newCardRate * 100).toFixed(0)}%`,
          rawValue: this.config.newCardRate,
          weight: 0.2,
          contribution: newCardFactor * 0.2,
          source: "mode_policy",
          visualIndicator:
            newCardFactor > 0
              ? "boost"
              : newCardFactor < 0
                ? "penalty"
                : "neutral",
          impactDescription:
            this.config.newCardRate > 0.5
              ? "Mode encourages new cards"
              : this.config.newCardRate < 0.3
                ? "Mode limits new card introduction"
                : "Normal new card rate",
        });
      }

      // 4. Serendipity injection
      if (this.config.serendipityFactor > 0) {
        const serendipityNoise =
          (Math.random() - 0.5) * 2 * this.config.serendipityFactor;
        factors.push({
          id: generateFactorId(),
          name: "Serendipity",
          description: "Random exploration factor",
          rawValue: Math.abs(serendipityNoise),
          weight: 0.15,
          contribution: serendipityNoise * 0.15,
          source: "mode_policy",
          visualIndicator: "neutral",
          impactDescription: "Adding variety to review order",
        });
      }

      // 5. Strictness factor (inverse - high strictness reduces random variance)
      const strictnessMultiplier = this.config.strictness;
      factors.push({
        id: generateFactorId(),
        name: "Strictness",
        description: `Mode strictness: ${(this.config.strictness * 100).toFixed(0)}%`,
        rawValue: strictnessMultiplier,
        weight: 0, // Meta-factor, affects other weights
        contribution: 0,
        source: "mode_policy",
        visualIndicator: "neutral",
        impactDescription:
          strictnessMultiplier > 0.7
            ? "Strict priority ordering"
            : strictnessMultiplier < 0.4
              ? "Loose ordering for exploration"
              : "Balanced priority",
      });

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
      factorWeights: {
        ...Object.fromEntries(
          Object.entries(this.config.signalModifiers).map(([k, v]) => [
            `signal_${k}`,
            v,
          ]),
        ),
        depth: Math.abs(this.config.depthPreference) * 0.1,
        newCard: 0.2,
        serendipity: 0.15,
      },
      policyWeight: 0.6, // Mode modifiers have significant weight
    };
  }

  canExecute(context: PolicyExecutionContext): PolicyValidationResult {
    // Check if this policy applies to the current mode
    if (
      this.applicableModes.length > 0 &&
      !this.applicableModes.includes(
        context.modeRuntimeState.activeModeDefinition.id as LearningModeId,
      )
    ) {
      return {
        canExecute: false,
        reason: `Policy not applicable to mode ${context.modeRuntimeState.activeModeDefinition.id}`,
      };
    }
    return { canExecute: true };
  }

  private formatSignalName(signal: LkgcSignalType): string {
    return signal
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private describeSignalImpact(
    signal: LkgcSignalType,
    value: number,
    modifier: number,
  ): string {
    const direction = modifier > 0 ? "boosts" : "reduces";
    const strength = Math.abs(modifier) > 0.3 ? "significantly" : "slightly";

    const signalDescriptions: Partial<Record<LkgcSignalType, string>> = {
      prerequisite_completion: `Prerequisite progress ${direction} priority`,
      blocking_gap: `Knowledge gap ${modifier < 0 ? "increases" : "decreases"} priority`,
      mastery_level: `Mastery level ${direction} priority`,
      synthesis_depth: `Synthesis depth ${direction} priority`,
      exploration_potential: `Exploration potential ${direction} priority`,
      cross_context_stability: `Cross-context stability ${direction} priority`,
      forgetting_risk: `Forgetting risk ${direction} priority`,
      volatility: `Memory volatility ${direction} priority`,
    };

    return (
      signalDescriptions[signal] ||
      `${this.formatSignalName(signal)} ${strength} ${direction} priority`
    );
  }
}

/**
 * Create mode modifier policy with config
 */
export function createModeModifierPolicy(
  modeId: LearningModeId,
  config?: Partial<ModeModifierPolicyConfig>,
  applicableModes?: readonly LearningModeId[],
): ModeModifierPolicy {
  return new ModeModifierPolicy(modeId, config, applicableModes);
}
