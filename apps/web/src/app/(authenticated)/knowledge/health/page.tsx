/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — /knowledge/health
 *
 * Structural Health Dashboard:
 *   1. Hero — NeuralGauge with overall health score + grade
 *   2. Radar chart — 11 structural metrics (click axis to drill down)
 *   3. Metric drill-down — expands below radar on axis click
 *   4. Recommendations — insight cards from health report
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useStructuralHealth, useMetricHistory } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { NeuralGauge } from '@noema/ui';
import { Loader2 } from 'lucide-react';
import { RadarChart } from '@/components/knowledge/radar-chart';
import type { IRadarMetric } from '@/components/knowledge/radar-chart';
import { MetricDrillDown } from '@/components/knowledge/metric-drill-down';

// ── 11 structural metric definitions ─────────────────────────────────────────
const METRIC_DEFS: { key: string; label: string; fullLabel: string }[] = [
  { key: 'abstractionDrift', label: 'AbsDrift', fullLabel: 'Abstraction Drift' },
  { key: 'depthCalibrationGradient', label: 'DepthCal', fullLabel: 'Depth Calibration Gradient' },
  { key: 'scopeLeakageIndex', label: 'ScopeLeak', fullLabel: 'Scope Leakage Index' },
  { key: 'siblingConfusionEntropy', label: 'SibConf', fullLabel: 'Sibling Confusion Entropy' },
  { key: 'upwardLinkStrength', label: 'UpLink', fullLabel: 'Upward Link Strength' },
  { key: 'traversalBreadthScore', label: 'TravBreadth', fullLabel: 'Traversal Breadth Score' },
  { key: 'strategyDepthFit', label: 'StratFit', fullLabel: 'Strategy Depth Fit' },
  {
    key: 'structuralStrategyEntropy',
    label: 'StratEntr',
    fullLabel: 'Structural Strategy Entropy',
  },
  {
    key: 'structuralAttributionAccuracy',
    label: 'AttribAcc',
    fullLabel: 'Structural Attribution Accuracy',
  },
  { key: 'structuralStabilityGain', label: 'StabGain', fullLabel: 'Structural Stability Gain' },
  {
    key: 'boundarySensitivityImprovement',
    label: 'BndSens',
    fullLabel: 'Boundary Sensitivity Improvement',
  },
];

const GRADE_COLORS: Record<string, string> = {
  excellent: 'text-green-400',
  good: 'text-blue-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
};

export default function KnowledgeHealthPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [selectedMetricKey, setSelectedMetricKey] = React.useState<string | null>(null);

  const { data: healthResponse, isLoading: healthLoading } = useStructuralHealth(userId);
  const { data: historyResponse, isLoading: historyLoading } = useMetricHistory(userId);

  const isLoading = healthLoading || historyLoading;

  const health: any = (healthResponse as any)?.data ?? null;
  const historyEntries: any[] = (historyResponse as any)?.data?.entries ?? [];

  // Build 11-metric array for RadarChart from health report
  const radarMetrics: IRadarMetric[] = React.useMemo(() => {
    if (health === null) {
      return METRIC_DEFS.map((d) => ({ ...d, value: 0 }));
    }
    return METRIC_DEFS.map((d) => {
      const raw = health[d.key];
      // If individual metric is not present, use 0 — fabricating a balanced polygon
      // from the overall score would misrepresent "no data" as meaningful structure.
      const rawScore: number = typeof raw === 'number' ? raw : 0;
      const value = Math.min(1, Math.max(0, rawScore));
      return { ...d, value };
    });
  }, [health]);

  // History scores (overall score across time) for sparkline
  const historyScores: number[] = React.useMemo(
    () => historyEntries.map((e) => (typeof e.score === 'number' ? (e.score as number) : 0)),
    [historyEntries]
  );

  const selectedMetric = React.useMemo(
    () => radarMetrics.find((m) => m.key === selectedMetricKey) ?? null,
    [radarMetrics, selectedMetricKey]
  );

  const handleAxisClick = React.useCallback((metric: IRadarMetric) => {
    setSelectedMetricKey((prev) => (prev === metric.key ? null : metric.key));
  }, []);

  const handleDrillDownClose = React.useCallback(() => {
    setSelectedMetricKey(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">Structural Health</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading health report…
        </div>
      </div>
    );
  }

  if (health === null) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Structural Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How well-structured and internally consistent your knowledge graph is.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-16 text-sm text-muted-foreground">
          No health data available yet. Complete study sessions to generate your first health
          report.
        </div>
      </div>
    );
  }

  const score: number = typeof health?.score === 'number' ? (health.score as number) : 0;
  const grade: string = typeof health?.grade === 'string' ? (health.grade as string) : 'fair';
  const issues: string[] = Array.isArray(health?.issues) ? (health.issues as string[]) : [];
  const recommendations: string[] = Array.isArray(health?.recommendations)
    ? (health.recommendations as string[])
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Structural Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How well-structured and internally consistent your knowledge graph is.
        </p>
      </div>

      {/* ── Section 1: Hero ─────────────────────────────────────────────── */}
      <section
        aria-label="Overall health score"
        className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-6"
      >
        <NeuralGauge value={score} size="lg" />
        <div>
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {String(Math.round(score * 100))}
            <span className="ml-1 text-xl font-normal text-muted-foreground">/ 100</span>
          </p>
          <p
            className={[
              'text-lg font-semibold capitalize',
              GRADE_COLORS[grade] ?? 'text-foreground',
            ].join(' ')}
          >
            {grade}
          </p>
        </div>
        {issues.length > 0 && (
          <div className="ml-auto flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Active Issues
            </p>
            {issues.slice(0, 3).map((issue) => (
              <p key={issue} className="text-xs text-muted-foreground">
                {issue}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2 + 3: Radar + Drill-down ──────────────────────────── */}
      <section aria-label="Structural metrics radar">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Metric Radar — click any axis to drill down
        </h2>
        <div className="flex flex-wrap items-start gap-8">
          <RadarChart
            metrics={radarMetrics}
            size={380}
            selectedKey={selectedMetricKey}
            onAxisClick={handleAxisClick}
          />
          {selectedMetric !== null && (
            <div className="flex-1 min-w-[280px]">
              <MetricDrillDown
                metric={selectedMetric}
                historyScores={historyScores}
                onClose={handleDrillDownClose}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Section 4: Recommendations ──────────────────────────────────── */}
      {recommendations.length > 0 && (
        <section aria-label="Health recommendations">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recommendations
          </h2>
          <div className="flex flex-col gap-2">
            {recommendations.map((rec) => (
              <div
                key={rec}
                className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
              >
                {rec}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
