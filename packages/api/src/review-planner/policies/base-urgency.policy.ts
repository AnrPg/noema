// =============================================================================
// BASE URGENCY POLICY
// =============================================================================
// Computes base urgency from scheduler outputs (FSRS/HLR data)
// This is the foundation layer - other policies build on top of this
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
  BaseUrgencyPolicyConfig,
  ReviewPolicyId,
  LearningModeId,
} from "@manthanein/shared";
import { DEFAULT_BASE_URGENCY_CONFIG } from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Base urgency policy - computes urgency from scheduler outputs
 *
 * Factors computed:
 * - Retrievability urgency (lower R = higher urgency)
 * - Overdue pressure (days past due)
 * - Difficulty weighting
 * - Learning state boost
 * - New card handling
 */
export class BaseUrgencyPolicy implements ReviewPolicy {
  readonly id = "policy:base_urgency" as ReviewPolicyId;
  readonly name = "Base Urgency";
  readonly description =
    "Computes base review urgency from scheduler outputs (retrievability, overdue days, difficulty)";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "base_urgency";
  readonly applicableModes: readonly LearningModeId[] = []; // All modes
  readonly compositionPriority = 0; // First in chain

  private config: BaseUrgencyPolicyConfig;

  constructor(config?: Partial<BaseUrgencyPolicyConfig>) {
    this.config = {
      ...DEFAULT_BASE_URGENCY_CONFIG,
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
      const sd = candidate.schedulerData;

      // 1. Retrievability urgency (lower R = higher urgency)
      const retrievabilityUrgency = 1 - sd.retrievability;
      factors.push({
        id: generateFactorId(),
        name: "Retrievability Urgency",
        description: "Memory at risk of forgetting",
        rawValue: retrievabilityUrgency,
        weight: this.config.retrievabilityWeight,
        contribution: retrievabilityUrgency * this.config.retrievabilityWeight,
        source: "scheduler",
        visualIndicator: retrievabilityUrgency > 0.5 ? "boost" : "neutral",
        impactDescription:
          retrievabilityUrgency > 0.7
            ? "Memory at high risk - review soon"
            : retrievabilityUrgency > 0.4
              ? "Memory moderately at risk"
              : "Memory still stable",
      });

      // 2. Overdue pressure
      const dueDate = sd.dueDate.getTime();
      const nowTime = now;
      const daysSinceDue = (nowTime - dueDate) / (1000 * 60 * 60 * 24);
      const overdueNormalized = this.computeOverdueScore(daysSinceDue);

      factors.push({
        id: generateFactorId(),
        name: "Overdue Pressure",
        description: `${daysSinceDue > 0 ? Math.floor(daysSinceDue) : 0} days overdue`,
        rawValue: overdueNormalized,
        weight: this.config.overdueWeight,
        contribution: overdueNormalized * this.config.overdueWeight,
        source: "temporal",
        visualIndicator:
          daysSinceDue > 7 ? "boost" : daysSinceDue > 0 ? "neutral" : "neutral",
        impactDescription:
          daysSinceDue > 7
            ? "Significantly overdue - prioritize"
            : daysSinceDue > 0
              ? "Overdue - should review"
              : "Not yet due",
      });

      // 3. Difficulty weighting
      const difficultyNormalized = sd.difficulty / 10; // 1-10 scale
      factors.push({
        id: generateFactorId(),
        name: "Difficulty Factor",
        description: `Difficulty ${sd.difficulty.toFixed(1)}/10`,
        rawValue: difficultyNormalized,
        weight: this.config.difficultyWeight,
        contribution: difficultyNormalized * this.config.difficultyWeight,
        source: "scheduler",
        visualIndicator: "neutral",
        impactDescription:
          sd.difficulty > 7
            ? "Difficult card - needs more practice"
            : sd.difficulty > 4
              ? "Moderate difficulty"
              : "Easier card",
      });

      // 4. Learning/relearning state boost
      if (sd.state === "learning" || sd.state === "relearning") {
        factors.push({
          id: generateFactorId(),
          name: "Learning State",
          description:
            sd.state === "learning"
              ? "Currently learning"
              : "Relearning after lapse",
          rawValue: 1.0,
          weight: this.config.learningBoost,
          contribution: this.config.learningBoost,
          source: "scheduler",
          visualIndicator: "boost",
          impactDescription: "Active learning - prioritize to complete",
        });
      }

      // 5. New card handling
      if (sd.state === "new") {
        factors.push({
          id: generateFactorId(),
          name: "New Card",
          description: "Card not yet studied",
          rawValue: 1.0,
          weight: this.config.newCardBonus,
          contribution: this.config.newCardBonus,
          source: "scheduler",
          visualIndicator: this.config.newCardBonus > 0 ? "boost" : "neutral",
          impactDescription: "New card available for introduction",
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
        retrievability: this.config.retrievabilityWeight,
        overdue: this.config.overdueWeight,
        difficulty: this.config.difficultyWeight,
        learning: this.config.learningBoost,
        newCard: this.config.newCardBonus,
      },
      policyWeight: 1.0, // Base policy has full weight
    };
  }

  canExecute(_context: PolicyExecutionContext): PolicyValidationResult {
    return { canExecute: true };
  }

  /**
   * Compute overdue score with decay
   */
  private computeOverdueScore(daysSinceDue: number): number {
    if (daysSinceDue <= 0) return 0;

    const cappedDays = Math.min(daysSinceDue, this.config.maxOverdueDays);

    switch (this.config.overdueDecay) {
      case "linear":
        return cappedDays / this.config.maxOverdueDays;

      case "exponential":
        return 1 - Math.exp(-cappedDays / (this.config.maxOverdueDays / 3));

      case "logarithmic":
      default:
        return (
          Math.log(1 + cappedDays) / Math.log(1 + this.config.maxOverdueDays)
        );
    }
  }
}

/**
 * Create base urgency policy with config
 */
export function createBaseUrgencyPolicy(
  config?: Partial<BaseUrgencyPolicyConfig>,
): BaseUrgencyPolicy {
  return new BaseUrgencyPolicy(config);
}
