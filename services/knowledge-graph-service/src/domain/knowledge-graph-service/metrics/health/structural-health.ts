/**
 * @noema/knowledge-graph-service — Structural Health Computation
 *
 * Computes the aggregate IStructuralHealthReport from raw IStructuralMetrics.
 * Applies per-metric weights (summing to 1.0) and threshold-based health
 * classification.
 */

import type {
  IMetricStatusEntry,
  IStructuralHealthReport,
  IStructuralMetrics,
  MetacognitiveStage,
  StructuralMetricType,
  TrendDirection,
} from '@noema/types';
import { MetricHealthStatus as HealthStatus, TrendDirection as Trend } from '@noema/types';

import type { IMetricSnapshot } from '../../metrics.repository.js';
import { detectCrossMetricPatterns } from './cross-metric-patterns.js';

// ============================================================================
// Weights & Thresholds
// ============================================================================

interface IMetricConfig {
  /** Weight in the overall health score (all must sum to 1.0) */
  weight: number;
  /** Threshold below which the metric is "healthy" (for badness metrics) */
  healthyThreshold: number;
  /** Threshold above which the metric is "critical" (for badness metrics) */
  criticalThreshold: number;
  /** If true, higher is worse (badness metric); if false, higher is better */
  isBadness: boolean;
  /** Human-readable label */
  label: string;
}

const METRIC_CONFIGS: Record<string, IMetricConfig> = {
  abstractionDrift: {
    weight: 0.12,
    healthyThreshold: 0.2,
    criticalThreshold: 0.6,
    isBadness: true,
    label: 'Abstraction Drift',
  },
  depthCalibrationGradient: {
    weight: 0.1,
    healthyThreshold: 0.2,
    criticalThreshold: 0.6,
    isBadness: true,
    label: 'Depth Calibration Gradient',
  },
  scopeLeakageIndex: {
    weight: 0.1,
    healthyThreshold: 0.15,
    criticalThreshold: 0.5,
    isBadness: true,
    label: 'Scope Leakage Index',
  },
  siblingConfusionEntropy: {
    weight: 0.08,
    healthyThreshold: 0.25,
    criticalThreshold: 0.6,
    isBadness: true,
    label: 'Sibling Confusion Entropy',
  },
  upwardLinkStrength: {
    weight: 0.12,
    healthyThreshold: 0.7,
    criticalThreshold: 0.3,
    isBadness: false,
    label: 'Upward Link Strength',
  },
  traversalBreadthScore: {
    weight: 0.08,
    healthyThreshold: 0.5,
    criticalThreshold: 0.2,
    isBadness: false,
    label: 'Traversal Breadth Score',
  },
  strategyDepthFit: {
    weight: 0.08,
    healthyThreshold: 0.6,
    criticalThreshold: 0.3,
    isBadness: false,
    label: 'Strategy-Depth Fit',
  },
  structuralStrategyEntropy: {
    weight: 0.06,
    healthyThreshold: 0.3,
    criticalThreshold: 0.7,
    isBadness: true,
    label: 'Structural Strategy Entropy',
  },
  structuralAttributionAccuracy: {
    weight: 0.1,
    healthyThreshold: 0.7,
    criticalThreshold: 0.3,
    isBadness: false,
    label: 'Structural Attribution Accuracy',
  },
  structuralStabilityGain: {
    weight: 0.08,
    healthyThreshold: 0.5,
    criticalThreshold: 0.1,
    isBadness: false,
    label: 'Structural Stability Gain',
  },
  boundarySensitivityImprovement: {
    weight: 0.08,
    healthyThreshold: 0.0,
    criticalThreshold: -0.3,
    isBadness: false,
    label: 'Boundary Sensitivity Improvement',
  },
};

// ============================================================================
// Field → StructuralMetricType mapping
// ============================================================================

