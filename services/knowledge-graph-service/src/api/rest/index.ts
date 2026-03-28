/**
 * @noema/knowledge-graph-service - REST API Barrel Export
 *
 * Re-exports all route registration functions for use by the
 * bootstrap module (src/index.ts).
 */

// Health check routes (existing — used by k8s probes)
export { registerHealthRoutes } from './health.routes.js';

// PKG operations
export { registerPkgEdgeRoutes } from './pkg-edge.routes.js';
export { registerPkgMasteryRoutes } from './pkg-mastery.routes.js';
export { registerPkgNodeRoutes } from './pkg-node.routes.js';
export { registerPkgTraversalRoutes } from './pkg-traversal.routes.js';

// CKG operations
export { registerCkgEdgeRoutes } from './ckg-edge.routes.js';
export { registerCkgMutationRoutes } from './ckg-mutation.routes.js';
export { registerCkgNodeRoutes } from './ckg-node.routes.js';
export { registerCkgTraversalRoutes } from './ckg-traversal.routes.js';

// PKG operation log
export { registerPkgOperationLogRoutes } from './pkg-operation-log.routes.js';

// Metrics, misconceptions, health, comparison
export { registerComparisonRoutes } from './comparison.routes.js';
export { registerMetricsRoutes } from './metrics.routes.js';
export { registerMisconceptionRoutes } from './misconception.routes.js';
export { registerOntologyImportRoutes } from './ontology-import.routes.js';
export { registerStructuralHealthRoutes } from './structural-health.routes.js';
