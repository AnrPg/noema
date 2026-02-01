// =============================================================================
// RULE REGISTRY - Update Rule Management for MasteryState
// =============================================================================
// Manages update rules for mastery state computation.
// Each rule:
// - Has a unique ID and version
// - Is deterministic and replayable
// - Can be traced for audit purposes
//
// Rules are placeholder heuristics now; ML models replace them later.
// =============================================================================

import type {
  NodeId,
  Timestamp,
  Confidence,
  NormalizedValue,
  Duration,
} from "../types/lkgc/foundation";
import type {
  MasteryState,
  MasteryGranularity,
  MemoryState,
  EvidenceAggregate,
  MetacognitionState,
  ForgettingState,
  GeneralizationState,
  CognitiveLoadState,
  AffectState,
  TrustState,
} from "../types/lkgc/mastery";
import type {
  AttemptFeatures,
  SessionFeatures,
} from "../types/lkgc/aggregation";

// =============================================================================
// RULE METADATA
// =============================================================================

/**
 * Unique identifier for a rule
 */
export type RuleId = string;

/**
 * Rule category for organization
 */
export type RuleCategory =
  | "memory"
  | "evidence"
  | "metacognition"
  | "forgetting"
  | "generalization"
  | "cognitive_load"
  | "affect"
  | "trust";

/**
 * Rule metadata - describes a rule without the implementation
 */
export interface RuleMetadata {
  /** Unique rule identifier */
  readonly id: RuleId;

  /** Human-readable name */
  readonly name: string;

  /** Detailed description of what this rule does */
  readonly description: string;

  /** Category */
  readonly category: RuleCategory;

  /** Version number (for tracking changes) */
  readonly version: number;

  /** When this rule was added */
  readonly addedAt: Timestamp;

  /** Whether this rule is currently active */
  readonly isActive: boolean;

  /** Rule priority (higher = applied first) */
  readonly priority: number;

  /** Applicable granularities */
  readonly applicableGranularities: readonly MasteryGranularity[];

  /** Dependencies on other rules */
  readonly dependsOn: readonly RuleId[];

  /** Tags for filtering */
  readonly tags: readonly string[];
}

// =============================================================================
// RULE CONTEXT - Input to rules
// =============================================================================

/**
 * Context provided to rules for computation
 */
export interface RuleContext {
  /** Target node ID */
  readonly nodeId: NodeId;

  /** Granularity level */
  readonly granularity: MasteryGranularity;

  /** Current timestamp */
  readonly now: Timestamp;

  /** Previous mastery state (null if new) */
  readonly previousState: MasteryState | null;

  /** Feature inputs */
  readonly features: RuleFeatureInputs;

  /** Graph context */
  readonly graphContext: RuleGraphContext;

  /** Session context (if in active session) */
  readonly sessionContext: RuleSessionContext | null;
}

/**
 * Feature inputs for rule computation
 */
export interface RuleFeatureInputs {
  /** Latest attempt features (if any) */
  readonly latestAttempt: AttemptFeatures | null;

  /** Recent attempt features (last N) */
  readonly recentAttempts: readonly AttemptFeatures[];

  /** Latest session features */
  readonly latestSession: SessionFeatures | null;

  /** Aggregated statistics */
  readonly aggregates: FeatureAggregates;
}

/**
 * Pre-computed feature aggregates
 */
export interface FeatureAggregates {
  /** Total review count */
  readonly totalReviews: number;

  /** Success rate */
  readonly successRate: NormalizedValue;

  /** Average response time (ms) */
  readonly avgResponseTime: Duration;

  /** Response time variance */
  readonly responseTimeVariance: number;

  /** Lapses (forgotten after learned) */
  readonly lapses: number;

  /** Total hint usage */
  readonly totalHints: number;

  /** Hint dependency ratio */
  readonly hintDependency: NormalizedValue;

  /** Answer change frequency */
  readonly answerChangeRate: NormalizedValue;

  /** Outcome distribution */
  readonly outcomeDistribution: {
    readonly again: number;
    readonly hard: number;
    readonly good: number;
    readonly easy: number;
  };

  /** Days since last review */
  readonly daysSinceLastReview: number;

  /** Days since first introduction */
  readonly elapsedDays: number;

  /** Context count (unique sessions/decks) */
  readonly contextCount: number;
}

/**
 * Graph context for rule computation
 */
export interface RuleGraphContext {
  /** Prerequisite node IDs */
  readonly prerequisites: readonly NodeId[];

  /** Prerequisite mastery levels */
  readonly prerequisiteMasteryLevels: readonly {
    nodeId: NodeId;
    retrievability: NormalizedValue;
  }[];

  /** Frequently confused nodes */
  readonly confusions: readonly NodeId[];

  /** Confusion frequency counts */
  readonly confusionCounts: Readonly<Record<string, number>>;

  /** Linked strategies */
  readonly strategies: readonly NodeId[];

  /** Part-of relationships (for coverage) */
  readonly parts: readonly NodeId[];

  /** Part mastery levels (for coverage calculation) */
  readonly partMasteryLevels: readonly {
    nodeId: NodeId;
    retrievability: NormalizedValue;
  }[];

  /** Dependent nodes (nodes that require this one) */
  readonly dependents: readonly NodeId[];
}

/**
 * Session context for rule computation
 */
export interface RuleSessionContext {
  /** Current position in session */
  readonly positionInSession: number;

  /** Time since session start */
  readonly timeSinceSessionStart: Duration;

  /** Session duration so far */
  readonly sessionDuration: Duration;

