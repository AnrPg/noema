// =============================================================================
// EXAM CRAM POLICY
// =============================================================================
// Specialized policy for exam-oriented mode
// Prioritizes coverage over depth, handles exam deadlines
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
  ExamCramPolicyConfig,
  ReviewPolicyId,
  LearningModeId,
} from "@manthanein/shared";
import { DEFAULT_EXAM_CRAM_CONFIG } from "@manthanein/shared";
import { generateFactorId } from "../types.js";

/**
 * Exam cram policy - optimized for time-bounded exam preparation
 *
 * Factors computed:
 * - Exam deadline urgency
 * - Coverage priority (breadth over depth)
 * - Exam weight boosting
 * - Low-weight content filtering
 * - Mastery gap identification
 */
export class ExamCramPolicy implements ReviewPolicy {
  readonly id = "policy:exam_cram" as ReviewPolicyId;
  readonly name = "Exam Cram";
  readonly description =
    "Optimizes review ordering for time-bounded exam preparation";
  readonly version = "1.0.0";
  readonly type: ReviewPolicyType = "exam_cram";
  readonly applicableModes: readonly LearningModeId[] = [
    "system:exam_oriented" as LearningModeId,
  ];
  readonly compositionPriority = 20; // High priority for exam mode

  private config: ExamCramPolicyConfig;

  constructor(config?: Partial<ExamCramPolicyConfig>) {
    this.config = {
      ...DEFAULT_EXAM_CRAM_CONFIG,
      ...config,
    };
  }

  async computeFactors(
    candidates: readonly SchedulerCandidateOutput[],
    context: PolicyExecutionContext,
  ): Promise<PolicyFactorResult> {
    const startTime = Date.now();
    const factorsByCandidateId = new Map<string, readonly RankingFactor[]>();
    const examDeadline = context.examDeadline;

    // Calculate days until exam
    const daysUntilExam = examDeadline
      ? (examDeadline - context.now) / (1000 * 60 * 60 * 24)
      : null;

    for (const candidate of candidates) {
      const factors: RankingFactor[] = [];
      const meta = candidate.categoryMetadata;

      // 1. Exam deadline urgency
      if (daysUntilExam !== null) {
        const deadlineUrgency = this.computeDeadlineUrgency(daysUntilExam);
        factors.push({
          id: generateFactorId(),
          name: "Exam Deadline Urgency",
          description: `${Math.ceil(daysUntilExam)} days until exam`,
          rawValue: deadlineUrgency,
          weight: 0.4,
          contribution: deadlineUrgency * 0.4,
          source: "temporal",
          visualIndicator:
            deadlineUrgency > 0.7
              ? "boost"
              : deadlineUrgency > 0.4
                ? "neutral"
                : "neutral",
          impactDescription:
            daysUntilExam <= this.config.criticalDays
              ? "CRITICAL - Exam imminent, maximize coverage"
              : daysUntilExam <= 7
                ? "Exam approaching - focus on gaps"
                : "Time available for thorough review",
        });
      }

      // 2. Coverage priority
      if (meta) {
        const masteryGap = 1 - meta.userMastery;
        const coverageNeed =
          masteryGap > 1 - this.config.coverageMasteryThreshold
            ? masteryGap
            : 0;

        if (coverageNeed > 0) {
          const coverageContribution =
            coverageNeed * this.config.coveragePriority * 0.3;
          factors.push({
            id: generateFactorId(),
            name: "Coverage Gap",
            description: `Category mastery: ${(meta.userMastery * 100).toFixed(0)}% (target: ${(this.config.coverageMasteryThreshold * 100).toFixed(0)}%)`,
            rawValue: coverageNeed,
            weight: this.config.coveragePriority * 0.3,
            contribution: coverageContribution,
            source: "mode_policy",
            visualIndicator: "boost",
            impactDescription:
              meta.userMastery < 0.4
                ? "Major coverage gap - prioritize for exam"
                : meta.userMastery < 0.6
                  ? "Coverage gap - needs attention"
                  : "Minor gap to close",
          });
        }
      }

      // 3. Exam weight boosting
      if (meta?.examWeight) {
        const examWeightBoost =
          meta.examWeight * this.config.examFrequencyBoost;
        factors.push({
          id: generateFactorId(),
          name: "Exam Weight",
          description: `Exam importance: ${(meta.examWeight * 100).toFixed(0)}%`,
          rawValue: meta.examWeight,
          weight: this.config.examFrequencyBoost,
          contribution: examWeightBoost,
          source: "mode_policy",
          visualIndicator: meta.examWeight > 0.5 ? "boost" : "neutral",
          impactDescription:
            meta.examWeight > 0.7
              ? "High exam weight - frequently tested content"
              : meta.examWeight > 0.4
                ? "Moderate exam importance"
                : "Lower exam priority",
        });
      }

      // 4. Low-weight content filtering
      if (
        meta?.examWeight &&
        meta.examWeight < this.config.skipLowWeightThreshold
      ) {
        factors.push({
          id: generateFactorId(),
          name: "Low Priority Content",
          description: `Content below exam threshold (${(this.config.skipLowWeightThreshold * 100).toFixed(0)}%)`,
          rawValue: meta.examWeight,
          weight: -0.5,
          contribution: -0.5,
          source: "mode_policy",
          visualIndicator: "penalty",
          impactDescription: "Low exam priority - consider skipping for now",
        });
      }

      // 5. Difficulty adjustment for exam (slightly prefer easier for coverage)
      const difficulty = candidate.schedulerData.difficulty;
      if (difficulty > 7) {
        const difficultyPenalty =
          ((difficulty - 7) / 3) * 0.1 * this.config.coveragePriority;
        factors.push({
          id: generateFactorId(),
          name: "Difficulty Trade-off",
          description: `High difficulty (${difficulty.toFixed(1)}) - coverage may be prioritized`,
          rawValue: difficulty / 10,
          weight: -0.1 * this.config.coveragePriority,
          contribution: -difficultyPenalty,
          source: "mode_policy",
          visualIndicator: "penalty",
          impactDescription: "Very difficult - may trade depth for coverage",
        });
      }

      // 6. New cards - limited in exam cram mode
      if (candidate.schedulerData.state === "new") {
        const daysThreshold = this.config.criticalDays * 2;
        if (daysUntilExam !== null && daysUntilExam < daysThreshold) {
          factors.push({
            id: generateFactorId(),
            name: "New Card Near Exam",
            description: "New cards less valuable close to exam",
            rawValue: 1.0,
            weight: -0.3,
            contribution: -0.3,
            source: "mode_policy",
            visualIndicator: "penalty",
            impactDescription:
              "New cards limited - focus on reinforcing existing knowledge",
          });
        }
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
        deadline: 0.4,
        coverage: this.config.coveragePriority * 0.3,
        examWeight: this.config.examFrequencyBoost,
        lowPriority: -0.5,
        difficulty: -0.1 * this.config.coveragePriority,
        newCard: -0.3,
      },
      policyWeight: 0.8, // High weight in exam mode
    };
  }

