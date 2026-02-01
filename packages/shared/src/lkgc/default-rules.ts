// =============================================================================
// DEFAULT RULES - Deterministic Heuristic Rules for MasteryState
// =============================================================================
// Placeholder rules that implement deterministic heuristics.
// These rules:
// - Preserve the correct schema and field structure
// - Are designed to be replaced by ML models (FSRS/HLR) later
// - Are fully traceable and auditable
//
// Each rule is tagged with "heuristic-v0" to indicate placeholder status.
// =============================================================================

import type {
  Timestamp,
  NormalizedValue,
  NodeId,
  BipolarScore,
} from "../types/lkgc/foundation";
import type { MasteryGranularity } from "../types/lkgc/mastery";
import { confidence, normalized, now as nowFn } from "./id-generator";
import { createRuleRegistry, type RuleRegistry } from "./rule-registry";
import type {
  UpdateRule,
  RuleMetadata,
  RuleContext,
  RuleOutput,
  RuleCategory,
} from "./rule-registry";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a BipolarScore (value in [-1, 1])
 */
function bipolar(value: number): BipolarScore {
  return Math.max(-1, Math.min(1, value)) as BipolarScore;
}

/**
 * Clamp a value to [0, 1]
 */
function clamp01(value: number): NormalizedValue {
  return normalized(Math.max(0, Math.min(1, value)));
}

/**
 * Clamp a value to [-1, 1] for bipolar scores
 */
function clampBipolar(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Calculate days between timestamps
 * @internal Reserved for future use in HLR/FSRS implementations
 */
function _daysBetween(from: Timestamp, to: Timestamp): number {
  return Math.max(0, (to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Create rule metadata helper
 */
function createMetadata(
  id: string,
  name: string,
  description: string,
  category: RuleCategory,
  priority: number,
  granularities: readonly MasteryGranularity[] = ["card", "concept", "skill"],
): RuleMetadata {
  return {
    id,
    name,
    description,
    category,
    version: 1,
    addedAt: nowFn(),
    isActive: true,
    priority,
    applicableGranularities: granularities,
    dependsOn: [],
    tags: ["heuristic-v0", "deterministic"],
  };
}

// =============================================================================
// MEMORY RULES (Placeholders for FSRS/HLR)
// =============================================================================

/**
 * Rule: Update stability based on review outcomes
 * PLACEHOLDER: Real FSRS/HLR will replace this
 */
export const stabilityUpdateRule: UpdateRule = {
  metadata: createMetadata(
    "memory.stability.heuristic",
    "Stability Update (Heuristic)",
    "Updates memory stability based on review outcomes. Placeholder for FSRS.",
    "memory",
    100,
  ),

  applies(context: RuleContext): boolean {
    return context.features.latestAttempt !== null;
  },

  compute(context: RuleContext): RuleOutput {
    const { previousState, features, now } = context;
    const attempt = features.latestAttempt!;
    const agg = features.aggregates;

    // Current stability (default to 1 day for new items)
    const currentStability = previousState?.memory.stability ?? 1;

    // Heuristic: stability increases with success, decreases with failure
    // Real FSRS uses more sophisticated formulas
    let newStability: number;
    if (attempt.performance.success) {
      // Success: multiply by 1.5-3.0 based on difficulty and response time
      const multiplier = 1.5 + 1.5 * agg.successRate;
      newStability = currentStability * multiplier;
    } else {
      // Failure: reset to 60% of current, minimum 0.5 days
      newStability = Math.max(0.5, currentStability * 0.6);
    }

    // Cap stability at 365 days for sanity
    newStability = Math.min(365, newStability);

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        memory: {
          stability: newStability,
          lastReview: now,
        },
      },
      confidence: confidence(0.6), // Low confidence - placeholder
      explanation: `Stability ${attempt.performance.success ? "increased" : "decreased"} from ${currentStability.toFixed(2)} to ${newStability.toFixed(2)} based on ${attempt.performance.success ? "success" : "failure"}. [HEURISTIC]`,
    };
  },
};

/**
 * Rule: Update difficulty based on performance patterns
 * PLACEHOLDER: Real FSRS/HLR will replace this
 */
export const difficultyUpdateRule: UpdateRule = {
  metadata: createMetadata(
    "memory.difficulty.heuristic",
    "Difficulty Update (Heuristic)",
    "Updates item difficulty based on performance patterns. Placeholder for FSRS.",
    "memory",
    99,
  ),

  applies(context: RuleContext): boolean {
    return context.features.aggregates.totalReviews > 0;
  },

  compute(context: RuleContext): RuleOutput {
    const { previousState, features } = context;
    const agg = features.aggregates;

    // Current difficulty (default to 0.5 for new items)
    const currentDifficulty = previousState?.memory.difficulty ?? 0.5;

    // Heuristic: difficulty tracks inverse of success rate, with smoothing
    // Real FSRS uses initial rating + adjustment
    const targetDifficulty = 1 - agg.successRate;
    const smoothingFactor = 0.3; // How fast difficulty adjusts
    const newDifficulty =
      currentDifficulty +
      smoothingFactor * (targetDifficulty - currentDifficulty);

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        memory: {
          difficulty: clamp01(newDifficulty),
        },
      },
      confidence: confidence(0.5), // Low confidence - placeholder
      explanation: `Difficulty adjusted from ${(currentDifficulty as number).toFixed(3)} to ${newDifficulty.toFixed(3)} based on success rate ${(agg.successRate as number).toFixed(2)}. [HEURISTIC]`,
    };
  },
};

