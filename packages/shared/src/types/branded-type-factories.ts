// =============================================================================
// BRANDED TYPE FACTORIES
// =============================================================================
// Centralized factory functions for creating branded types with runtime safety.
// These functions provide type-safe creation of branded identifiers while
// allowing for optional validation patterns.
// =============================================================================

import type {
  LearningModeId,
  ModeParameterSetId,
  ModeSessionId,
  ExplainabilityTraceId,
  NavigationSuggestionId,
  ReviewCandidateId,
  ModePluginId,
  SystemModeType,
} from "./learning-mode.types";

import type { Timestamp, NormalizedValue, Confidence } from "./lkgc/foundation";

// =============================================================================
// VALIDATION CONFIGURATION
// =============================================================================

/**
 * Configuration for branded type validation behavior
 */
export interface BrandedTypeValidationConfig {
  /** Whether to throw on invalid input (default: false, returns undefined) */
  readonly throwOnInvalid: boolean;
  /** Whether to allow empty strings (default: false) */
  readonly allowEmpty: boolean;
  /** Custom validation function */
  readonly customValidator?: (value: string) => boolean;
  /** Prefix pattern for IDs (e.g., 'system:', 'plugin:') */
  readonly requiredPrefix?: string;
  /** Maximum length for the identifier */
  readonly maxLength?: number;
  /** Minimum length for the identifier */
  readonly minLength?: number;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: BrandedTypeValidationConfig = {
  throwOnInvalid: false,
  allowEmpty: false,
  maxLength: 256,
  minLength: 1,
};

/**
 * Strict validation configuration (throws on invalid)
 */
export const STRICT_VALIDATION_CONFIG: BrandedTypeValidationConfig = {
  throwOnInvalid: true,
  allowEmpty: false,
  maxLength: 256,
  minLength: 1,
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates a string against the given configuration
 */
function validateString(
  value: unknown,
  config: Partial<BrandedTypeValidationConfig> = {}
): { valid: boolean; error?: string } {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config };

  if (typeof value !== "string") {
    return { valid: false, error: "Value must be a string" };
  }

  if (!mergedConfig.allowEmpty && value.length === 0) {
    return { valid: false, error: "Value cannot be empty" };
  }

  if (mergedConfig.minLength && value.length < mergedConfig.minLength) {
    return {
      valid: false,
      error: `Value must be at least ${mergedConfig.minLength} characters`,
    };
  }

  if (mergedConfig.maxLength && value.length > mergedConfig.maxLength) {
    return {
      valid: false,
      error: `Value must be at most ${mergedConfig.maxLength} characters`,
    };
  }

  if (mergedConfig.requiredPrefix && !value.startsWith(mergedConfig.requiredPrefix)) {
    return {
      valid: false,
      error: `Value must start with '${mergedConfig.requiredPrefix}'`,
    };
  }

  if (mergedConfig.customValidator && !mergedConfig.customValidator(value)) {
    return { valid: false, error: "Value failed custom validation" };
  }

  return { valid: true };
}

/**
 * Creates a branded type or handles validation failure
 */
function createBrandedType<T extends string>(
  value: unknown,
  typeName: string,
  config: Partial<BrandedTypeValidationConfig> = {}
): T | undefined {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  const result = validateString(value, mergedConfig);

  if (!result.valid) {
    if (mergedConfig.throwOnInvalid) {
      throw new Error(`Invalid ${typeName}: ${result.error}`);
    }
    return undefined;
  }

  return value as T;
}

// =============================================================================
// LEARNING MODE IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a LearningModeId from a string
 * @param value The string value to brand
 * @param config Optional validation configuration
 * @returns Branded LearningModeId or undefined if validation fails
 */
export function createLearningModeId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): LearningModeId {
  return createBrandedType<LearningModeId>(value, "LearningModeId", config) as LearningModeId;
}

/**
 * Creates a system LearningModeId with 'system:' prefix
 */
export function createSystemModeId(type: SystemModeType): LearningModeId {
  return `system:${type}` as LearningModeId;
}

/**
 * Creates a plugin LearningModeId with 'plugin:' prefix
 */
export function createPluginModeId(pluginId: string, modeName: string): LearningModeId {
  return `plugin:${pluginId}:${modeName}` as LearningModeId;
}

/**
 * Creates a custom user LearningModeId with 'custom:' prefix
 */
export function createCustomModeId(userId: string, modeName: string): LearningModeId {
  return `custom:${userId}:${modeName}` as LearningModeId;
}

/**
 * Type guard to check if a value is a valid LearningModeId
 */
export function isLearningModeId(value: unknown): value is LearningModeId {
  return typeof value === "string" && value.length > 0;
}

/**
 * Type guard to check if a LearningModeId is a system mode
 */
export function isSystemModeId(modeId: LearningModeId): boolean {
  return modeId.startsWith("system:");
}

/**
 * Extracts the SystemModeType from a system mode ID
 */
export function extractSystemModeType(modeId: LearningModeId): SystemModeType | undefined {
  if (!isSystemModeId(modeId)) return undefined;
  const type = modeId.slice("system:".length) as SystemModeType;
  const validTypes: SystemModeType[] = ["exploration", "goal_driven", "exam_oriented", "synthesis"];
  return validTypes.includes(type) ? type : undefined;
}

// =============================================================================
// MODE SESSION IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a ModeSessionId from a string
 */
export function createModeSessionId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): ModeSessionId {
  return createBrandedType<ModeSessionId>(value, "ModeSessionId", config) as ModeSessionId;
}

