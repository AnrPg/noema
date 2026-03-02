/**
 * @noema/knowledge-graph-service — Structural Metrics Engine
 *
 * Orchestrates all 11 structural metric computers, executing them against
 * a shared IMetricComputationContext and producing an IStructuralMetrics result.
 *
 * Design: Strategy Pattern (ADR-006, D1-B).
 * Each metric is an independent IMetricComputer class. The engine owns the
 * registry and maps abbreviations to IStructuralMetrics field names.
 */

import type { Logger } from 'pino';

import type { IStructuralMetrics } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from './types.js';

import {
  AbstractionDriftComputer,
  BoundarySensitivityImprovementComputer,
  DepthCalibrationGradientComputer,
  ScopeLeakageIndexComputer,
  SiblingConfusionEntropyComputer,
  StrategyDepthFitComputer,
  StructuralAttributionAccuracyComputer,
  StructuralStabilityGainComputer,
  StructuralStrategyEntropyComputer,
  TraversalBreadthScoreComputer,
  UpwardLinkStrengthComputer,
} from './computers/index.js';

// ============================================================================
// Abbreviation → IStructuralMetrics field mapping
// ============================================================================

type MetricFieldName = keyof IStructuralMetrics;

const ABBREVIATION_TO_FIELD: ReadonlyMap<string, MetricFieldName> = new Map([
  ['AD', 'abstractionDrift'],
  ['DCG', 'depthCalibrationGradient'],
  ['SLI', 'scopeLeakageIndex'],
  ['SCE', 'siblingConfusionEntropy'],
  ['ULS', 'upwardLinkStrength'],
  ['TBS', 'traversalBreadthScore'],
  ['SDF', 'strategyDepthFit'],
  ['SSE', 'structuralStrategyEntropy'],
  ['SAA', 'structuralAttributionAccuracy'],
  ['SSG', 'structuralStabilityGain'],
  ['BSI', 'boundarySensitivityImprovement'],
]);

// ============================================================================
// Result type
// ============================================================================

/**
 * Result from computeAll, including partial failure information.
 * Consumers can check partialFailures to decide whether to trust the metrics.
 */
export interface IMetricsComputationResult {
  readonly metrics: IStructuralMetrics;
  readonly partialFailures: readonly IMetricPartialFailure[];
}

export interface IMetricPartialFailure {
  readonly field: string;
  readonly abbreviation: string;
  readonly error: string;
}

// ============================================================================
// Engine
// ============================================================================

export class StructuralMetricsEngine {
  private readonly computers: readonly IMetricComputer[];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'StructuralMetricsEngine' });
    this.computers = [
      new AbstractionDriftComputer(),
      new DepthCalibrationGradientComputer(),
      new ScopeLeakageIndexComputer(),
      new SiblingConfusionEntropyComputer(),
      new UpwardLinkStrengthComputer(),
      new TraversalBreadthScoreComputer(),
      new StrategyDepthFitComputer(),
      new StructuralStrategyEntropyComputer(),
      new StructuralAttributionAccuracyComputer(),
      new StructuralStabilityGainComputer(),
      new BoundarySensitivityImprovementComputer(),
    ];
  }

  /**
   * Run all 11 metric computers against the shared context.
   * Returns a complete IStructuralMetrics object along with partial failure info.
   */
  computeAll(ctx: IMetricComputationContext): IMetricsComputationResult {
    const partialFailures: IMetricPartialFailure[] = [];

    // Build the metrics object field by field with explicit typing
    let abstractionDrift = 0;
    let depthCalibrationGradient = 0;
    let scopeLeakageIndex = 0;
    let siblingConfusionEntropy = 0;
    let upwardLinkStrength = 0;
    let traversalBreadthScore = 0;
    let strategyDepthFit = 0;
    let structuralStrategyEntropy = 0;
    let structuralAttributionAccuracy = 0;
    let structuralStabilityGain = 0;
    let boundarySensitivityImprovement = 0;

    for (const computer of this.computers) {
      const field = ABBREVIATION_TO_FIELD.get(computer.abbreviation);
      if (field === undefined) {
        throw new Error(
          `StructuralMetricsEngine: unknown abbreviation "${computer.abbreviation}" ` +
            `from computer "${computer.name}". Add it to ABBREVIATION_TO_FIELD.`
        );
      }

      try {
        const value = computer.compute(ctx);

        // Assign to the correct field
        switch (field) {
          case 'abstractionDrift':
            abstractionDrift = value;
            break;
          case 'depthCalibrationGradient':
            depthCalibrationGradient = value;
            break;
          case 'scopeLeakageIndex':
            scopeLeakageIndex = value;
            break;
          case 'siblingConfusionEntropy':
            siblingConfusionEntropy = value;
            break;
          case 'upwardLinkStrength':
            upwardLinkStrength = value;
            break;
          case 'traversalBreadthScore':
            traversalBreadthScore = value;
            break;
          case 'strategyDepthFit':
            strategyDepthFit = value;
            break;
          case 'structuralStrategyEntropy':
            structuralStrategyEntropy = value;
            break;
          case 'structuralAttributionAccuracy':
            structuralAttributionAccuracy = value;
            break;
          case 'structuralStabilityGain':
            structuralStabilityGain = value;
            break;
          case 'boundarySensitivityImprovement':
            boundarySensitivityImprovement = value;
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        partialFailures.push({
          field,
          abbreviation: computer.abbreviation,
          error: message,
        });

        this.logger.error(
          { abbreviation: computer.abbreviation, name: computer.name, error: message },
          'Metric computation failed — defaulting to 0'
        );
      }
    }

    const metrics: IStructuralMetrics = {
      abstractionDrift,
      depthCalibrationGradient,
      scopeLeakageIndex,
      siblingConfusionEntropy,
      upwardLinkStrength,
      traversalBreadthScore,
      strategyDepthFit,
      structuralStrategyEntropy,
      structuralAttributionAccuracy,
      structuralStabilityGain,
      boundarySensitivityImprovement,
    };

    return { metrics, partialFailures };
  }

  /**
   * Compute a single metric by abbreviation (for targeted recomputation).
   */
  computeSingle(abbreviation: string, ctx: IMetricComputationContext): number {
    const computer = this.computers.find((c) => c.abbreviation === abbreviation);
    if (!computer) {
      throw new Error(`StructuralMetricsEngine: no computer registered for "${abbreviation}"`);
    }
    return computer.compute(ctx);
  }

  /** Returns all registered abbreviations. */
  get registeredAbbreviations(): readonly string[] {
    return this.computers.map((c) => c.abbreviation);
  }
}
