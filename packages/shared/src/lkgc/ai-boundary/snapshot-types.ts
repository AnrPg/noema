// =============================================================================
// SNAPSHOT TYPES - AI Integration Boundary
// =============================================================================
// Defines the snapshot model for exporting LKGC state to AI inference.
//
// Core principles:
// - AI never owns truth — it only proposes
// - Snapshots are immutable, versioned, and auditable
// - Profiles control scope — AI does not decide what it sees
// - All data is model-agnostic
//
// NO UI. NO REAL ML. LKGC IS AUTHORITATIVE.
// =============================================================================

import type {
  EntityId,
  NodeId,
  EdgeId,
  UserId,
  SessionId,
  SnapshotId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
  RevisionNumber,
} from "../../types/lkgc/foundation";
import type {
  MasteryState,
  MasteryGranularity,
} from "../../types/lkgc/mastery";
import type { EdgeType } from "../../types/lkgc/edges";
import type { NodeType } from "../../types/lkgc/nodes";

// =============================================================================
// SNAPSHOT PROFILE IDENTITY
// =============================================================================

/**
 * Unique identifier for a snapshot profile
 */
declare const __snapshotProfileId: unique symbol;
export type SnapshotProfileId = string & {
  readonly [__snapshotProfileId]: never;
};

/**
 * Profile version number
 */
export type ProfileVersion = number;

/**
 * Canonical profile names (extensible by plugins)
 */
export type BuiltinProfileName =
  | "SchedulingSnapshot"
  | "ConfusionDetectionSnapshot"
  | "PrerequisiteGraphSnapshot"
  | "StrategyEfficacySnapshot"
  | "CalibrationTrainingSnapshot"
  | "SessionRegulationSnapshot";

// =============================================================================
// BUDGET TIERS
// =============================================================================

/**
 * Predefined budget tiers for snapshot profiles
 */
export type BudgetTier = "minimal" | "standard" | "extended";

/**
 * Budget constraints for a snapshot
 */
export interface SnapshotBudget {
  /** Maximum number of nodes to include */
  readonly maxNodes: number;

  /** Maximum number of edges to include */
  readonly maxEdges: number;

  /** Maximum number of mastery states to include */
  readonly maxMasteryStates: number;

  /** Maximum number of feature records to include */
  readonly maxFeatures: number;

  /** Maximum payload size in bytes (approximate) */
  readonly maxPayloadBytes: number;
}

/**
 * Bounded budget parameter with min/max constraints
 */
export interface BoundedBudgetParam {
  /** Default value */
  readonly default: number;

  /** Minimum allowed value */
  readonly min: number;

  /** Maximum allowed value */
  readonly max: number;
}

/**
 * Budget bounds defined by a profile version
 */
export interface ProfileBudgetBounds {
  readonly maxNodes: BoundedBudgetParam;
  readonly maxEdges: BoundedBudgetParam;
  readonly maxMasteryStates: BoundedBudgetParam;
  readonly maxFeatures: BoundedBudgetParam;
  readonly maxPayloadBytes: BoundedBudgetParam;
}

/**
 * Tiered budget presets for a profile
 */
export interface TieredBudgets {
  readonly minimal: SnapshotBudget;
  readonly standard: SnapshotBudget;
  readonly extended: SnapshotBudget;
}

// =============================================================================
// TEMPORAL SCOPE
// =============================================================================

/**
 * Bounded temporal parameter
 */
export interface BoundedTemporalParam {
  /** Default value */
  readonly default: number;

  /** Minimum allowed value */
  readonly min: number;

  /** Maximum allowed value */
  readonly max: number;
}

/**
 * Temporal scope constraints for a snapshot
 */
export interface TemporalScope {
  /** Number of recent attempts per item */
  readonly recentAttempts: number;

  /** Number of recent sessions */
  readonly recentSessions: number;

  /** Rolling window in days */
  readonly rollingWindowDays: number;

  /** Lookback limit in days (absolute maximum) */
  readonly maxLookbackDays: number;
}

/**
 * Temporal bounds defined by a profile version
 */
export interface ProfileTemporalBounds {
  readonly recentAttempts: BoundedTemporalParam;
  readonly recentSessions: BoundedTemporalParam;
  readonly rollingWindowDays: BoundedTemporalParam;
  readonly maxLookbackDays: BoundedTemporalParam;
}

