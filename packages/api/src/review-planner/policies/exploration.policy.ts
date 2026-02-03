// =============================================================================
// EXPLORATION POLICY
// =============================================================================
// Specialized policy for exploration mode
// Reduces pressure, encourages novelty and serendipity
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
  ExplorationPolicyConfig,
  ReviewPolicyId,
  LearningModeId,
} from "@manthanein/shared";
import { DEFAULT_EXPLORATION_CONFIG } from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Exploration policy - optimized for curiosity-driven learning
 *
 * Factors computed:
 * - Urgency dampening (reduce pressure)
 * - Novelty boost
 * - Serendipity boost
 * - Overdue deferral (allow postponement)
 * - Bridge category boost (connections)
 */
export class ExplorationPolicy implements ReviewPolicy {
  readonly id = "policy:exploration" as ReviewPolicyId;
  readonly name = "Exploration";
  readonly description =
    "Reduces urgency pressure and encourages curiosity-driven exploration";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "exploration";
  readonly applicableModes: readonly LearningModeId[] = [
    "system:exploration" as LearningModeId,
  ];
  readonly compositionPriority = 20; // High priority for exploration mode

  private config: ExplorationPolicyConfig;

  constructor(config?: Partial<ExplorationPolicyConfig>) {
    this.config = {
      ...DEFAULT_EXPLORATION_CONFIG,
      ...config,
    };
  }