const FIELD_TO_METRIC_TYPE: Record<string, StructuralMetricType> = {
  abstractionDrift: 'abstraction_drift' as StructuralMetricType,
  depthCalibrationGradient: 'depth_calibration_gradient' as StructuralMetricType,
  scopeLeakageIndex: 'scope_leakage_index' as StructuralMetricType,
  siblingConfusionEntropy: 'sibling_confusion_entropy' as StructuralMetricType,
  upwardLinkStrength: 'upward_link_strength' as StructuralMetricType,
  traversalBreadthScore: 'traversal_breadth_score' as StructuralMetricType,
  strategyDepthFit: 'strategy_depth_fit' as StructuralMetricType,
  structuralStrategyEntropy: 'structural_strategy_entropy' as StructuralMetricType,
  structuralAttributionAccuracy: 'structural_attribution_accuracy' as StructuralMetricType,
  structuralStabilityGain: 'structural_stability_gain' as StructuralMetricType,
  boundarySensitivityImprovement: 'boundary_sensitivity_improvement' as StructuralMetricType,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a full structural health report from metrics, previous snapshots,
 * and current misconception/stage context.
 */
export function buildStructuralHealthReport(
  metrics: IStructuralMetrics,
  previousSnapshots: IMetricSnapshot[],
  activeMisconceptionCount: number,
  metacognitiveStage: MetacognitiveStage,
  domain: string
): IStructuralHealthReport {
  const breakdown = buildMetricBreakdown(metrics, previousSnapshots);
  const overallScore = computeOverallScore(metrics);
  const trend = computeOverallTrend(previousSnapshots);

  // Detect cross-metric interaction patterns (I-2 improvement)
  const crossPatterns = detectCrossMetricPatterns(metrics);

  return {
    overallScore,
    metricBreakdown: breakdown,
    trend,
    activeMisconceptionCount,
    metacognitiveStage,
    domain,
    generatedAt: new Date().toISOString(),
    crossMetricPatterns: crossPatterns,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function buildMetricBreakdown(
  metrics: IStructuralMetrics,
  previousSnapshots: IMetricSnapshot[]
): IMetricStatusEntry[] {
  const entries: IMetricStatusEntry[] = [];

  for (const [field, config] of Object.entries(METRIC_CONFIGS)) {
    const value = metrics[field as keyof IStructuralMetrics];
    const metricType = FIELD_TO_METRIC_TYPE[field] ?? ('abstraction_drift' as StructuralMetricType);
    const status = classifyHealth(value, config);
    const trend = computeMetricTrend(field as keyof IStructuralMetrics, previousSnapshots);
    const hint = generateHint(config.label, value, status, config.isBadness);

    entries.push({ metricType, value, status, trend, hint });
  }

  return entries;
}

function classifyHealth(
  value: number,
  config: IMetricConfig
): typeof HealthStatus.HEALTHY | typeof HealthStatus.WARNING | typeof HealthStatus.CRITICAL {
  if (config.isBadness) {
    if (value <= config.healthyThreshold) return HealthStatus.HEALTHY;
    if (value >= config.criticalThreshold) return HealthStatus.CRITICAL;
    return HealthStatus.WARNING;
  } else {
    if (value >= config.healthyThreshold) return HealthStatus.HEALTHY;
    if (value <= config.criticalThreshold) return HealthStatus.CRITICAL;
    return HealthStatus.WARNING;
  }
}

/**
 * Normalise a raw metric value to a [0,1] "goodness" score.
 *
 * Most metrics use simple inversion (badness) or direct pass-through (goodness).
 * Three special cases from STRUCTURAL-METRICS-SPECIFICATION.md:
 *
 *  - SSE → s = 1 - |SSE - 0.5| × 2   (best at 0.5, worst at extremes)
 *  - SSG → s = (SSG + 1) / 2          (maps [-1,1] → [0,1])
 *  - BSI → s = (BSI + 1) / 2          (maps [-1,1] → [0,1])
 */
function normaliseToGoodness(field: string, raw: number, config: IMetricConfig): number {
  // Special: SSE — best at 0.5, worst at 0 or 1
  if (field === 'structuralStrategyEntropy') {
    return 1 - Math.abs(raw - 0.5) * 2;
  }

  // Special: SSG / BSI — range [-1,1] mapped to [0,1]
  if (field === 'structuralStabilityGain' || field === 'boundarySensitivityImprovement') {
    return (raw + 1) / 2;
  }

  // Default: badness metrics inverted, goodness metrics pass-through
  return config.isBadness ? 1 - raw : raw;
}

function computeOverallScore(metrics: IStructuralMetrics): number {
  let score = 0;

  for (const [field, config] of Object.entries(METRIC_CONFIGS)) {
    const raw = metrics[field as keyof IStructuralMetrics];
    const goodness = normaliseToGoodness(field, raw, config);
    score += config.weight * Math.max(0, Math.min(1, goodness));
  }

  return Math.max(0, Math.min(1, score));
}

function computeMetricTrend(
  field: keyof IStructuralMetrics,
  snapshots: IMetricSnapshot[]
): TrendDirection {
  if (snapshots.length < 2) return Trend.STABLE;

  // Use last 3 snapshots (most recent first)
  const recent = snapshots.slice(0, 3);
  const values = recent.map((s) => s.metrics[field]);

  // Simple linear trend: average of pairwise differences
  let sumDelta = 0;
  for (let i = 0; i < values.length - 1; i++) {
    sumDelta += (values[i] ?? 0) - (values[i + 1] ?? 0);
  }
  const avgDelta = sumDelta / (values.length - 1);

  const threshold = 0.05;
  if (Math.abs(avgDelta) < threshold) return Trend.STABLE;
  return avgDelta > 0 ? Trend.IMPROVING : Trend.DECLINING;
}

function computeOverallTrend(snapshots: IMetricSnapshot[]): TrendDirection {
  if (snapshots.length < 2) return Trend.STABLE;

  const scores = snapshots.slice(0, 3).map((s) => computeOverallScore(s.metrics));

  let sumDelta = 0;
  for (let i = 0; i < scores.length - 1; i++) {
    sumDelta += (scores[i] ?? 0) - (scores[i + 1] ?? 0);
  }
  const avgDelta = sumDelta / (scores.length - 1);

  const threshold = 0.03;
  if (Math.abs(avgDelta) < threshold) return Trend.STABLE;
  return avgDelta > 0 ? Trend.IMPROVING : Trend.DECLINING;
}

function generateHint(label: string, value: number, status: string, isBadness: boolean): string {
  const rounded = (value * 100).toFixed(0);

  if (status === HealthStatus.HEALTHY) {
    return `${label} is healthy at ${rounded}%${isBadness ? ' (low is good)' : ''}.`;
  }
  if (status === HealthStatus.CRITICAL) {
    return `${label} is critical at ${rounded}%${isBadness ? ' — consider remediation' : ' — needs strengthening'}.`;
  }
  return `${label} is at ${rounded}% — room for improvement.`;
}