// =============================================================================
// GRAPH SCOPE
// =============================================================================

/**
 * Graph scope constraints for a snapshot
 */
export interface GraphScope {
  /** Maximum hops from target nodes */
  readonly maxHops: number;

  /** Edge types allowed in traversal (whitelist) */
  readonly allowedEdgeTypes: readonly EdgeType[];

  /** Edge types explicitly excluded */
  readonly excludedEdgeTypes: readonly EdgeType[];

  /** Node types allowed (whitelist, empty = all) */
  readonly allowedNodeTypes: readonly NodeType[];

  /** Node types explicitly excluded */
  readonly excludedNodeTypes: readonly NodeType[];

  /** Whether to include deleted (soft-deleted) nodes */
  readonly includeDeleted: boolean;
}

/**
 * Graph scope bounds defined by a profile version
 */
export interface ProfileGraphBounds {
  /** Maximum allowed hops */
  readonly maxHops: BoundedTemporalParam;

  /** Edge types that CAN be included (superset) */
  readonly allowableEdgeTypes: readonly EdgeType[];

  /** Edge types that MUST be excluded */
  readonly mandatoryExcludedEdgeTypes: readonly EdgeType[];

  /** Node types that CAN be included (superset) */
  readonly allowableNodeTypes: readonly NodeType[];

  /** Node types that MUST be excluded */
  readonly mandatoryExcludedNodeTypes: readonly NodeType[];
}

// =============================================================================
// SIGNAL SCOPE
// =============================================================================

/**
 * Which MasteryState fields to include
 */
export interface MasterySignalScope {
  /** Include memory parameters (stability, difficulty, retrievability) */
  readonly includeMemory: boolean;

  /** Include evidence aggregates */
  readonly includeEvidence: boolean;

  /** Include metacognition metrics */
  readonly includeMetacognition: boolean;

  /** Include forgetting/interference metrics */
  readonly includeForgetting: boolean;

  /** Include generalization metrics */
  readonly includeGeneralization: boolean;

  /** Include cognitive load metrics */
  readonly includeCognitiveLoad: boolean;

  /** Include affect metrics */
  readonly includeAffect: boolean;

  /** Include trust metrics */
  readonly includeTrust: boolean;

  /** Specific fields to include (whitelist, empty = all allowed) */
  readonly fieldWhitelist: readonly string[];

  /** Specific fields to exclude (blacklist) */
  readonly fieldBlacklist: readonly string[];
}

/**
 * Context signals to include
 */
export interface ContextSignalScope {
  /** Include learning mode */
  readonly includeMode: boolean;

  /** Include time budget */
  readonly includeTimeBudget: boolean;

  /** Include fatigue/motivation */
  readonly includeFatigueMotivation: boolean;

  /** Include device type */
  readonly includeDevice: boolean;

  /** Include time of day */
  readonly includeTimeOfDay: boolean;

  /** Include current goals */
  readonly includeGoals: boolean;

  /** Include current streak */
  readonly includeStreak: boolean;
}

// =============================================================================
// PRIVACY RULES
// =============================================================================

/**
 * Privacy rules for snapshot generation
 */
export interface SnapshotPrivacyRules {
  /** Include raw reflection text */
  readonly allowReflectionText: boolean;

  /** Include user-approved reflection summaries */
  readonly allowReflectionSummaries: boolean;

  /** Include rubric scores */
  readonly allowRubricScores: boolean;

  /** Include strategy tags */
  readonly allowStrategyTags: boolean;

  /** Include error attribution */
  readonly allowErrorAttribution: boolean;

  /** Include confidence predictions */
  readonly allowConfidencePredictions: boolean;

  /** Maximum text length for any included text field */
  readonly maxTextLength: number;

  /** Require explicit user consent for sensitive fields */
  readonly requireExplicitConsent: boolean;
}

// =============================================================================
// EXPECTED OUTPUTS
// =============================================================================

/**
 * Types of outputs expected from AI based on this snapshot
 */