  async computeFactors(
    candidates: readonly SchedulerCandidateOutput[],
    context: PolicyExecutionContext,
  ): Promise<PolicyFactorResult> {
    const startTime = Date.now();
    const factorsByCandidateId = new Map<string, readonly RankingFactor[]>();
    const now = context.now;

    for (const candidate of candidates) {
      const factors: RankingFactor[] = [];
      const meta = candidate.categoryMetadata;
      const sd = candidate.schedulerData;

      // 1. Urgency dampening (reduce pressure from overdue)
      const dueDate = sd.dueDate.getTime();
      const daysSinceDue = (now - dueDate) / (1000 * 60 * 60 * 24);

      if (daysSinceDue > 0) {
        const dampening = this.config.urgencyDampening * 0.3;
        factors.push({
          id: generateFactorId(),
          name: "Urgency Dampening",
          description: "Exploration mode reduces review pressure",
          rawValue: this.config.urgencyDampening,
          weight: -0.3,
          contribution: -dampening,
          source: "mode_policy",
          visualIndicator: "neutral",
          impactDescription: "Lower pressure - take your time to explore",
        });
      }

      // 2. Novelty boost from LKGC signals
      const noveltySignal = candidate.lkgcSignals["novelty_score"];
      if (noveltySignal) {
        const noveltyContribution =
          noveltySignal.normalizedValue * this.config.noveltyBoost;
        factors.push({
          id: generateFactorId(),
          name: "Novelty Score",
          description: `Content novelty: ${(noveltySignal.normalizedValue * 100).toFixed(0)}%`,
          rawValue: noveltySignal.normalizedValue,
          weight: this.config.noveltyBoost,
          contribution: noveltyContribution,
          source: "lkgc_signal",
          lkgcSignal: "novelty_score",
          visualIndicator:
            noveltySignal.normalizedValue > 0.5 ? "boost" : "neutral",
          impactDescription:
            noveltySignal.normalizedValue > 0.7
              ? "Novel content - perfect for exploration"
              : noveltySignal.normalizedValue > 0.4
                ? "Moderately novel"
                : "Familiar content",
        });
      }

      // 3. Exploration potential from LKGC
      const explorationSignal = candidate.lkgcSignals["exploration_potential"];
      if (explorationSignal) {
        const explorationContribution = explorationSignal.normalizedValue * 0.2;
        factors.push({
          id: generateFactorId(),
          name: "Exploration Potential",
          description: `Exploration value: ${(explorationSignal.normalizedValue * 100).toFixed(0)}%`,
          rawValue: explorationSignal.normalizedValue,
          weight: 0.2,
          contribution: explorationContribution,
          source: "lkgc_signal",
          lkgcSignal: "exploration_potential",
          visualIndicator:
            explorationSignal.normalizedValue > 0.5 ? "boost" : "neutral",
          impactDescription: "Content with high exploration potential",
        });
      }

      // 4. Serendipity boost (random discovery factor)
      const serendipityScore = Math.random();
      if (serendipityScore > 0.7) {
        const serendipityContribution =
          (serendipityScore - 0.7) * this.config.serendipityBoost * 3;
        factors.push({
          id: generateFactorId(),
          name: "Serendipity",
          description: "Random discovery opportunity",
          rawValue: serendipityScore,
          weight: this.config.serendipityBoost,
          contribution: serendipityContribution,
          source: "mode_policy",
          visualIndicator: "boost",
          impactDescription: "Serendipitous discovery - something unexpected!",
        });
      }

      // 5. Overdue deferral (allow postponing overdue cards)
      if (
        this.config.allowOverdueDefer &&
        daysSinceDue > 0 &&
        daysSinceDue <= this.config.maxDeferDays
      ) {
        const deferAmount =
          Math.min(daysSinceDue / this.config.maxDeferDays, 1) * 0.2;
        factors.push({
          id: generateFactorId(),
          name: "Overdue Deferral",
          description: `${Math.floor(daysSinceDue)} days overdue - can be deferred`,
          rawValue: daysSinceDue / this.config.maxDeferDays,
          weight: -0.2,
          contribution: -deferAmount,
          source: "mode_policy",
          visualIndicator: "penalty",
          impactDescription: "Overdue but exploration mode allows deferral",
        });
      }

      // 6. Bridge category boost
      if (meta && meta.dependentCount > 0 && meta.prerequisiteCount > 0) {
        // This is a "bridge" category - connects concepts
        const bridgeScore = Math.min(
          (meta.dependentCount + meta.prerequisiteCount) / 6,
          1,
        );
        const bridgeContribution =
          bridgeScore * this.config.bridgeCategoryBoost;
        factors.push({
          id: generateFactorId(),
          name: "Bridge Category",
          description: `Connects ${meta.prerequisiteCount} prerequisites to ${meta.dependentCount} dependents`,
          rawValue: bridgeScore,
          weight: this.config.bridgeCategoryBoost,
          contribution: bridgeContribution,
          source: "structural",
          visualIndicator: "boost",
          impactDescription:
            "Bridge concept - connects different knowledge areas",
        });
      }

      // 7. New card encouragement in exploration
      if (sd.state === "new") {
        factors.push({
          id: generateFactorId(),
          name: "New Discovery",
          description: "New content for exploration",
          rawValue: 1.0,
          weight: 0.15,
          contribution: 0.15,
          source: "mode_policy",
          visualIndicator: "boost",
          impactDescription: "New content to discover",
        });
      }

      // 8. Shallow category boost (broader exploration)
      if (meta && meta.depth <= 2) {
        factors.push({
          id: generateFactorId(),
          name: "Broad Topic",
          description: `Top-level category (depth ${meta.depth})`,
          rawValue: 1 - meta.depth / 5,
          weight: 0.1,
          contribution: (1 - meta.depth / 5) * 0.1,
          source: "structural",
          visualIndicator: "neutral",
          impactDescription: "Broad topic - good for overview exploration",
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
      factorWeights: {
        urgencyDampening: -0.3,
        novelty: this.config.noveltyBoost,
        exploration: 0.2,
        serendipity: this.config.serendipityBoost,
        deferral: -0.2,
        bridge: this.config.bridgeCategoryBoost,
        newCard: 0.15,
        broadTopic: 0.1,
      },
      policyWeight: 0.7,
    };
  }

  canExecute(context: PolicyExecutionContext): PolicyValidationResult {
    const modeId = context.modeRuntimeState.activeModeDefinition.id;
    if (!this.applicableModes.includes(modeId as LearningModeId)) {
      return {
        canExecute: false,
        reason: `Exploration policy only applies to exploration mode, current: ${modeId}`,
      };
    }
    return { canExecute: true };
  }
}

/**
 * Create exploration policy with config
 */
export function createExplorationPolicy(
  config?: Partial<ExplorationPolicyConfig>,
): ExplorationPolicy {
  return new ExplorationPolicy(config);
}
