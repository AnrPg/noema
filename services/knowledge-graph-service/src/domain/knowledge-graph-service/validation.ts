/**
 * @noema/knowledge-graph-service - Validation Pipeline Interfaces
 *
 * Domain-layer abstractions for the CKG mutation validation pipeline.
 * Each validation stage is a pluggable unit with a consistent interface,
 * enabling:
 *
 * 1. **Extensibility**: add new stages (e.g., semantic coherence) without
 *    modifying existing code.
 * 2. **Testability**: unit-test each stage in isolation with mock mutations.
 * 3. **Environment-specific configuration**: dev environments can omit
 *    expensive stages.
 * 4. **Agent-controlled validation**: the ValidationOptions bypass mechanism
 *    can skip toggled-off stages.
 */

import type { Metadata } from '@noema/types';

import type { ICkgMutation } from './mutation.repository.js';

// ============================================================================
// Validation Context
// ============================================================================

/**
 * Context passed to each validation stage alongside the mutation.
 * Provides access to configuration and environment-specific settings.
 */
export interface IValidationContext {
  /** Originating request correlation ID */
  readonly correlationId: string;

  /** Whether to short-circuit on first error-severity violation */
  readonly shortCircuitOnError: boolean;

  /** Additional context (e.g., environment flags, feature toggles) */
  readonly metadata?: Metadata;
}

// ============================================================================
// IValidationViolation
// ============================================================================

/**
 * A specific issue found during validation.
 */
export interface IValidationViolation {
  /**
   * Machine-readable violation code.
   * E.g., `CYCLIC_EDGE_DETECTED`, `UNKNOWN_NODE_TYPE`, `INSUFFICIENT_EVIDENCE`.
   */
  readonly code: string;

  /** Human-readable description */
  readonly message: string;

  /** Severity: errors cause rejection, warnings are logged but don't block */
  readonly severity: 'error' | 'warning';

  /**
   * Which operation in the mutation's operation list caused this violation.
   * Zero-indexed.
   */
  readonly affectedOperationIndex: number;

  /** Additional context (e.g., the cycle path for a cycle violation) */
  readonly metadata: Metadata;
}

// ============================================================================
// IValidationStageResult
// ============================================================================

/**
 * Result from a single validation stage.
 */
export interface IValidationStageResult {
  /** Name of the stage that produced this result */
  readonly stageName: string;

  /** Whether the stage passed (no error-severity violations) */
  readonly passed: boolean;

  /** Human-readable summary */
  readonly details: string;

  /** Specific issues found */
  readonly violations: readonly IValidationViolation[];

  /** Milliseconds taken to run this stage */
  readonly duration: number;
}

// ============================================================================
// IValidationStage
// ============================================================================

/**
 * A single validation stage — a pluggable unit in the CKG mutation
 * validation pipeline.
 *
 * Standard stages (Phase 6):
 * - `schema` — validates mutation DSL syntax
 * - `structural_integrity` — checks graph structure (acyclicity, etc.)
 * - `conflict_detection` — detects conflicting concurrent mutations
 * - `evidence_sufficiency` — checks promotion band thresholds
 */
export interface IValidationStage {
  /** Human-readable stage identifier */
  readonly name: string;

  /** Execution order (stages run sequentially, lowest first) */
  readonly order: number;

  /**
   * Run this stage's checks against the mutation.
   * @param mutation The CKG mutation to validate.
   * @param context Validation context (correlation ID, settings).
   * @returns Stage result with pass/fail, violations, and timing.
   */
  validate(mutation: ICkgMutation, context: IValidationContext): Promise<IValidationStageResult>;
}

// ============================================================================
// IValidationResult
// ============================================================================

/**
 * Result from the complete validation pipeline.
 */
export interface IValidationResult {
  /** Whether all stages passed (no error-severity violations) */
  readonly passed: boolean;

  /**
   * Results from each stage that ran. Stages after a short-circuit
   * won't appear in this array.
   */
  readonly stageResults: readonly IValidationStageResult[];

  /** Sum of all stage durations (milliseconds) */
  readonly totalDuration: number;

  /** Aggregated error-severity violations from all stages */
  readonly violations: readonly IValidationViolation[];

  /** Aggregated warning-severity violations from all stages */
  readonly warnings: readonly IValidationViolation[];
}

// ============================================================================
// IValidationPipeline
// ============================================================================

/**
 * The pipeline that orchestrates validation stages.
 *
 * Runs all registered stages in order, short-circuiting on first
 * error-severity failure (warnings don't short-circuit).
 */
export interface IValidationPipeline {
  /**
   * Register a validation stage (idempotent by stage name).
   */
  addStage(stage: IValidationStage): void;

  /**
   * Unregister a stage by name.
   * Useful for testing or simplified pipelines in dev environments.
   */
  removeStage(stageName: string): void;

  /**
   * List registered stages in execution order.
   */
  getStages(): IValidationStage[];

  /**
   * Run all stages in order against the mutation.
   * Short-circuits on first error-severity failure when
   * context.shortCircuitOnError is true.
   */
  validate(mutation: ICkgMutation, context: IValidationContext): Promise<IValidationResult>;
}
