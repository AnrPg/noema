// =============================================================================
// LKGC METRICS - Meta-Learning Metrics for Control
// =============================================================================
// Comprehensive metrics organized by concern:
// - Calibration & judgment
// - Learning efficiency & retention
// - Strategy use & effectiveness
// - Self-regulation & motivation
// - Transfer & understanding
//
// These metrics are queryable state and usable by decision policies.
// =============================================================================

import type {
  LKGCEntity,
  EntityId,
  NodeId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
  BipolarScore,
} from "./foundation";

// =============================================================================
// METRICS COLLECTION - Container for all metrics
// =============================================================================

/**
 * Complete metrics collection for a user
 */
export interface MetricsCollection extends LKGCEntity {
  /** User this collection belongs to */
  readonly userId?: EntityId;

  /** When metrics were last computed */
  readonly computedAt: Timestamp;

  /** Computation period */
  readonly period: MetricsPeriod;

  /** All metric categories */
  readonly calibration: CalibrationMetrics;
  readonly efficiency: EfficiencyMetrics;
  readonly strategy: StrategyMetrics;
  readonly selfRegulation: SelfRegulationMetrics;
  readonly transfer: TransferMetrics;

  /** Metric health indicators */
  readonly health: MetricsHealth;
}

export interface MetricsPeriod {
  readonly start: Timestamp;
  readonly end: Timestamp;
  readonly windowDays: number;
  readonly dataPoints: number;
  readonly completeness: NormalizedValue;
}

export interface MetricsHealth {
  /** Overall data quality */
  readonly dataQuality: NormalizedValue;

  /** Are metrics reliable? */
  readonly reliable: boolean;

  /** Staleness warning */
  readonly stale: boolean;

  /** Missing data warnings */
  readonly warnings: readonly MetricWarning[];
}

export interface MetricWarning {
  readonly metric: string;
  readonly issue: "insufficient_data" | "stale" | "outliers" | "inconsistent";
  readonly severity: "low" | "medium" | "high";
  readonly message: string;
}

// =============================================================================
// 1. CALIBRATION & JUDGMENT METRICS
// =============================================================================

/**
 * Calibration metrics - accuracy of self-assessment
 */
export interface CalibrationMetrics {
  // ---- Core calibration ----

  /**
   * Brier Score: Mean squared error of probabilistic predictions
   * Range: [0, 1], lower is better
   * Formula: (1/N) * Σ(predicted - actual)²
   */
  readonly brierScore: BrierScoreMetric;

  /**
   * Expected Calibration Error: Average gap between confidence and accuracy
   * Range: [0, 1], lower is better
   */
  readonly ece: ECEMetric;

  /**
   * Calibration Bias: Systematic over/underconfidence
   * Range: [-1, 1], 0 is perfect, positive = overconfident
   */
  readonly bias: CalibrationBiasMetric;

  /**
   * Resolution: Ability to distinguish between items
   * Range: [0, 1], higher is better
   */
  readonly resolution: ResolutionMetric;

  // ---- Advanced calibration ----

  /**
   * Metacognitive Sensitivity: Can distinguish knowing from not knowing
   * Range: [0, 1], higher is better
   */
  readonly metacognitiveSensitivity: MetacognitiveSensitivityMetric;

  /**
   * Dunning-Kruger Indicator: Overestimates ability on low-mastery items
   * Range: [0, 1], lower is better (less D-K effect)
   */
  readonly dunningKrugerIndicator: DunningKrugerMetric;

  /**
   * Confidence-Accuracy Correlation
   * Range: [-1, 1], higher is better
   */
  readonly confidenceAccuracyCorrelation: CorrelationMetric;

  /**
   * Calibration by difficulty level
   */
  readonly calibrationByDifficulty: CalibrationByDifficulty;
}

