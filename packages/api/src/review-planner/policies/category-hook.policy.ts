// =============================================================================
// CATEGORY HOOK POLICY
// =============================================================================
// Applies category-level metadata influences on ranking
// This includes difficulty multipliers, decay adjustments, and structural factors
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
  CategoryHookPolicyConfig,
  ReviewPolicyId,
  LearningModeId,
  NormalizedValue,
} from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Default category hook policy config
 */
const DEFAULT_CATEGORY_HOOK_CONFIG: CategoryHookPolicyConfig = {
  applyDifficultyMultiplier: true,
  applyDecayMultiplier: true,
  prerequisiteGapBoost: 0.3,
  volatilityPenalty: 0.1,
  masteryThreshold: 0.8 as NormalizedValue,
  maintenanceBoost: 0.1,
};

/**
 * Category hook policy - applies category metadata influences
 *
 * Factors computed:
 * - Difficulty multiplier from category
 * - Decay multiplier from category
 * - Prerequisite gap boost
 * - Volatility penalty
 * - Maintenance mode for well-learned categories
 */
export class CategoryHookPolicy implements ReviewPolicy {
  readonly id = "policy:category_hook" as ReviewPolicyId;
  readonly name = "Category Hooks";
  readonly description =
    "Applies category-level difficulty, decay, and structural influences on ranking";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "category_hook";
  readonly applicableModes: readonly LearningModeId[] = []; // All modes
  readonly compositionPriority = 5; // Between base and mode modifier

  private config: CategoryHookPolicyConfig;

  constructor(config?: Partial<CategoryHookPolicyConfig>) {
    this.config = {
      ...DEFAULT_CATEGORY_HOOK_CONFIG,
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
      const meta = candidate.categoryMetadata;

      // Skip if no category metadata
      if (!meta) {
        factorsByCandidateId.set(candidate.cardId, factors);
        continue;
      }

      // 1. Difficulty multiplier from category
      if (
        this.config.applyDifficultyMultiplier &&
        meta.difficultyMultiplier !== 1.0
      ) {
        const difficultyAdjustment = (meta.difficultyMultiplier - 1) * 0.2;
        factors.push({
          id: generateFactorId(),
          name: "Category Difficulty",
          description: `Category difficulty multiplier: ${meta.difficultyMultiplier.toFixed(2)}x`,
          rawValue: meta.difficultyMultiplier,
          weight: 0.2,
          contribution: difficultyAdjustment,
          source: "category_hook",
          visualIndicator:
            difficultyAdjustment > 0
              ? "boost"
              : difficultyAdjustment < 0
                ? "penalty"
                : "neutral",
          impactDescription:
            meta.difficultyMultiplier > 1.2
              ? "Challenging category - extra attention needed"
              : meta.difficultyMultiplier < 0.8
                ? "Easier category - less frequent review needed"
                : "Normal category difficulty",
        });
      }

      // 2. Decay multiplier from category (faster decay = more urgent)
      if (this.config.applyDecayMultiplier && meta.decayMultiplier !== 1.0) {
        const decayAdjustment = (meta.decayMultiplier - 1) * 0.15;
        factors.push({
          id: generateFactorId(),
          name: "Category Decay Rate",
          description: `Category decay multiplier: ${meta.decayMultiplier.toFixed(2)}x`,
          rawValue: meta.decayMultiplier,
          weight: 0.15,
          contribution: decayAdjustment,
          source: "category_hook",
          visualIndicator: decayAdjustment > 0 ? "boost" : "neutral",
          impactDescription:
            meta.decayMultiplier > 1.2
              ? "Fast-decaying category - review more frequently"
              : meta.decayMultiplier < 0.8
                ? "Slow-decaying category - retains well"
                : "Normal decay rate",
        });
      }

      // 3. Prerequisite gap boost
      if (meta.hasUnmetPrerequisites && this.config.prerequisiteGapBoost > 0) {
        factors.push({
          id: generateFactorId(),
          name: "Prerequisite Gap",
          description: `Category has ${meta.prerequisiteCount} unmet prerequisites`,
          rawValue: 1.0,
          weight: this.config.prerequisiteGapBoost,
          contribution: this.config.prerequisiteGapBoost,
          source: "structural",
          visualIndicator: "boost",
          impactDescription:
            "Prerequisite knowledge gaps - prioritize foundation building",
        });
      }

      // 4. Volatility penalty
      if (meta.volatilityFactor > 0.5) {
        const volatilityContribution =
          (meta.volatilityFactor - 0.5) * this.config.volatilityPenalty * 2;
        factors.push({
          id: generateFactorId(),
          name: "Category Volatility",
          description: `Category volatility: ${(meta.volatilityFactor * 100).toFixed(0)}%`,
          rawValue: meta.volatilityFactor,
          weight: this.config.volatilityPenalty,
          contribution: -volatilityContribution, // Penalty
          source: "category_hook",
          visualIndicator: "penalty",
          impactDescription:
            meta.volatilityFactor > 0.7
              ? "High volatility - mastery fluctuates, may need more practice"
              : "Moderate volatility in this category",
        });
      }

      // 5. Maintenance mode for well-learned categories
      if (meta.userMastery >= this.config.masteryThreshold) {
        factors.push({
          id: generateFactorId(),
          name: "Maintenance Mode",
          description: `Category mastery: ${(meta.userMastery * 100).toFixed(0)}%`,
          rawValue: meta.userMastery,
          weight: this.config.maintenanceBoost,
          contribution: this.config.maintenanceBoost,
          source: "category_hook",
          visualIndicator: "boost",
          impactDescription:
            "Well-learned category - maintenance reviews to preserve",
        });
      }

      // 6. Dependent count influence (more dependents = more important)
      if (meta.dependentCount > 0) {
        const dependentScore = Math.min(meta.dependentCount / 5, 1); // Cap at 5 dependents
        const dependentContribution = dependentScore * 0.1;
        factors.push({
          id: generateFactorId(),
          name: "Dependency Importance",
          description: `${meta.dependentCount} categories depend on this one`,
          rawValue: dependentScore,
          weight: 0.1,
          contribution: dependentContribution,
          source: "structural",
          visualIndicator: dependentContribution > 0.05 ? "boost" : "neutral",
          impactDescription:
            meta.dependentCount > 3
              ? "Critical foundation - many categories depend on this"
              : "Some dependent categories",
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
        difficulty: 0.2,
        decay: 0.15,
        prerequisite: this.config.prerequisiteGapBoost,
        volatility: this.config.volatilityPenalty,
        maintenance: this.config.maintenanceBoost,
        dependency: 0.1,
      },
      policyWeight: 0.4,
    };
  }

  canExecute(_context: PolicyExecutionContext): PolicyValidationResult {
    return { canExecute: true };
  }
}

/**
 * Create category hook policy with config
 */
export function createCategoryHookPolicy(
  config?: Partial<CategoryHookPolicyConfig>,
): CategoryHookPolicy {
  return new CategoryHookPolicy(config);
}
