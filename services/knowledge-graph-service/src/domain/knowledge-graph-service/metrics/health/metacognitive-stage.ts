/**
 * @noema/knowledge-graph-service — Metacognitive Stage Assessment
 *
 * Evaluates which metacognitive stage a student currently occupies based
 * on their structural metric values. Implements the stage gate criteria
 * from the Phase 7 specification.
 *
 * Stages (from lowest to highest autonomy):
 *   system_guided → structure_salient → shared_control → user_owned
 */

import type {
  IMetacognitiveStageAssessment,
  IStageGateCriterion,
  IStageGateGap,
  IStructuralMetrics,
  MetacognitiveStage,
  StructuralMetricType,
} from '@noema/types';
import { MetacognitiveStage as Stage, StructuralMetricType as SMT } from '@noema/types';

// ============================================================================
// Stage Gate Definitions
// ============================================================================

interface IGateRule {
  /** Which IStructuralMetrics field to check */
  field: keyof IStructuralMetrics;
  /** StructuralMetricType enum value for the criterion */
  metricType: StructuralMetricType;
  /** Comparison operator */
  operator: 'below' | 'above' | 'stable' | 'improving';
  /** Threshold value */
  threshold: number;
}

/**
 * To reach a stage, ALL gate rules for that stage must be met.
 * Stages are evaluated in order; the highest stage whose gates are
 * fully satisfied is the current stage.
 */
const STAGE_GATES: ReadonlyMap<MetacognitiveStage, readonly IGateRule[]> = new Map([
  // ── structure_salient: user notices structural patterns ─────────
  [
    Stage.STRUCTURE_SALIENT,
    [
      {
        field: 'abstractionDrift',
        metricType: SMT.ABSTRACTION_DRIFT,
        operator: 'below',
        threshold: 0.5,
      },
      {
        field: 'upwardLinkStrength',
        metricType: SMT.UPWARD_LINK_STRENGTH,
        operator: 'above',
        threshold: 0.4,
      },
      {
        field: 'traversalBreadthScore',
        metricType: SMT.TRAVERSAL_BREADTH_SCORE,
        operator: 'above',
        threshold: 0.3,
      },
    ],
  ],

  // ── shared_control: user can co-manage their learning ───────────
  [
    Stage.SHARED_CONTROL,
    [
      {
        field: 'abstractionDrift',
        metricType: SMT.ABSTRACTION_DRIFT,
        operator: 'below',
        threshold: 0.3,
      },
      {
        field: 'scopeLeakageIndex',
        metricType: SMT.SCOPE_LEAKAGE_INDEX,
        operator: 'below',
        threshold: 0.2,
      },
      {
        field: 'upwardLinkStrength',
        metricType: SMT.UPWARD_LINK_STRENGTH,
        operator: 'above',
        threshold: 0.6,
      },
      {
        field: 'strategyDepthFit',
        metricType: SMT.STRATEGY_DEPTH_FIT,
        operator: 'above',
        threshold: 0.5,
      },
      {
        field: 'structuralAttributionAccuracy',
        metricType: SMT.STRUCTURAL_ATTRIBUTION_ACCURACY,
        operator: 'above',
        threshold: 0.6,
      },
    ],
  ],

  // ── user_owned: fully autonomous learner ────────────────────────
  [
    Stage.USER_OWNED,
    [
      {
        field: 'abstractionDrift',
        metricType: SMT.ABSTRACTION_DRIFT,
        operator: 'below',
        threshold: 0.15,
      },
      {
        field: 'scopeLeakageIndex',
        metricType: SMT.SCOPE_LEAKAGE_INDEX,
        operator: 'below',
        threshold: 0.1,
      },
      {
        field: 'siblingConfusionEntropy',
        metricType: SMT.SIBLING_CONFUSION_ENTROPY,
        operator: 'below',
        threshold: 0.2,
      },
      {
        field: 'upwardLinkStrength',
        metricType: SMT.UPWARD_LINK_STRENGTH,
        operator: 'above',
        threshold: 0.8,
      },
      {
        field: 'strategyDepthFit',
        metricType: SMT.STRATEGY_DEPTH_FIT,
        operator: 'above',
        threshold: 0.7,
      },
      {
        field: 'structuralAttributionAccuracy',
        metricType: SMT.STRUCTURAL_ATTRIBUTION_ACCURACY,
        operator: 'above',
        threshold: 0.8,
      },
      {
        field: 'structuralStabilityGain',
        metricType: SMT.STRUCTURAL_STABILITY_GAIN,
        operator: 'above',
        threshold: 0.5,
      },
    ],
  ],
]);