  canExecute(context: PolicyExecutionContext): PolicyValidationResult {
    const modeId = context.modeRuntimeState.activeModeDefinition.id;
    if (!this.applicableModes.includes(modeId as LearningModeId)) {
      return {
        canExecute: false,
        reason: `Exam cram policy only applies to exam-oriented mode, current: ${modeId}`,
      };
    }
    return { canExecute: true };
  }

  /**
   * Compute urgency based on days until exam
   */
  private computeDeadlineUrgency(daysUntilExam: number): number {
    if (daysUntilExam <= 0) return 1.0; // Exam today or past
    if (daysUntilExam <= this.config.criticalDays)
      return (
        0.9 +
        (this.config.criticalDays - daysUntilExam) /
          (this.config.criticalDays * 10)
      );

    const maxDays = 30; // Consider 30 days as planning horizon

    switch (this.config.urgencyCurve) {
      case "linear":
        return Math.max(0, 1 - daysUntilExam / maxDays);

      case "exponential":
        return Math.exp(-daysUntilExam / (maxDays / 3));

      case "step":
        if (daysUntilExam <= this.config.criticalDays) return 0.9;
        if (daysUntilExam <= 7) return 0.7;
        if (daysUntilExam <= 14) return 0.5;
        return 0.3;

      default:
        return Math.max(0, 1 - daysUntilExam / maxDays);
    }
  }
}

/**
 * Create exam cram policy with config
 */
export function createExamCramPolicy(
  config?: Partial<ExamCramPolicyConfig>,
): ExamCramPolicy {
  return new ExamCramPolicy(config);
}
