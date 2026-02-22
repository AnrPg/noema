export interface IEventPublisher {
  publish(event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    metadata: {
      correlationId: string;
      userId?: string;
    };
  }): Promise<void>;
}