/**
 * Rule: Compute retrievability (probability of recall)
 * PLACEHOLDER: Real FSRS uses exponential decay
 */
export const retrievabilityRule: UpdateRule = {
  metadata: createMetadata(
    "memory.retrievability.heuristic",
    "Retrievability Estimate (Heuristic)",
    "Estimates current probability of recall. Placeholder for FSRS.",
    "memory",
    98,
  ),

  applies(_context: RuleContext): boolean {
    return true; // Always applies
  },

  compute(context: RuleContext): RuleOutput {
    const { previousState, features, now: _now } = context;
    const agg = features.aggregates;

    // Get stability (use default if not set)
    const stability = previousState?.memory.stability ?? 1;

    // Heuristic: exponential decay based on days since last review
    // R = e^(-t/S) where t = days, S = stability
    // Real FSRS uses R = (1 + t/(9*S))^(-1)
    const daysSinceReview = agg.daysSinceLastReview;
    const retrievability = Math.exp(-daysSinceReview / stability);

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        memory: {
          retrievability: clamp01(retrievability),
        },
      },
      confidence: confidence(0.5), // Low confidence - placeholder
      explanation: `Retrievability estimated at ${(retrievability * 100).toFixed(1)}% (${daysSinceReview.toFixed(1)} days since review, stability ${stability.toFixed(1)} days). [HEURISTIC]`,
    };
  },
};

/**
 * Rule: Compute next due date
 * PLACEHOLDER: Real scheduling is separate
 */
export const dueDateRule: UpdateRule = {
  metadata: createMetadata(
    "memory.dueDate.heuristic",
    "Due Date Placeholder",
    "Sets a placeholder next due date. Real scheduling is separate.",
    "memory",
    97,
  ),

  applies(_context: RuleContext): boolean {
    return true;
  },

  compute(context: RuleContext): RuleOutput {
    const { previousState, now } = context;

    // Get stability
    const stability = previousState?.memory.stability ?? 1;

    // Heuristic: schedule when R drops to 90% (target retention)
    // t = S * ln(1/0.9) ≈ S * 0.105
    // For simplicity: next due = stability * 0.9 days
    const intervalDays = stability * 0.9;
    const nextDue = (now + intervalDays * 24 * 60 * 60 * 1000) as Timestamp;

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        memory: {
          dueDate: nextDue,
          scheduledDays: intervalDays,
        },
      },
      confidence: confidence(0.4), // Very low - placeholder
      explanation: `Due date set to ${intervalDays.toFixed(1)} days from now (stability-based). [PLACEHOLDER - real scheduling is separate]`,
    };
  },
};