// Detailed metric types for calibration
export interface BrierScoreMetric {
  readonly value: NormalizedValue;
  readonly sampleSize: number;
  readonly trend: BipolarScore;
  readonly percentile: NormalizedValue;
  readonly breakdown: {
    readonly preAnswer: NormalizedValue;
    readonly postAnswer: NormalizedValue;
  };
}

export interface ECEMetric {
  readonly value: NormalizedValue;
  readonly bins: readonly CalibrationBin[];
  readonly trend: BipolarScore;
}

export interface CalibrationBin {
  readonly confidenceRange: { min: number; max: number };
  readonly avgConfidence: NormalizedValue;
  readonly avgAccuracy: NormalizedValue;
  readonly count: number;
  readonly gap: number;
}

export interface CalibrationBiasMetric {
  readonly value: BipolarScore;
  readonly direction: "overconfident" | "underconfident" | "calibrated";
  readonly magnitude: NormalizedValue;
  readonly trend: BipolarScore;
}

export interface ResolutionMetric {
  readonly value: NormalizedValue;
  readonly reliability: Confidence;
  readonly trend: BipolarScore;
}

export interface MetacognitiveSensitivityMetric {
  readonly value: NormalizedValue;
  readonly gamma: number; // Goodman-Kruskal gamma
  readonly dPrime: number; // Signal detection d'
  readonly trend: BipolarScore;
}

export interface DunningKrugerMetric {
  readonly value: NormalizedValue;
  readonly lowMasteryOverestimate: number;
  readonly highMasteryUnderestimate: number;
  readonly crossoverPoint: NormalizedValue;
}

export interface CorrelationMetric {
  readonly value: BipolarScore;
  readonly pValue: NormalizedValue;
  readonly sampleSize: number;
}

export interface CalibrationByDifficulty {
  readonly easy: NormalizedValue;
  readonly medium: NormalizedValue;
  readonly hard: NormalizedValue;
  readonly veryHard: NormalizedValue;
}

// =============================================================================
// 2. LEARNING EFFICIENCY & RETENTION METRICS
// =============================================================================

/**
 * Efficiency and retention metrics
 */
export interface EfficiencyMetrics {
  // ---- Stability & retention ----

  /**
   * Stability Trend: How stability is changing over time
   * Range: [-1, 1], positive = improving
   */
  readonly stabilityTrend: StabilityTrendMetric;

  /**
   * Forgetting Curve Fit Error: How well FSRS/HLR predicts
   * Range: [0, 1], lower is better
   */
  readonly forgettingCurveFitError: ForgettingCurveFitMetric;

  /**
   * Time to Mastery: Average days/reviews to reach mastery
   */
  readonly timeToMastery: TimeToMasteryMetric;

  /**
   * Hint Dependency Ratio: Reliance on hints
   * Range: [0, 1], lower is better (more independent)
   */
  readonly hintDependencyRatio: HintDependencyMetric;

  // ---- Efficiency ----

  /**
   * Spacing Quality Index: How well spaced are reviews
   * Range: [0, 1], higher is better
   */
  readonly spacingQualityIndex: SpacingQualityMetric;

  /**
   * Interference Index: Confusion between similar items
   * Range: [0, 1], lower is better
   */
  readonly interferenceIndex: InterferenceMetric;

  /**
   * Review Efficiency: Learning per unit time
   */
  readonly reviewEfficiency: ReviewEfficiencyMetric;

  /**
   * Retention Rate: Long-term retention
   * Range: [0, 1], higher is better
   */
  readonly retentionRate: RetentionRateMetric;

  /**
   * Lapse Rate: How often learned items are forgotten
   * Range: [0, 1], lower is better
   */
  readonly lapseRate: LapseRateMetric;
}

// Detailed metric types for efficiency
export interface StabilityTrendMetric {
  readonly value: BipolarScore;
  readonly avgStability: number;
  readonly stabilityGrowthRate: number;
  readonly byMasteryLevel: Readonly<Record<string, number>>;
}

