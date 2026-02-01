// =============================================================================
// EVENT VALIDATOR - Validation Rules for Events
// =============================================================================
// Ensures all events conform to the strict taxonomy and contain valid data.
// Validation happens BEFORE events are written to the log.
//
// Validation rules:
// 1. Schema validation (required fields, types)
// 2. Provenance validation (source, device, timestamps)
// 3. Referential integrity (session IDs, node IDs exist)
// 4. Business rules (e.g., confidence in [0,1])
// =============================================================================

import type {
  EventId,
  SessionId,
  NodeId,
  Timestamp,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type { LKGCEvent, EventCategory } from "../types/lkgc/events";

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Severity of the issue */
  readonly severity: ValidationSeverity;

  /** Issue code for programmatic handling */
  readonly code: ValidationIssueCode;

  /** Human-readable message */
  readonly message: string;

  /** The field path that caused the issue (e.g., "provenance.confidence") */
  readonly field?: string;

  /** The actual value that caused the issue */
  readonly actualValue?: unknown;

  /** The expected value or constraint */
  readonly expectedValue?: string;
}

/**
 * Validation issue codes
 */
export type ValidationIssueCode =
  // Schema issues
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_TYPE"
  | "INVALID_ENUM_VALUE"
  | "SCHEMA_VERSION_UNSUPPORTED"
  // Identity issues
  | "INVALID_EVENT_ID"
  | "DUPLICATE_EVENT_ID"
  | "INVALID_SESSION_ID"
  | "INVALID_NODE_ID"
  // Provenance issues
  | "MISSING_PROVENANCE"
  | "INVALID_SOURCE"
  | "INVALID_DEVICE_ID"
  | "MISSING_APP_VERSION"
  // Timestamp issues
  | "TIMESTAMP_IN_FUTURE"
  | "TIMESTAMP_TOO_OLD"
  | "INVALID_TIMESTAMP_FORMAT"
  | "TIMESTAMP_BEFORE_SESSION_START"
  // Range issues
  | "VALUE_OUT_OF_RANGE"
  | "CONFIDENCE_OUT_OF_RANGE"
  | "NORMALIZED_VALUE_OUT_OF_RANGE"
  | "DURATION_NEGATIVE"
  // Referential integrity
  | "SESSION_NOT_FOUND"
  | "NODE_NOT_FOUND"
  | "ATTEMPT_NOT_FOUND"
  // Business logic
  | "INVALID_EVENT_SEQUENCE"
  | "MISSING_PREREQUISITE_EVENT"
  | "INCONSISTENT_STATE";

/**
 * Result of validating an event
 * (Named EventValidationResult to avoid conflict with plugin.types.ts ValidationResult)
 */
export interface EventValidationResult {
  /** Whether the event is valid (no errors) */
  readonly valid: boolean;

  /** The validated event (potentially normalized) */
  readonly event: LKGCEvent;

  /** All validation issues found */
  readonly issues: readonly ValidationIssue[];

  /** Just the errors (convenience) */
  readonly errors: readonly ValidationIssue[];

  /** Just the warnings (convenience) */
  readonly warnings: readonly ValidationIssue[];
}

// =============================================================================
// VALIDATION CONTEXT
// =============================================================================

/**
 * Context for validation - provides access to existing data
 */
export interface ValidationContext {
  /**
   * Check if an event ID already exists
   */
  eventExists(eventId: EventId): Promise<boolean>;

  /**
   * Check if a session exists and is valid
   */
  sessionExists(sessionId: SessionId): Promise<boolean>;

  /**
   * Check if a node exists
   */
  nodeExists(nodeId: NodeId): Promise<boolean>;

  /**
   * Get the current timestamp (for future timestamp checks)
   */
  getCurrentTimestamp(): Timestamp;

  /**
   * Get the maximum allowed timestamp skew (ms)
   */
  getMaxTimestampSkew(): number;

  /**
   * Get the minimum allowed timestamp (for "too old" checks)
   */
  getMinTimestamp(): Timestamp;

  /**
   * Get supported schema versions
   */
  getSupportedSchemaVersions(): readonly number[];
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * A single validation rule
 */
export interface ValidationRule {
  /** Rule identifier */
  readonly id: string;

  /** Human-readable description */
  readonly description: string;

  /** Which event categories this rule applies to (empty = all) */
  readonly categories?: readonly EventCategory[];

  /** Which event types this rule applies to (empty = all in category) */
  readonly eventTypes?: readonly string[];

  /** The validation function */
  validate(
    event: LKGCEvent,
    context: ValidationContext,
  ): Promise<readonly ValidationIssue[]>;
}

/**
 * A set of validation rules
 */
export interface ValidationRuleSet {
  /** Ruleset identifier */
  readonly id: string;

  /** All rules in this set */
  readonly rules: readonly ValidationRule[];

  /** Whether to stop on first error */
  readonly failFast: boolean;
}

// =============================================================================
// EVENT VALIDATOR INTERFACE
// =============================================================================

/**
 * EventValidator - Validates events before they are written to the log
 */
export interface EventValidator {
  /**
   * Validate a single event
   * @param event The event to validate
   * @returns Validation result
   */
  validate(event: LKGCEvent): Promise<EventValidationResult>;

  /**
   * Validate multiple events
   * @param events The events to validate
   * @returns Validation results in same order
   */
  validateBatch(
    events: readonly LKGCEvent[],
  ): Promise<readonly EventValidationResult[]>;

  /**
   * Add a custom validation rule
   * @param rule The rule to add
   */
  addRule(rule: ValidationRule): void;

  /**
   * Remove a validation rule
   * @param ruleId The rule ID to remove
   */
  removeRule(ruleId: string): void;

