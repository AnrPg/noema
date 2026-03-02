/**
 * @noema/knowledge-graph-service — Metrics module barrel export
 */

export { buildGraphComparison } from './graph-comparison-builder.js';
export { buildMetricComputationContext } from './metric-computation-context.js';
export { StructuralMetricsEngine } from './structural-metrics-engine.js';
export type {
  IMetricPartialFailure,
  IMetricsComputationResult,
} from './structural-metrics-engine.js';

export type {
  IMetricComputationContext,
  IMetricComputer,
  ISiblingGroup,
  IStructuralRegion,
} from './types.js';

export {
  assessMetacognitiveStage,
  buildStructuralHealthReport,
  detectCrossMetricPatterns,
} from './health/index.js';
export type { ICrossMetricPattern } from './health/index.js';