export interface ForgettingCurveFitMetric {
  readonly value: NormalizedValue;
  readonly rmse: number;
  readonly modelUsed: "fsrs" | "hlr" | "sm2" | "custom";
  readonly byInterval: readonly IntervalFitError[];
}

export interface IntervalFitError {
  readonly intervalDays: number;
  readonly predictedRetention: NormalizedValue;
  readonly actualRetention: NormalizedValue;
  readonly error: number;
  readonly sampleSize: number;
}

export interface TimeToMasteryMetric {
  readonly avgDays: number;
  readonly avgReviews: number;
  readonly medianDays: number;
  readonly medianReviews: number;
  readonly percentile90Days: number;
  readonly byDifficulty: Readonly<Record<string, number>>;
}

export interface HintDependencyMetric {
  readonly value: NormalizedValue;
  readonly hintUsageRate: NormalizedValue;
  readonly avgHintsPerReview: number;
  readonly successWithoutHints: NormalizedValue;
  readonly trend: BipolarScore;
}

export interface SpacingQualityMetric {
  readonly value: NormalizedValue;
  readonly avgIntervalRatio: number; // actual / optimal
  readonly prematureReviews: NormalizedValue;
  readonly overdueReviews: NormalizedValue;
  readonly optimalSpacingAdherence: NormalizedValue;
}

export interface InterferenceMetric {
  readonly value: NormalizedValue;
  readonly confusionPairs: readonly ConfusionPair[];
  readonly proactiveInterference: NormalizedValue;
  readonly retroactiveInterference: NormalizedValue;
}

export interface ConfusionPair {
  readonly nodeA: NodeId;
  readonly nodeB: NodeId;
  readonly confusionRate: NormalizedValue;
  readonly direction: "bidirectional" | "a_to_b" | "b_to_a";
}

export interface ReviewEfficiencyMetric {
  readonly cardsPerHour: number;
  readonly effectiveCardsPerHour: number; // Adjusted for retention
  readonly timePerCorrectAnswer: Duration;
  readonly trend: BipolarScore;
}

export interface RetentionRateMetric {
  readonly shortTerm: NormalizedValue; // < 7 days
  readonly mediumTerm: NormalizedValue; // 7-30 days
  readonly longTerm: NormalizedValue; // > 30 days
  readonly overall: NormalizedValue;
  readonly byTopic: Readonly<Record<string, NormalizedValue>>;
}

export interface LapseRateMetric {
  readonly value: NormalizedValue;
  readonly lapsesPerHundredReviews: number;
  readonly avgReviewsBeforeLapse: number;
  readonly recoveryRate: NormalizedValue;
}

// =============================================================================
// 3. STRATEGY USE & EFFECTIVENESS METRICS
// =============================================================================

/**
 * Strategy metrics
 */
export interface StrategyMetrics {
  /**
   * Strategy Diversity: Variety of strategies used
   * Range: [0, 1], higher = more diverse
   */
  readonly strategyDiversity: StrategyDiversityMetric;

  /**
   * Strategy Adherence: Following planned strategies
   * Range: [0, 1], higher is better
   */
  readonly strategyAdherence: StrategyAdherenceMetric;

  /**
   * Strategy Efficacy Uplift: Performance boost from strategies
   * Range: [-1, 1], positive = strategies help
   */
  readonly strategyEfficacyUplift: StrategyEfficacyMetric;

  /**
   * Reflection Completion Rate: How often reflections are done
   * Range: [0, 1], higher is better
   */
  readonly reflectionCompletionRate: ReflectionCompletionMetric;

  /**
   * Reflection Quality: Average quality of reflections
   * Range: [0, 1], higher is better
   */
  readonly reflectionQuality: ReflectionQualityMetric;

  /**
   * Plan Follow-Through Score: Acting on reflection insights
   * Range: [0, 1], higher is better
   */
  readonly planFollowThroughScore: PlanFollowThroughMetric;

  /**
   * Strategy selection appropriateness
   */
  readonly selectionAppropriatenessScore: StrategySelectionMetric;
}

