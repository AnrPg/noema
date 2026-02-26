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
// Engine
// ============================================================================

export class StructuralMetricsEngine {
  private readonly computers: readonly IMetricComputer[];

  constructor() {
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
   * Returns a complete IStructuralMetrics object.
   */
  computeAll(ctx: IMetricComputationContext): IStructuralMetrics {
    const result: Record<string, number> = {};

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
        result[field] = value;
      } catch (error) {
        // Defensive: a single metric failure shouldn't crash the entire computation
        result[field] = 0;

        console.error(
          `StructuralMetricsEngine: ${computer.abbreviation} (${computer.name}) failed:`,
          error
        );
      }
    }

    return result as unknown as IStructuralMetrics;
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
