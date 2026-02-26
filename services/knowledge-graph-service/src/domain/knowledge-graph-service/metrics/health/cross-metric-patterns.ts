/**
 * @noema/knowledge-graph-service — Cross-Metric Interaction Patterns
 *
 * Detects compound patterns formed by combinations of structural metric
 * values. These patterns surface higher-order issues that individual
 * metrics cannot capture alone.
 */

import type { IStructuralMetrics } from '@noema/types';

// ============================================================================
// Pattern types
// ============================================================================

export interface ICrossMetricPattern {
  /** Unique pattern identifier */
  readonly id: string;

  /** Human-readable pattern name */
  readonly name: string;

  /** Severity: info, warning, critical */
  readonly severity: 'info' | 'warning' | 'critical';

  /** Human-readable description of what the pattern means */
  readonly description: string;

  /** Which metric abbreviations participate in this pattern */
  readonly participatingMetrics: readonly string[];
}

// ============================================================================
// Pattern detection
// ============================================================================

/**
 * Detect cross-metric interaction patterns in the current metrics.
 */
export function detectCrossMetricPatterns(metrics: IStructuralMetrics): ICrossMetricPattern[] {
  const patterns: ICrossMetricPattern[] = [];

  // ── Pattern 1: Orphaned Depth ─────────────────────────────────────
  // High depth calibration gradient + low upward link strength
  // → student adds deep nodes but doesn't connect them to abstractions
  if (metrics.depthCalibrationGradient > 0.4 && metrics.upwardLinkStrength < 0.4) {
    patterns.push({
      id: 'orphaned_depth',
      name: 'Orphaned Depth',
      severity: 'warning',
      description:
        'Deep concepts exist but lack proper hierarchical connections. ' +
        'The student may be memorising specifics without understanding their place in the broader structure.',
      participatingMetrics: ['DCG', 'ULS'],
    });
  }

  // ── Pattern 2: Shallow Breadth Without Depth ──────────────────────
  // High traversal breadth + low strategy depth fit + shallow bias
  if (metrics.traversalBreadthScore > 0.6 && metrics.strategyDepthFit < 0.4) {
    patterns.push({
      id: 'shallow_breadth',
      name: 'Shallow Breadth Without Depth',
      severity: 'info',
      description:
        'The graph has diverse edge types but the depth profile does not match the learning strategy. ' +
        'Consider deepening understanding in a few areas rather than expanding breadth.',
      participatingMetrics: ['TBS', 'SDF'],
    });
  }

  // ── Pattern 3: Structural Confusion ───────────────────────────────
  // High sibling confusion + high abstraction drift
  // → student confuses related concepts AND misplaces them in the hierarchy
  if (metrics.siblingConfusionEntropy > 0.4 && metrics.abstractionDrift > 0.4) {
    patterns.push({
      id: 'structural_confusion',
      name: 'Structural Confusion',
      severity: 'critical',
      description:
        'The student both confuses sibling concepts and misplaces them in the hierarchy. ' +
        'This compound pattern suggests fundamental conceptual misunderstanding that needs targeted remediation.',
      participatingMetrics: ['SCE', 'AD'],
    });
  }

  // ── Pattern 4: Leaking Despite Accuracy ───────────────────────────
  // High scope leakage + high attribution accuracy
  // → student understands concepts correctly but connects them across domains inappropriately
  if (metrics.scopeLeakageIndex > 0.3 && metrics.structuralAttributionAccuracy > 0.6) {
    patterns.push({
      id: 'accurate_but_leaking',
      name: 'Accurate but Leaking',
      severity: 'info',
      description:
        'Concepts are correctly attributed but inappropriately connected across domains. ' +
        'This may reflect genuine interdisciplinary thinking or domain boundary confusion.',
      participatingMetrics: ['SLI', 'SAA'],
    });
  }

  // ── Pattern 5: Unstable Despite Progress ──────────────────────────
  // Low structural stability + improving attribution accuracy
  // → student is restructuring (good) but creating churn (risky)
  if (metrics.structuralStabilityGain < 0.3 && metrics.structuralAttributionAccuracy > 0.5) {
    patterns.push({
      id: 'productive_instability',
      name: 'Productive Instability',
      severity: 'info',
      description:
        'The graph is undergoing significant restructuring while attribution accuracy remains good. ' +
        'This may indicate healthy conceptual reorganisation.',
      participatingMetrics: ['SSG', 'SAA'],
    });
  }

  // ── Pattern 6: Stagnant Despite Good Structure ────────────────────
  // High overall scores but no stability gain or boundary improvement
  // → student has stopped growing
  if (
    metrics.upwardLinkStrength > 0.7 &&
    metrics.abstractionDrift < 0.2 &&
    metrics.structuralStabilityGain > 0.8 &&
    metrics.boundarySensitivityImprovement < 0.05
  ) {
    patterns.push({
      id: 'structural_plateau',
      name: 'Structural Plateau',
      severity: 'info',
      description:
        'The graph is well-structured and stable but shows no recent improvement. ' +
        'The student may benefit from more challenging material or new domains.',
      participatingMetrics: ['ULS', 'AD', 'SSG', 'BSI'],
    });
  }

  return patterns;
}
