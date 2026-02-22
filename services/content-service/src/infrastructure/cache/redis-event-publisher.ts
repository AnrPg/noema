/**
 * @noema/content-service - Redis Event Publisher
 *
 * Re-exports from the shared @noema/events package.
 * The Redis-based event publisher implementation is centrally defined there.
 */

export { RedisEventPublisher } from '@noema/events/publisher';
export type { IRedisEventPublisherConfig } from '@noema/events/publisher';

