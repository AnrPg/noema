'use client';
/**
 * @noema/web — Knowledge / MetricDrillDown
 *
 * Expanded detail panel for a selected structural metric.
 * Shows: full metric name, plain-English description,
 *        NeuralGauge value, trend sparkline (last N snapshots).
 */
import * as React from 'react';
import { NeuralGauge } from '@noema/ui';
import type { IRadarMetric } from './radar-chart.js';

// ── Plain-English descriptions per metric key ────────────────────────────────
const METRIC_DESCRIPTIONS: Record<string, string> = {
  abstractionDrift:
    'How much your abstraction levels shift inconsistently across your graph. Lower is better.',
  depthCalibrationGradient:
    'Whether your concept depth is well-calibrated from fundamentals to advanced topics. Higher is better.',
  scopeLeakageIndex:
    'How often concepts bleed into neighboring domains without clear boundaries. Lower is better.',
  siblingConfusionEntropy:
    'How much confusion exists between sibling concepts at the same level. Lower is better.',
  upwardLinkStrength:
    'Strength of connections from specific examples up to general principles. Higher is better.',
  traversalBreadthScore:
    'How well you can traverse the breadth of your knowledge domains. Higher is better.',
  strategyDepthFit:
    'How well your learning strategy matches the depth of concepts you are working on. Higher is better.',
  structuralStrategyEntropy:
    'Disorder in the structural strategies reflected in your graph. Lower is better.',
  structuralAttributionAccuracy:
    'How accurately you attribute knowledge to correct structural categories. Higher is better.',
  structuralStabilityGain:
    'Rate at which your knowledge graph is becoming more stable over time. Higher is better.',
  boundarySensitivityImprovement:
    'How much your sensitivity to concept boundary violations has improved. Higher is better.',
};

// ── Inline SVG sparkline ──────────────────────────────────────────────────────
interface ISparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

function Sparkline({ values, width = 160, height = 36 }: ISparklineProps): React.JSX.Element {
  if (values.length < 2) {
    return <span className="text-xs text-muted-foreground">Insufficient history</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min !== 0 ? max - min : 1;

  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      aria-label={`Trend sparkline — ${String(values.length)} data points`}
      role="img"
    >
      <polyline points={pts} fill="none" stroke="#7c6ee6" strokeWidth="1.5" />
      {/* Highlight the last point */}
      {(() => {
        const lastX = width;
        const lastIdx = values.length - 1;
        const lastVal = values[lastIdx];
        if (lastVal === undefined) return null;
        const lastY = height - ((lastVal - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r={2.5} fill="#7c6ee6" />;
      })()}
    </svg>
  );
}

// ── MetricDrillDown ───────────────────────────────────────────────────────────
export interface IMetricDrillDownProps {
  metric: IRadarMetric;
  /** Ordered history entries — each entry's `score` field is used for the sparkline */
  historyScores?: number[];
  onClose: () => void;
}

export function MetricDrillDown({
  metric,
  historyScores = [],
  onClose,
}: IMetricDrillDownProps): React.JSX.Element {
  const description = METRIC_DESCRIPTIONS[metric.key] ?? 'No description available.';

  const statusColor =
    metric.value >= 0.7
      ? 'text-green-400'
      : metric.value >= 0.4
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-md"
      role="region"
      aria-label={`${metric.fullLabel} details`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{metric.fullLabel}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Close metric detail"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-4">
        <NeuralGauge value={metric.value} size="sm" />
        <span className={['text-2xl font-bold tabular-nums', statusColor].join(' ')}>
          {String(Math.round(metric.value * 100))}
          <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>
        </span>
      </div>

      {historyScores.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">
            Health trend ({String(historyScores.length)} snapshots)
          </p>
          <Sparkline values={historyScores} />
        </div>
      )}
    </div>
  );
}