/** Ordered stages from highest to lowest autonomy */
const STAGE_ORDER: readonly MetacognitiveStage[] = [
  Stage.USER_OWNED,
  Stage.SHARED_CONTROL,
  Stage.STRUCTURE_SALIENT,
  Stage.SYSTEM_GUIDED,
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Assess the student's current metacognitive stage based on structural metrics.
 *
 * Evaluates stage gates from highest to lowest. The first stage whose
 * gates are ALL satisfied becomes the current stage.
 */
export function assessMetacognitiveStage(
  metrics: IStructuralMetrics,
  previousMetrics: IStructuralMetrics | null,
  domain: string
): IMetacognitiveStageAssessment {
  let currentStage: MetacognitiveStage = Stage.SYSTEM_GUIDED;
  let stageEvidence: IStageGateCriterion[] = [];

  // Try each stage from highest to lowest
  for (const stage of STAGE_ORDER) {
    const gates = STAGE_GATES.get(stage);
    if (!gates) continue;

    const criteria = evaluateGates(gates, metrics, previousMetrics);
    const allMet = criteria.every((c) => c.met);

    if (allMet) {
      currentStage = stage;
      stageEvidence = criteria;
      break;
    }
  }

  // If we ended up at SYSTEM_GUIDED, there are no gates to evidence
  if (currentStage === Stage.SYSTEM_GUIDED && stageEvidence.length === 0) {
    stageEvidence = []; // No gates for the base stage
  }

  // Compute gaps to the NEXT stage above current
  const nextStageGaps = computeNextStageGaps(currentStage, metrics, previousMetrics);

  // Detect regression: if the previous stage was higher, flag it
  const regressionDetected = detectRegression(currentStage, previousMetrics);

  return {
    currentStage,
    domain,
    stageEvidence,
    nextStageGaps,
    regressionDetected,
    assessedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function evaluateGates(
  gates: readonly IGateRule[],
  metrics: IStructuralMetrics,
  previousMetrics: IStructuralMetrics | null
): IStageGateCriterion[] {
  return gates.map((gate) => {
    const currentValue = metrics[gate.field];
    const met = evaluateCondition(gate, currentValue, previousMetrics);

    return {
      metricType: gate.metricType,
      threshold: gate.threshold,
      operator: gate.operator,
      currentValue,
      met,
    };
  });
}

function evaluateCondition(
  gate: IGateRule,
  value: number,
  previousMetrics: IStructuralMetrics | null
): boolean {
  switch (gate.operator) {
    case 'below':
      return value < gate.threshold;
    case 'above':
      return value > gate.threshold;
    case 'stable': {
      if (!previousMetrics) return false;
      const prev = previousMetrics[gate.field];
      return Math.abs(value - prev) < gate.threshold;
    }
    case 'improving': {
      if (!previousMetrics) return false;
      const prev = previousMetrics[gate.field];
      // For improving: value should be better than previous
      // (higher for goodness, lower for badness — use threshold sign as hint)
      return value > prev;
    }
    default:
      return false;
  }
}

function computeNextStageGaps(
  currentStage: MetacognitiveStage,
  metrics: IStructuralMetrics,
  previousMetrics: IStructuralMetrics | null
): IStageGateGap[] {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  // If already at highest, no gaps
  if (currentIndex <= 0) return [];

  const nextStage = STAGE_ORDER[currentIndex - 1];
  if (nextStage === undefined) return [];
  const gates = STAGE_GATES.get(nextStage);
  if (!gates) return [];

  const gaps: IStageGateGap[] = [];

  for (const gate of gates) {
    const currentValue = metrics[gate.field];
    const met = evaluateCondition(gate, currentValue, previousMetrics);

    if (!met) {
      const gap = Math.abs(currentValue - gate.threshold);
      gaps.push({
        metricType: gate.metricType,
        currentValue,
        requiredValue: gate.threshold,
        gap,
        description: `${gate.field} needs to be ${gate.operator} ${String(gate.threshold)} (currently ${currentValue.toFixed(3)})`,
      });
    }
  }

  return gaps;
}

function detectRegression(
  currentStage: MetacognitiveStage,
  previousMetrics: IStructuralMetrics | null
): boolean {
  if (!previousMetrics) return false;

  // Re-assess the previous metrics to find the previous stage
  const prevAssessment = assessMetacognitiveStage(previousMetrics, null, '');
  const prevIndex = STAGE_ORDER.indexOf(prevAssessment.currentStage);
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  // Regression = moving to a lower stage (higher index in STAGE_ORDER)
  return currentIndex > prevIndex;
}
