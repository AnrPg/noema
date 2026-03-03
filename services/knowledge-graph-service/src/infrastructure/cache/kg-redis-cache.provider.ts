/**
 * @noema/knowledge-graph-service — Redis Cache Provider
 *
 * Fail-safe Redis cache wrapper for the knowledge-graph-service.
 * Follows the content-service RedisCacheProvider pattern:
 * - All Redis errors swallowed (logged as warnings, treated as misses)
 * - getOrLoad() for read-through caching
 * - SCAN-based pattern deletion for invalidation
 *
 * Key namespace: "kg:{subkey}" to avoid collisions with other services.
 */

import type { Redis } from 'ioredis';
import type pino from 'pino';

// ============================================================================
// Configuration
// ============================================================================

export interface IKgCacheConfig {
  /** TTL (seconds) for individual node/edge lookups */
  entityTtl: number;
  /** TTL (seconds) for query result sets */
  queryTtl: number;
  /** Key prefix (e.g., "kg") */
  prefix: string;
}

// ============================================================================
// KgRedisCacheProvider
// ============================================================================

export class KgRedisCacheProvider {
  private readonly redis: Redis;
  private readonly config: IKgCacheConfig;
  private readonly logger: pino.Logger;

  constructor(redis: Redis, config: IKgCacheConfig, logger: pino.Logger) {
    this.redis = redis;
    this.config = config;
    this.logger = logger.child({ component: 'KgCacheProvider' });
  }

  // ==========================================================================
  // Core Operations (all fail-safe)
  // ==========================================================================

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

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(this.prefixedKey(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache set error — ignoring');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixedKey(key));
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache del error — ignoring');
    }
  }

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

  // ==========================================================================
  // Read-Through Helper
  // ==========================================================================

  /**
   * Get a value from cache or load it via the provided function.
   * Cache misses and errors both trigger the loader.
   * Loader errors PROPAGATE (only Redis errors are swallowed).
   * Null/undefined loader results are NOT cached to prevent negative caching.
   */
  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) return cached as T;

    const value = await loader();

    // Skip caching null/undefined to prevent negative caching of missing entities.
    // The generic T may include null at runtime (e.g., T = IGraphNode | null)
    // even if the type parameter doesn't explicitly include it.
    // REASON: Generic T may be nullable at runtime despite the type signature.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  // ==========================================================================
  // Key Builders
  // ==========================================================================

  nodeKey(nodeId: string): string {
    return `node:${nodeId}`;
  }

  edgeKey(edgeId: string): string {
    return `edge:${edgeId}`;
  }

  edgesForNodeKey(nodeId: string, direction: string): string {
    return `edges:${nodeId}:${direction}`;
  }

  nodesByIdsKey(nodeIds: readonly string[]): string {
    const sorted = [...nodeIds].sort();
    return `nodes:${sorted.join(',')}`;
  }

  /** Pattern to invalidate all cached edges for a node */
  edgesForNodePattern(nodeId: string): string {
    return `edges:${nodeId}:*`;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private prefixedKey(key: string): string {
    return `${this.config.prefix}:${key}`;
  }
}
