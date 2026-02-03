// =============================================================================
// MODE PARAMETER VALIDATION
// =============================================================================
// Phase 5A: Utilities for validating mode parameters against schema
//
// This module provides:
// - Schema-based parameter validation
// - Type coercion where appropriate
// - Cross-parameter validation
// - Helpful error messages
// =============================================================================

import type {
  ModeParameterSchema,
  ModeParameterDefinition,
  ModeParameterConstraints,
  ModeParameterType,
  CrossValidationRule,
} from "@manthanein/shared";

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  coercedValues: Record<string, unknown>;
}

export interface ValidationError {
  parameterKey: string;
  message: string;
  code: ValidationErrorCode;
  providedValue?: unknown;
  expectedType?: string;
}

export interface ValidationWarning {
  parameterKey: string;
  message: string;
  code: ValidationWarningCode;
}

export type ValidationErrorCode =
  | "REQUIRED_MISSING"
  | "INVALID_TYPE"
  | "OUT_OF_RANGE"
  | "INVALID_ENUM_VALUE"
  | "CONSTRAINT_VIOLATION"
  | "CROSS_VALIDATION_FAILED"
  | "UNKNOWN_PARAMETER";

export type ValidationWarningCode =
  | "TYPE_COERCED"
  | "DEFAULT_USED"
  | "DEPRECATED_PARAMETER"
  | "ADVANCED_PARAMETER_MODIFIED";

// =============================================================================
// VALIDATION OPTIONS
// =============================================================================

export interface ValidationOptions {
  /**
   * Whether to attempt type coercion
   */
  allowCoercion: boolean;

  /**
   * Whether to allow unknown parameters
   */
  allowUnknown: boolean;

  /**
   * Whether to warn about advanced parameters being modified
   */
  warnOnAdvancedModification: boolean;

  /**
   * Whether to run cross-validation rules
   */
  runCrossValidation: boolean;
}

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  allowCoercion: true,
  allowUnknown: false,
  warnOnAdvancedModification: true,
  runCrossValidation: true,
};

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validate parameters against a mode's schema
 */
