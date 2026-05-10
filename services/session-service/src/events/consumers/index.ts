/**
 * @noema/session-service - Event Consumers Barrel Export
 *
 * Re-exports all session-service event consumers.
 *
 * @see ADR-003 — Event consumer architecture unification
 */

export { UserDeletedConsumer } from './user-deleted.consumer.js';
export { MetacognitionTriggerConsumer } from './metacognition-trigger.consumer.js';
export { MetacognitionEvaluationRecordedConsumer } from './metacognition-evaluation-recorded.consumer.js';