/**
 * Rule: Update learning state transitions
 */
export const learningStateRule: UpdateRule = {
  metadata: createMetadata(
    "memory.learningState.heuristic",
    "Learning State Transition",
    "Determines learning state (new/learning/review/relearning).",
    "memory",
    96,
  ),

  applies(_context: RuleContext): boolean {
    return true;
  },

  compute(context: RuleContext): RuleOutput {
    const { previousState, features } = context;
    const agg = features.aggregates;
    const attempt = features.latestAttempt;

    const currentState = previousState?.memory.learningState ?? "new";
    let newState: "new" | "learning" | "review" | "relearning" = currentState;

    // State transition logic
    if (agg.totalReviews === 0) {
      newState = "new";
    } else if (currentState === "new" && attempt) {
      newState = "learning";
    } else if (
      currentState === "learning" &&
      agg.successRate >= 0.8 &&
      agg.totalReviews >= 3
    ) {
      newState = "review";
    } else if (
      currentState === "review" &&
      attempt &&
      !attempt.performance.success
    ) {
      newState = "relearning";
    } else if (currentState === "relearning" && attempt?.performance.success) {
      newState = "review";
    }

    // Update reps, lapses, streak
    const reps = previousState?.memory.reps ?? 0;
    const lapses = previousState?.memory.lapses ?? 0;
    const streak = previousState?.memory.streak ?? 0;

    let newReps = reps;
    let newLapses = lapses;
    let newStreak = streak;

    if (attempt) {
      if (attempt.performance.success) {
        newReps = reps + 1;
        newStreak = streak + 1;
      } else {
        if (currentState === "review") {
          newLapses = lapses + 1; // Only count lapses in review state
        }
        newStreak = 0;
      }
    }

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        memory: {
          learningState: newState,
          reps: newReps,
          lapses: newLapses,
          streak: newStreak,
          elapsedDays: agg.elapsedDays,
        },
      },
      confidence: confidence(0.9), // High confidence - deterministic logic
      explanation: `Learning state: ${currentState} -> ${newState}. Reps=${newReps}, Lapses=${newLapses}, Streak=${newStreak}.`,
    };
  },
};

// =============================================================================
// EVIDENCE RULES
// =============================================================================

/**
 * Rule: Update evidence aggregates from attempts
 */
export const evidenceAggregateRule: UpdateRule = {
  metadata: createMetadata(
    "evidence.aggregate.direct",
    "Evidence Aggregation",
    "Aggregates review evidence from attempts.",
    "evidence",
    90,
  ),

  applies(context: RuleContext): boolean {
    return context.features.aggregates.totalReviews > 0;
  },

  compute(context: RuleContext): RuleOutput {
    const { features, now: _now } = context;
    const agg = features.aggregates;

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        evidence: {
          totalReviews: agg.totalReviews,
          avgResponseTime: agg.avgResponseTime,
          hintUsageCount: agg.totalHints,
          hintDependencyRatio: agg.hintDependency,
          answerChangeCount: Math.round(
            agg.answerChangeRate * agg.totalReviews,
          ),
          contextCount: agg.contextCount,
          daysSinceLastReview: agg.daysSinceLastReview,
          reviewsByOutcome: agg.outcomeDistribution,
          recentAccuracy: agg.successRate,
        },
      },
      confidence: confidence(0.95), // High - direct aggregation
      explanation: `Evidence aggregated: ${agg.totalReviews} reviews, ${((agg.successRate as number) * 100).toFixed(1)}% accuracy.`,
    };
  },
};

// =============================================================================
// FORGETTING & INTERFERENCE RULES
// =============================================================================

/**
 * Rule: Compute interference index from confusions
 */
