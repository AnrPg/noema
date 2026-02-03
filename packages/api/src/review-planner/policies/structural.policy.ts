// =============================================================================
// STRUCTURAL POLICY
// =============================================================================
// Processes graph structure influences on ranking
// Considers prerequisites, dependencies, and knowledge hierarchy
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
} from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Configuration for structural policy
 */
export interface StructuralPolicyConfig {
  /** Weight for prerequisite completion influence */
  readonly prerequisiteWeight: number;

  /** Weight for dependent importance */
  readonly dependentWeight: number;

  /** Weight for hierarchy depth */
  readonly depthWeight: number;

  /** Penalty for unmet prerequisites */
  readonly unmetPrerequisitePenalty: number;

  /** Boost for bridge categories */
  readonly bridgeCategoryBoost: number;

  /** Boost for foundational categories (many dependents) */
  readonly foundationBoost: number;
}

const DEFAULT_STRUCTURAL_CONFIG: StructuralPolicyConfig = {
  prerequisiteWeight: 0.15,
  dependentWeight: 0.1,
  depthWeight: 0.05,
  unmetPrerequisitePenalty: -0.2,
  bridgeCategoryBoost: 0.15,
  foundationBoost: 0.2,
};

/**
 * Structural policy - considers knowledge graph structure
 *
 * Factors computed:
 * - Prerequisite chain position
 * - Dependent category importance
 * - Hierarchy depth influence
 * - Bridge category detection
 * - Foundation category boosting
 */
export class StructuralPolicy implements ReviewPolicy {
  readonly id = "policy:structural" as ReviewPolicyId;
  readonly name = "Structural";
  readonly description =
    "Considers knowledge graph structure for ranking (prerequisites, dependencies, hierarchy)";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "structural";
  readonly applicableModes: readonly LearningModeId[] = []; // All modes
  readonly compositionPriority = 8; // After category hooks, before mode modifiers

  private config: StructuralPolicyConfig;

  constructor(config?: Partial<StructuralPolicyConfig>) {
    this.config = {
      ...DEFAULT_STRUCTURAL_CONFIG,
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

      // 1. Unmet prerequisites penalty
      if (meta.hasUnmetPrerequisites) {
        factors.push({
          id: generateFactorId(),
          name: "Unmet Prerequisites",
          description: `Category has unmet prerequisites`,
          rawValue: 1.0,
          weight: this.config.unmetPrerequisitePenalty,
          contribution: this.config.unmetPrerequisitePenalty,
          source: "structural",
          visualIndicator: "penalty",
          impactDescription:
            "Prerequisites not met - consider building foundation first",
        });
      }

      // 2. Foundation category boost (many dependents)
      if (meta.dependentCount >= 3) {
        const foundationScore = Math.min(meta.dependentCount / 5, 1);
        const foundationContribution =
          foundationScore * this.config.foundationBoost;
        factors.push({
          id: generateFactorId(),
          name: "Foundation Category",
          description: `${meta.dependentCount} categories depend on this knowledge`,
          rawValue: foundationScore,
          weight: this.config.foundationBoost,
          contribution: foundationContribution,
          source: "structural",
          visualIndicator: "boost",
          impactDescription: "Critical foundation - strengthens many areas",
        });
      }

      // 3. Bridge category boost (connects prerequisites to dependents)
      if (meta.prerequisiteCount > 0 && meta.dependentCount > 0) {
        const bridgeScore = Math.min(
          (meta.prerequisiteCount + meta.dependentCount) / 6,
          1,
        );
        const bridgeContribution =
          bridgeScore * this.config.bridgeCategoryBoost;
        factors.push({
          id: generateFactorId(),
          name: "Bridge Category",
          description: `Bridges ${meta.prerequisiteCount} foundations to ${meta.dependentCount} advanced topics`,
          rawValue: bridgeScore,
          weight: this.config.bridgeCategoryBoost,
          contribution: bridgeContribution,
          source: "structural",
          visualIndicator: "boost",
          impactDescription: "Bridge concept - key for knowledge integration",
        });
      }

      // 4. Hierarchy depth influence
      const maxDepth = 5;
      const depthScore = meta.depth / maxDepth;
      const depthContribution = depthScore * this.config.depthWeight;
      factors.push({
        id: generateFactorId(),
        name: "Hierarchy Depth",
        description: `Category at depth ${meta.depth} in hierarchy`,
        rawValue: depthScore,
        weight: this.config.depthWeight,
        contribution: depthContribution,
        source: "structural",
        visualIndicator: "neutral",
        impactDescription:
          meta.depth <= 1
            ? "Top-level category"
            : meta.depth >= 4
              ? "Deep specialization"
              : "Mid-level category",
      });

      // 5. Prerequisite completion influence
      if (meta.prerequisiteCount > 0 && !meta.hasUnmetPrerequisites) {
        const completionScore = 1.0; // All prerequisites met
        const completionContribution =
          completionScore * this.config.prerequisiteWeight;
        factors.push({
          id: generateFactorId(),
          name: "Prerequisites Met",
          description: `All ${meta.prerequisiteCount} prerequisites completed`,
          rawValue: completionScore,
          weight: this.config.prerequisiteWeight,
          contribution: completionContribution,
          source: "structural",
          visualIndicator: "boost",
          impactDescription: "Ready to advance - foundation is solid",
        });
      }

      // 6. Dependent importance (leaf categories have fewer dependents)
      const dependentScore = Math.min(meta.dependentCount / 3, 1);
      const dependentContribution =
        dependentScore * this.config.dependentWeight;
      factors.push({
        id: generateFactorId(),
        name: "Dependent Importance",
        description:
          meta.dependentCount > 0
            ? `${meta.dependentCount} topics build on this`
            : "Specialized topic (no dependents)",
        rawValue: dependentScore,
        weight: this.config.dependentWeight,
        contribution: dependentContribution,
        source: "structural",
        visualIndicator: meta.dependentCount > 0 ? "boost" : "neutral",
        impactDescription:
          meta.dependentCount > 0
            ? "Important for downstream learning"
            : "Specialized knowledge",
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
        unmetPrerequisite: this.config.unmetPrerequisitePenalty,
        foundation: this.config.foundationBoost,
        bridge: this.config.bridgeCategoryBoost,
        depth: this.config.depthWeight,
        prerequisiteComplete: this.config.prerequisiteWeight,
        dependent: this.config.dependentWeight,
      },
      policyWeight: 0.3,
    };
  }

  canExecute(_context: PolicyExecutionContext): PolicyValidationResult {
    return { canExecute: true };
  }
}

/**
 * Create structural policy with config
 */
export function createStructuralPolicy(
  config?: Partial<StructuralPolicyConfig>,
): StructuralPolicy {
  return new StructuralPolicy(config);
}
