// =============================================================================
// LEARNING MODE SERVICE TYPES
// =============================================================================
// Internal types for the Mode Runtime service.
// These extend the shared types with service-specific concerns.
// =============================================================================

import type {
  LearningModeId,
  ModeSessionId,
  ModeDefinition,
  ModeActivation,
  ModeRuntimeState,
  RankedCandidateList,
  ReviewCandidate,
  NavigationSuggestion,
  LkgcSignalSnapshot,
  ModePolicyContext,
  ReviewCandidateInput,
} from "@manthanein/shared";

// =============================================================================
// SERVICE INPUT/OUTPUT TYPES
// =============================================================================

/**
 * Input for activating a mode
 */
export interface ActivateModeInput {
  userId: string;
  modeId: LearningModeId;
  scope: "global" | "category" | "session";
  categoryId?: string;
  sessionId?: ModeSessionId;
  parameterOverrides?: Record<string, unknown>;
}

/**
 * Result of mode activation
 */
export interface ActivateModeResult {
  success: boolean;
  activation?: ModeActivation;
  previousActivation?: ModeActivation;
  error?: string;
}

/**
 * Input for creating a mode session
 */
export interface CreateModeSessionInput {
  userId: string;
  modeId: LearningModeId;
  parameterOverrides?: Record<string, unknown>;
  categoryId?: string;
  timeBudgetMinutes?: number;
}

/**
 * Input for ending a mode session
 */
export interface EndModeSessionInput {
  userId: string;
  sessionId: ModeSessionId;
  status?: "completed" | "abandoned";
}

/**
 * Input for getting the active mode runtime
 */
export interface GetModeRuntimeInput {
  userId: string;
  categoryId?: string;
  sessionId?: ModeSessionId;
}

/**
 * Input for generating ranked candidates
 */
export interface GenerateRankedCandidatesInput {
  userId: string;
  modeRuntimeState: ModeRuntimeState;
  availableCandidates: readonly ReviewCandidateInput[];
  timeBudget?: number;
  categoryFilter?: string;
  maxResults?: number;
}

/**
 * Result of ranked candidate generation
 */
export interface GenerateRankedCandidatesResult {
  success: boolean;
  rankedList?: RankedCandidateList;
  error?: string;
  generationTimeMs?: number;
}

/**
 * Input for creating an explainability trace
 */
export interface CreateExplainabilityTraceInput {
  userId: string;
  subjectType:
    | "card"
    | "category"
    | "navigation_suggestion"
    | "review_candidate"
    | "synthesis_prompt"
    | "mode_switch";
  subjectId: string;
  modeId: LearningModeId;
  parametersUsed: Record<string, unknown>;
  factors: ExplainabilityFactorInput[];
  summary: string;
  detailedExplanation?: string;
  suggestedActions?: ExplainabilitySuggestedActionInput[];
  ttlMs?: number;
}

/**
 * Simplified factor input for creating traces
 */
export interface ExplainabilityFactorInput {
  id: string;
  name: string;
  description: string;
  weight: number;
  value: number;
  contribution: number;
  lkgcSignal?: string;
  modeSpecific: boolean;
  visualHint?: "positive" | "negative" | "neutral" | "warning";
}

/**
 * Simplified action input for creating traces
 */
export interface ExplainabilitySuggestedActionInput {
  id: string;
  label: string;
  description: string;
  actionType: "switch_mode" | "adjust_parameter" | "navigate" | "dismiss";
  actionPayload: Record<string, unknown>;
}

/**
 * Input for saving a parameter preset
 */
export interface SaveParameterPresetInput {
  userId: string;
  modeId: LearningModeId;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  isDefault?: boolean;
}

/**
 * Input for updating user mode preferences
 */
export interface UpdateModePreferencesInput {
  userId: string;
  defaultModeId?: LearningModeId;
  defaultParameters?: Record<string, unknown>;
  addToFavorites?: LearningModeId;
  removeFromFavorites?: LearningModeId;
}

/**
 * Input for setting category mode default
 */
export interface SetCategoryModeDefaultInput {
  userId: string;
  categoryId: string;
  modeId: LearningModeId;
  parameterOverrides?: Record<string, unknown>;
}

/**
 * Input for updating category scheduling metadata
 */
export interface UpdateCategorySchedulingInput {
  userId: string;
  categoryId: string;
  difficultyMultiplier?: number;
  targetStability?: number;
  decayModel?: "fsrs" | "hlr" | "exponential" | "power_law" | "custom";
  customDecayParams?: Record<string, number>;
  interferenceGroupIds?: string[];
  interferenceSpacingHours?: number;
  targetMasteryDate?: Date;
  targetMasteryLevel?: number;
  dailyAllocation?: number;
  modeOverrides?: Record<string, Record<string, unknown>>;
}

// =============================================================================
// SERVICE HOOK INTERFACES
// =============================================================================

/**
 * Hooks for extending mode runtime behavior
 * These allow plugin integration and customization
 */