export const interferenceRule: UpdateRule = {
  metadata: createMetadata(
    "forgetting.interference.heuristic",
    "Interference Index (Heuristic)",
    "Estimates interference from frequently confused items.",
    "forgetting",
    80,
  ),

  applies(_context: RuleContext): boolean {
    return true;
  },

  compute(context: RuleContext): RuleOutput {
    const { graphContext, features, previousState: _previousState } = context;
    const agg = features.aggregates;

    // Count confusions from graph
    const confusionCount = graphContext.confusions.length;

    // Base interference on confusion count and lapse rate
    // More confusions + more lapses = higher interference
    const lapseRate = agg.totalReviews > 0 ? agg.lapses / agg.totalReviews : 0;
    const confusionFactor = Math.min(1, confusionCount / 5); // Saturate at 5 confusions
    const interferenceIndex = clamp01(0.3 * lapseRate + 0.7 * confusionFactor);

    // Context variability: number of unique contexts
    const contextVariability = clamp01(Math.min(1, agg.contextCount / 10));

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        forgetting: {
          interferenceIndex,
          contextVariability,
          confusionSet: graphContext.confusions as NodeId[],
        },
      },
      confidence: confidence(0.6), // Medium - heuristic
      explanation: `Interference index: ${(interferenceIndex as number).toFixed(3)} (${confusionCount} confusions, ${(lapseRate * 100).toFixed(1)}% lapse rate). Context variability: ${(contextVariability as number).toFixed(3)}.`,
    };
  },
};

// =============================================================================
// GENERALIZATION & COVERAGE RULES
// =============================================================================

/**
 * Rule: Compute coverage from graph structure
 */
export const coverageRule: UpdateRule = {
  metadata: createMetadata(
    "generalization.coverage.graph",
    "Coverage from Graph Structure",
    "Computes coverage based on mastery of related parts/subconcepts.",
    "generalization",
    70,
    ["concept", "skill"],
  ),

  applies(context: RuleContext): boolean {
    return (
      context.granularity !== "card" && context.graphContext.parts.length > 0
    );
  },

  compute(context: RuleContext): RuleOutput {
    const { graphContext } = context;

    // Coverage = average retrievability of parts
    if (graphContext.partMasteryLevels.length === 0) {
      return {
        ruleId: this.metadata.id,
        ruleVersion: this.metadata.version,
        updates: {
          generalization: {
            coverage: clamp01(0),
          },
        },
        confidence: confidence(0.5),
        explanation: "No part mastery data available for coverage calculation.",
      };
    }

    const avgPartMastery =
      graphContext.partMasteryLevels.reduce(
        (sum, p) => sum + (p.retrievability as number),
        0,
      ) / graphContext.partMasteryLevels.length;

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        generalization: {
          coverage: clamp01(avgPartMastery),
        },
      },
      confidence: confidence(0.7),
      explanation: `Coverage: ${(avgPartMastery * 100).toFixed(1)}% based on ${graphContext.parts.length} subconcepts.`,
    };
  },
};

/**
 * Rule: Placeholder transfer score
 */
export const transferScoreRule: UpdateRule = {
  metadata: createMetadata(
    "generalization.transfer.heuristic",
    "Transfer Score (Heuristic)",
    "Placeholder transfer score based on variant performance.",
    "generalization",
    69,
  ),

  applies(context: RuleContext): boolean {
    return context.features.aggregates.totalReviews >= 3;
  },

  compute(context: RuleContext): RuleOutput {
    const { features } = context;
    const agg = features.aggregates;

    // Heuristic: transfer score correlates with:
    // - Success rate (can apply knowledge)
    // - Context diversity (practiced in multiple settings)
    // - Low hint dependency (doesn't need scaffolding)
    const transferScore = clamp01(
      0.4 * (agg.successRate as number) +
        0.3 * Math.min(1, agg.contextCount / 5) +
        0.3 * (1 - (agg.hintDependency as number)),
    );

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        generalization: {
          transferScore,
        },
      },
      confidence: confidence(0.4), // Low - heuristic placeholder
      explanation: `Transfer score: ${(transferScore as number).toFixed(3)} (success=${(agg.successRate as number).toFixed(2)}, contexts=${agg.contextCount}, hint_dep=${(agg.hintDependency as number).toFixed(2)}). [HEURISTIC]`,
    };
  },
};

