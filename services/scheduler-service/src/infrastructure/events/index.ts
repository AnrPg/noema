export { SchedulerEventConsumer } from './scheduler-event-consumer.js';
export type {
  ISchedulerEventConsumerConfig,
  ISchedulerEventConsumerDependencies
} from './scheduler-event-consumer.js';

// Decomposed consumers (ADR-0039)
export {
  BaseEventConsumer,
  ContentSeededConsumer,
  ReviewRecordedConsumer,
  SessionCohortConsumer,
  SessionStartedConsumer
} from './consumers/index.js';

