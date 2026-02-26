/**
 * @noema/knowledge-graph-service — Cross-Metric Interaction Patterns
 *
 * Detects compound patterns formed by combinations of structural metric
 * values. These patterns surface higher-order issues that individual
 * metrics cannot capture alone.
 *
 * The six patterns below are specified in STRUCTURAL-METRICS-SPECIFICATION.md
 * §Cross-Metric Interaction Patterns (L1048-1107).
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

  /** Recommended action from the spec */
  readonly suggestedAction: string;
}

// ============================================================================
// Pattern detection
// ============================================================================

/**
 * Detect cross-metric interaction patterns in the current metrics.
 *
 * All six patterns and their semantics are drawn from the structural-metrics
 * specification document.
 */
export function detectCrossMetricPatterns(metrics: IStructuralMetrics): ICrossMetricPattern[] {
  const patterns: ICrossMetricPattern[] = [];

  // ── Pattern 1: Double Misframing (High AD + High DCG) ─────────────
  // The student's hierarchy is wrong AND at the wrong depth — a
  // fundamental misorganisation of the domain.
  if (metrics.abstractionDrift > 0.5 && metrics.depthCalibrationGradient > 0.5) {
    patterns.push({
      id: 'double_misframing',
      name: 'Double Misframing',
      severity: 'critical',
      description:
        'Conceptual hierarchy is wrong AND at the wrong depth — the student is ' +
        'fundamentally misorganising the domain.',
      participatingMetrics: ['AD', 'DCG'],
      suggestedAction:
        'Scaffolded restructuring from the top down. Do not add new content; fix ' +
        'the existing hierarchy first.',
    });
  }

  // ── Pattern 2: Interdisciplinary Thinking (High SLI + Low SCE) ────
  // Cross-domain edges exist but siblings are not confused. This may
  // indicate creative interdisciplinary thinking rather than confusion.
  if (metrics.scopeLeakageIndex > 0.4 && metrics.siblingConfusionEntropy < 0.3) {
    patterns.push({
      id: 'interdisciplinary_thinking',
      name: 'Interdisciplinary Thinking',
      severity: 'info',
      description:
        'The student crosses domain boundaries but does not confuse sibling ' +
        'concepts. This may indicate genuine interdisciplinary reasoning rather ' +
        'than confusion.',
      participatingMetrics: ['SLI', 'SCE'],
      suggestedAction:
        'Validate cross-domain connections; reduce SLI penalty if they are ' +
        'pedagogically sound.',
    });
  }

  // ── Pattern 3: Weak Hierarchy (Low ULS + High TBS) ────────────────
  // Diverse relationship types but weak hierarchical links. The student
  // knows "how things relate" but not "what things are."
  if (metrics.upwardLinkStrength < 0.4 && metrics.traversalBreadthScore > 0.6) {
    patterns.push({
      id: 'weak_hierarchy',
      name: 'Weak Hierarchy',
      severity: 'warning',
      description:
        'Diverse relationship types exist but hierarchical connections are weak. ' +
        'The student understands associations but not classifications.',
      participatingMetrics: ['ULS', 'TBS'],
      suggestedAction:
        'Focus on explicit is_a and part_of exercises to build conceptual scaffolding.',
    });
  }

  // ── Pattern 4: Structural Neglect (High SSE + Low SAA) ────────────
  // The graph is structurally uneven AND the student does not realise it
  // — unintentional neglect of some regions.
  if (metrics.structuralStrategyEntropy > 0.5 && metrics.structuralAttributionAccuracy < 0.4) {
    patterns.push({
      id: 'structural_neglect',
      name: 'Structural Neglect',
      severity: 'warning',
      description:
        'The graph is structurally uneven and the student does not understand ' +
        'why. Some areas are developed while others are forgotten.',
      participatingMetrics: ['SSE', 'SAA'],
      suggestedAction:
        'Draw attention to underdeveloped regions. Use a territory-map visualisation.',
    });
  }

  // ── Pattern 5: Consolidating Wrong Boundaries (+ SSG + − BSI) ────
  // The graph is stabilising but boundary sensitivity is worsening. The
  // student is locking in incorrect domain boundaries.
  if (metrics.structuralStabilityGain > 0 && metrics.boundarySensitivityImprovement < 0) {
    patterns.push({
      id: 'consolidating_wrong_boundaries',
      name: 'Consolidating Wrong Boundaries',
      severity: 'critical',
      description:
        'The graph is stabilising overall but boundary sensitivity is worsening. ' +
        'The student is consolidating incorrect boundaries into a steady state.',
      participatingMetrics: ['SSG', 'BSI'],
      suggestedAction: 'Urgent boundary remediation before the wrong model becomes entrenched.',
    });
  }

  // ── Pattern 6: One-Dimensional Depth (High SDF + Low TBS) ────────
  // Strategy matches depth well but only one relationship type is used.
  // Effective for depth but creating one-dimensional understanding.
  if (metrics.strategyDepthFit > 0.6 && metrics.traversalBreadthScore < 0.3) {
    patterns.push({
      id: 'one_dimensional_depth',
      name: 'One-Dimensional Depth',
      severity: 'info',
      description:
        'Strategy matches depth well but the student primarily uses one type of ' +
        'relationship, creating limited understanding.',
      participatingMetrics: ['SDF', 'TBS'],
      suggestedAction:
        'Diversify relationship types; introduce exercises requiring classification, ' +
        'contrast, or composition reasoning.',
    });
  }

  return patterns;
}
