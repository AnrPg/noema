/**
 * @noema/scheduler-service - Event Consumers Barrel Export
 *
 * Re-exports all scheduler-service event consumers and the
 * scheduler-specific base consumer.
 *
 * @see ADR-003 — Event consumer architecture unification
 */

// Base
export { SchedulerBaseConsumer } from './scheduler-base-consumer.js';
export type { ISchedulerConsumerDependencies } from './scheduler-base-consumer.js';

// Existing consumers (refactored from infrastructure/)
export { ContentSeededConsumer } from './content-seeded.consumer.js';
export { ReviewRecordedConsumer } from './review-recorded.consumer.js';
export { SessionCohortConsumer } from './session-cohort.consumer.js';
export { SessionStartedConsumer } from './session-started.consumer.js';

// New Phase 2 consumers
export { CardLifecycleConsumer } from './card-lifecycle.consumer.js';
export { SessionLifecycleConsumer } from './session-lifecycle.consumer.js';
export { UserDeletedConsumer } from './user-deleted.consumer.js';