// Detailed metric types for strategy
export interface StrategyDiversityMetric {
  readonly value: NormalizedValue;
  readonly uniqueStrategiesUsed: number;
  readonly entropyScore: number;
  readonly dominantStrategy?: NodeId;
  readonly dominanceRatio: NormalizedValue;
}

export interface StrategyAdherenceMetric {
  readonly value: NormalizedValue;
  readonly plannedStrategies: number;
  readonly executedStrategies: number;
  readonly deviationReasons: readonly string[];
}

export interface StrategyEfficacyMetric {
  readonly value: BipolarScore;
  readonly byStrategy: readonly StrategyEffectiveness[];
  readonly bestStrategy?: NodeId;
  readonly worstStrategy?: NodeId;
}

export interface StrategyEffectiveness {
  readonly strategyId: NodeId;
  readonly strategyName: string;
  readonly usageCount: number;
  readonly avgAccuracyWith: NormalizedValue;
  readonly avgAccuracyWithout: NormalizedValue;
  readonly uplift: BipolarScore;
  readonly confidence: Confidence;
}

export interface ReflectionCompletionMetric {
  readonly value: NormalizedValue;
  readonly totalOpportunities: number;
  readonly completed: number;
  readonly skipped: number;
  readonly trend: BipolarScore;
}

export interface ReflectionQualityMetric {
  readonly value: NormalizedValue;
  readonly avgDepth: NormalizedValue;
  readonly avgActionability: NormalizedValue;
  readonly avgSpecificity: NormalizedValue;
  readonly improvementOverTime: BipolarScore;
}

export interface PlanFollowThroughMetric {
  readonly value: NormalizedValue;
  readonly plansCreated: number;
  readonly plansCompleted: number;
  readonly plansAbandoned: number;
  readonly avgCompletionRate: NormalizedValue;
}

export interface StrategySelectionMetric {
  readonly value: NormalizedValue;
  readonly matchedRecommendations: number;
  readonly totalSelections: number;
  readonly appropriatenessRate: NormalizedValue;
}

// =============================================================================
// 4. SELF-REGULATION & MOTIVATION METRICS
// =============================================================================

/**
 * Self-regulation and motivation metrics
 */
export interface SelfRegulationMetrics {
  /**
   * Session Consistency: Regular study patterns
   * Range: [0, 1], higher is better
   */
  readonly sessionConsistency: SessionConsistencyMetric;

  /**
   * Fatigue Index: Detected fatigue levels
   * Range: [0, 1], lower is better
   */
  readonly fatigueIndex: FatigueIndexMetric;

  /**
   * Flow Proxy: Engagement without frustration
   * Range: [0, 1], higher is better
   */
  readonly flowProxy: FlowProxyMetric;

  /**
   * Friction Score: Difficulty getting started
   * Range: [0, 1], lower is better
   */
  readonly frictionScore: FrictionScoreMetric;

  /**
   * Streak Health: Sustainability of streak
   * Range: [0, 1], higher is better
   */
  readonly streakHealth: StreakHealthMetric;

  /**
   * Goal Alignment Score: Studying what matters
   * Range: [0, 1], higher is better
   */
  readonly goalAlignmentScore: GoalAlignmentMetric;

  /**
   * Procrastination Index: Tendency to delay
   * Range: [0, 1], lower is better
   */
  readonly procrastinationIndex: ProcrastinationMetric;

  /**
   * Self-efficacy Score: Belief in ability
   * Range: [0, 1], higher is better
   */
  readonly selfEfficacyScore: SelfEfficacyMetric;
}

// Detailed metric types for self-regulation
export interface SessionConsistencyMetric {
  readonly value: NormalizedValue;
  readonly avgSessionsPerWeek: number;
  readonly sessionTimeVariance: number;
  readonly preferredTimeSlot: string;
  readonly consistencyStreak: number;
}

