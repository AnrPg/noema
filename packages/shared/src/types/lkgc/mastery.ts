// =============================================================================
// LKGC MASTERY STATE - Multi-dimensional Learning State
// =============================================================================
// MasteryState goes beyond simple memory metrics to capture:
// - Memory parameters (stability, difficulty, retrievability)
// - Evidence aggregates (from reviews and interactions)
// - Metacognitive skill metrics
// - Forgetting & interference
// - Generalization & transfer
// - Cognitive load
// - Affect & motivation
// - Trust & reliability
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
// MASTERY GRANULARITY
// =============================================================================

/**
 * Granularity level for mastery state
 */
export type MasteryGranularity =
  | "card" // Individual flashcard
  | "concept" // Abstract concept
  | "skill" // Procedural skill
  | "topic" // Topic/subject area
  | "domain"; // Entire domain

// =============================================================================
// CORE MASTERY STATE
// =============================================================================

/**
 * Complete mastery state for a learning object
 */
export interface MasteryState extends LKGCEntity {
  /** The node this mastery state is for */
  readonly nodeId: NodeId;

  /** Granularity level */
  readonly granularity: MasteryGranularity;

  /** Memory parameters (FSRS/HLR) */
  readonly memory: MemoryState;

  /** Evidence aggregates */
  readonly evidence: EvidenceAggregate;

  /** Metacognitive skill metrics */
  readonly metacognition: MetacognitionState;

  /** Forgetting & interference */
  readonly forgetting: ForgettingState;

  /** Generalization & transfer */
  readonly generalization: GeneralizationState;

  /** Cognitive load */
  readonly cognitiveLoad: CognitiveLoadState;

  /** Affect & motivation */
  readonly affect: AffectState;

  /** Trust & reliability */
  readonly trust: TrustState;

  /** Last computed timestamp */
  readonly computedAt: Timestamp;

  /** State version (for delta computation) */
  readonly stateVersion: number;
}

// =============================================================================
// MEMORY STATE - FSRS/HLR Parameters
// =============================================================================

/**
 * Core memory parameters
 */
export interface MemoryState {
  /** FSRS stability (days until R drops to 90%) */
  readonly stability: number;

  /** FSRS difficulty [0, 1] */
  readonly difficulty: NormalizedValue;

  /** Current retrievability estimate [0, 1] */
  readonly retrievability: NormalizedValue;

  /** Half-life in days (HLR parameter) */
  readonly halfLife: number;

  /** Learning state */
  readonly learningState: "new" | "learning" | "review" | "relearning";

  /** Total successful repetitions */
  readonly reps: number;

  /** Total lapses (forgotten after learned) */
  readonly lapses: number;

  /** Consecutive successful reviews */
  readonly streak: number;

  /** Days since first introduction */
  readonly elapsedDays: number;

  /** Current scheduled interval */
  readonly scheduledDays: number;

  /** Next scheduled review */
  readonly dueDate: Timestamp;

  /** Last review timestamp */
  readonly lastReview?: Timestamp;

  /** Optimal retention target (personalized) */
  readonly targetRetention: NormalizedValue;
}

// =============================================================================
// EVIDENCE AGGREGATE - Summary of learning interactions
// =============================================================================

/**
 * Aggregated evidence from learning interactions
 */
export interface EvidenceAggregate {
  /** Total review count */
  readonly totalReviews: number;

  /** Reviews by outcome */
  readonly reviewsByOutcome: ReviewOutcomeCounts;

  /** Average response time (ms) */
  readonly avgResponseTime: Duration;

  /** Response time trend (positive = getting faster) */
  readonly responseTimeTrend: BipolarScore;

  /** Accuracy over last N reviews */
  readonly recentAccuracy: NormalizedValue;

  /** Accuracy trend (positive = improving) */
  readonly accuracyTrend: BipolarScore;

  /** Time spent studying this item (total) */
  readonly totalStudyTime: Duration;

  /** Days since last review */
  readonly daysSinceLastReview: number;

  /** Total hint usage count */
  readonly hintUsageCount: number;

