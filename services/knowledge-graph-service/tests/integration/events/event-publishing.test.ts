import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import pino from 'pino';

import { RedisEventPublisher } from '@noema/events/publisher';
import { canUseDockerRuntime, startRedisContainer } from '../../helpers/docker-integration.js';

const redisUrl = process.env['REDIS_URL'];
const hasRedisIntegration = (redisUrl !== undefined && redisUrl !== '') || canUseDockerRuntime();

describe.runIf(hasRedisIntegration)('Redis — Event Publishing', () => {
  const streamKey = `it:kg:event-publishing:${Date.now().toString(36)}`;
  const logger = pino({ level: 'silent' });
  let redis: ConstructorParameters<typeof RedisEventPublisher>[0];
  let publisher: RedisEventPublisher;
  let runtimeDispose: (() => Promise<void>) | null = null;
  let runtimeRedisUrl = redisUrl;

  beforeAll(async () => {
    if (runtimeRedisUrl === undefined || runtimeRedisUrl === '') {
      const runtime = await startRedisContainer();
      runtimeRedisUrl = runtime.redisUrl;
      runtimeDispose = runtime.dispose;
    }

    redis = new Redis(runtimeRedisUrl, {
      maxRetriesPerRequest: 5,
      lazyConnect: true,
    });
    await redis.connect();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await redis.ping();
        break;
      } catch (error) {
        if (attempt === 19) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    await redis.del(streamKey);
    publisher = new RedisEventPublisher(
      redis,
      {
        streamKey,
        maxLen: 100,
        serviceName: 'knowledge-graph-service',
        serviceVersion: 'test',
        environment: 'test',
      },
      logger
    );
  });

  afterAll(async () => {
    await redis.del(streamKey);
    await redis.quit();
    await runtimeDispose?.();
  });

  it('publish() writes a serialized event envelope to Redis Streams', async () => {
    await publisher.publish({
      eventType: 'pkg.node.created',
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: 'user_test',
      payload: { nodeId: 'node_1', label: 'Cell' },
      metadata: { correlationId: 'corr_1', userId: 'user_test' as never },
    });

    const entries = await redis.xrange(streamKey, '-', '+', 'COUNT', 1);
    expect(entries).toHaveLength(1);

    const [, fields] = entries[0] ?? [];
    const serialized = typeof fields?.[1] === 'string' ? fields[1] : '{}';
    const envelope = JSON.parse(serialized) as Record<string, unknown>;

    expect(envelope['eventType']).toBe('pkg.node.created');
    expect(envelope['aggregateId']).toBe('user_test');
    expect((envelope['metadata'] as Record<string, unknown>)['serviceName']).toBe(
      'knowledge-graph-service'
    );
    expect((envelope['payload'] as Record<string, unknown>)['label']).toBe('Cell');
  });
});
