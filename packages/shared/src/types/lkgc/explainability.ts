// =============================================================================
// LKGC EXPLAINABILITY - First-Class Domain Objects for Transparency
// =============================================================================
// Explainability is NOT an afterthought - it's a core domain concern.
// These objects enable:
// - Understanding why decisions were made
// - Scientific iteration on algorithms
// - Building user trust
// - Debugging and improvement
// =============================================================================

import type {
  LKGCEntity,
  EntityId,
  NodeId,
  ProposalId,
  SessionId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./foundation";

// =============================================================================
// DECISION RATIONALE - Why was this decision made?
// =============================================================================

/**
 * Comprehensive decision rationale
 */
export interface DecisionRationaleRecord extends LKGCEntity {
  /** Decision this rationale explains */
  readonly decisionId: EntityId;

  /** Type of decision */
  readonly decisionType: DecisionType;

  /** When decision was made */
  readonly decidedAt: Timestamp;

  /** Features and their contributions */
  readonly featureAnalysis: FeatureAnalysis;

  /** Model information */
  readonly modelInfo: ModelInfo;

  /** Counterfactual analysis */
  readonly counterfactuals: readonly CounterfactualAnalysis[];

  /** Human-readable summary */
  readonly summary: RationaleSummary;

  /** Confidence and uncertainty */
  readonly uncertainty: UncertaintyAnalysis;
}

export type DecisionType =
  | "scheduling"
  | "difficulty_update"
  | "coaching_trigger"
  | "gamification_trigger"
  | "leech_detection"
  | "strategy_recommendation"
  | "goal_suggestion"
  | "content_recommendation";

/**
 * Feature analysis - which features drove the decision
 */
export interface FeatureAnalysis {
  /** All features considered */
  readonly features: readonly FeatureDetail[];

  /** Top N most important features */
  readonly topFeatures: readonly FeatureDetail[];

  /** Feature interactions */
  readonly interactions?: readonly FeatureInteraction[];

  /** Features that were surprisingly unimportant */
  readonly unexpectedlyLowImpact?: readonly string[];
}

export interface FeatureDetail {
  readonly name: string;
  readonly value: number;
  readonly normalizedValue: NormalizedValue;
  readonly contribution: number;
  readonly direction: "positive" | "negative" | "neutral";
  readonly percentile?: NormalizedValue;
  readonly description: string;
}

export interface FeatureInteraction {
  readonly features: readonly string[];
  readonly interactionEffect: number;
  readonly description: string;
}

/**
 * Model information
 */
export interface ModelInfo {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly modelType: "fsrs" | "hlr" | "neural" | "rule_based" | "ensemble";
  readonly trainingDate?: Timestamp;
  readonly historicalAccuracy: NormalizedValue;
  readonly userSpecificAccuracy?: NormalizedValue;
}

/**
 * Counterfactual analysis - what would have changed the outcome
 */
export interface CounterfactualAnalysis {
  /** Description of the alternative scenario */
  readonly scenario: string;

  /** What would need to change */
  readonly requiredChanges: readonly RequiredChange[];

  /** What the outcome would be */
  readonly alternativeOutcome: string;

  /** How likely is this scenario */
  readonly plausibility: NormalizedValue;

  /** Is this scenario actionable by the user? */
  readonly userActionable: boolean;
}

export interface RequiredChange {
  readonly feature: string;
  readonly currentValue: number;
  readonly requiredValue: number;
  readonly changeDirection: "increase" | "decrease";
  readonly feasibility: "easy" | "moderate" | "difficult" | "impossible";
}

/**
 * Human-readable rationale summary
 */
export interface RationaleSummary {
  /** One-sentence summary */
  readonly oneLiner: string;

  /** Detailed explanation (few paragraphs) */
  readonly detailed: string;

  /** Key points (bullet points) */
  readonly keyPoints: readonly string[];

  /** Recommended actions */
  readonly recommendations?: readonly string[];

  /** Similar past decisions for reference */
  readonly similarDecisions?: readonly EntityId[];
}

/**
 * Uncertainty analysis
 */
export interface UncertaintyAnalysis {
  /** Overall confidence */
  readonly overallConfidence: Confidence;

  /** Data uncertainty (quality and quantity) */
  readonly dataUncertainty: NormalizedValue;

  /** Model uncertainty (epistemic) */
  readonly modelUncertainty: NormalizedValue;

  /** Sources of uncertainty */
  readonly uncertaintySources: readonly UncertaintySource[];

  /** What would reduce uncertainty */
  readonly uncertaintyReduction: readonly UncertaintyReductionStrategy[];
}

export interface UncertaintySource {
  readonly source: string;
  readonly contribution: NormalizedValue;
  readonly description: string;
  readonly mitigable: boolean;
}

export interface UncertaintyReductionStrategy {
  readonly strategy: string;
  readonly expectedReduction: NormalizedValue;
  readonly effort: "low" | "medium" | "high";
}

// =============================================================================
// COACHING INTERVENTION - Tracked coaching interactions
// =============================================================================

/**
 * Coaching intervention record
 */
export interface CoachingInterventionRecord extends LKGCEntity {
  /** Related proposal (if any) */
  readonly proposalId?: ProposalId;

  /** Intervention type */
  readonly interventionType: InterventionType;

  /** When intervention was triggered */
  readonly triggeredAt: Timestamp;

  /** Trigger conditions */
  readonly triggerConditions: readonly TriggerCondition[];

  /** Content shown to user */
  readonly content: InterventionContent;

  /** User interaction */
  readonly userInteraction: UserInteractionRecord;

  /** Measured downstream effect */
  readonly measuredEffect?: InterventionEffect;

  /** Rationale for this intervention */
  readonly rationale: DecisionRationaleRecord;
}

export type InterventionType =
  | "encouragement"
  | "strategy_suggestion"
  | "difficulty_warning"
  | "fatigue_alert"
  | "streak_motivation"
  | "calibration_feedback"
  | "progress_celebration"
  | "goal_reminder"
  | "learning_tip"
  | "metacognitive_prompt";

/**
 * Trigger condition that caused intervention
 */
export interface TriggerCondition {
  readonly conditionType: string;
  readonly metric: string;
  readonly threshold: number;
  readonly actualValue: number;
  readonly description: string;
}

/**
 * Content of the intervention
 */
export interface InterventionContent {
  /** Primary message */
  readonly message: string;

  /** Optional title */
  readonly title?: string;

  /** Optional emoji/icon */
  readonly emoji?: string;

  /** Call to action (if any) */
  readonly callToAction?: string;

  /** Links to related content */
  readonly relatedLinks?: readonly RelatedLink[];

  /** Media attachments */
  readonly media?: {
    readonly type: "image" | "animation" | "audio";
    readonly url: string;
  };

  /** Personalization applied */
  readonly personalization: PersonalizationInfo;
}

export interface RelatedLink {
  readonly label: string;
  readonly targetNodeId: NodeId;
  readonly relevance: string;
}

export interface PersonalizationInfo {
  readonly basedOnHistory: boolean;
  readonly referencedPastSuccess?: string;
  readonly adaptedToMood?: boolean;
  readonly languageLevel: "simple" | "standard" | "technical";
}

/**
 * User interaction with intervention
 */
export interface UserInteractionRecord {
  /** Did user see the intervention? */
  readonly seen: boolean;
  readonly seenAt?: Timestamp;

  /** How long was it visible? */
  readonly viewDuration?: Duration;

  /** User action */
  readonly action:
    | "dismissed"
    | "engaged"
    | "followed_cta"
    | "ignored"
    | "negative_feedback";

  /** Time to action */
  readonly timeToAction?: Duration;

  /** User feedback (if provided) */
  readonly feedback?: UserFeedback;
}

export interface UserFeedback {
  readonly rating?: 1 | 2 | 3 | 4 | 5;
  readonly helpful: boolean;
  readonly comment?: string;
  readonly reportedAt: Timestamp;
}

/**
 * Measured effect of intervention
 */
export interface InterventionEffect {
  /** Measurement period */
  readonly measurementPeriod: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };

  /** Metrics before intervention */
  readonly baselineMetrics: InterventionMetrics;

  /** Metrics after intervention */
  readonly postInterventionMetrics: InterventionMetrics;

  /** Calculated uplift */
  readonly uplift: InterventionUplift;

  /** Statistical significance */
  readonly significance: NormalizedValue;

  /** Confidence in causal attribution */
  readonly causalConfidence: Confidence;

  /** Confounding factors */
  readonly confoundingFactors?: readonly string[];
}

