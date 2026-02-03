// =============================================================================
// LEARNING MODE FRAMEWORK - INDEX
// =============================================================================
// Phase 5A: Mode Framework & Runtime
//
// This module exports:
// - ModeRuntimeService: Central service for mode management
// - Built-in mode definitions (Exploration, Goal-Driven, Exam-Oriented, Synthesis)
// - Types for service input/output
// - Hooks for extending mode behavior
// - REST API routes
// - Parameter validation utilities
// =============================================================================

// Service exports
export {
  ModeRuntimeService,
  getModeRuntimeService,
  initializeModeRuntimeService,
} from "./mode-runtime.service.js";

// Built-in mode exports
export {
  BuiltInModes,
  createExplorationMode,
  createGoalDrivenMode,
  createExamOrientedMode,
  createSynthesisMode,
  getAllBuiltInModes,
  getBuiltInModeByType,
  isSystemModeId,
  extractSystemType,
} from "./built-in-modes.js";

// Router export
export { learningModeRoutes, routes } from "./routes.js";

// Parameter validation exports
export {
  validateModeParameters,
  mergeWithDefaults,
  formatValidationErrors,
  DEFAULT_VALIDATION_OPTIONS,
} from "./parameter-validator.js";

export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationErrorCode,
  ValidationWarningCode,
  ValidationOptions,
} from "./parameter-validator.js";

// Type exports
export type {
  // Service input types
  ActivateModeInput,
  ActivateModeResult,
  CreateModeSessionInput,
  EndModeSessionInput,
  GetModeRuntimeInput,
  GenerateRankedCandidatesInput,
  GenerateRankedCandidatesResult,
  CreateExplainabilityTraceInput,
  ExplainabilityFactorInput,
  ExplainabilitySuggestedActionInput,
  SaveParameterPresetInput,
  UpdateModePreferencesInput,
  SetCategoryModeDefaultInput,
  UpdateCategorySchedulingInput,
  // Hook types
  ModeRuntimeHooks,
  // Configuration types
  ModeRuntimeConfig,
  // Resolution types
  ResolvedMode,
  ModeResolutionOptions,
  // Statistics types
  ModeUsageStatistics,
  ExplainabilityStatistics,
  // Built-in mode factory
  BuiltInModeFactory,
} from "./types.js";

export { DEFAULT_MODE_RUNTIME_CONFIG } from "./types.js";