export type ExpectedOutputType =
  | "memory_parameter_proposals"
  | "scheduling_hints"
  | "confusion_edge_proposals"
  | "prerequisite_edge_proposals"
  | "strategy_efficacy_proposals"
  | "calibration_metrics"
  | "session_regulation_hints"
  | "ranked_candidates"
  | "clustering_results"
  | "anomaly_detection";

/**
 * Expected output specification
 */
export interface ExpectedOutput {
  /** Output type */
  readonly type: ExpectedOutputType;

  /** Whether this output is required */
  readonly required: boolean;

  /** Description of what the output should contain */
  readonly description: string;
}

// =============================================================================
// SNAPSHOT PROFILE DEFINITION
// =============================================================================

/**
 * Complete snapshot profile definition (versioned)
 *
 * A profile is a declarative definition of:
 * - What the AI is allowed to see
 * - Why it needs to see it
 * - What outputs are expected
 */
export interface SnapshotProfileDefinition {
  /** Profile identifier */
  readonly profileId: SnapshotProfileId;

  /** Human-readable name */
  readonly name: string;

  /** Profile version */
  readonly version: ProfileVersion;

  /** Purpose description */
  readonly purpose: string;

  /** Detailed description of what this profile enables */
  readonly description: string;

  /** When this profile version was defined */
  readonly definedAt: Timestamp;

  /** Whether this profile is active */
  readonly isActive: boolean;

  /** Target node selection criteria */
  readonly targetCriteria: TargetSelectionCriteria;

  /** Graph scope bounds */
  readonly graphBounds: ProfileGraphBounds;

  /** Budget bounds */
  readonly budgetBounds: ProfileBudgetBounds;

  /** Tiered budget presets */
  readonly tieredBudgets: TieredBudgets;

  /** Temporal bounds */
  readonly temporalBounds: ProfileTemporalBounds;

  /** Signal scope (what mastery/context signals to include) */
  readonly signalScope: {
    readonly mastery: MasterySignalScope;
    readonly context: ContextSignalScope;
  };

  /** Privacy rules */
  readonly privacyRules: SnapshotPrivacyRules;

  /** Expected outputs */
  readonly expectedOutputs: readonly ExpectedOutput[];

  /** Tags for categorization */
  readonly tags: readonly string[];
}

/**
 * Criteria for selecting target nodes
 */
export interface TargetSelectionCriteria {
  /** Description of what nodes should be targeted */
  readonly description: string;

  /** Node types to target */
  readonly targetNodeTypes: readonly NodeType[];

  /** Granularity levels to target */
  readonly targetGranularities: readonly MasteryGranularity[];

  /** Optional: filter by due status */
  readonly dueFilter?: {
    /** Include items due within this window (ms) */
    readonly dueWithin: Duration;
    /** Include overdue items from this window (ms) */
    readonly overdueWithin: Duration;
  };

  /** Optional: filter by recent failures */
  readonly failureFilter?: {
    /** Include items failed within this window (ms) */
    readonly failedWithin: Duration;
    /** Minimum failure count */
    readonly minFailures: number;
  };

  /** Optional: filter by blocking score */
  readonly blockingFilter?: {
    /** Include items blocking at least this many dependents */
    readonly minBlockedDependents: number;
  };

  /** Optional: filter by interference */
  readonly interferenceFilter?: {
    /** Minimum interference index */
    readonly minInterferenceIndex: NormalizedValue;
  };
}

// =============================================================================
// SNAPSHOT REQUEST
// =============================================================================

/**
 * Request to generate a snapshot
 */
export interface SnapshotRequest {
  /** Profile to use */
  readonly profileId: SnapshotProfileId;

  /** Profile version (optional, defaults to latest) */
  readonly profileVersion?: ProfileVersion;

  /** User ID for the snapshot */
  readonly userId: UserId;

  /** Budget tier (optional, defaults to "standard") */
  readonly budgetTier?: BudgetTier;

  /** Budget overrides (optional, must be within bounds) */
  readonly budgetOverrides?: Partial<SnapshotBudget>;

  /** Temporal overrides (optional, must be within bounds) */
  readonly temporalOverrides?: Partial<TemporalScope>;

  /** Graph scope overrides (optional, must be within bounds) */
  readonly graphOverrides?: Partial<GraphScope>;

  /** Explicit target node IDs (optional, adds to criteria-based selection) */
  readonly explicitTargetIds?: readonly NodeId[];