export interface InterventionMetrics {
  readonly accuracy?: NormalizedValue;
  readonly responseTime?: Duration;
  readonly sessionDuration?: Duration;
  readonly cardsReviewed?: number;
  readonly streakMaintained?: boolean;
  readonly moodScore?: NormalizedValue;
  readonly customMetrics?: Readonly<Record<string, number>>;
}

export interface InterventionUplift {
  readonly accuracyChange?: number;
  readonly responseTimeChange?: number;
  readonly engagementChange?: number;
  readonly retentionChange?: number;
  readonly overallScore: number;
  readonly isPositive: boolean;
}

// =============================================================================
// EXPLANATION TEMPLATES - For generating consistent explanations
// =============================================================================

/**
 * Explanation template
 */
export interface ExplanationTemplate extends LKGCEntity {
  /** Template category */
  readonly category: DecisionType;

  /** Template name */
  readonly name: string;

  /** Template pattern with placeholders */
  readonly pattern: string;

  /** Required placeholders */
  readonly requiredPlaceholders: readonly PlaceholderDefinition[];

  /** Optional placeholders */
  readonly optionalPlaceholders?: readonly PlaceholderDefinition[];

  /** Conditions for using this template */
  readonly conditions?: readonly TemplateCondition[];

  /** Example outputs */
  readonly examples: readonly string[];

