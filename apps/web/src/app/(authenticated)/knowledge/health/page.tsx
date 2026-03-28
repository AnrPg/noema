'use client';
/**
 * @noema/web — /knowledge/health
 *
 * Structural Health Dashboard:
 *   1. Hero — overall health score + grade
 *   2. Metacognitive stage bar — current scaffolding stage + evidence/gaps
 *   3. Radar chart — 11 health-normalized structural metrics
 *   4. Metric drill-down — selected metric status, hint, and history
 *   5. Recommendations + cross-metric patterns
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useMetacognitiveStage, useMetricHistory, useStructuralHealth } from '@noema/api-client';
import type { StructuralMetricType, UserId } from '@noema/types';
import { NeuralGauge } from '@noema/ui';
import { AlertTriangle, ArrowRight, Loader2, Sparkles, TrendingDown } from 'lucide-react';
import { MetricDrillDown } from '@/components/knowledge/metric-drill-down';
import { RadarChart } from '@/components/knowledge/radar-chart';
import type { IRadarMetric } from '@/components/knowledge/radar-chart';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import { getStudyModeDescription, getStudyModeLabel } from '@/lib/study-mode';

type MetricKey =
  | 'abstractionDrift'
  | 'depthCalibrationGradient'
  | 'scopeLeakageIndex'
  | 'siblingConfusionEntropy'
  | 'upwardLinkStrength'
  | 'traversalBreadthScore'
  | 'strategyDepthFit'
  | 'structuralStrategyEntropy'
  | 'structuralAttributionAccuracy'
  | 'structuralStabilityGain'
  | 'boundarySensitivityImprovement';

const BADNESS_METRICS: MetricKey[] = [
  'abstractionDrift',
  'depthCalibrationGradient',
  'scopeLeakageIndex',
  'siblingConfusionEntropy',
];

const METRIC_TYPE_BY_KEY: Record<MetricKey, StructuralMetricType> = {
  abstractionDrift: 'abstraction_drift',
  depthCalibrationGradient: 'depth_calibration_gradient',
  scopeLeakageIndex: 'scope_leakage_index',
  siblingConfusionEntropy: 'sibling_confusion_entropy',
  upwardLinkStrength: 'upward_link_strength',
  traversalBreadthScore: 'traversal_breadth_score',
  strategyDepthFit: 'strategy_depth_fit',
  structuralStrategyEntropy: 'structural_strategy_entropy',
  structuralAttributionAccuracy: 'structural_attribution_accuracy',
  structuralStabilityGain: 'structural_stability_gain',
  boundarySensitivityImprovement: 'boundary_sensitivity_improvement',
};

const METRIC_DEFS: { key: MetricKey; label: string; fullLabel: string; ideal?: number }[] = [
  { key: 'abstractionDrift', label: 'AbsDrift', fullLabel: 'Abstraction Drift', ideal: 0.9 },
  {
    key: 'depthCalibrationGradient',
    label: 'DepthCal',
    fullLabel: 'Depth Calibration Gradient',
    ideal: 0.9,
  },
  { key: 'scopeLeakageIndex', label: 'ScopeLeak', fullLabel: 'Scope Leakage Index', ideal: 0.9 },
  {
    key: 'siblingConfusionEntropy',
    label: 'SibConf',
    fullLabel: 'Sibling Confusion Entropy',
    ideal: 0.85,
  },
  { key: 'upwardLinkStrength', label: 'UpLink', fullLabel: 'Upward Link Strength', ideal: 0.8 },
  {
    key: 'traversalBreadthScore',
    label: 'TravBreadth',
    fullLabel: 'Traversal Breadth Score',
    ideal: 0.75,
  },
  { key: 'strategyDepthFit', label: 'StratFit', fullLabel: 'Strategy Depth Fit', ideal: 0.8 },
  {
    key: 'structuralStrategyEntropy',
    label: 'StratEntr',
    fullLabel: 'Structural Strategy Entropy',
    ideal: 1,
  },
  {
    key: 'structuralAttributionAccuracy',
    label: 'AttribAcc',
    fullLabel: 'Structural Attribution Accuracy',
    ideal: 0.85,
  },
  {
    key: 'structuralStabilityGain',
    label: 'StabGain',
    fullLabel: 'Structural Stability Gain',
    ideal: 0.8,
  },
  {
    key: 'boundarySensitivityImprovement',
    label: 'BndSens',
    fullLabel: 'Boundary Sensitivity Improvement',
    ideal: 0.8,
  },
];

const STAGE_STEPS = [
  {
    key: 'system_guided',
    label: 'System-Guided',
    description: 'The system scaffolds PKG structure and the learner reviews suggestions.',
  },
  {
    key: 'structure_salient',
    label: 'Structure-Salient',
    description: 'The learner begins to notice and refine structural patterns with guidance.',
  },
  {
    key: 'shared_control',
    label: 'Shared Control',
    description: 'System and learner jointly shape the PKG through recommendations and edits.',
  },
  {
    key: 'user_owned',
    label: 'User-Owned',
    description: 'The learner actively manages PKG structure with minimal scaffolding.',
  },
] as const;

const GRADE_COLORS: Record<string, string> = {
  excellent: 'text-green-400',
  good: 'text-blue-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
};

const PATTERN_ACCENT: Record<string, string> = {
  info: 'border-blue-500/40 bg-blue-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  critical: 'border-red-500/40 bg-red-500/10',
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeMetricForRadar(key: MetricKey, raw: number): number {
  if (key === 'structuralStrategyEntropy') {
    return clamp(1 - Math.abs(raw - 0.5) * 2);
  }

  if (key === 'structuralStabilityGain' || key === 'boundarySensitivityImprovement') {
    return clamp((raw + 1) / 2);
  }

  if (BADNESS_METRICS.includes(key)) {
    return clamp(1 - raw);
  }

  return clamp(raw);
}

function formatPercent(value: number): string {
  return `${String(Math.round(clamp(value) * 100))}%`;
}

function prettifyStage(stage: string): string {
  return stage
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export default function KnowledgeHealthPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const activeStudyMode = useActiveStudyMode();
  const [selectedMetricKey, setSelectedMetricKey] = React.useState<MetricKey | null>(null);

  const { data: healthResponse, isLoading: healthLoading } = useStructuralHealth(userId, {
    studyMode: activeStudyMode,
  });
  const { data: stageResponse, isLoading: stageLoading } = useMetacognitiveStage(userId, {
    studyMode: activeStudyMode,
  });
  const { data: historyResponse, isLoading: historyLoading } = useMetricHistory(userId, {
    studyMode: activeStudyMode,
  });

  const isLoading = healthLoading || stageLoading || historyLoading;
  const health = healthResponse?.data ?? null;
  const stage = stageResponse?.data ?? null;
  const historyEntries = historyResponse?.data.entries ?? [];

  const radarMetrics: IRadarMetric[] = React.useMemo(() => {
    if (health === null) {
      return METRIC_DEFS.map((metric) => ({ ...metric, value: 0 }));
    }

    return METRIC_DEFS.map((metric) => ({
      ...metric,
      value: normalizeMetricForRadar(metric.key, health[metric.key]),
    }));
  }, [health]);

  const metricBreakdownByType = React.useMemo(() => {
    return new Map((health?.metricBreakdown ?? []).map((entry) => [entry.metricType, entry]));
  }, [health]);

  const historyScores = React.useMemo(
    () => historyEntries.map((entry) => entry.score),
    [historyEntries]
  );

  const selectedMetric = React.useMemo(
    () => radarMetrics.find((metric) => metric.key === selectedMetricKey) ?? null,
    [radarMetrics, selectedMetricKey]
  );

  const selectedMetricBreakdown = React.useMemo(() => {
    if (selectedMetricKey === null) {
      return null;
    }

    return metricBreakdownByType.get(METRIC_TYPE_BY_KEY[selectedMetricKey]) ?? null;
  }, [metricBreakdownByType, selectedMetricKey]);

  const currentStage = stage?.currentStage ?? health?.metacognitiveStage ?? 'system_guided';
  const currentStageMeta =
    STAGE_STEPS.find((stageStep) => stageStep.key === currentStage) ?? STAGE_STEPS[0];
  const currentStageIndex = STAGE_STEPS.findIndex((stageStep) => stageStep.key === currentStage);

  const handleAxisClick = React.useCallback((metric: IRadarMetric) => {
    setSelectedMetricKey((previous) =>
      previous === metric.key ? null : (metric.key as MetricKey)
    );
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
            How well-structured and internally consistent your knowledge graph is in{' '}
            {getStudyModeLabel(activeStudyMode)}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getStudyModeDescription(activeStudyMode)}
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-16 text-sm text-muted-foreground">
          No health data available yet. Complete study sessions to generate your first health
          report.
        </div>
      </div>
    );
  }

  const displayScore = health.overallScore;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Structural Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How well-structured and internally consistent your knowledge graph is in{' '}
          {getStudyModeLabel(activeStudyMode)}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {getStudyModeDescription(activeStudyMode)}
        </p>
      </div>

      <section
        aria-label="Overall health score"
        className="grid gap-6 rounded-xl border border-border bg-card p-6 lg:grid-cols-[auto,1fr,320px]"
      >
        <div className="flex items-center gap-5">
          <NeuralGauge value={displayScore} size="lg" />
          <div>
            <p className="text-4xl font-bold tabular-nums text-foreground">
              {String(Math.round(displayScore * 100))}
              <span className="ml-1 text-xl font-normal text-muted-foreground">/ 100</span>
            </p>
            <p
              className={[
                'text-lg font-semibold capitalize',
                GRADE_COLORS[health.grade] ?? 'text-foreground',
              ].join(' ')}
            >
              {health.grade}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Domain: {health.domain} • Generated {new Date(health.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trend</p>
            <p className="mt-2 text-sm font-medium capitalize text-foreground">{health.trend}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Misconceptions</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {String(health.activeMisconceptionCount)} active
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Stage</p>
            <p className="mt-2 text-sm font-medium text-foreground">{currentStageMeta.label}</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active Issues
          </p>
          {health.issues.length > 0 ? (
            <div className="space-y-2">
              {health.issues.slice(0, 4).map((issue) => (
                <div
                  key={issue}
                  className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground"
                >
                  {issue}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active structural issues detected.</p>
          )}
        </div>
      </section>

      <section
        aria-label="Metacognitive stage"
        className="rounded-xl border border-border bg-card p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Metacognitive Stage</h2>
            <p className="mt-1 text-sm text-muted-foreground">{currentStageMeta.description}</p>
          </div>
          <div className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
            {prettifyStage(currentStage)}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {STAGE_STEPS.map((stageStep, index) => {
            const isCurrent = stageStep.key === currentStage;
            const isReached = index <= currentStageIndex;
            return (
              <div
                key={stageStep.key}
                className={[
                  'rounded-xl border p-4 transition-colors',
                  isCurrent
                    ? 'border-blue-500/60 bg-blue-500/10'
                    : isReached
                      ? 'border-border bg-background/50'
                      : 'border-border/60 bg-background/20',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{stageStep.label}</p>
                  <span
                    className={[
                      'h-2.5 w-2.5 rounded-full',
                      isCurrent ? 'bg-blue-400' : isReached ? 'bg-emerald-400' : 'bg-slate-600',
                    ].join(' ')}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {stageStep.description}
                </p>
              </div>
            );
          })}
        </div>

        {stage !== null && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-blue-400" aria-hidden="true" />
                Stage Evidence
              </div>
              <div className="mt-3 space-y-2">
                {stage.stageEvidence.length > 0 ? (
                  stage.stageEvidence.slice(0, 4).map((criterion) => (
                    <div
                      key={`${criterion.metricType}-${criterion.operator}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-foreground">{criterion.metricType}</p>
                        <p className="text-xs text-muted-foreground">
                          {criterion.operator} {formatPercent(criterion.threshold)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {formatPercent(criterion.currentValue)}
                        </p>
                        <p
                          className={[
                            'text-xs uppercase tracking-wide',
                            criterion.met ? 'text-green-400' : 'text-amber-400',
                          ].join(' ')}
                        >
                          {criterion.met ? 'met' : 'in progress'}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No stage evidence available yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ArrowRight className="h-4 w-4 text-amber-400" aria-hidden="true" />
                Next-Stage Gaps
              </div>
              <div className="mt-3 space-y-2">
                {stage.nextStageGaps.length > 0 ? (
                  stage.nextStageGaps.slice(0, 4).map((gap) => (
                    <div
                      key={`${gap.metricType}-${String(gap.requiredValue)}`}
                      className="rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-foreground">{gap.metricType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{gap.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Current {formatPercent(gap.currentValue)} → target{' '}
                        {formatPercent(gap.requiredValue)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No blocking gaps detected for the next stage.
                  </p>
                )}
              </div>

              {stage.regressionDetected && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  Recent metrics suggest a regression risk. Tighten scope and review the weakest
                  graph regions before expanding further.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Structural metrics radar">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Metric Radar — click any axis to drill down
        </h2>
        <div className="flex flex-wrap items-start gap-8 rounded-xl border border-border bg-card p-6">
          <RadarChart
            metrics={radarMetrics}
            size={380}
            selectedKey={selectedMetricKey}
            onAxisClick={handleAxisClick}
          />
          {selectedMetric !== null && (
            <div className="min-w-[280px] flex-1">
              <MetricDrillDown
                metric={selectedMetric}
                historyScores={historyScores}
                historyLabel="Overall health trend"
                {...(selectedMetricBreakdown !== null
                  ? {
                      status: selectedMetricBreakdown.status,
                      trend: selectedMetricBreakdown.trend,
                      hint: selectedMetricBreakdown.hint,
                    }
                  : {})}
                onClose={handleDrillDownClose}
              />
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div aria-label="Health recommendations">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recommendations
          </h2>
          <div className="space-y-2">
            {health.recommendations.length > 0 ? (
              health.recommendations.map((recommendation) => (
                <div
                  key={recommendation}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
                >
                  {recommendation}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                No recommendations available yet.
              </div>
            )}
          </div>
        </div>

        <div aria-label="Cross metric patterns">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Cross-Metric Patterns
          </h2>
          <div className="space-y-3">
            {(health.crossMetricPatterns ?? []).length > 0 ? (
              health.crossMetricPatterns?.map((pattern) => (
                <div
                  key={pattern.id}
                  className={[
                    'rounded-xl border px-4 py-4',
                    PATTERN_ACCENT[pattern.severity] ?? 'border-border bg-card',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{pattern.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{pattern.description}</p>
                    </div>
                    <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {pattern.severity}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pattern.participatingMetrics.map((metric) => (
                      <span
                        key={metric}
                        className="rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground"
                      >
                        {metric}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-sm text-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span>{pattern.suggestedAction}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                No cross-metric interaction patterns detected yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