/**
 * Generates a new unique ModeSessionId
 */
export function generateModeSessionId(): ModeSessionId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `session_${timestamp}_${random}` as ModeSessionId;
}

/**
 * Type guard to check if a value is a valid ModeSessionId
 */
export function isModeSessionId(value: unknown): value is ModeSessionId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// MODE PARAMETER SET IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a ModeParameterSetId from a string
 */
export function createModeParameterSetId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): ModeParameterSetId {
  return createBrandedType<ModeParameterSetId>(
    value,
    "ModeParameterSetId",
    config
  ) as ModeParameterSetId;
}

/**
 * Generates a new unique ModeParameterSetId
 */
export function generateModeParameterSetId(): ModeParameterSetId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `params_${timestamp}_${random}` as ModeParameterSetId;
}

/**
 * Type guard to check if a value is a valid ModeParameterSetId
 */
export function isModeParameterSetId(value: unknown): value is ModeParameterSetId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// EXPLAINABILITY TRACE IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates an ExplainabilityTraceId from a string
 */
export function createExplainabilityTraceId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): ExplainabilityTraceId {
  return createBrandedType<ExplainabilityTraceId>(
    value,
    "ExplainabilityTraceId",
    config
  ) as ExplainabilityTraceId;
}

/**
 * Generates a new unique ExplainabilityTraceId
 */
export function generateExplainabilityTraceId(): ExplainabilityTraceId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `trace_${timestamp}_${random}` as ExplainabilityTraceId;
}

/**
 * Type guard to check if a value is a valid ExplainabilityTraceId
 */
export function isExplainabilityTraceId(value: unknown): value is ExplainabilityTraceId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// NAVIGATION SUGGESTION IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a NavigationSuggestionId from a string
 */
export function createNavigationSuggestionId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): NavigationSuggestionId {
  return createBrandedType<NavigationSuggestionId>(
    value,
    "NavigationSuggestionId",
    config
  ) as NavigationSuggestionId;
}

/**
 * Generates a new unique NavigationSuggestionId
 */
export function generateNavigationSuggestionId(): NavigationSuggestionId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `nav_${timestamp}_${random}` as NavigationSuggestionId;
}

/**
 * Type guard to check if a value is a valid NavigationSuggestionId
 */
export function isNavigationSuggestionId(value: unknown): value is NavigationSuggestionId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// REVIEW CANDIDATE IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a ReviewCandidateId from a string
 */
export function createReviewCandidateId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): ReviewCandidateId {
  return createBrandedType<ReviewCandidateId>(
    value,
    "ReviewCandidateId",
    config
  ) as ReviewCandidateId;
}

/**
 * Generates a new unique ReviewCandidateId
 */
export function generateReviewCandidateId(): ReviewCandidateId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `candidate_${timestamp}_${random}` as ReviewCandidateId;
}

/**
 * Type guard to check if a value is a valid ReviewCandidateId
 */
export function isReviewCandidateId(value: unknown): value is ReviewCandidateId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// MODE PLUGIN IDENTIFIER FACTORIES
// =============================================================================

/**
 * Creates a ModePluginId from a string
 */
export function createModePluginId(
  value: string,
  config?: Partial<BrandedTypeValidationConfig>
): ModePluginId {
  return createBrandedType<ModePluginId>(value, "ModePluginId", config) as ModePluginId;
}

/**
 * Generates a new unique ModePluginId
 */
export function generateModePluginId(author: string, pluginName: string): ModePluginId {
  return `${author}/${pluginName}` as ModePluginId;
}

/**
 * Type guard to check if a value is a valid ModePluginId
 */
export function isModePluginId(value: unknown): value is ModePluginId {
  return typeof value === "string" && value.length > 0;
}

// =============================================================================
// FOUNDATION TYPE FACTORIES
// =============================================================================

/**
 * Creates a Timestamp from a number
 */
export function createTimestamp(value: number): Timestamp {
  return value as Timestamp;
}

/**
 * Gets the current timestamp
 */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/**
 * Creates a NormalizedValue (0-1 range) from a number
 * @param value The number to normalize
 * @param clamp Whether to clamp the value to 0-1 range (default: true)
 */
export function createNormalizedValue(value: number, clamp: boolean = true): NormalizedValue {
  if (clamp) {
    return Math.max(0, Math.min(1, value)) as NormalizedValue;
  }
  return value as NormalizedValue;
}

/**
 * Creates a Confidence value (0-1 range) from a number
 * @param value The number to use as confidence
 * @param clamp Whether to clamp the value to 0-1 range (default: true)
 */
export function createConfidence(value: number, clamp: boolean = true): Confidence {
  if (clamp) {
    return Math.max(0, Math.min(1, value)) as Confidence;
  }
  return value as Confidence;
}

// =============================================================================
// BATCH CONVERSION UTILITIES
// =============================================================================

/**
 * Converts an array of strings to branded types
 */
export function batchCreateBrandedTypes<T extends string>(
  values: readonly string[],
  factory: (value: string) => T
): readonly T[] {
  return values.map(factory);
}

/**
 * Converts a mutable array to readonly for assignment to branded type arrays
 */
export function asReadonly<T>(arr: T[]): readonly T[] {
  return arr;
}

/**
 * Safely spreads a readonly array to a mutable one (for Prisma compatibility)
 */
export function asMutable<T>(arr: readonly T[]): T[] {
  return [...arr];
}
