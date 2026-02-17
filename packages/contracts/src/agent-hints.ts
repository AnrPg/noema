/**
 * @noema/contracts - AgentHints v2.0.0
 *
 * The AgentHints structure is returned by all tools and APIs
 * to guide agents on what to do next. This is a CORE contract.
 *
 * @version 2.0.0
 */

import type { Metadata } from '@noema/types';

// ============================================================================
// Enumerations
// ============================================================================

/**
 * Priority levels for suggested actions.
 */
export const ActionPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ActionPriority = (typeof ActionPriority)[keyof typeof ActionPriority];

/**
 * Categories for suggested actions.
 */
export const ActionCategory = {
  EXPLORATION: 'exploration',
  OPTIMIZATION: 'optimization',
  CORRECTION: 'correction',
  LEARNING: 'learning',
} as const;

export type ActionCategory = (typeof ActionCategory)[keyof typeof ActionCategory];

/**
 * Source quality indicator.
 */
export const SourceQuality = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unknown',
} as const;

export type SourceQuality = (typeof SourceQuality)[keyof typeof SourceQuality];

/**
 * Validity period for hints.
 */
export const ValidityPeriod = {
  IMMEDIATE: 'immediate',
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  INDEFINITE: 'indefinite',
} as const;

export type ValidityPeriod = (typeof ValidityPeriod)[keyof typeof ValidityPeriod];

/**
 * Risk factor types.
 */
export const RiskType = {
  PERFORMANCE: 'performance',
  ACCURACY: 'accuracy',
  COST: 'cost',
  COMPLEXITY: 'complexity',
  USER_EXPERIENCE: 'user-experience',
} as const;

export type RiskType = (typeof RiskType)[keyof typeof RiskType];

/**
 * Risk severity levels.
 */
export const RiskSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

/**
 * Dependency types.
 */
export const DependencyType = {
  REQUIRED: 'required',
  RECOMMENDED: 'recommended',
  OPTIONAL: 'optional',
} as const;

export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];

/**
 * Preference alignment levels.
 */
export const AlignmentLevel = {
  STRONG: 'strong',
  MODERATE: 'moderate',
  WEAK: 'weak',
  NEUTRAL: 'neutral',
  CONFLICT: 'conflict',
} as const;

export type AlignmentLevel = (typeof AlignmentLevel)[keyof typeof AlignmentLevel];

/**
 * Warning types.
 */
export const WarningType = {
  VALIDATION: 'validation',
  DUPLICATE: 'duplicate',
  CONFLICT: 'conflict',
  DEPRECATION: 'deprecation',
  PERFORMANCE: 'performance',
} as const;

export type WarningType = (typeof WarningType)[keyof typeof WarningType];

/**
 * Warning severity.
 */
export const WarningSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type WarningSeverity = (typeof WarningSeverity)[keyof typeof WarningSeverity];

// ============================================================================
// Suggested Action
// ============================================================================

/**
 * A suggested next action for the agent.
 */
export interface SuggestedAction {
  /** Action identifier (kebab-case) */
  action: string;

  /** Priority level */
  priority: ActionPriority;

  /** Action-specific data */
  data?: Metadata;

  /** Human-readable description */
  description?: string;

  /** Estimated execution time in ms */
  estimatedTime?: number;

  /** Estimated cost (arbitrary units) */
  estimatedCost?: number;

  /** Action category */
  category?: ActionCategory;

  /** Actions that must complete first */
  prerequisites?: string[];

  /** What will happen if executed */
  expectedOutcome?: string;

  /** Can this action be undone? */
  reversible?: boolean;

  /** Confidence in this specific action (0-1) */
  confidence?: number;
}

// ============================================================================
// Related Resource
// ============================================================================

/**
 * Resource metadata for related resources.
 */
export interface ResourceMetadata {
  category?: string;
  lastAccessed?: string;
  accessCount?: number;
  quality?: number;
  freshness?: number;
}

/**
 * A related resource that may be useful.
 */
export interface RelatedResource {
  /** Resource type */
  type: string;

  /** Resource identifier */
  id: string;

  /** Display name */
  label: string;

  /** Relevance score (0.0 to 1.0) */
  relevance: number;

  /** Additional metadata */
  metadata?: ResourceMetadata;
}

// ============================================================================
// Risk Factor
// ============================================================================

/**
 * A potential risk associated with the suggestions.
 */
export interface RiskFactor {
  /** Risk type */
  type: RiskType;

  /** Severity level */
  severity: RiskSeverity;

  /** Description of the risk */
  description: string;

  /** Probability (0.0 to 1.0) */
  probability: number;

  /** Impact (0.0 to 1.0) */
  impact: number;

  /** How to mitigate */
  mitigation?: string;
}

// ============================================================================
// Action Dependency
// ============================================================================