  /** Hint dependency ratio (hints used / total reviews) */
  readonly hintDependencyRatio: NormalizedValue;

  /** Times the answer was changed during review */
  readonly answerChangeCount: number;

  /** Distinct contexts/sessions where reviewed */
  readonly contextCount: number;

  /** Time-of-day performance (morning/afternoon/evening/night) */
  readonly performanceByTimeOfDay: Readonly<Record<TimeOfDay, NormalizedValue>>;
}

export interface ReviewOutcomeCounts {
  readonly again: number;
  readonly hard: number;
  readonly good: number;
  readonly easy: number;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

// =============================================================================
// METACOGNITION STATE - Self-awareness metrics
// =============================================================================

/**
 * Metacognitive skill metrics
 */
export interface MetacognitionState {
  /** Calibration metrics */
  readonly calibration: MasteryCalibration;

  /** Strategy usage metrics */
  readonly strategyUsage: StrategyUsageMetrics;

  /** Self-regulation metrics */
  readonly selfRegulation: MasterySelfRegulation;

  /** Reflection metrics */
  readonly reflection: ReflectionMetrics;
}

/**
 * Calibration - accuracy of self-assessment (mastery context)
 */
export interface MasteryCalibration {
  /** Brier score (lower is better) [0, 1] */
  readonly brierScore: NormalizedValue;

  /** Expected Calibration Error */
  readonly ece: NormalizedValue;

  /** Bias: positive = overconfident, negative = underconfident */
  readonly bias: BipolarScore;

  /** Resolution (discrimination ability) */
  readonly resolution: NormalizedValue;

  /** Metacognitive sensitivity (can distinguish knowing from not knowing) */
  readonly metacognitiveSensitivity: NormalizedValue;

  /** Dunning-Kruger indicator: high = overestimates low mastery items */
  readonly dunningKrugerIndicator: NormalizedValue;

  /** Confidence-accuracy correlation */
  readonly confidenceAccuracyCorrelation: BipolarScore;
}

/**
 * Strategy usage patterns
 */
export interface StrategyUsageMetrics {
  /** Diversity of strategies used */
  readonly strategyDiversity: NormalizedValue;

  /** Adherence to planned strategies */
  readonly strategyAdherence: NormalizedValue;

  /** Effectiveness of chosen strategies */
  readonly strategyEfficacyUplift: BipolarScore;

  /** Most effective strategies (by ID) */
  readonly topStrategies: readonly NodeId[];

  /** Strategy selection appropriateness */
  readonly selectionAppropriatenessScore: NormalizedValue;
}

/**
 * Self-regulation abilities (mastery context)
 */
export interface MasterySelfRegulation {
  /** Session consistency (regular vs sporadic) */
  readonly sessionConsistency: NormalizedValue;

  /** Fatigue detection index */
  readonly fatigueIndex: NormalizedValue;

  /** Flow state proxy (engagement without frustration) */
  readonly flowProxy: NormalizedValue;

  /** Friction score (difficulty getting started) */
  readonly frictionScore: NormalizedValue;

  /** Goal alignment (studying what matters) */
  readonly goalAlignmentScore: NormalizedValue;

  /** Break timing appropriateness */
  readonly breakTimingScore: NormalizedValue;
}

/**
 * Reflection quality and frequency
 */
export interface ReflectionMetrics {
  /** Reflection completion rate */
  readonly completionRate: NormalizedValue;

  /** Average reflection quality */
  readonly averageQuality: NormalizedValue;

  /** Plan follow-through (did what was planned) */
  readonly planFollowThroughScore: NormalizedValue;

  /** Insight generation rate */
  readonly insightRate: NormalizedValue;

  /** Days since last meaningful reflection */
  readonly daysSinceLastReflection: number;
}

// =============================================================================
// FORGETTING STATE - Interference and decay
// =============================================================================

/**
 * Forgetting and interference metrics
 */
export interface ForgettingState {
  /** Interference index (confusion with similar items) */
  readonly interferenceIndex: NormalizedValue;

  /** Context variability (performance varies by context) */
  readonly contextVariability: NormalizedValue;

