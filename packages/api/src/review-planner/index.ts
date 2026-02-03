// =============================================================================
// REVIEW PLANNER MODULE - Policy-Based Review Ranking
// =============================================================================
// Phase 5B-Final: Policy-Based Review Planner
//
// This module provides a composable policy system for ranking review candidates.
// It influences SELECTION and ORDERING without modifying FSRS/HLR core algorithms.
//
// Key Principles:
// 1. FSRS/HLR still compute intervals, stability, retrievability
// 2. Policies only affect which cards get shown and in what order
// 3. Policies are composable and mode-aware
// 4. All decisions have explainability traces
// =============================================================================

// Types from local module
export type {
  ReviewPlannerServiceConfig,
  PolicyComposerConfig,
  ProcessingCandidate,
  CompositionResult,
  PolicyExecutionInternalResult,
  RegisteredPolicyEntry,
  RankRequestBody,
  ExplainRequestBody,
  ApiResponse,
} from "./types.js";

// Helper functions
export {
  generateFactorId,
  generatePolicyChainId,
  generatePolicyId,
  normalizeScore,
  clamp,
  now,
  calculateUrgencyLevel,
  getRecommendation,
  calculateConfidence,
  DEFAULT_REVIEW_PLANNER_CONFIG,
  DEFAULT_COMPOSER_CONFIG,
} from "./types.js";

// Service
export {
  ReviewPlannerService,
  getReviewPlannerService,
  resetReviewPlannerService,
} from "./review-planner.service.js";

// Policy Composition
export { PolicyComposer } from "./policy-composer.js";

// Built-in Policies
export {
  BaseUrgencyPolicy,
  ModeModifierPolicy,
  CategoryHookPolicy,
  ExamCramPolicy,
  ExplorationPolicy,
  LkgcSignalPolicy,
  StructuralPolicy,
} from "./policies/index.js";

// Routes
export { reviewPlannerRoutes, routes } from "./routes.js";
