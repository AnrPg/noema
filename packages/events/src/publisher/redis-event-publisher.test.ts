import { Environment } from '@noema/types';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { RedisEventPublisher } from './redis-event-publisher.js';

function makePublisher(exec: () => Promise<unknown>) {
  const pipeline = {
    xadd: vi.fn(),
    exec: vi.fn(exec),
  };
  const redis = {
    pipeline: vi.fn(() => pipeline),
  } as unknown as Redis;
  const publisher = new RedisEventPublisher(
    redis,
    {
      streamKey: 'events:test',
      maxLen: 1000,
      serviceName: 'test-service',
      serviceVersion: '0.0.0',
      environment: Environment.TEST,
    },
    pino({ level: 'silent' })
  );
  return { pipeline, publisher };
}

describe('RedisEventPublisher', () => {
  it('rejects a batch when Redis returns no pipeline results', async () => {
    const { publisher } = makePublisher(() => Promise.resolve(null));

    await expect(
      publisher.publishBatch([
        {
          eventType: 'test.event',
          aggregateType: 'Test',
          aggregateId: 'test_1',
          payload: { ok: true },
          metadata: { correlationId: 'cor_test' as never },
        },
      ])
    ).rejects.toThrow('Redis pipeline did not return batch publish results');
  });

  it('rejects a batch when any pipelined command fails', async () => {
    const failure = new Error('XADD failed');
    const { publisher } = makePublisher(() =>
      Promise.resolve([
        [null, '1-0'],
        [failure, null],
      ])
    );

    await expect(
      publisher.publishBatch([
        {
          eventType: 'test.created',
          aggregateType: 'Test',
          aggregateId: 'test_1',
          payload: { ok: true },
          metadata: { correlationId: 'cor_test' as never },
        },
        {
          eventType: 'test.failed',
          aggregateType: 'Test',
          aggregateId: 'test_2',
          payload: { ok: false },
          metadata: { correlationId: 'cor_test' as never },
        },
      ])
    ).rejects.toThrow('test.failed:XADD failed');
  });
});
