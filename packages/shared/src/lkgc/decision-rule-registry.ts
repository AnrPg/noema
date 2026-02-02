// =============================================================================
// DECISION RULE REGISTRY - Rule Management for Decision Layer
// =============================================================================
// Manages decision rules for queue building, coaching, and gamification.
// Each rule:
// - Has a unique ID and version
// - Is deterministic and explainable
// - Can be traced for audit purposes
//
// Rules are heuristics; ML models can replace them later.
// =============================================================================

import type {
  Timestamp,
  Confidence,
  NormalizedValue,
  NodeId,
} from "../types/lkgc/foundation";
import type { MasteryState } from "../types/lkgc/mastery";
import type {
  DecisionRuleId,
  DecisionConstraints,
  DecisionContext,
  CoachingInterventionType,
  GameHookType,
  PlanRationale,
  RationaleFactor,
} from "./decision-types";

// =============================================================================
// DECISION RULE CATEGORIES
// =============================================================================

/**
 * Categories of decision rules
 */
export type DecisionRuleCategory =
  | "queue_selection" // Which items to include
  | "queue_priority" // How to order items
  | "queue_interleaving" // How to space items
  | "coaching_selection" // Which interventions to show
  | "coaching_timing" // When to show interventions
  | "gamification_selection" // Which hooks to activate
  | "gamification_parameters"; // Hook difficulty/duration

// =============================================================================
// DECISION RULE METADATA
// =============================================================================

/**
 * Metadata for a decision rule
 */
export interface DecisionRuleMetadata {
  /** Unique rule identifier */
  readonly id: DecisionRuleId;

  /** Human-readable name */
  readonly name: string;

  /** Detailed description */
  readonly description: string;

  /** Rule category */
  readonly category: DecisionRuleCategory;

  /** Version number */
  readonly version: number;

  /** When this rule was added */
  readonly addedAt: Timestamp;

  /** Whether this rule is active */
  readonly isActive: boolean;

  /** Rule priority (higher = evaluated first) */
  readonly priority: number;

  /** Tags for filtering */
  readonly tags: readonly string[];
}

// =============================================================================
// DECISION RULE CONTEXT - Input to rules
// =============================================================================

/**
 * Context for item selection rules
 */
export interface ItemSelectionContext {
  /** Node ID being evaluated */
  readonly nodeId: NodeId;

  /** Mastery state for this node */
  readonly masteryState: MasteryState;

  /** Current timestamp */
  readonly now: Timestamp;

  /** Decision constraints */
  readonly constraints: DecisionConstraints;

  /** Decision context */
  readonly context: DecisionContext;

  /** Graph relations */
  readonly graphContext: ItemGraphContext;
}

/**
 * Graph context for an item
 */
export interface ItemGraphContext {
  /** Prerequisites for this item */
  readonly prerequisites: readonly NodeId[];

  /** Items that depend on this one */
  readonly dependents: readonly NodeId[];

  /** Items frequently confused with this one */
  readonly confusions: readonly NodeId[];

  /** Related strategies */
  readonly strategies: readonly NodeId[];

  /** Goal this item is linked to */
  readonly linkedGoals: readonly NodeId[];

  /** Deck/topic this item belongs to */
  readonly deckId?: NodeId;

  /** Parent concept (if any) */
  readonly parentConcept?: NodeId;
}

/**
 * Context for coaching rules
 */
export interface CoachingContext {
  /** Current timestamp */
  readonly now: Timestamp;

  /** Decision constraints */
  readonly constraints: DecisionConstraints;

  /** Decision context */
  readonly context: DecisionContext;

  /** User's aggregate mastery state */
  readonly aggregateMastery: AggregateMasteryMetrics;

  /** Queue being built */
  readonly queueItems: readonly {
    nodeId: NodeId;
    masteryState: MasteryState;
  }[];

  /** Recent session history */
  readonly recentHistory: RecentSessionHistory;
}