export interface ModeRuntimeHooks {
  /**
   * Called before mode activation
   * Return false to prevent activation
   */
  beforeActivation?: (input: ActivateModeInput) => Promise<boolean>;

  /**
   * Called after mode activation
   */
  afterActivation?: (activation: ModeActivation) => Promise<void>;

  /**
   * Called before generating ranked candidates
   * Can modify the input
   */
  beforeCandidateGeneration?: (
    input: GenerateRankedCandidatesInput,
  ) => Promise<GenerateRankedCandidatesInput>;

  /**
   * Called after generating ranked candidates
   * Can modify the output
   */
  afterCandidateGeneration?: (
    result: RankedCandidateList,
    context: ModePolicyContext,
  ) => Promise<RankedCandidateList>;

  /**
   * Called to get custom LKGC signals
   */
  getLkgcSignals?: (
    userId: string,
    cardIds?: string[],
  ) => Promise<LkgcSignalSnapshot>;

  /**
   * Called to provide custom navigation suggestions
   */
  generateNavigationSuggestions?: (
    context: ModePolicyContext,
  ) => Promise<readonly NavigationSuggestion[]>;

  /**
   * Called to provide custom review candidate scoring
   */
  scoreReviewCandidates?: (
    candidates: readonly ReviewCandidateInput[],
    context: ModePolicyContext,
  ) => Promise<readonly ReviewCandidate[]>;
}

// =============================================================================
// BUILT-IN MODE DEFINITIONS
// =============================================================================

/**
 * Factory for creating built-in mode definitions
 */
export interface BuiltInModeFactory {
  /**
   * Create the Exploration mode definition
   */
  createExplorationMode(): ModeDefinition;

  /**
   * Create the Goal-Driven mode definition
   */
  createGoalDrivenMode(): ModeDefinition;

  /**
   * Create the Exam-Oriented mode definition
   */
  createExamOrientedMode(): ModeDefinition;

  /**
   * Create the Synthesis mode definition
   */
  createSynthesisMode(): ModeDefinition;

  /**
   * Get all built-in mode definitions
   */
  getAllBuiltInModes(): ModeDefinition[];
}

// =============================================================================
// MODE RESOLUTION TYPES
// =============================================================================

/**
 * Resolved mode for a given context
 * Takes into account global, category, and session scopes
 */
export interface ResolvedMode {
  mode: ModeDefinition;
  activation: ModeActivation;
  resolvedParameters: Record<string, unknown>;
  scope: "global" | "category" | "session";
  resolutionPath: string[]; // e.g., ["session:abc", "category:xyz", "global"]
}

/**
 * Mode resolution options
 */
export interface ModeResolutionOptions {
  respectCategoryDefaults: boolean;
  respectSessionOverrides: boolean;
  fallbackToGlobal: boolean;
}

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/**
 * Configuration for the Mode Runtime service
 */
export interface ModeRuntimeConfig {
  /**
   * Whether to enable session overrides
   */
  enableSessionOverrides: boolean;

  /**
   * Whether to enable category defaults
   */
  enableCategoryDefaults: boolean;

  /**
   * Default TTL for explainability traces (ms)
   */
  defaultExplainabilityTtlMs: number;

  /**
   * Maximum candidates to return in ranked list
   */
  maxRankedCandidates: number;

  /**
   * Maximum navigation suggestions to return
   */
  maxNavigationSuggestions: number;

  /**
   * Whether to cache runtime state
   */
  enableRuntimeCaching: boolean;

  /**
   * Runtime cache TTL (ms)
   */
  runtimeCacheTtlMs: number;

  /**
   * Whether to seed built-in modes on startup
   */
  seedBuiltInModes: boolean;
}

/**
 * Default service configuration
 */
export const DEFAULT_MODE_RUNTIME_CONFIG: ModeRuntimeConfig = {
  enableSessionOverrides: true,
  enableCategoryDefaults: true,
  defaultExplainabilityTtlMs: 5 * 60 * 1000, // 5 minutes
  maxRankedCandidates: 100,
  maxNavigationSuggestions: 10,
  enableRuntimeCaching: true,
  runtimeCacheTtlMs: 60 * 1000, // 1 minute
  seedBuiltInModes: true,
};

// =============================================================================
// STATISTICS TYPES
// =============================================================================

/**
 * Statistics for mode usage
 */
export interface ModeUsageStatistics {
  userId: string;
  period: "day" | "week" | "month" | "all_time";
  modeUsage: Record<
    LearningModeId,
    {
      activationCount: number;
      totalTimeMinutes: number;
      cardsReviewed: number;
      averageSessionLengthMinutes: number;
    }
  >;
  mostUsedMode: LearningModeId;
  totalSessions: number;
  totalTimeMinutes: number;
}

/**
 * Statistics for explainability
 */
export interface ExplainabilityStatistics {
  userId: string;
  period: "day" | "week" | "month" | "all_time";
  tracesCreated: number;
  tracesViewed: number;
  mostCommonSubjectType: string;
  mostCommonFactors: Array<{ factorName: string; count: number }>;
  actionsFollowed: number;
}