  /**
   * Get all active rules
   */
  getRules(): readonly ValidationRule[];

  /**
   * Set the validation context
   * @param context The context to use for validation
   */
  setContext(context: ValidationContext): void;
}

// =============================================================================
// BUILT-IN VALIDATION RULES
// =============================================================================

/**
 * Built-in rule: Validate provenance is present and complete
 */
export const RULE_PROVENANCE: ValidationRule = {
  id: "provenance",
  description: "Validates provenance information is present and valid",
  async validate(event): Promise<readonly ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const prov = event.provenance;

    if (!prov) {
      issues.push({
        severity: "error",
        code: "MISSING_PROVENANCE",
        message: "Event is missing provenance information",
        field: "provenance",
      });
      return issues;
    }

    if (!prov.source) {
      issues.push({
        severity: "error",
        code: "INVALID_SOURCE",
        message: "Provenance source is required",
        field: "provenance.source",
      });
    }

    if (!prov.deviceId) {
      issues.push({
        severity: "error",
        code: "INVALID_DEVICE_ID",
        message: "Device ID is required",
        field: "provenance.deviceId",
      });
    }

    if (!prov.appVersion) {
      issues.push({
        severity: "warning",
        code: "MISSING_APP_VERSION",
        message: "App version is recommended",
        field: "provenance.appVersion",
      });
    }

    return issues;
  },
};

/**
 * Built-in rule: Validate confidence values are in [0, 1]
 */
export const RULE_CONFIDENCE_RANGE: ValidationRule = {
  id: "confidence-range",
  description: "Validates confidence values are in [0, 1]",
  async validate(event): Promise<readonly ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Check provenance confidence
    const confidence = event.provenance?.confidence;
    if (confidence !== undefined) {
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        issues.push({
          severity: "error",
          code: "CONFIDENCE_OUT_OF_RANGE",
          message: "Confidence must be a number between 0 and 1",
          field: "provenance.confidence",
          actualValue: confidence,
          expectedValue: "[0, 1]",
        });
      }
    }

    return issues;
  },
};

/**
 * Built-in rule: Validate timestamps are not in the future
 */
export const RULE_TIMESTAMP_NOT_FUTURE: ValidationRule = {
  id: "timestamp-not-future",
  description: "Validates timestamps are not too far in the future",
  async validate(event, context): Promise<readonly ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const now = context.getCurrentTimestamp();
    const maxSkew = context.getMaxTimestampSkew();

    if (event.timestamp > now + maxSkew) {
      issues.push({
        severity: "error",
        code: "TIMESTAMP_IN_FUTURE",
        message: `Timestamp is too far in the future (${event.timestamp} > ${now + maxSkew})`,
        field: "timestamp",
        actualValue: event.timestamp,
        expectedValue: `<= ${now + maxSkew}`,
      });
    }

    return issues;
  },
};

/**
 * Built-in rule: Validate timestamps are not too old
 */
export const RULE_TIMESTAMP_NOT_TOO_OLD: ValidationRule = {
  id: "timestamp-not-too-old",
  description: "Validates timestamps are not too far in the past",
  async validate(event, context): Promise<readonly ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const minTimestamp = context.getMinTimestamp();

    if (event.timestamp < minTimestamp) {
      issues.push({
        severity: "warning",
        code: "TIMESTAMP_TOO_OLD",
        message: `Timestamp is very old (${event.timestamp} < ${minTimestamp})`,
        field: "timestamp",
        actualValue: event.timestamp,
        expectedValue: `>= ${minTimestamp}`,
      });
    }

    return issues;
  },
};

/**
 * Built-in rule: Validate schema version is supported
 */
export const RULE_SCHEMA_VERSION: ValidationRule = {
  id: "schema-version",
  description: "Validates schema version is supported",
  async validate(event, context): Promise<readonly ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const schemaVersion = event.provenance?.schemaVersion;
    const supported = context.getSupportedSchemaVersions();

    if (schemaVersion !== undefined && !supported.includes(schemaVersion)) {
      issues.push({
        severity: "error",
        code: "SCHEMA_VERSION_UNSUPPORTED",
        message: `Schema version ${schemaVersion} is not supported`,
        field: "provenance.schemaVersion",
        actualValue: schemaVersion,
        expectedValue: `one of [${supported.join(", ")}]`,
      });
    }

    return issues;
  },
};

/**
 * All built-in validation rules
 */
export const BUILTIN_VALIDATION_RULES: readonly ValidationRule[] = [
  RULE_PROVENANCE,
  RULE_CONFIDENCE_RANGE,
  RULE_TIMESTAMP_NOT_FUTURE,
  RULE_TIMESTAMP_NOT_TOO_OLD,
  RULE_SCHEMA_VERSION,
];

/**
 * Default validation rule set
 */
export const DEFAULT_VALIDATION_RULESET: ValidationRuleSet = {
  id: "default",
  rules: BUILTIN_VALIDATION_RULES,
  failFast: false,
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a value is a valid normalized value [0, 1]
 */
export function isValidNormalizedValue(
  value: unknown,
): value is NormalizedValue {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/**
 * Check if a value is a valid confidence [0, 1]
 */
export function isValidConfidence(value: unknown): value is Confidence {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/**
 * Check if a value is a valid timestamp (positive number)
 */
export function isValidTimestamp(value: unknown): value is Timestamp {
  return typeof value === "number" && value > 0 && Number.isFinite(value);
}

/**
 * Create a validation issue
 */
export function createIssue(
  severity: ValidationSeverity,
  code: ValidationIssueCode,
  message: string,
  field?: string,
  actualValue?: unknown,
  expectedValue?: string,
): ValidationIssue {
  return {
    severity,
    code,
    message,
    field,
    actualValue,
    expectedValue,
  };
}
