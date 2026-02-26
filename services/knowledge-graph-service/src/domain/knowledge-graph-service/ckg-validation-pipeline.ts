/**
 * @noema/knowledge-graph-service - CKG Validation Pipeline Implementation
 *
 * Implements the IValidationPipeline interface — orchestrates validation
 * stages in order, collects results, and supports short-circuiting.
 */

import type { ICkgMutation } from './mutation.repository.js';
import type {
  IValidationContext,
  IValidationPipeline,
  IValidationResult,
  IValidationStage,
  IValidationStageResult,
  IValidationViolation,
} from './validation.js';

// ============================================================================
// CkgValidationPipeline
// ============================================================================

/**
 * Concrete implementation of IValidationPipeline.
 *
 * Runs registered stages in order (sorted by `stage.order`).
 * Short-circuits on first error-severity failure when
 * `context.shortCircuitOnError` is true.
 */
export class CkgValidationPipeline implements IValidationPipeline {
  private stages = new Map<string, IValidationStage>();

  /**
   * Register a validation stage (idempotent by stage name).
   */
  addStage(stage: IValidationStage): void {
    this.stages.set(stage.name, stage);
  }

  /**
   * Unregister a stage by name.
   */
  removeStage(stageName: string): void {
    this.stages.delete(stageName);
  }

  /**
   * List registered stages in execution order (sorted by `order`).
   */
  getStages(): IValidationStage[] {
    return [...this.stages.values()].sort((a, b) => a.order - b.order);
  }

  /**
   * Run all stages in order against the mutation.
   *
   * @param mutation The CKG mutation to validate.
   * @param context Validation context (correlation ID, settings).
   * @returns Aggregate result with per-stage details.
   */
  async validate(mutation: ICkgMutation, context: IValidationContext): Promise<IValidationResult> {
    const stageResults: IValidationStageResult[] = [];
    const allViolations: IValidationViolation[] = [];
    const allWarnings: IValidationViolation[] = [];
    let totalDuration = 0;
    let overallPassed = true;

    const orderedStages = this.getStages();

    for (const stage of orderedStages) {
      const result = await stage.validate(mutation, context);
      stageResults.push(result);
      totalDuration += result.duration;

      // Separate errors from warnings
      for (const violation of result.violations) {
        if (violation.severity === 'error') {
          allViolations.push(violation);
        } else {
          allWarnings.push(violation);
        }
      }

      if (!result.passed) {
        overallPassed = false;

        // Short-circuit: stop running stages after first error
        if (context.shortCircuitOnError) {
          break;
        }
      }
    }

    return {
      passed: overallPassed,
      stageResults,
      totalDuration,
      violations: allViolations,
      warnings: allWarnings,
    };
  }
}