// =============================================================================
// COGNITIVE LOAD RULES
// =============================================================================

/**
 * Rule: Estimate cognitive load from behavioral signals
 */
export const cognitiveLoadRule: UpdateRule = {
  metadata: createMetadata(
    "cognitive_load.estimate.heuristic",
    "Cognitive Load Estimation (Heuristic)",
    "Estimates intrinsic, extraneous, and germane load from behavior.",
    "cognitive_load",
    60,
  ),

  applies(context: RuleContext): boolean {
    return (
      context.features.latestAttempt !== null ||
      context.features.latestSession !== null
    );
  },

  compute(context: RuleContext): RuleOutput {
    const { features, previousState } = context;
    const agg = features.aggregates;
    const _session = features.latestSession;

    // Intrinsic load: based on item difficulty and prerequisite complexity
    const intrinsicLoad = previousState?.memory.difficulty ?? clamp01(0.5);

    // Extraneous load: from hints, edits, response time variance
    const extraneousLoad = clamp01(
      0.3 * (agg.hintDependency as number) +
        0.3 * (agg.answerChangeRate as number) +
        0.4 * Math.min(1, agg.responseTimeVariance / 10000), // Normalize variance
    );

    // Germane load: productive effort = success despite difficulty
    // High when: high difficulty + high success + low hints
    const difficulty = (previousState?.memory.difficulty as number) ?? 0.5;
    const germaneLoad = clamp01(
      difficulty *
        (agg.successRate as number) *
        (1 - (agg.hintDependency as number)),
    );

    // Total load (can exceed 1)
    const totalLoad = clamp01(
      0.4 * (intrinsicLoad as number) +
        0.3 * (extraneousLoad as number) +
        0.3 * (germaneLoad as number),
    );

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        cognitiveLoad: {
          intrinsicLoad,
          extraneousLoad,
          germaneLoad,
          totalLoad,
        },
      },
      confidence: confidence(0.5), // Medium-low - heuristic
      explanation: `Cognitive load: intrinsic=${(intrinsicLoad as number).toFixed(2)}, extraneous=${(extraneousLoad as number).toFixed(2)}, germane=${(germaneLoad as number).toFixed(2)}, total=${(totalLoad as number).toFixed(2)}. [HEURISTIC]`,
    };
  },
};

// =============================================================================
// AFFECT RULES
// =============================================================================

/**
 * Rule: Infer affect from behavioral signals
 */
export const affectInferenceRule: UpdateRule = {
  metadata: createMetadata(
    "affect.inference.heuristic",
    "Affect Inference (Heuristic)",
    "Infers frustration, flow, and boredom from behavior.",
    "affect",
    50,
  ),

  applies(context: RuleContext): boolean {
    return (
      context.features.latestAttempt !== null ||
      context.features.latestSession !== null
    );
  },

  compute(context: RuleContext): RuleOutput {
    const { features, now } = context;
    const agg = features.aggregates;
    // Session data reserved for future use
    const _session = features.latestSession;

    // Frustration indicators:
    // - High response time variance
    // - Low success rate
    // - High hint dependency
    // - Answer changes
    const frustrationInferred = clamp01(
      0.3 * (1 - (agg.successRate as number)) +
        0.3 * (agg.hintDependency as number) +
        0.2 * (agg.answerChangeRate as number) +
        0.2 * Math.min(1, agg.responseTimeVariance / 10000),
    );

    // Flow indicators:
    // - Good success rate (not too easy, not too hard)
    // - Consistent response times
    // - Low hint dependency
    // - Steady pacing
    const successRate = agg.successRate as number;
    const optimalSuccess = Math.abs(successRate - 0.85); // Optimal around 85%
    const flowInferred = clamp01(
      0.4 * (1 - optimalSuccess * 2) +
        0.3 * (1 - (agg.hintDependency as number)) +
        0.3 * (1 - Math.min(1, agg.responseTimeVariance / 5000)),
    );

    // Boredom indicators:
    // - Very high success rate (too easy)
    // - Very fast response times
    // - Low engagement time
    const boredomInferred = clamp01(
      successRate > 0.95 ? 0.5 + (0.5 * (successRate - 0.95)) / 0.05 : 0,
    );

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        affect: {
          frustration: {
            inferred: frustrationInferred,
            combined: frustrationInferred,
            confidence: confidence(0.5),
            lastUpdated: now,
          },
          flow: {
            inferred: flowInferred,
            combined: flowInferred,
            confidence: confidence(0.5),
            lastUpdated: now,
          },
          boredom: {
            inferred: boredomInferred,
            combined: boredomInferred,
            confidence: confidence(0.4),
            lastUpdated: now,
          },
        },
      },
      confidence: confidence(0.4), // Low - inferred from behavior
      explanation: `Affect inferred: frustration=${(frustrationInferred as number).toFixed(2)}, flow=${(flowInferred as number).toFixed(2)}, boredom=${(boredomInferred as number).toFixed(2)}. [HEURISTIC]`,
    };
  },
};

