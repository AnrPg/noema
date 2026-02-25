/**
 * @noema/content-service - Redis Cache Provider
 *
 * Read-through cache implementation for frequently accessed data.
 * Uses Redis with TTL-based expiry and cache-aside pattern.
 *
 * All operations are fail-safe: Redis errors are logged and treated
 * as cache misses, never propagated as request errors.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

// ============================================================================
// Cache Configuration
// ============================================================================

export interface ICacheConfig {
  /** TTL for individual card lookups (seconds) */
  cardTtl: number;
  /** TTL for query result pages (seconds) */
  queryTtl: number;
  /** Key prefix for namespacing */
  prefix: string;
}

// ============================================================================
// Cache Provider
// ============================================================================

export class RedisCacheProvider {
  private readonly redis: Redis;
  private readonly config: ICacheConfig;
  private readonly logger: Logger;

  constructor(redis: Redis, config: ICacheConfig, logger: Logger) {
    this.redis = redis;
    this.config = config;
    this.logger = logger.child({ component: 'RedisCacheProvider' });
  }

  // ============================================================================
  // Generic Cache Operations
  // ============================================================================

  /**
   * Get a value from cache. Returns null on miss or error.
   */
  async get(key: string): Promise<unknown> {
    try {
      const raw = await this.redis.get(this.prefixedKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as unknown;
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache get error — treating as miss');
      return null;
    }
  }

  /**
   * Set a value in cache with TTL.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(
        this.prefixedKey(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds
      );
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache set error — ignoring');
    }
  }

  /**
   * Delete a key from cache.
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixedKey(key));
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache del error — ignoring');
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. invalidate all queries for a user).
   * Uses SCAN to avoid blocking Redis with KEYS.
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.prefixedKey(pattern);
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn({ error, pattern }, 'Cache delPattern error — ignoring');
    }
  }

  // ============================================================================
  // Read-Through Helper
  // ============================================================================

  /**
   * Read-through cache: get from cache, on miss call loader, cache result.
   * Does not cache null/undefined values to avoid caching "not found" results.
   */
  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) return cached as T;

    const value = await loader();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- value may be null at runtime despite type
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  // ============================================================================
  // Key Helpers
  // ============================================================================

  private prefixedKey(key: string): string {
    return `${this.config.prefix}:${key}`;
  }

  /**
   * Build a card cache key.
   */
  cardKey(cardId: string): string {
    return `card:${cardId}`;
  }

  /**
   * Build a query result cache key.
   */
  queryKey(userId: string, queryHash: string): string {
    return `query:${userId}:${queryHash}`;
  }

  /**
   * Build a user-scoped pattern for invalidation.
   */
  userPattern(userId: string): string {
    return `query:${userId}:*`;
  }
}