  /** Current session ID (for context) */
  readonly sessionId?: SessionId;

  /** Additional context (mode, fatigue, etc.) */
  readonly context?: SnapshotRequestContext;

  /** Request timestamp */
  readonly requestedAt: Timestamp;

  /** Request ID for tracking */
  readonly requestId: EntityId;
}

/**
 * Context provided with a snapshot request
 */
export interface SnapshotRequestContext {
  /** Learning mode */
  readonly mode?: "review" | "learn" | "exam" | "mixed";

  /** Available time budget (ms) */
  readonly timeBudget?: Duration;

  /** User-reported fatigue (0-1) */
  readonly fatigue?: NormalizedValue;

  /** User-reported motivation (0-1) */
  readonly motivation?: NormalizedValue;

  /** Device type */
  readonly device?: "mobile" | "desktop" | "tablet";

  /** Current active goal IDs */
  readonly activeGoalIds?: readonly NodeId[];
}

// =============================================================================
// SNAPSHOT METADATA
// =============================================================================

/**
 * Metadata about how a snapshot was generated
 */
export interface SnapshotMetadata {
  /** Snapshot ID */
  readonly snapshotId: SnapshotId;

  /** Profile used */
  readonly profileId: SnapshotProfileId;

  /** Profile version used */
  readonly profileVersion: ProfileVersion;

  /** User ID */
  readonly userId: UserId;

  /** When the snapshot was generated */
  readonly generatedAt: Timestamp;

  /** Request that triggered this snapshot */
  readonly requestId: EntityId;

  /** Budget tier used */
  readonly budgetTier: BudgetTier;

  /** Effective budget (after applying tier + overrides) */
  readonly effectiveBudget: SnapshotBudget;

  /** Effective temporal scope */
  readonly effectiveTemporalScope: TemporalScope;

  /** Effective graph scope */
  readonly effectiveGraphScope: GraphScope;

  /** Overrides that were applied (for explainability) */
  readonly appliedOverrides: {
    readonly budget: Partial<SnapshotBudget>;
    readonly temporal: Partial<TemporalScope>;
    readonly graph: Partial<GraphScope>;
  };

  /** Schema version */
  readonly schemaVersion: number;

  /** Generation duration (ms) */
  readonly generationDuration: Duration;

  /** Watermarks for replay/staleness detection */
  readonly watermarks: SnapshotWatermarks;

  /** Statistics about what was included */
  readonly statistics: SnapshotStatistics;
}

/**
 * Watermarks for staleness detection and replay
 */
export interface SnapshotWatermarks {
  /** Last event revision included */
  readonly lastEventRevision: RevisionNumber;

  /** Last graph revision included */
  readonly lastGraphRevision: RevisionNumber;

  /** Last mastery state revision included */
  readonly lastMasteryRevision: RevisionNumber;

  /** Oldest data timestamp included */
  readonly oldestDataTimestamp: Timestamp;

  /** Newest data timestamp included */
  readonly newestDataTimestamp: Timestamp;
}

/**
 * Statistics about snapshot contents
 */
export interface SnapshotStatistics {
  /** Number of nodes included */
  readonly nodeCount: number;

  /** Number of edges included */
  readonly edgeCount: number;

  /** Number of mastery states included */
  readonly masteryStateCount: number;

  /** Number of feature records included */
  readonly featureCount: number;

  /** Approximate payload size in bytes */
  readonly approximatePayloadBytes: number;

  /** Nodes by type */
  readonly nodesByType: Readonly<Record<string, number>>;

  /** Edges by type */
  readonly edgesByType: Readonly<Record<string, number>>;

  /** Budget utilization (0-1) */
  readonly budgetUtilization: NormalizedValue;
}

// =============================================================================
// SNAPSHOT CONTENT
// =============================================================================

/**
 * Node data included in a snapshot (privacy-filtered)
 */
export interface SnapshotNode {
  /** Node ID */
  readonly nodeId: NodeId;

  /** Node type */
  readonly nodeType: NodeType;

  /** Granularity (if applicable) */
  readonly granularity?: MasteryGranularity;

  /** Creation timestamp */
  readonly createdAt: Timestamp;

  /** Last updated timestamp */
  readonly updatedAt: Timestamp;

