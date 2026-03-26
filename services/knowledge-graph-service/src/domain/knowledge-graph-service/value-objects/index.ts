/**
 * @noema/knowledge-graph-service - Value Objects Barrel Export
 *
 * Re-exports all value objects, their factory methods, and supporting types.
 */

// Graph value objects — EdgePolicy, ValidationOptions, TraversalOptions, NodeFilter
export {
  EdgePolicy,
  NodeFilter,
  TraversalOptions,
  ValidationOptions,
} from './graph.value-objects.js';

export type {
  IEdgePolicy,
  INodeFilter,
  ITraversalOptions,
  IValidationOptions,
  TraversalDirection,
} from './graph.value-objects.js';

// Local branded numerics — PositiveDepth (KG-specific)
export { PositiveDepth } from './branded-numerics.js';
export type { PositiveDepth as PositiveDepthType } from './branded-numerics.js';

// PKG↔CKG comparison
export { ComparisonScopeMode, DivergenceSeverity, DivergenceType } from './comparison.js';
export type {
  ComparisonScopeMode as ComparisonScopeModeType,
  DivergenceSeverity as DivergenceSeverityType,
  DivergenceType as DivergenceTypeType,
  IComparisonRequest,
  IComparisonScopeMetadata,
  IGraphComparison,
  IStructuralDivergence,
} from './comparison.js';

// PKG operation log (discriminated union)
export { PkgOperationType } from './operation-log.js';
export type {
  IPkgBatchImportOp,
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
  IPkgNodeCreatedOp,
  IPkgNodeDeletedOp,
  IPkgNodeUpdatedOp,
  PkgAtomicOperation,
  PkgOperation,
  PkgOperationType as PkgOperationTypeUnion,
} from './operation-log.js';

// Promotion band utilities
export { PromotionBandUtil } from './promotion-band.js';
