/**
 * @noema/knowledge-graph-service - Event Consumers Barrel Export
 *
 * Re-exports all knowledge-graph-service event consumers.
 *
 * @see ADR-003 — Event consumer architecture unification
 */

export { UserDeletedConsumer } from './user-deleted.consumer.js';
export { PkgAggregationConsumer } from './pkg-aggregation.consumer.js';