  /** Tags (if allowed by privacy rules) */
  readonly tags?: readonly string[];

  /** Type-specific properties (filtered by profile) */
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * Edge data included in a snapshot
 */
export interface SnapshotEdge {
  /** Edge ID */
  readonly edgeId: EdgeId;

  /** Edge type */
  readonly edgeType: EdgeType;

  /** Source node ID */
  readonly sourceId: NodeId;

  /** Target node ID */
  readonly targetId: NodeId;

  /** Edge weight/strength */
  readonly weight: NormalizedValue;

  /** Confidence in this edge */
  readonly confidence: Confidence;

  /** Whether this edge was inferred */
  readonly isInferred: boolean;

  /** Type-specific properties */
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * Mastery state included in a snapshot (filtered by signal scope)
 */
export interface SnapshotMasteryState {
  /** Node ID */
  readonly nodeId: NodeId;

  /** Granularity */
  readonly granularity: MasteryGranularity;

  /** State version */
  readonly stateVersion: number;

  /** Last computed timestamp */
  readonly computedAt: Timestamp;

  /** Memory parameters (if included) */
  readonly memory?: Partial<MasteryState["memory"]>;

  /** Evidence aggregates (if included) */
  readonly evidence?: Partial<MasteryState["evidence"]>;

  /** Metacognition metrics (if included) */
  readonly metacognition?: Partial<MasteryState["metacognition"]>;

  /** Forgetting metrics (if included) */
  readonly forgetting?: Partial<MasteryState["forgetting"]>;

  /** Generalization metrics (if included) */
  readonly generalization?: Partial<MasteryState["generalization"]>;

  /** Cognitive load metrics (if included) */
  readonly cognitiveLoad?: Partial<MasteryState["cognitiveLoad"]>;

  /** Affect metrics (if included) */
  readonly affect?: Partial<MasteryState["affect"]>;

  /** Trust metrics (if included) */
  readonly trust?: Partial<MasteryState["trust"]>;
}

/**
 * Feature record included in a snapshot
 */
export interface SnapshotFeature {
  /** Feature ID */
  readonly featureId: EntityId;

  /** Feature name/type */
  readonly featureName: string;

  /** Node ID this feature is for */
  readonly nodeId: NodeId;

  /** Granularity */
  readonly granularity: MasteryGranularity;

  /** Window this feature covers */
  readonly window: {
    readonly type: string;
    readonly startAt: Timestamp;
    readonly endAt: Timestamp;
  };

  /** Feature value */
  readonly value: unknown;

  /** Confidence in this feature */
  readonly confidence: Confidence;
}

/**
 * Context included in a snapshot
 */
export interface SnapshotContext {
  /** Learning mode (if included) */
  readonly mode?: "review" | "learn" | "exam" | "mixed";

  /** Time budget (if included) */
  readonly timeBudget?: Duration;

  /** Fatigue (if included) */
  readonly fatigue?: NormalizedValue;

  /** Motivation (if included) */
  readonly motivation?: NormalizedValue;

  /** Device type (if included) */
  readonly device?: "mobile" | "desktop" | "tablet";

  /** Time of day (if included) */
  readonly timeOfDay?: "morning" | "afternoon" | "evening" | "night";

  /** Active goal IDs (if included) */
  readonly activeGoalIds?: readonly NodeId[];

  /** Current streak (if included) */
  readonly currentStreak?: number;
}

// =============================================================================
// COMPLETE SNAPSHOT
// =============================================================================

/**
 * Complete, immutable snapshot for AI inference
 */
export interface AISnapshot {
  /** Snapshot metadata */
  readonly metadata: SnapshotMetadata;

  /** Nodes included */
  readonly nodes: readonly SnapshotNode[];

  /** Edges included */
  readonly edges: readonly SnapshotEdge[];

  /** Mastery states included */
  readonly masteryStates: readonly SnapshotMasteryState[];

  /** Features included */
  readonly features: readonly SnapshotFeature[];

  /** Context */
  readonly context: SnapshotContext;

  /** Target node IDs (the primary subjects of inference) */
  readonly targetNodeIds: readonly NodeId[];

  /** Profile definition used (for self-documentation) */
  readonly profileDefinition: SnapshotProfileDefinition;
}
