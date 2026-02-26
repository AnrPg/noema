/**
 * @noema/knowledge-graph-service - Event Publisher Interface
 *
 * Re-exports from the shared @noema/events package.
 * All event publisher types are centrally defined there.
 */

export { EVENT_PUBLISHER } from '@noema/events/publisher';
export type { IEventPublisher, IEventToPublish } from '@noema/events/publisher';