  /** Interruption count */
  readonly interruptions: number;

  /** Cards reviewed in session */
  readonly cardsReviewed: number;

  /** Session accuracy so far */
  readonly sessionAccuracy: NormalizedValue;

  /** Pacing trend */
  readonly pacingTrend: "speeding_up" | "slowing_down" | "steady" | "erratic";
}

// =============================================================================
// RULE OUTPUT
// =============================================================================

/**
 * Output from a rule computation
 */
export interface RuleOutput {
  /** Rule ID that produced this output */
  readonly ruleId: RuleId;

  /** Rule version used */
  readonly ruleVersion: number;

  /** Partial state updates */
  readonly updates: Partial<{
    readonly memory: Partial<MemoryState>;
    readonly evidence: Partial<EvidenceAggregate>;
    readonly metacognition: Partial<MetacognitionState>;
    readonly forgetting: Partial<ForgettingState>;
    readonly generalization: Partial<GeneralizationState>;
    readonly cognitiveLoad: Partial<CognitiveLoadState>;
    readonly affect: Partial<AffectState>;
    readonly trust: Partial<TrustState>;
  }>;

  /** Confidence in these updates */
  readonly confidence: Confidence;

  /** Explanation for audit */
  readonly explanation: string;

  /** Whether this rule was skipped (with reason) */
  readonly skipped?: { reason: string };
}

// =============================================================================
// UPDATE RULE INTERFACE
// =============================================================================

/**
 * An update rule that computes partial mastery state updates
 */
export interface UpdateRule {
  /** Rule metadata */
  readonly metadata: RuleMetadata;

  /**
   * Check if this rule applies to the given context
   */
  applies(context: RuleContext): boolean;

  /**
   * Compute the update for the given context
   * Must be deterministic and side-effect free
   */
  compute(context: RuleContext): RuleOutput;
}

// =============================================================================
// RULE REGISTRY INTERFACE
// =============================================================================

/**
 * Registry for managing update rules
 */
export interface RuleRegistry {
  /**
   * Register a new rule
   */
  register(rule: UpdateRule): void;

  /**
   * Unregister a rule
   */
  unregister(ruleId: RuleId): boolean;

  /**
   * Get a rule by ID
   */
  getRule(ruleId: RuleId): UpdateRule | null;

  /**
   * Get all registered rules
   */
  getAllRules(): readonly UpdateRule[];

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): readonly UpdateRule[];

  /**
   * Get rules applicable to a granularity
   */
  getRulesForGranularity(
    granularity: MasteryGranularity,
  ): readonly UpdateRule[];

  /**
   * Get active rules in priority order
   */
  getActiveRules(): readonly UpdateRule[];

  /**
   * Get rule metadata (without implementation)
   */
  getRuleMetadata(ruleId: RuleId): RuleMetadata | null;

  /**
   * Get all rule metadata
   */
  getAllRuleMetadata(): readonly RuleMetadata[];

  /**
   * Check if a rule exists
   */
  hasRule(ruleId: RuleId): boolean;

  /**
   * Get rule version
   */
  getRuleVersion(ruleId: RuleId): number | null;

  /**
   * Get rule count
   */
  getRuleCount(): number;
}

// =============================================================================
// DEFAULT RULE REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * In-memory implementation of RuleRegistry
 */
export class DefaultRuleRegistry implements RuleRegistry {
  private readonly rules: Map<RuleId, UpdateRule> = new Map();

  register(rule: UpdateRule): void {
    if (this.rules.has(rule.metadata.id)) {
      throw new Error(
        `Rule with ID "${rule.metadata.id}" is already registered`,
      );
    }
    this.rules.set(rule.metadata.id, rule);
  }

  unregister(ruleId: RuleId): boolean {
    return this.rules.delete(ruleId);
  }

  getRule(ruleId: RuleId): UpdateRule | null {
    return this.rules.get(ruleId) ?? null;
  }

  getAllRules(): readonly UpdateRule[] {
    return Array.from(this.rules.values());
  }

  getRulesByCategory(category: RuleCategory): readonly UpdateRule[] {
    return Array.from(this.rules.values()).filter(
      (r) => r.metadata.category === category,
    );
  }

  getRulesForGranularity(
    granularity: MasteryGranularity,
  ): readonly UpdateRule[] {
    return Array.from(this.rules.values()).filter((r) =>
      r.metadata.applicableGranularities.includes(granularity),
    );
  }

  getActiveRules(): readonly UpdateRule[] {
    return Array.from(this.rules.values())
      .filter((r) => r.metadata.isActive)
      .sort((a, b) => b.metadata.priority - a.metadata.priority);
  }

  getRuleMetadata(ruleId: RuleId): RuleMetadata | null {
    const rule = this.rules.get(ruleId);
    return rule?.metadata ?? null;
  }

  getAllRuleMetadata(): readonly RuleMetadata[] {
    return Array.from(this.rules.values()).map((r) => r.metadata);
  }

  hasRule(ruleId: RuleId): boolean {
    return this.rules.has(ruleId);
  }

  getRuleVersion(ruleId: RuleId): number | null {
    const rule = this.rules.get(ruleId);
    return rule?.metadata.version ?? null;
  }

  getRuleCount(): number {
    return this.rules.size;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new rule registry with optional initial rules
 */
export function createRuleRegistry(
  initialRules?: readonly UpdateRule[],
): RuleRegistry {
  const registry = new DefaultRuleRegistry();
  if (initialRules) {
    for (const rule of initialRules) {
      registry.register(rule);
    }
  }
  return registry;
}
