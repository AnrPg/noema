/**
 * @noema/content-service — Redis Cache Provider Unit Tests
 *
 * Tests cache operations with a mocked Redis instance.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheProvider } from '../../../src/infrastructure/cache/redis-cache.provider.js';

// ============================================================================
// Mock Redis
// ============================================================================

function mockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
  };
}

function mockPinoLogger() {
  const child = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  child.child.mockReturnValue(child);
  return child;
}

describe('RedisCacheProvider', () => {
  let redis: ReturnType<typeof mockRedis>;
  let logger: ReturnType<typeof mockPinoLogger>;
  let cache: RedisCacheProvider;

  beforeEach(() => {
    redis = mockRedis();
    logger = mockPinoLogger();
    cache = new RedisCacheProvider(
      redis as any,
      { cardTtl: 300, queryTtl: 60, prefix: 'test' },
      logger as any,
    );
  });

  // ==========================================================================
  // get()
  // ==========================================================================

  describe('get()', () => {
    it('returns parsed value on cache hit', async () => {
      const data = { id: 'card_1', name: 'Test' };
      redis.get.mockResolvedValue(JSON.stringify(data));

      const result = await cache.get('card:card_1');

      expect(result).toEqual(data);
      expect(redis.get).toHaveBeenCalledWith('test:card:card_1');
    });

    it('returns null on cache miss', async () => {
      redis.get.mockResolvedValue(null);

      const result = await cache.get('card:nonexistent');

      expect(result).toBeNull();
    });

    it('returns null and logs warning on Redis error', async () => {
      redis.get.mockRejectedValue(new Error('connection refused'));

      const result = await cache.get('card:err');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // set()
  // ==========================================================================

  describe('set()', () => {
    it('stores serialized value with TTL', async () => {
      await cache.set('card:123', { id: '123' }, 300);

      expect(redis.set).toHaveBeenCalledWith(
        'test:card:123',
        JSON.stringify({ id: '123' }),
        'EX',
        300,
      );
    });

    it('swallows errors silently', async () => {
      redis.set.mockRejectedValue(new Error('write error'));

      await expect(cache.set('key', 'val', 60)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // del()
  // ==========================================================================

  describe('del()', () => {
    it('deletes a prefixed key', async () => {
      await cache.del('card:456');

      expect(redis.del).toHaveBeenCalledWith('test:card:456');
    });
  });

  // ==========================================================================
  // getOrLoad()
  // ==========================================================================

  describe('getOrLoad()', () => {
    it('returns cached value without calling loader', async () => {
      const cached = { id: 'cached' };
      redis.get.mockResolvedValue(JSON.stringify(cached));
      const loader = vi.fn();

      const result = await cache.getOrLoad('key', 60, loader);

      expect(result).toEqual(cached);
      expect(loader).not.toHaveBeenCalled();
    });

    it('calls loader on cache miss and caches result', async () => {
      redis.get.mockResolvedValue(null);
      const loaded = { id: 'loaded' };
      const loader = vi.fn().mockResolvedValue(loaded);

      const result = await cache.getOrLoad('key', 60, loader);

      expect(result).toEqual(loaded);
      expect(loader).toHaveBeenCalledOnce();
      expect(redis.set).toHaveBeenCalled();
    });

    it('does not cache null values from loader', async () => {
      redis.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(null);

      const result = await cache.getOrLoad('key', 60, loader);

      expect(result).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Key helpers
  // ==========================================================================

  describe('key helpers', () => {
    it('builds card key', () => {
      expect(cache.cardKey('card_abc')).toBe('card:card_abc');
    });

    it('builds query key', () => {
      expect(cache.queryKey('user_1', 'hash123')).toBe('query:user_1:hash123');
    });

    it('builds user pattern', () => {
      expect(cache.userPattern('user_1')).toBe('query:user_1:*');
    });
  });
});
