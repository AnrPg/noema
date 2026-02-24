import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
    IOutboxEventInput,
    IOutboxEventRecord,
    IOutboxRepository,
} from '../../../src/domain/session-service/outbox.repository.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import { SessionOutboxWorker } from '../../../src/infrastructure/events/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLoggerMock(): Logger {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger & { child: ReturnType<typeof vi.fn> };

  logger.child.mockReturnValue(logger);
  return logger;
}

function createOutboxEventRecord(overrides: Partial<IOutboxEventRecord> = {}): IOutboxEventRecord {
  const now = new Date().toISOString();
  return {
    id: 'event_aaaaaaaaaaaaaaaaaaaaa' as IOutboxEventRecord['id'],
    eventType: 'session.started',
    aggregateType: 'Session',
    aggregateId: 'session_aaaaaaaaaaaaaaaaaaa',
    payload: { started: true },
    metadata: {
      correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as IOutboxEventRecord['metadata']['correlationId'],
    },
    publishedAt: null,
    attempts: 0,
    lastError: null,
    claimOwner: null,
    claimUntil: null,
    nextAttemptAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class InMemoryOutboxRepository implements IOutboxRepository {
  private readonly events = new Map<string, IOutboxEventRecord>();

  constructor(seedEvents: IOutboxEventRecord[]) {
    for (const event of seedEvents) {
      this.events.set(event.id, { ...event });
    }
  }

  async enqueue(event: IOutboxEventInput): Promise<IOutboxEventRecord> {
    const record = createOutboxEventRecord({
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      metadata: event.metadata,
    });
    this.events.set(record.id, record);
    return { ...record };
  }

  async enqueueBatch(events: IOutboxEventInput[]): Promise<void> {
    for (const event of events) {
      await this.enqueue(event);
    }
  }

  async listPending(limit: number): Promise<IOutboxEventRecord[]> {
    return Array.from(this.events.values())
      .filter((event) => event.publishedAt === null)
      .slice(0, limit)
      .map((event) => ({ ...event }));
  }

  async claimPending(
    limit: number,
    claimOwner: string,
    leaseMs: number,
    maxAttempts: number,
    now: Date = new Date()
  ): Promise<IOutboxEventRecord[]> {
    const claimed: IOutboxEventRecord[] = [];

    for (const event of Array.from(this.events.values())) {
      if (claimed.length >= limit) {
        break;
      }

      const claimExpired = event.claimUntil === null || new Date(event.claimUntil) <= now;
      const retryReady = event.nextAttemptAt === null || new Date(event.nextAttemptAt) <= now;

      if (
        event.publishedAt === null &&
        event.attempts < maxAttempts &&
        retryReady &&
        claimExpired
      ) {
        const updated: IOutboxEventRecord = {
          ...event,
          claimOwner,
          claimUntil: new Date(now.getTime() + leaseMs).toISOString(),
          updatedAt: new Date().toISOString(),
        };

        this.events.set(event.id, updated);
        claimed.push({ ...updated });
      }
    }

    return claimed;
  }

  async releaseClaims(claimOwner: string): Promise<number> {
    let released = 0;

    for (const event of this.events.values()) {
      if (event.claimOwner === claimOwner && event.publishedAt === null) {
        this.events.set(event.id, {
          ...event,
          claimOwner: null,
          claimUntil: null,
          updatedAt: new Date().toISOString(),
        });
        released += 1;
      }
    }

    return released;
  }

  async markPublished(id: IOutboxEventRecord['id']): Promise<void> {
    const event = this.events.get(id);
    if (!event) {
      throw new Error('Missing event');
    }

    this.events.set(id, {
      ...event,
      publishedAt: new Date().toISOString(),
      claimOwner: null,
      claimUntil: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async markPublishedClaimed(id: IOutboxEventRecord['id'], claimOwner: string): Promise<void> {
    const event = this.events.get(id);
    if (!event || event.claimOwner !== claimOwner) {
      throw new Error('Invalid claim owner');
    }

    await this.markPublished(id);
  }

  async markFailed(
    id: IOutboxEventRecord['id'],
    errorMessage: string,
    _tx?: unknown,
    nextAttemptAt?: Date | null
  ): Promise<void> {
    const event = this.events.get(id);
    if (!event) {
      throw new Error('Missing event');
    }

    this.events.set(id, {
      ...event,
      attempts: event.attempts + 1,
      lastError: errorMessage,
      claimOwner: null,
      claimUntil: null,
      nextAttemptAt: nextAttemptAt?.toISOString() ?? event.nextAttemptAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async markFailedClaimed(
    id: IOutboxEventRecord['id'],
    claimOwner: string,
    errorMessage: string,
    nextAttemptAt: Date
  ): Promise<void> {
    const event = this.events.get(id);
    if (!event || event.claimOwner !== claimOwner) {
      throw new Error('Invalid claim owner');
    }

    await this.markFailed(id, errorMessage, undefined, nextAttemptAt);
  }

  getById(id: string): IOutboxEventRecord | undefined {
    const event = this.events.get(id);
    return event ? { ...event } : undefined;
  }
}

describe('SessionOutboxWorker reliability hardening', () => {
  it('prevents double publish when two workers run concurrently', async () => {
    const event = createOutboxEventRecord();
    const repository = new InMemoryOutboxRepository([event]);

    const publisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const workerOne = new SessionOutboxWorker(repository, publisher, logger, {
      workerId: 'worker-one',
      pollIntervalMs: 5000,
      batchSize: 10,
      leaseMs: 100,
      maxAttempts: 5,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      drainTimeoutMs: 50,
    });
    const workerTwo = new SessionOutboxWorker(repository, publisher, logger, {
      workerId: 'worker-two',
      pollIntervalMs: 5000,
      batchSize: 10,
      leaseMs: 100,
      maxAttempts: 5,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      drainTimeoutMs: 50,
    });

    await Promise.all([workerOne.start(), workerTwo.start()]);
    await sleep(30);
    await Promise.all([workerOne.stop(), workerTwo.stop()]);

    expect((publisher.publish as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(repository.getById(event.id)?.publishedAt).not.toBeNull();
  });

  it('reclaims an expired lease and republishes with another worker', async () => {
    const event = createOutboxEventRecord();
    const repository = new InMemoryOutboxRepository([event]);

    const hungPublisher = {
      publish: vi.fn(async () => new Promise<void>(() => undefined)),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const workerOne = new SessionOutboxWorker(repository, hungPublisher, logger, {
      workerId: 'worker-one',
      pollIntervalMs: 10_000,
      batchSize: 10,
      leaseMs: 20,
      maxAttempts: 5,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      drainTimeoutMs: 25,
    });

    await workerOne.start();
    await sleep(30);

    const healthyPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const workerTwo = new SessionOutboxWorker(repository, healthyPublisher, logger, {
      workerId: 'worker-two',
      pollIntervalMs: 5,
      batchSize: 10,
      leaseMs: 20,
      maxAttempts: 5,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      drainTimeoutMs: 25,
    });

    await workerTwo.start();
    await sleep(40);

    await Promise.all([workerTwo.stop(), workerOne.stop()]);

    expect((healthyPublisher.publish as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      1
    );
    expect(repository.getById(event.id)?.publishedAt).not.toBeNull();
  });

  it('schedules retry with exponential delay on publish failure', async () => {
    const event = createOutboxEventRecord({ attempts: 1 });

    const repository = {
      enqueue: vi.fn(),
      enqueueBatch: vi.fn(),
      listPending: vi.fn(async () => []),
      claimPending: vi.fn(async () => [event]),
      releaseClaims: vi.fn(async () => 0),
      markPublished: vi.fn(async () => undefined),
      markPublishedClaimed: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      markFailedClaimed: vi.fn(async () => undefined),
    } as unknown as IOutboxRepository;

    const publisher = {
      publish: vi.fn(async () => {
        throw new Error('broker unavailable');
      }),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const worker = new SessionOutboxWorker(repository, publisher, logger, {
      workerId: 'retry-worker',
      pollIntervalMs: 10_000,
      batchSize: 1,
      leaseMs: 100,
      maxAttempts: 5,
      retryBaseDelayMs: 50,
      retryMaxDelayMs: 100,
      drainTimeoutMs: 50,
    });

    const beforeStart = Date.now();
    await worker.start();
    await sleep(20);
    await worker.stop();

    const markFailedCall = (repository.markFailedClaimed as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];

    expect(markFailedCall[0]).toBe(event.id);
    expect(markFailedCall[1]).toBe('retry-worker');
    expect(markFailedCall[2]).toContain('broker unavailable');

    const nextAttemptAt = markFailedCall[3] as Date;
    expect(nextAttemptAt.getTime()).toBeGreaterThanOrEqual(beforeStart + 90);
    expect(nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 200);
  });

  it('bounds shutdown drain duration and releases claims', async () => {
    const event = createOutboxEventRecord();

    const repository = {
      enqueue: vi.fn(),
      enqueueBatch: vi.fn(),
      listPending: vi.fn(async () => []),
      claimPending: vi.fn(async () => [event]),
      releaseClaims: vi.fn(async () => 1),
      markPublished: vi.fn(async () => undefined),
      markPublishedClaimed: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      markFailedClaimed: vi.fn(async () => undefined),
    } as unknown as IOutboxRepository;

    const publisher = {
      publish: vi.fn(async () => new Promise<void>(() => undefined)),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const worker = new SessionOutboxWorker(repository, publisher, logger, {
      workerId: 'drain-worker',
      pollIntervalMs: 10_000,
      batchSize: 1,
      leaseMs: 100,
      maxAttempts: 5,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      drainTimeoutMs: 30,
    });

    await worker.start();
    await sleep(10);

    const stopStartedAt = Date.now();
    await worker.stop();
    const stopElapsed = Date.now() - stopStartedAt;

    expect(stopElapsed).toBeGreaterThanOrEqual(30);
    expect(stopElapsed).toBeLessThan(250);
    expect((repository.releaseClaims as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'drain-worker'
    );
  });
});