/**
 * Aggregate mastery metrics across all items
 */
export interface AggregateMasteryMetrics {
  /** Average retrievability */
  readonly avgRetrievability: NormalizedValue;

  /** Average calibration bias */
  readonly avgCalibrationBias: number;

  /** Strategy diversity score */
  readonly strategyDiversity: NormalizedValue;

  /** Reflection completion rate */
  readonly reflectionRate: NormalizedValue;

  /** Average frustration */
  readonly avgFrustration: NormalizedValue;

  /** Average flow */
  readonly avgFlow: NormalizedValue;

  /** Items with high interference */
  readonly highInterferenceCount: number;

  /** Overdue item count */
  readonly overdueCount: number;
}

/**
 * Recent session history for coaching decisions
 */
export interface RecentSessionHistory {
  /** Sessions in last 7 days */
  readonly sessionsLast7Days: number;

  /** Average session duration */
  readonly avgSessionDuration: Duration;

  /** Average accuracy last 7 days */
  readonly avgAccuracyLast7Days: NormalizedValue;

  /** Reflection count last 7 days */
  readonly reflectionsLast7Days: number;

  /** Days since last reflection */
  readonly daysSinceLastReflection: number;

  /** Current daily streak */
  readonly currentStreak: number;

  /** Mistakes in last session */
  readonly mistakesLastSession: number;
}

import type { Duration } from "../types/lkgc/foundation";

/**
 * Context for gamification rules
 */
export interface GamificationContext {
  /** Current timestamp */
  readonly now: Timestamp;

  /** Decision constraints */
  readonly constraints: DecisionConstraints;

  /** Decision context */
  readonly context: DecisionContext;

  /** User's aggregate mastery state */
  readonly aggregateMastery: AggregateMasteryMetrics;

  /** Active hooks */
  readonly activeHooks: readonly ActiveHookState[];

  /** Completed hooks */
  readonly completedHooks: readonly CompletedHookState[];

  /** Recent session history */
  readonly recentHistory: RecentSessionHistory;
}

/**
 * State of an active hook
 */
export interface ActiveHookState {
  readonly hookId: string;
  readonly type: GameHookType;
  readonly startedAt: Timestamp;
  readonly progress: number;
  readonly target: number;
}

/**
 * State of a completed hook
 */
export interface CompletedHookState {
  readonly hookId: string;
  readonly type: GameHookType;
  readonly completedAt: Timestamp;
  readonly success: boolean;
}

// =============================================================================
// DECISION RULE OUTPUTS
// =============================================================================

/**
 * Output from an item selection rule
 */
export interface ItemSelectionOutput {
  /** Whether to include this item */
  readonly include: boolean;

  /** Reason for inclusion/exclusion */
  readonly reason: string;

  /** Confidence in decision */
  readonly confidence: Confidence;
}

/**
 * Output from a priority scoring rule
 */
export interface PriorityScoringOutput {
  /** Score contribution */
  readonly score: number;

  /** Factor name */
  readonly factorName: string;

  /** Weight to use */
  readonly weight: number;

  /** Explanation */
  readonly explanation: string;
}

/**
 * Output from a coaching rule
 */
export interface CoachingOutput {
  /** Whether to show an intervention */
  readonly showIntervention: boolean;

  /** Intervention type (if showing) */
  readonly interventionType?: CoachingInterventionType;

  /** Prompt text */
  readonly promptText?: string;

  /** Priority */
  readonly priority: number;

  /** Rationale */
  readonly rationale: string;
}

/**
 * Output from a gamification rule
 */
export interface GamificationOutput {
  /** Whether to activate a hook */
  readonly activateHook: boolean;

  /** Hook type (if activating) */
  readonly hookType?: GameHookType;

  /** Hook title */
  readonly title?: string;

  /** Hook parameters */
  readonly parameters?: Record<string, unknown>;

  /** Rationale */
  readonly rationale: string;
}

