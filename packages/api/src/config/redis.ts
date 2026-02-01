// =============================================================================
// REDIS CONFIGURATION
// =============================================================================

import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (error) => {
  console.error('❌ Redis error:', error);
});

// Connect
redis.connect().catch((error) => {
  console.error('❌ Redis connection failed:', error);
});

export type RedisClient = typeof redis;
