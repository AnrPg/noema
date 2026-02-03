// =============================================================================
// FACE RESOLUTION ENGINE - MODULE EXPORTS
// =============================================================================
// Phase 6B: Face Resolution Engine (Logic Core)
//
// This module provides the Face Resolution Engine for determining which
// face to present for a card given the context.
// =============================================================================

// Types
export type {
  // Input types
  FaceResolutionInput,
  CardFaceWithRules,
  CategoryLensContext,
  ParticipationContext,
  ModeContext,
  LkgcSignalsContext,
  UserPreferencesContext,
  TemporalContext,
  ResolutionOptions,

  // Output types
  FaceResolutionOutput,
  ScaffoldingDirectives,
  RenderingDirectives,
  EmphasisDirective,
  ContentRegionHighlight,
  ContextIndicator,

  // Explainability types
  FaceResolutionExplainability,
  FaceResolutionFactor,
  FaceResolutionFactorType,
  MatchedRuleExplanation,
  UnmatchedRuleExplanation,
  ConditionMatchExplanation,
  ConditionFailureExplanation,
  AlternativeFaceExplanation,
  ResolutionContextSnapshot,

  // Plugin types
  ResolutionRulePlugin,
  CustomConditionTypeDefinition,
  ConditionEvaluator,
  ConditionEvaluationResult,
  FaceScorer,
  FaceScoringResult,
  ScoreComponent,
  NamedFaceScorer,

  // Registry types
  ConditionEvaluatorRegistry,
  FaceScorerRegistry,

  // Configuration types
  FaceResolutionEngineConfig,
  ScaffoldingAdjustmentConfig,
  ResolutionCacheConfig,

  // Event types
  FaceResolvedEvent,
  FaceResolutionFailedEvent,
  PluginRuleEvaluatedEvent,
  FaceResolutionEvent,

  // Engine interface
  IFaceResolutionEngine,
  FaceResolutionInputBuilder as IFaceResolutionInputBuilder,

  // Identifiers
  ResolutionRequestId,
  ResolutionRulePluginId,
  FaceResolutionTraceId,
} from "../../types/face-resolution.types";

// Constants
export {
  DEFAULT_RESOLUTION_CONFIG,
  DEPTH_LEVEL_ORDER,
} from "../../types/face-resolution.types";

// Engine implementation
export {
  FaceResolutionEngine,
  createFaceResolutionEngine,
  FaceResolutionInputBuilder,
  buildResolutionInput,
} from "./face-resolution-engine";

// Condition evaluators
export {
  evaluateCategoryCondition,
  evaluateRoleCondition,
  evaluateModeCondition,
  evaluateDepthCondition,
  evaluateIntentCondition,
  evaluateLkgcSignalCondition,
  evaluateUserPreferenceCondition,
  evaluateTemporalCondition,
  evaluateCustomCondition,
  createCompositeEvaluator,
  buildDefaultEvaluatorRegistry,
  evaluateConditionSet,
} from "./condition-evaluators";
