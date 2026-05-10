import type { IEventPublisher } from '@noema/events/publisher';

export type { IEventPublisher, IEventToPublish } from '@noema/events/publisher';

export class NoopEventPublisher implements IEventPublisher {
  async publish(): Promise<void> {
    return Promise.resolve();
  }

  async publishBatch(): Promise<void> {
    return Promise.resolve();
  }
}