// =============================================================================
// DECISION RULE INTERFACE
// =============================================================================

/**
 * Base interface for all decision rules
 */
export interface DecisionRule<TContext, TOutput> {
  /** Rule metadata */
  readonly metadata: DecisionRuleMetadata;

  /** Check if this rule applies to the given context */
  applies(context: TContext): boolean;

  /** Compute the rule output */
  compute(context: TContext): TOutput;
}

/**
 * Item selection rule
 */
export type ItemSelectionRule = DecisionRule<
  ItemSelectionContext,
  ItemSelectionOutput
>;

/**
 * Priority scoring rule
 */
export type PriorityScoringRule = DecisionRule<
  ItemSelectionContext,
  PriorityScoringOutput
>;

/**
 * Coaching rule
 */
export type CoachingRule = DecisionRule<CoachingContext, CoachingOutput>;

/**
 * Gamification rule
 */
export type GamificationRule = DecisionRule<
  GamificationContext,
  GamificationOutput
>;

// =============================================================================
// DECISION RULE REGISTRY
// =============================================================================

/**
 * Registry for decision rules
 */
export interface DecisionRuleRegistry {
  // Registration
  registerItemSelectionRule(rule: ItemSelectionRule): void;
  registerPriorityScoringRule(rule: PriorityScoringRule): void;
  registerCoachingRule(rule: CoachingRule): void;
  registerGamificationRule(rule: GamificationRule): void;

  // Retrieval
  getItemSelectionRules(): readonly ItemSelectionRule[];
  getPriorityScoringRules(): readonly PriorityScoringRule[];
  getCoachingRules(): readonly CoachingRule[];
  getGamificationRules(): readonly GamificationRule[];

  // By ID
  getRule(id: DecisionRuleId): DecisionRule<unknown, unknown> | undefined;

  // Metadata
  getAllRuleMetadata(): readonly DecisionRuleMetadata[];
  getRuleVersions(): Readonly<Record<string, number>>;

  // Activation
  activateRule(id: DecisionRuleId): void;
  deactivateRule(id: DecisionRuleId): void;
}

// =============================================================================
// IN-MEMORY DECISION RULE REGISTRY
// =============================================================================

/**
 * In-memory implementation of DecisionRuleRegistry
 */
export class InMemoryDecisionRuleRegistry implements DecisionRuleRegistry {
  private readonly itemSelectionRules: Map<DecisionRuleId, ItemSelectionRule> =
    new Map();
  private readonly priorityScoringRules: Map<
    DecisionRuleId,
    PriorityScoringRule
  > = new Map();
  private readonly coachingRules: Map<DecisionRuleId, CoachingRule> = new Map();
  private readonly gamificationRules: Map<DecisionRuleId, GamificationRule> =
    new Map();
  private readonly activeRules: Set<DecisionRuleId> = new Set();

  registerItemSelectionRule(rule: ItemSelectionRule): void {
    this.itemSelectionRules.set(rule.metadata.id, rule);
    if (rule.metadata.isActive) {
      this.activeRules.add(rule.metadata.id);
    }
  }

  registerPriorityScoringRule(rule: PriorityScoringRule): void {
    this.priorityScoringRules.set(rule.metadata.id, rule);
    if (rule.metadata.isActive) {
      this.activeRules.add(rule.metadata.id);
    }
  }

  registerCoachingRule(rule: CoachingRule): void {
    this.coachingRules.set(rule.metadata.id, rule);
    if (rule.metadata.isActive) {
      this.activeRules.add(rule.metadata.id);
    }
  }

  registerGamificationRule(rule: GamificationRule): void {
    this.gamificationRules.set(rule.metadata.id, rule);
    if (rule.metadata.isActive) {
      this.activeRules.add(rule.metadata.id);
    }
  }

  getItemSelectionRules(): readonly ItemSelectionRule[] {
    return this.getSortedActiveRules(this.itemSelectionRules);
  }