  /** Tone */
  readonly tone: "friendly" | "neutral" | "technical" | "encouraging";

  /** Language complexity */
  readonly complexity: "simple" | "standard" | "detailed";
}

export interface PlaceholderDefinition {
  readonly name: string;
  readonly type: "number" | "string" | "date" | "list" | "percentage";
  readonly description: string;
  readonly formatter?: string;
}

export interface TemplateCondition {
  readonly field: string;
  readonly operator: "eq" | "gt" | "lt" | "in" | "between";
  readonly value: unknown;
}

// =============================================================================
// INSIGHT GENERATION - Patterns and discoveries
// =============================================================================

/**
 * Generated insight
 */
export interface GeneratedInsight extends LKGCEntity {
  /** Insight type */
  readonly insightType: InsightType;

  /** When insight was discovered */
  readonly discoveredAt: Timestamp;

  /** Confidence in insight */
  readonly confidence: Confidence;

  /** Insight content */
  readonly content: InsightContent;

  /** Supporting evidence */
  readonly evidence: InsightEvidence;

  /** Actionability */
  readonly actionability: InsightActionability;

  /** User interaction */
  readonly userInteraction?: {
    readonly shownAt?: Timestamp;
    readonly acknowledged: boolean;
    readonly helpful?: boolean;
    readonly actedUpon?: boolean;
  };
}

export type InsightType =
  | "pattern" // Recurring behavior pattern
  | "improvement" // Detected improvement
  | "concern" // Potential issue
  | "opportunity" // Optimization opportunity
  | "milestone" // Achievement/progress
  | "anomaly" // Unusual behavior
  | "correlation" // Discovered correlation
  | "prediction"; // Forward-looking insight

export interface InsightContent {
  /** Short title */
  readonly title: string;

  /** Main message */
  readonly message: string;

  /** Detailed explanation */
  readonly explanation?: string;

  /** Visual data (for charts) */
  readonly visualData?: InsightVisualization;

  /** Related nodes */
  readonly relatedNodeIds?: readonly NodeId[];
}

export interface InsightVisualization {
  readonly type: "trend_line" | "bar_chart" | "pie_chart" | "calendar_heatmap";
  readonly data: readonly number[];
  readonly labels?: readonly string[];
  readonly highlightIndex?: number;
}

export interface InsightEvidence {
  /** Data points supporting insight */
  readonly dataPoints: number;

  /** Time period analyzed */
  readonly timePeriod: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };

  /** Statistical significance */
  readonly significance: NormalizedValue;

  /** Key evidence items */
  readonly keyEvidence: readonly EvidenceItem[];
}

export interface EvidenceItem {
  readonly type: "metric" | "event" | "comparison" | "trend";
  readonly description: string;
  readonly value: number | string;
  readonly context?: string;
}

export interface InsightActionability {
  /** Is this actionable? */
  readonly isActionable: boolean;

  /** Suggested actions */
  readonly suggestedActions?: readonly SuggestedAction[];

  /** Urgency */
  readonly urgency: "low" | "medium" | "high";

  /** Expected impact of acting */
  readonly expectedImpact?: string;
}

export interface SuggestedAction {
  readonly action: string;
  readonly effort: "minimal" | "moderate" | "significant";
  readonly expectedBenefit: string;
  readonly relatedSettingId?: string;
}

// =============================================================================
// EXPLANATION AUDIT - Track explanation quality
// =============================================================================

/**
 * Explanation audit record
 */
export interface ExplanationAudit extends LKGCEntity {
  /** Explanation being audited */
  readonly explanationId: EntityId;

  /** Audit timestamp */
  readonly auditedAt: Timestamp;

  /** Quality metrics */
  readonly quality: ExplanationQualityMetrics;

  /** User feedback (if collected) */
  readonly userFeedback?: ExplanationFeedback;

  /** Improvement suggestions */
  readonly improvements?: readonly string[];
}

export interface ExplanationQualityMetrics {
  /** Readability score */
  readonly readability: NormalizedValue;

  /** Accuracy (does it match the actual decision?) */
  readonly accuracy: NormalizedValue;

  /** Completeness (does it cover all factors?) */
  readonly completeness: NormalizedValue;

  /** Actionability (does it help user act?) */
  readonly actionability: NormalizedValue;

  /** Consistency (with similar explanations) */
  readonly consistency: NormalizedValue;
}

export interface ExplanationFeedback {
  /** Did user understand? */
  readonly understood: boolean;

  /** Was it helpful? */
  readonly helpful: boolean;

  /** User rating */
  readonly rating?: 1 | 2 | 3 | 4 | 5;

  /** Specific feedback */
  readonly comments?: string;

  /** What was confusing? */
  readonly confusingParts?: readonly string[];
}