export function validateModeParameters(
  parameters: Record<string, unknown>,
  schema: ModeParameterSchema,
  options: Partial<ValidationOptions> = {},
): ValidationResult {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const coercedValues: Record<string, unknown> = {};

  // Create a map for quick lookup
  const parameterDefs = new Map<string, ModeParameterDefinition>();
  for (const def of schema.parameters) {
    parameterDefs.set(def.key, def);
  }

  // Check for unknown parameters
  if (!opts.allowUnknown) {
    for (const key of Object.keys(parameters)) {
      if (!parameterDefs.has(key)) {
        errors.push({
          parameterKey: key,
          message: `Unknown parameter: ${key}`,
          code: "UNKNOWN_PARAMETER",
          providedValue: parameters[key],
        });
      }
    }
  }

  // Validate each parameter definition
  for (const def of schema.parameters) {
    const value = parameters[def.key];
    const hasValue =
      def.key in parameters && value !== undefined && value !== null;

    // Check required
    if (def.required && !hasValue) {
      errors.push({
        parameterKey: def.key,
        message: `Required parameter '${def.key}' is missing`,
        code: "REQUIRED_MISSING",
      });
      continue;
    }

    // Skip if no value provided (will use default)
    if (!hasValue) {
      continue;
    }

    // Validate type and get coerced value
    const typeValidation = validateParameterType(
      def.key,
      value,
      def.type,
      def,
      opts.allowCoercion,
    );

    if (typeValidation.error) {
      errors.push(typeValidation.error);
      continue;
    }

    if (typeValidation.warning) {
      warnings.push(typeValidation.warning);
    }

    const validatedValue = typeValidation.coercedValue ?? value;
    coercedValues[def.key] = validatedValue;

    // Validate range (for number types)
    if (def.range && typeof validatedValue === "number") {
      if (validatedValue < def.range.min || validatedValue > def.range.max) {
        errors.push({
          parameterKey: def.key,
          message: `Value ${validatedValue} is out of range [${def.range.min}, ${def.range.max}]`,
          code: "OUT_OF_RANGE",
          providedValue: validatedValue,
        });
      }
    }

    // Validate enum options
    if (def.enumOptions && def.type === "enum") {
      const validValues = def.enumOptions.map((o) => o.value);
      if (!validValues.includes(validatedValue as string)) {
        errors.push({
          parameterKey: def.key,
          message: `Invalid enum value '${validatedValue}'. Valid values: ${validValues.join(", ")}`,
          code: "INVALID_ENUM_VALUE",
          providedValue: validatedValue,
        });
      }
    }

    // Validate constraints
    if (def.constraints) {
      const constraintErrors = validateConstraints(
        def.key,
        validatedValue,
        def.constraints,
      );
      errors.push(...constraintErrors);
    }

    // Warn about advanced parameter modification
    if (opts.warnOnAdvancedModification && def.advanced) {
      warnings.push({
        parameterKey: def.key,
        message: `Advanced parameter '${def.key}' has been modified`,
        code: "ADVANCED_PARAMETER_MODIFIED",
      });
    }
  }

  // Run cross-validation rules
  if (opts.runCrossValidation && schema.crossValidationRules) {
    for (const rule of schema.crossValidationRules) {
      const ruleResult = runCrossValidationRule(
        rule,
        { ...parameters, ...coercedValues },
        parameterDefs,
      );
      if (ruleResult) {
        errors.push(ruleResult);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coercedValues,
  };
}

// =============================================================================
// TYPE VALIDATION
// =============================================================================

interface TypeValidationResult {
  error?: ValidationError;
  warning?: ValidationWarning;
  coercedValue?: unknown;
}

function validateParameterType(
  key: string,
  value: unknown,
  type: ModeParameterType,
  def: ModeParameterDefinition,
  allowCoercion: boolean,
): TypeValidationResult {
  switch (type) {
    case "number":
    case "percentage":
    case "range":
    case "duration":
      return validateNumber(key, value, type, allowCoercion);

    case "boolean":
      return validateBoolean(key, value, allowCoercion);

    case "string":
    case "enum":
      return validateString(key, value, type, allowCoercion);

    case "category_list":
    case "card_list":
      return validateStringArray(key, value, type, allowCoercion);

    default:
      return {}; // Unknown type, accept anything
  }
}

function validateNumber(
  key: string,
  value: unknown,
  type: ModeParameterType,
  allowCoercion: boolean,
): TypeValidationResult {
  if (typeof value === "number" && !isNaN(value)) {
    return { coercedValue: value };
  }

  if (allowCoercion && typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return {
        coercedValue: parsed,
        warning: {
          parameterKey: key,
          message: `String value coerced to number`,
          code: "TYPE_COERCED",
        },
      };
    }
  }

  return {
    error: {
      parameterKey: key,
      message: `Expected ${type}, got ${typeof value}`,
      code: "INVALID_TYPE",
      providedValue: value,
      expectedType: type,
    },
  };
}

function validateBoolean(
  key: string,
  value: unknown,
  allowCoercion: boolean,
): TypeValidationResult {
  if (typeof value === "boolean") {
    return { coercedValue: value };
  }

  if (allowCoercion) {
    if (typeof value === "string") {
      if (value.toLowerCase() === "true" || value === "1") {
        return {
          coercedValue: true,
          warning: {
            parameterKey: key,
            message: `String value coerced to boolean`,
            code: "TYPE_COERCED",
          },
        };
      }
      if (value.toLowerCase() === "false" || value === "0") {
        return {
          coercedValue: false,
          warning: {
            parameterKey: key,
            message: `String value coerced to boolean`,
            code: "TYPE_COERCED",
          },
        };
      }
    }
    if (typeof value === "number") {
      return {
        coercedValue: value !== 0,
        warning: {
          parameterKey: key,
          message: `Number value coerced to boolean`,
          code: "TYPE_COERCED",
        },
      };
    }
  }

  return {
    error: {
      parameterKey: key,
      message: `Expected boolean, got ${typeof value}`,
      code: "INVALID_TYPE",
      providedValue: value,
      expectedType: "boolean",
    },
  };
}

function validateString(
  key: string,
  value: unknown,
  type: ModeParameterType,
  allowCoercion: boolean,
): TypeValidationResult {
  if (typeof value === "string") {
    return { coercedValue: value };
  }

  if (
    allowCoercion &&
    (typeof value === "number" || typeof value === "boolean")
  ) {
    return {
      coercedValue: String(value),
      warning: {
        parameterKey: key,
        message: `${typeof value} value coerced to string`,
        code: "TYPE_COERCED",
      },
    };
  }

  return {
    error: {
      parameterKey: key,
      message: `Expected string, got ${typeof value}`,
      code: "INVALID_TYPE",
      providedValue: value,
      expectedType: type,
    },
  };
}

function validateStringArray(
  key: string,
  value: unknown,
  type: ModeParameterType,
  allowCoercion: boolean,
): TypeValidationResult {
  if (Array.isArray(value)) {
    const allStrings = value.every((item) => typeof item === "string");
    if (allStrings) {
      return { coercedValue: value };
    }

    if (allowCoercion) {
      const coerced = value.map((item) => String(item));
      return {
        coercedValue: coerced,
        warning: {
          parameterKey: key,
          message: `Array items coerced to strings`,
          code: "TYPE_COERCED",
        },
      };
    }
  }

  // Allow single string to be coerced to array
  if (allowCoercion && typeof value === "string") {
    return {
      coercedValue: [value],
      warning: {
        parameterKey: key,
        message: `String value coerced to array`,
        code: "TYPE_COERCED",
      },
    };
  }

  return {
    error: {
      parameterKey: key,
      message: `Expected string array, got ${typeof value}`,
      code: "INVALID_TYPE",
      providedValue: value,
      expectedType: type,
    },
  };
}

// =============================================================================
// CONSTRAINT VALIDATION
// =============================================================================

function validateConstraints(
  key: string,
  value: unknown,
  constraints: ModeParameterConstraints,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // String length constraints
  if (typeof value === "string") {
    if (
      constraints.minLength !== undefined &&
      value.length < constraints.minLength
    ) {
      errors.push({
        parameterKey: key,
        message: `String length ${value.length} is below minimum ${constraints.minLength}`,
        code: "CONSTRAINT_VIOLATION",
        providedValue: value,
      });
    }
    if (
      constraints.maxLength !== undefined &&
      value.length > constraints.maxLength
    ) {
      errors.push({
        parameterKey: key,
        message: `String length ${value.length} exceeds maximum ${constraints.maxLength}`,
        code: "CONSTRAINT_VIOLATION",
        providedValue: value,
      });
    }
    if (constraints.pattern) {
      const regex = new RegExp(constraints.pattern);
      if (!regex.test(value)) {
        errors.push({
          parameterKey: key,
          message: `Value does not match pattern: ${constraints.pattern}`,
          code: "CONSTRAINT_VIOLATION",
          providedValue: value,
        });
      }
    }
  }

  // Array length constraints
  if (Array.isArray(value)) {
    if (
      constraints.minItems !== undefined &&
      value.length < constraints.minItems
    ) {
      errors.push({
        parameterKey: key,
        message: `Array length ${value.length} is below minimum ${constraints.minItems}`,
        code: "CONSTRAINT_VIOLATION",
        providedValue: value,
      });
    }
    if (
      constraints.maxItems !== undefined &&
      value.length > constraints.maxItems
    ) {
      errors.push({
        parameterKey: key,
        message: `Array length ${value.length} exceeds maximum ${constraints.maxItems}`,
        code: "CONSTRAINT_VIOLATION",
        providedValue: value,
      });
    }
  }

  return errors;
}

// =============================================================================
// CROSS-VALIDATION RULES
// =============================================================================

/**
 * Built-in cross-validation rule handlers
 */
const CROSS_VALIDATION_HANDLERS: Record<
  string,
  (params: Record<string, unknown>, keys: string[]) => string | null
> = {
  /**
   * Validate that value A is less than value B
   */
  lessThan: (params, keys) => {
    if (keys.length < 2) return null;
    const a = params[keys[0]] as number;
    const b = params[keys[1]] as number;
    if (typeof a === "number" && typeof b === "number" && a >= b) {
      return `${keys[0]} must be less than ${keys[1]}`;
    }
    return null;
  },

  /**
   * Validate that values sum to a specific total
   */
  sumTo: (params, keys) => {
    // Last key should be the target sum
    if (keys.length < 2) return null;
    const targetKey = keys[keys.length - 1];
    const target = params[targetKey] as number;
    const sum = keys
      .slice(0, -1)
      .reduce((acc, key) => acc + ((params[key] as number) || 0), 0);
    if (Math.abs(sum - target) > 0.001) {
      return `Sum of [${keys.slice(0, -1).join(", ")}] must equal ${target}`;
    }
    return null;
  },

  /**
   * Validate mutual exclusivity
   */
  mutuallyExclusive: (params, keys) => {
    const trueCount = keys.filter((key) => params[key] === true).length;
    if (trueCount > 1) {
      return `Only one of [${keys.join(", ")}] can be true`;
    }
    return null;
  },

  /**
   * Validate that if A is set, B must also be set
   */
  requiresIf: (params, keys) => {
    if (keys.length < 2) return null;
    const [conditionKey, requiredKey] = keys;
    if (
      params[conditionKey] !== undefined &&
      params[requiredKey] === undefined
    ) {
      return `${requiredKey} is required when ${conditionKey} is set`;
    }
    return null;
  },
};

function runCrossValidationRule(
  rule: CrossValidationRule,
  params: Record<string, unknown>,
  _parameterDefs: Map<string, ModeParameterDefinition>,
): ValidationError | null {
  const handler = CROSS_VALIDATION_HANDLERS[rule.validatorKey];
  if (!handler) {
    // Unknown validator, skip
    return null;
  }

  const errorMessage = handler(params, [...rule.parameters]);
  if (errorMessage) {
    return {
      parameterKey: rule.parameters.join(", "),
      message: errorMessage,
      code: "CROSS_VALIDATION_FAILED",
    };
  }

  return null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Merge user parameters with defaults, applying validated values
 */
export function mergeWithDefaults(
  userParams: Record<string, unknown>,
  schema: ModeParameterSchema,
  validationResult: ValidationResult,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Start with defaults
  for (const def of schema.parameters) {
    result[def.key] = def.defaultValue;
  }

  // Apply user params (using coerced values where available)
  for (const key of Object.keys(userParams)) {
    if (key in validationResult.coercedValues) {
      result[key] = validationResult.coercedValues[key];
    } else if (!validationResult.errors.find((e) => e.parameterKey === key)) {
      result[key] = userParams[key];
    }
  }

  return result;
}

/**
 * Get a summary of validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return "All parameters are valid";
  }

  const lines = result.errors.map(
    (err) => `• ${err.parameterKey}: ${err.message}`,
  );

  return `Validation errors:\n${lines.join("\n")}`;
}