export interface FatigueIndexMetric {
  readonly value: NormalizedValue;
  readonly avgFatiguePoint: number; // Cards until fatigue
  readonly performanceDecline: NormalizedValue;
  readonly recoveryPattern: "quick" | "slow" | "incomplete";
  readonly fatigueIndicators: readonly string[];
}

export interface FlowProxyMetric {
  readonly value: NormalizedValue;
  readonly engagementScore: NormalizedValue;
  readonly challengeSkillBalance: BipolarScore;
  readonly flowStateFrequency: NormalizedValue;
  readonly avgFlowDuration: Duration;
}

export interface FrictionScoreMetric {
  readonly value: NormalizedValue;
  readonly avgTimeToStart: Duration;
  readonly abandonBeforeStart: NormalizedValue;
  readonly warmupCardsNeeded: number;
  readonly frictionSources: readonly string[];
}

export interface StreakHealthMetric {
  readonly value: NormalizedValue;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly avgStreakLength: number;
  readonly closeCalls: number; // Near misses
  readonly freezesUsed: number;
  readonly sustainabilityScore: NormalizedValue;
}

export interface GoalAlignmentMetric {
  readonly value: NormalizedValue;
  readonly goalsCovered: NormalizedValue;
  readonly timeOnGoalMaterial: NormalizedValue;
  readonly distractionRate: NormalizedValue;
  readonly priorityAdherence: NormalizedValue;
}

export interface ProcrastinationMetric {
  readonly value: NormalizedValue;
  readonly avgOverdueDays: number;
  readonly overdueRate: NormalizedValue;
  readonly lastMinuteRate: NormalizedValue;
  readonly deadlineBehavior: "early" | "on_time" | "late" | "very_late";
}

export interface SelfEfficacyMetric {
  readonly value: NormalizedValue;
  readonly confidenceInAbility: NormalizedValue;
  readonly pastSuccessRate: NormalizedValue;
  readonly attributionPattern: "internal" | "external" | "mixed";
  readonly resilience: NormalizedValue;
}

// =============================================================================
// 5. TRANSFER & UNDERSTANDING METRICS
// =============================================================================

/**
 * Transfer and understanding metrics
 */
export interface TransferMetrics {
  /**
   * Generalization Score: Apply in new contexts
   * Range: [0, 1], higher is better
   */
  readonly generalizationScore: GeneralizationScoreMetric;

  /**
   * Concept Coverage: Proportion of concepts mastered
   * Range: [0, 1], higher is better
   */
  readonly conceptCoverage: ConceptCoverageMetric;

  /**
   * Error Pattern Recurrence: Repeating same mistakes
   * Range: [0, 1], lower is better
   */
  readonly errorPatternRecurrence: ErrorPatternMetric;

  /**
   * Explanation Quality: Can explain concepts
   * Range: [0, 1], higher is better
   */
  readonly explanationQuality: ExplanationQualityMetric;

  /**
   * Cross-Context Robustness: Consistency across contexts
   * Range: [0, 1], higher is better
   */
  readonly crossContextRobustness: CrossContextMetric;

  /**
   * Analogical Reasoning: Can draw analogies
   * Range: [0, 1], higher is better
   */
  readonly analogicalReasoning: AnalogicalReasoningMetric;

  /**
   * Integration Score: Connecting new with existing knowledge
   * Range: [0, 1], higher is better
   */
  readonly integrationScore: IntegrationScoreMetric;
}

// Detailed metric types for transfer
export interface GeneralizationScoreMetric {
  readonly value: NormalizedValue;
  readonly nearTransfer: NormalizedValue;
  readonly farTransfer: NormalizedValue;
  readonly novelProblemSuccess: NormalizedValue;
  readonly transferExamples: number;
}

export interface ConceptCoverageMetric {
  readonly value: NormalizedValue;
  readonly totalConcepts: number;
  readonly masteredConcepts: number;
  readonly inProgressConcepts: number;
  readonly notStartedConcepts: number;
  readonly coverageByDomain: Readonly<Record<string, NormalizedValue>>;
}