  /** Forgetting curve fit error (how well FSRS/HLR predicts) */
  readonly forgettingCurveFitError: NormalizedValue;

  /** Proactive interference (old learning interferes with new) */
  readonly proactiveInterference: NormalizedValue;

  /** Retroactive interference (new learning interferes with old) */
  readonly retroactiveInterference: NormalizedValue;

  /** Sleep-dependent consolidation estimate */
  readonly consolidationEstimate: NormalizedValue;

  /** Items frequently confused with */
  readonly confusionSet: readonly NodeId[];
}

// =============================================================================
// GENERALIZATION STATE - Transfer and coverage
// =============================================================================

/**
 * Generalization and transfer metrics
 */
export interface GeneralizationState {
  /** Transfer score (can apply in new contexts) */
  readonly transferScore: NormalizedValue;

  /** Coverage (proportion of related concepts mastered) */
  readonly coverage: NormalizedValue;

  /** Cross-context robustness */
  readonly crossContextRobustness: NormalizedValue;

  /** Near transfer score (similar contexts) */
  readonly nearTransfer: NormalizedValue;

  /** Far transfer score (dissimilar contexts) */
  readonly farTransfer: NormalizedValue;

  /** Abstraction level achieved */
  readonly abstractionLevel: NormalizedValue;

  /** Analogical reasoning score */
  readonly analogicalReasoning: NormalizedValue;
}

// =============================================================================
// COGNITIVE LOAD STATE - Mental effort tracking
// =============================================================================

/**
 * Cognitive load metrics (Cognitive Load Theory)
 */
export interface CognitiveLoadState {
  /** Intrinsic load (inherent difficulty) */
  readonly intrinsicLoad: NormalizedValue;

  /** Extraneous load (poor instructional design) */
  readonly extraneousLoad: NormalizedValue;

  /** Germane load (productive mental effort) */
  readonly germaneLoad: NormalizedValue;

  /** Total load estimate */
  readonly totalLoad: NormalizedValue;

  /** Load capacity remaining */
  readonly remainingCapacity: NormalizedValue;

  /** Optimal challenge point (zone of proximal development) */
  readonly optimalChallengePoint: NormalizedValue;

  /** Current difficulty relative to optimal */
  readonly difficultyAlignment: BipolarScore;
}

// =============================================================================
// AFFECT STATE - Emotional and motivational factors
// =============================================================================

/**
 * Affective and motivational state
 */
export interface AffectState {
  /** Frustration level (inferred and/or self-reported) */
  readonly frustration: AffectiveMetric;

  /** Flow/engagement (inferred and/or self-reported) */
  readonly flow: AffectiveMetric;

  /** Boredom level (inferred and/or self-reported) */
  readonly boredom: AffectiveMetric;

  /** Anxiety/stress level */
  readonly anxiety: AffectiveMetric;

  /** Interest/curiosity level */
  readonly interest: AffectiveMetric;

  /** Self-efficacy (belief in ability to succeed) */
  readonly selfEfficacy: NormalizedValue;

  /** Motivation type */
  readonly motivationType: "intrinsic" | "extrinsic" | "mixed";

  /** Streak health (positive associations with streaks) */
  readonly streakHealth: NormalizedValue;
}

/**
 * Affective metric with both inferred and self-reported values
 */
export interface AffectiveMetric {
  /** Inferred from behavior */
  readonly inferred: NormalizedValue;

  /** Self-reported (if available) */
  readonly selfReported?: NormalizedValue;

  /** Combined estimate */
  readonly combined: NormalizedValue;

  /** Confidence in estimate */
  readonly confidence: Confidence;

  /** Last updated */
  readonly lastUpdated: Timestamp;
}

// =============================================================================
// TRUST STATE - Data quality and model agreement
// =============================================================================

/**
 * Trust and reliability metrics
 */
export interface TrustState {
  /** Data quality score (completeness, consistency) */
  readonly dataQualityScore: NormalizedValue;

  /** Model disagreement (FSRS vs HLR vs heuristics) */
  readonly modelDisagreement: NormalizedValue;

