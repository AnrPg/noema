export interface IEventPublisher {
  publish(input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    metadata: {
      correlationId?: string | undefined;
      userId?: string | null | undefined;
    };
  }): Promise<void>;
}

export class NoopEventPublisher implements IEventPublisher {
  async publish(): Promise<void> {
    return Promise.resolve();
  }
}