export interface ErrorPatternMetric {
  readonly value: NormalizedValue;
  readonly uniquePatterns: number;
  readonly resolvedPatterns: number;
  readonly persistentPatterns: number;
  readonly avgResolutionTime: Duration;
  readonly topRecurringErrors: readonly NodeId[];
}

export interface ExplanationQualityMetric {
  readonly value: NormalizedValue;
  readonly avgClarity: NormalizedValue;
  readonly avgCompleteness: NormalizedValue;
  readonly avgAccuracy: NormalizedValue;
  readonly explanationCount: number;
}

export interface CrossContextMetric {
  readonly value: NormalizedValue;
  readonly contextsTested: number;
  readonly consistencyScore: NormalizedValue;
  readonly problematicContexts: readonly string[];
}

export interface AnalogicalReasoningMetric {
  readonly value: NormalizedValue;
  readonly analogiesGenerated: number;
  readonly analogyQuality: NormalizedValue;
  readonly crossDomainAnalogies: number;
}

export interface IntegrationScoreMetric {
  readonly value: NormalizedValue;
  readonly linksCreated: number;
  readonly integrationDepth: NormalizedValue;
  readonly isolatedConcepts: number;
}

// =============================================================================
// METRICS QUERY INTERFACE
// =============================================================================

/**
 * Query parameters for metrics
 */
export interface MetricsQuery {
  readonly period?: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };
  readonly categories?: readonly MetricCategory[];
  readonly granularity?: "detailed" | "summary";
  readonly includeHistory?: boolean;
  readonly includeComparisons?: boolean;
}

export type MetricCategory =
  | "calibration"
  | "efficiency"
  | "strategy"
  | "selfRegulation"
  | "transfer";

/**
 * Metrics comparison result
 */
export interface MetricsComparison {
  readonly currentPeriod: MetricsCollection;
  readonly previousPeriod?: MetricsCollection;
  readonly changes: MetricsChanges;
  readonly insights: readonly string[];
}

export interface MetricsChanges {
  readonly improved: readonly MetricChange[];
  readonly declined: readonly MetricChange[];
  readonly stable: readonly MetricChange[];
}

export interface MetricChange {
  readonly metricName: string;
  readonly previousValue: number;
  readonly currentValue: number;
  readonly changePercent: number;
  readonly significance: "significant" | "marginal" | "none";
}

// =============================================================================
// METRICS THRESHOLDS - For decision policies
// =============================================================================

/**
 * Metric thresholds for triggering actions
 */
export interface MetricThresholds {
  readonly calibration: {
    readonly brierScoreWarning: number;
    readonly biasInterventionThreshold: number;
  };
  readonly efficiency: {
    readonly minRetentionRate: number;
    readonly maxLapseRate: number;
    readonly hintDependencyWarning: number;
  };
  readonly strategy: {
    readonly minReflectionCompletion: number;
    readonly minPlanFollowThrough: number;
  };
  readonly selfRegulation: {
    readonly maxFatigueIndex: number;
    readonly minConsistency: number;
    readonly streakAtRisk: number;
  };
  readonly transfer: {
    readonly minGeneralization: number;
    readonly errorRecurrenceWarning: number;
  };
}

/**
 * Default thresholds
 */
export const DEFAULT_METRIC_THRESHOLDS: MetricThresholds = {
  calibration: {
    brierScoreWarning: 0.25,
    biasInterventionThreshold: 0.15,
  },
  efficiency: {
    minRetentionRate: 0.85,
    maxLapseRate: 0.1,
    hintDependencyWarning: 0.3,
  },
  strategy: {
    minReflectionCompletion: 0.5,
    minPlanFollowThrough: 0.6,
  },
  selfRegulation: {
    maxFatigueIndex: 0.7,
    minConsistency: 0.6,
    streakAtRisk: 0.4,
  },
  transfer: {
    minGeneralization: 0.5,
    errorRecurrenceWarning: 0.3,
  },
} as const;