/**
 * Dependency between actions.
 */
export interface ActionDependency {
  /** The dependent action */
  action: string;

  /** Actions it depends on */
  dependsOn: string[];

  /** Dependency type */
  type: DependencyType;

  /** Why this dependency exists */
  reason?: string;
}

// ============================================================================
// Estimated Impact
// ============================================================================

/**
 * Expected impact if suggestions are followed.
 */
export interface EstimatedImpact {
  /** Benefit score (0.0 to 1.0) */
  benefit: number;

  /** Effort required (0.0 to 1.0) */
  effort: number;

  /** Return on investment (benefit/effort) */
  roi: number;

  /** Specific metrics affected */
  affectedMetrics?: string[];
}

// ============================================================================
// Preference Alignment
// ============================================================================

/**
 * How a suggestion aligns with user preferences.
 */
export interface PreferenceAlignment {
  /** Which action this applies to */
  action: string;

  /** Which preference it aligns with */
  preference: string;

  /** Alignment level */
  alignment: AlignmentLevel;

  /** Alignment score (-1.0 to 1.0) */
  score: number;

  /** Explanation */
  explanation?: string;
}

// ============================================================================
// Warning
// ============================================================================

/**
 * Warning about potential issues.
 */
export interface Warning {
  /** Warning type */
  type: WarningType;

  /** Severity level */
  severity: WarningSeverity;

  /** Human-readable message */
  message: string;

  /** Related entity IDs */
  relatedIds?: string[];

  /** How to fix */
  suggestedFix?: string;

  /** Can be fixed automatically? */
  autoFixable?: boolean;
}

// ============================================================================
// Alternative
// ============================================================================

/**
 * Alternative approach that was considered.
 */
export interface Alternative {
  /** Description of alternative */
  approach: string;

  /** Confidence in alternative (0.0 to 1.0) */
  confidence: number;

  /** Why this alternative exists */
  reasoning: string;

  /** Advantages */
  pros?: string[];

  /** Disadvantages */
  cons?: string[];

  /** Impact score (0.0 to 1.0) */
  estimatedImpact?: number;
}

// ============================================================================
// Hints Metadata
// ============================================================================

/**
 * Metadata about hint generation.
 */
export interface HintsMetadata {
  /** When hints were generated */
  generatedAt: string;

  /** Service/agent that generated hints */
  generatedBy: string;

  /** AI model version (if AI-generated) */
  modelVersion?: string;

  /** Processing time in ms */
  processingTime?: number;
}

// ============================================================================
// AgentHints v2.0.0
// ============================================================================

/**
 * AgentHints v2.0.0 - Enhanced hints for agent guidance.
 *
 * All APIs and tools MUST return this structure to guide
 * agents on what to do next.
 *
 * @version 2.0.0
 */
export interface AgentHints {
  // ========== REQUIRED CORE FIELDS (8) ==========

  /** Suggested next actions (can be empty array) */
  suggestedNextActions: SuggestedAction[];

  /** Related resources (can be empty array) */
  relatedResources: RelatedResource[];

  /** Overall confidence (0.0 to 1.0) */
  confidence: number;

  /** Source quality indicator */
  sourceQuality: SourceQuality;

  /** How long hints remain valid */
  validityPeriod: ValidityPeriod;

  /** Additional context that would improve hints (can be empty) */
  contextNeeded: string[];

  /** Assumptions made when generating hints (can be empty) */
  assumptions: string[];

  /** Risk factors (can be empty array) */
  riskFactors: RiskFactor[];

  /** Action dependencies (can be empty array) */
  dependencies: ActionDependency[];

  /** Expected impact if suggestions followed */
  estimatedImpact: EstimatedImpact;

  /** How suggestions align with preferences (can be empty) */
  preferenceAlignment: PreferenceAlignment[];

  // ========== OPTIONAL FIELDS (Strongly Recommended) ==========

  /** Plain English explanation of hints */
  reasoning?: string;

  /** Potential issues and warnings */
  warnings?: Warning[];

  /** Alternative approaches considered */
  alternatives?: Alternative[];

  /** Limitations on the suggestions */
  constraints?: string[];

  /** Generation metadata */
  metadata?: HintsMetadata;
}

// ============================================================================
// Factory for Empty AgentHints
// ============================================================================

/**
 * Create minimal valid AgentHints (all required fields with empty/default values).
 */
export function createEmptyAgentHints(): AgentHints {
  return {
    suggestedNextActions: [],
    relatedResources: [],
    confidence: 0,
    sourceQuality: SourceQuality.UNKNOWN,
    validityPeriod: ValidityPeriod.IMMEDIATE,
    contextNeeded: [],
    assumptions: [],
    riskFactors: [],
    dependencies: [],
    estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
    preferenceAlignment: [],
  };
}