  getPriorityScoringRules(): readonly PriorityScoringRule[] {
    return this.getSortedActiveRules(this.priorityScoringRules);
  }

  getCoachingRules(): readonly CoachingRule[] {
    return this.getSortedActiveRules(this.coachingRules);
  }

  getGamificationRules(): readonly GamificationRule[] {
    return this.getSortedActiveRules(this.gamificationRules);
  }

  getRule(id: DecisionRuleId): DecisionRule<unknown, unknown> | undefined {
    return (
      this.itemSelectionRules.get(id) ||
      this.priorityScoringRules.get(id) ||
      this.coachingRules.get(id) ||
      this.gamificationRules.get(id)
    );
  }

  getAllRuleMetadata(): readonly DecisionRuleMetadata[] {
    const all: DecisionRuleMetadata[] = [];
    for (const rule of this.itemSelectionRules.values()) {
      all.push(rule.metadata);
    }
    for (const rule of this.priorityScoringRules.values()) {
      all.push(rule.metadata);
    }
    for (const rule of this.coachingRules.values()) {
      all.push(rule.metadata);
    }
    for (const rule of this.gamificationRules.values()) {
      all.push(rule.metadata);
    }
    return all;
  }

  getRuleVersions(): Readonly<Record<string, number>> {
    const versions: Record<string, number> = {};
    for (const meta of this.getAllRuleMetadata()) {
      versions[meta.id] = meta.version;
    }
    return versions;
  }

  activateRule(id: DecisionRuleId): void {
    this.activeRules.add(id);
  }

  deactivateRule(id: DecisionRuleId): void {
    this.activeRules.delete(id);
  }

  private getSortedActiveRules<T extends DecisionRule<unknown, unknown>>(
    rules: Map<DecisionRuleId, T>,
  ): readonly T[] {
    return Array.from(rules.values())
      .filter((r) => this.activeRules.has(r.metadata.id))
      .sort((a, b) => b.metadata.priority - a.metadata.priority);
  }
}

// =============================================================================
// RATIONALE BUILDER - Helper for building rationales
// =============================================================================

/**
 * Builder for creating decision rationales
 */
export class RationaleBuilder {
  private factors: RationaleFactor[] = [];
  private rules: {
    ruleId: DecisionRuleId;
    version: number;
    matched: boolean;
    output?: unknown;
  }[] = [];
  private counterfactuals: {
    condition: string;
    consequence: string;
    proximity: NormalizedValue;
  }[] = [];
  private summary = "";

  withSummary(summary: string): this {
    this.summary = summary;
    return this;
  }

  addFactor(
    name: string,
    value: number | string | boolean,
    sourceField: string,
    weight: number,
    contribution: number,
    explanation: string,
  ): this {
    this.factors.push({
      name,
      value,
      sourceField,
      weight,
      contribution,
      explanation,
    });
    return this;
  }

  addRule(
    ruleId: DecisionRuleId,
    version: number,
    matched: boolean,
    output?: unknown,
  ): this {
    this.rules.push({ ruleId, version, matched, output });
    return this;
  }

  addCounterfactual(
    condition: string,
    consequence?: string,
    proximity?: NormalizedValue,
  ): this {
    this.counterfactuals.push({
      condition,
      consequence: consequence || "outcome would differ",
      proximity: proximity || (0.5 as NormalizedValue),
    });
    return this;
  }

  build(confidence: Confidence): PlanRationale {
    return {
      rationaleId:
        `rat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` as import("./decision-types").RationaleId,
      summary: this.summary,
      topFactors: [...this.factors]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 5),
      rulesApplied: this.rules.map((r) => ({
        ruleId: r.ruleId,
        version: r.version,
        matched: r.matched,
        output: r.output,
      })),
      counterfactuals: this.counterfactuals,
      confidence,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new decision rule registry
 */
export function createDecisionRuleRegistry(): DecisionRuleRegistry {
  return new InMemoryDecisionRuleRegistry();
}
