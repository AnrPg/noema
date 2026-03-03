/**
 * @noema/content-service - Event Consumers Barrel Export
 */

export { AttemptRecordedConsumer } from './attempt-recorded.consumer.js';
export { KgNodeDeletedConsumer } from './kg-node-deleted.consumer.js';
export { UserDeletedConsumer } from './user-deleted.consumer.js';

// Re-export shared base for convenience in bootstrap code
export { BaseEventConsumer } from '@noema/events/consumer';
export type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';

