/**
 * @noema/knowledge-graph-service — Analysis Thresholds (4.6)
 *
 * Centralised policy object for business-rule thresholds used by the
 * agent-hints factory and structural-analysis helpers. Extracting these
 * from the hint generators makes them independently testable and
 * externally configurable when needed.
 */

// ============================================================================
// Subgraph & Density
// ============================================================================

/** Subgraph density below which we flag it as "sparse" (edge:node ratio). */
export const SPARSE_DENSITY_THRESHOLD = 0.1;

/** Minimum node count before the sparse-density check kicks in. */
export const SPARSE_DENSITY_MIN_NODES = 3;

// ============================================================================
// Sibling & Co-Parent Groups
// ============================================================================

/** Sibling group size above which we warn about high sibling confusion entropy. */
export const LARGE_SIBLING_GROUP_THRESHOLD = 10;

/** Co-parent group size above which we flag potential scope overlap. */
export const HIGH_CO_PARENT_THRESHOLD = 5;

// ============================================================================
// Neighborhood — Edge-Type Diversity
// ============================================================================

/** Minimum distinct edge-type groups to label a node a "structural hub". */
export const STRUCTURAL_HUB_EDGE_TYPES = 3;

// ============================================================================
// Bridge Nodes (Articulation Points)
// ============================================================================

/** Bridge count at which we flag the graph as having structural bottlenecks. */
export const BRIDGE_BOTTLENECK_THRESHOLD = 3;

// ============================================================================
// Centrality
// ============================================================================

/** StdDev-to-mean ratio above which centrality variance is "high". */
export const CENTRALITY_VARIANCE_RATIO = 0.5;

// ============================================================================
// Structural Metrics Warning Ranges
// ============================================================================

/** Abstraction drift above this triggers a warning. */
export const ABSTRACTION_DRIFT_WARNING = 0.6;

/** Scope leakage index above this triggers a warning. */
export const SCOPE_LEAKAGE_WARNING = 0.5;

/** Sibling confusion entropy above this triggers a warning. */
export const SIBLING_CONFUSION_WARNING = 0.6;

/** Structural attribution accuracy below this triggers a warning. */
export const ATTRIBUTION_ACCURACY_WARNING = 0.4;

// ============================================================================
// Misconception Confidence
// ============================================================================

/** Misconception confidence at or above this is classified "high". */
export const HIGH_CONFIDENCE_MISCONCEPTION = 0.7;

// ============================================================================
// Health Scores
// ============================================================================

/** Overall health score at or above this is "healthy". */
export const HEALTH_SCORE_HEALTHY = 0.7;

/** Overall health score at or above this (but below HEALTHY) is "warning". */
export const HEALTH_SCORE_WARNING = 0.4;

// ============================================================================
// Risk-Factor Probabilities (canonical values)
// ============================================================================

/** Risk probability for orphaned references after deletion. */
export const DELETION_ORPHAN_RISK_PROBABILITY = 0.3;
export const DELETION_ORPHAN_RISK_IMPACT = 0.4;

/** Risk probability for metrics in warning range. */
export const METRICS_WARNING_RISK_PROBABILITY = 0.7;
export const METRICS_WARNING_RISK_IMPACT = 0.5;

/** Risk probability for PKG/CKG divergences. */
export const COMPARISON_DIVERGENCE_RISK_PROBABILITY = 0.8;
export const COMPARISON_DIVERGENCE_RISK_IMPACT = 0.4;

/** Risk probability for high-confidence misconceptions. */
export const MISCONCEPTION_RISK_PROBABILITY = 0.9;
export const MISCONCEPTION_RISK_IMPACT = 0.7;

/** Risk probability for critical graph health. */
export const CRITICAL_HEALTH_RISK_PROBABILITY = 0.9;
export const CRITICAL_HEALTH_RISK_IMPACT = 0.9;

// ============================================================================
// Metric Change Detection
// ============================================================================

/** Absolute delta above which a metric change is "significant". */
export const SIGNIFICANT_CHANGE_THRESHOLD = 0.05;