// =============================================================================
// TRUST RULES
// =============================================================================

/**
 * Rule: Compute data quality and trust metrics
 */
export const trustMetricsRule: UpdateRule = {
  metadata: createMetadata(
    "trust.metrics.compute",
    "Trust Metrics Computation",
    "Computes data quality score and evidence sufficiency.",
    "trust",
    40,
  ),

  applies(_context: RuleContext): boolean {
    return true;
  },

  compute(context: RuleContext): RuleOutput {
    const { features, now: _now, previousState: _previousState } = context;
    const agg = features.aggregates;

    // Data quality: based on evidence amount and recency
    const evidenceScore = Math.min(1, agg.totalReviews / 10); // Saturate at 10 reviews
    const recencyScore =
      agg.daysSinceLastReview < 30
        ? 1
        : Math.max(0, 1 - (agg.daysSinceLastReview - 30) / 60);
    const dataQualityScore = clamp01(0.6 * evidenceScore + 0.4 * recencyScore);

    // Evidence sufficiency: need at least 5 reviews for confidence
    const evidenceSufficiency = clamp01(agg.totalReviews / 5);

    // Reviews until confident
    const reviewsUntilConfident = Math.max(0, 5 - agg.totalReviews);

    // Stale if not reviewed in 60+ days
    const isStale = agg.daysSinceLastReview > 60;

    // Evidence recency
    const evidenceRecency = clamp01(
      Math.max(0, 1 - agg.daysSinceLastReview / 30),
    );

    // Model disagreement placeholder (will be computed when ML is added)
    const modelDisagreement = clamp01(0);

    // Prediction confidence based on evidence
    const predictionConfidence = confidence(
      Math.min(0.9, 0.4 + 0.5 * (evidenceSufficiency as number)),
    );

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        trust: {
          dataQualityScore,
          evidenceSufficiency,
          evidenceRecency,
          modelDisagreement,
          predictionConfidence,
          isStale,
          reviewsUntilConfident,
        },
      },
      confidence: confidence(0.8),
      explanation: `Trust metrics: quality=${(dataQualityScore as number).toFixed(2)}, sufficiency=${(evidenceSufficiency as number).toFixed(2)}, stale=${isStale}.`,
    };
  },
};

// =============================================================================
// METACOGNITION RULES (Placeholders)
// =============================================================================

/**
 * Rule: Placeholder calibration metrics
 */