  /** Prediction confidence */
  readonly predictionConfidence: Confidence;

  /** Evidence recency (how recent is the data) */
  readonly evidenceRecency: NormalizedValue;

  /** Evidence sufficiency (enough data to trust estimates) */
  readonly evidenceSufficiency: NormalizedValue;

  /** Outlier proportion (anomalous data points) */
  readonly outlierProportion: NormalizedValue;

  /** Human override count (user disagreed with AI) */
  readonly humanOverrideCount: number;

  /** Stale data warning */
  readonly isStale: boolean;

  /** Minimum reviews needed for confidence */
  readonly reviewsUntilConfident: number;
}

// =============================================================================
// MASTERY STATE DELTA - For efficient updates
// =============================================================================

/**
 * Changes to mastery state (for event sourcing)
 */
export interface MasteryStateDelta {
  readonly nodeId: NodeId;
  readonly timestamp: Timestamp;
  readonly previousStateVersion: number;
  readonly newStateVersion: number;

  /** Partial updates to mastery state */
  readonly changes: Partial<{
    readonly memory: Partial<MemoryState>;
    readonly evidence: Partial<EvidenceAggregate>;
    readonly metacognition: Partial<MetacognitionState>;
    readonly forgetting: Partial<ForgettingState>;
    readonly generalization: Partial<GeneralizationState>;
    readonly cognitiveLoad: Partial<CognitiveLoadState>;
    readonly affect: Partial<AffectState>;
    readonly trust: Partial<TrustState>;
  }>;

  /** Reason for update */
  readonly reason: MasteryUpdateReason;

  /** Triggering event (if any) */
  readonly triggeringEventId?: EntityId;
}

export type MasteryUpdateReason =
  | "review_completed"
  | "session_ended"
  | "reflection_submitted"
  | "model_recalculation"
  | "manual_adjustment"
  | "sync_merge"
  | "decay_update";

// =============================================================================
// MASTERY SNAPSHOT - For AI batch processing
// =============================================================================

/**
 * Snapshot of mastery state for AI processing
 * Includes derived features optimized for model input
 */
export interface MasterySnapshot {
  readonly nodeId: NodeId;
  readonly snapshotAt: Timestamp;

  /** Flattened feature vector for ML models */
  readonly features: MasteryFeatureVector;

  /** Recent history summary */
  readonly recentHistory: RecentHistorySummary;

  /** Related node summaries */
  readonly relatedNodes: readonly RelatedNodeSummary[];
}

/**
 * Flattened feature vector for ML models
 */
export interface MasteryFeatureVector {
  // Memory features
  readonly stability: number;
  readonly difficulty: number;
  readonly retrievability: number;
  readonly reps: number;
  readonly lapses: number;
  readonly daysSinceLastReview: number;

  // Performance features
  readonly recentAccuracy: number;
  readonly avgResponseTime: number;
  readonly accuracyTrend: number;
  readonly responseTimeTrend: number;

  // Metacognition features
  readonly brierScore: number;
  readonly calibrationBias: number;
  readonly strategyDiversity: number;

  // Context features
  readonly timeOfDay: number; // 0-1 normalized
  readonly dayOfWeek: number; // 0-1 normalized
  readonly sessionDuration: number;
  readonly positionInSession: number;

  // Difficulty features
  readonly intrinsicLoad: number;
  readonly interferenceIndex: number;
  readonly prerequisiteMastery: number;
}

/**
 * Summary of recent learning history
 */
export interface RecentHistorySummary {
  readonly last7Days: PeriodSummary;
  readonly last30Days: PeriodSummary;
  readonly last90Days: PeriodSummary;
}

export interface PeriodSummary {
  readonly reviewCount: number;
  readonly accuracy: NormalizedValue;
  readonly avgInterval: number;
  readonly studyTime: Duration;
}

/**
 * Summary of a related node (for context)
 */
export interface RelatedNodeSummary {
  readonly nodeId: NodeId;
  readonly relationshipType: string;
  readonly masteryLevel: NormalizedValue;
  readonly lastReviewed?: Timestamp;
}
