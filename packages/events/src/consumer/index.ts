/**
 * @noema/events/consumer — Event consumer infrastructure barrel export.
 *
 * Re-exports the shared BaseEventConsumer, configuration types,
 * and default config values used by all Noema service consumers.
 */

export { BaseEventConsumer, DEFAULT_CONSUMER_CONFIG } from './base-consumer.js';

export type { IEventConsumerConfig, IStreamEventEnvelope } from './base-consumer.js';