export const calibrationPlaceholderRule: UpdateRule = {
  metadata: createMetadata(
    "metacognition.calibration.placeholder",
    "Calibration Placeholder",
    "Placeholder for calibration metrics. Requires confidence judgments.",
    "metacognition",
    30,
  ),

  applies(context: RuleContext): boolean {
    // Only apply if we have confidence data from attempts
    return context.features.recentAttempts.some(
      (a) => a.metacognition.preConfidence !== undefined,
    );
  },

  compute(context: RuleContext): RuleOutput {
    const { features, now: _now } = context;

    // Calculate calibration from attempts with confidence
    const attemptsWithConf = features.recentAttempts.filter(
      (a) => a.metacognition.preConfidence !== undefined,
    );

    if (attemptsWithConf.length === 0) {
      return {
        ruleId: this.metadata.id,
        ruleVersion: this.metadata.version,
        updates: {},
        confidence: confidence(0.3),
        explanation: "No confidence data available for calibration.",
        skipped: { reason: "No confidence judgments in recent attempts" },
      };
    }

    // Simple calibration: compare confidence to outcome
    let sumSquaredError = 0;
    let biasSum = 0;
    for (const a of attemptsWithConf) {
      const conf = a.metacognition.preConfidence as number;
      const outcome = a.performance.success ? 1 : 0;
      sumSquaredError += (conf - outcome) ** 2;
      biasSum += conf - outcome; // Positive = overconfident
    }

    const brierScore = clamp01(sumSquaredError / attemptsWithConf.length);
    const bias = clampBipolar(biasSum / attemptsWithConf.length);

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        metacognition: {
          calibration: {
            brierScore,
            bias: bipolar(bias),
            ece: brierScore, // Simplified - ECE ≈ Brier for this placeholder
            resolution: clamp01(1 - (brierScore as number)),
            metacognitiveSensitivity: clamp01(1 - Math.abs(bias)),
            dunningKrugerIndicator: clamp01(Math.max(0, bias)),
            confidenceAccuracyCorrelation: bipolar(
              1 - 2 * (brierScore as number),
            ),
          },
        },
      },
      confidence: confidence(0.5),
      explanation: `Calibration: Brier=${(brierScore as number).toFixed(3)}, bias=${bias.toFixed(3)} (${attemptsWithConf.length} samples). [PLACEHOLDER]`,
    };
  },
};

/**
 * Rule: Strategy metrics placeholder
 */
export const strategyMetricsRule: UpdateRule = {
  metadata: createMetadata(
    "metacognition.strategy.placeholder",
    "Strategy Metrics Placeholder",
    "Placeholder for strategy usage and effectiveness metrics.",
    "metacognition",
    29,
  ),

  applies(context: RuleContext): boolean {
    return context.graphContext.strategies.length > 0;
  },

  compute(context: RuleContext): RuleOutput {
    const { graphContext } = context;

    // Strategy diversity = count of linked strategies
    const strategyDiversity = clamp01(
      Math.min(1, graphContext.strategies.length / 5),
    );

    return {
      ruleId: this.metadata.id,
      ruleVersion: this.metadata.version,
      updates: {
        metacognition: {
          strategyUsage: {
            strategyDiversity,
            strategyAdherence: clamp01(0.5), // Placeholder
            strategyEfficacyUplift: bipolar(0), // Placeholder - neutral
            topStrategies: graphContext.strategies.slice(0, 3) as NodeId[],
            selectionAppropriatenessScore: clamp01(0.5), // Placeholder
          },
        },
      },
      confidence: confidence(0.3),
      explanation: `Strategy metrics: diversity=${(strategyDiversity as number).toFixed(2)}, ${graphContext.strategies.length} strategies linked. [PLACEHOLDER]`,
    };
  },
};

// =============================================================================
// RULE COLLECTION
// =============================================================================

/**
 * All default heuristic rules
 */
export const DEFAULT_HEURISTIC_RULES: readonly UpdateRule[] = [
  // Memory rules (highest priority - core to mastery)
  stabilityUpdateRule,
  difficultyUpdateRule,
  retrievabilityRule,
  dueDateRule,
  learningStateRule,

  // Evidence rules
  evidenceAggregateRule,

  // Forgetting rules
  interferenceRule,

  // Generalization rules
  coverageRule,
  transferScoreRule,

  // Cognitive load rules
  cognitiveLoadRule,

  // Affect rules
  affectInferenceRule,

  // Trust rules
  trustMetricsRule,

  // Metacognition rules (lowest priority - depend on others)
  calibrationPlaceholderRule,
  strategyMetricsRule,
];

/**
 * Create a registry pre-populated with default rules
 */
export function createDefaultRuleRegistry(): RuleRegistry {
  return createRuleRegistry(DEFAULT_HEURISTIC_RULES);
}
