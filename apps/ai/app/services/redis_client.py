# =============================================================================
# REDIS CLIENT SERVICE
# =============================================================================

import json
from typing import Any, Dict, List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class RedisClient:
    """
    Redis client for caching and pub/sub.
    """

    _instance = None
    _redis = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """Initialize Redis connection."""
        if self._initialized:
            return

        try:
            import redis.asyncio as redis

            self._redis = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )

            # Test connection
            await self._redis.ping()

            self._initialized = True
            logger.info("Redis client initialized")
        except Exception as e:
            logger.error("Failed to initialize Redis", error=str(e))
            self._initialized = False

    async def close(self):
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            self._initialized = False
            logger.info("Redis connection closed")

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._initialized and self._redis is not None

    async def get(self, key: str) -> Optional[str]:
        """Get value from cache."""
        if not self.is_available:
            return None

        try:
            return await self._redis.get(key)
        except Exception as e:
            logger.error("Redis GET failed", key=key, error=str(e))
            return None

    async def set(
        self,
        key: str,
        value: str,
        expire: Optional[int] = None,
    ) -> bool:
        """Set value in cache."""
        if not self.is_available:
            return False

        try:
            await self._redis.set(key, value, ex=expire)
            return True
        except Exception as e:
            logger.error("Redis SET failed", key=key, error=str(e))
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if not self.is_available:
            return False

        try:
            await self._redis.delete(key)
            return True
        except Exception as e:
            logger.error("Redis DELETE failed", key=key, error=str(e))
            return False

    async def get_json(self, key: str) -> Optional[Any]:
        """Get JSON value from cache."""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None

    async def set_json(
        self,
        key: str,
        value: Any,
        expire: Optional[int] = None,
    ) -> bool:
        """Set JSON value in cache."""
        try:
            return await self.set(key, json.dumps(value), expire)
        except (TypeError, ValueError):
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if not self.is_available:
            return False

        try:
            return await self._redis.exists(key) > 0
        except Exception:
            return False

    async def incr(self, key: str) -> Optional[int]:
        """Increment counter."""
        if not self.is_available:
            return None

        try:
            return await self._redis.incr(key)
        except Exception:
            return None

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration on key."""
        if not self.is_available:
            return False

        try:
            return await self._redis.expire(key, seconds)
        except Exception:
            return False

    async def publish(self, channel: str, message: str) -> int:
        """Publish message to channel."""
        if not self.is_available:
            return 0

        try:
            return await self._redis.publish(channel, message)
        except Exception:
            return 0

    async def lpush(self, key: str, *values: str) -> Optional[int]:
        """Push values to list."""
        if not self.is_available:
            return None

        try:
            return await self._redis.lpush(key, *values)
        except Exception:
            return None

    async def lrange(self, key: str, start: int, end: int) -> List[str]:
        """Get range from list."""
        if not self.is_available:
            return []

        try:
            return await self._redis.lrange(key, start, end)
        except Exception:
            return []

    async def hset(self, name: str, key: str, value: str) -> bool:
        """Set hash field."""
        if not self.is_available:
            return False

        try:
            await self._redis.hset(name, key, value)
            return True
        except Exception:
            return False

    async def hget(self, name: str, key: str) -> Optional[str]:
        """Get hash field."""
        if not self.is_available:
            return None

        try:
            return await self._redis.hget(name, key)
        except Exception:
            return None

    async def hgetall(self, name: str) -> Dict[str, str]:
        """Get all hash fields."""
        if not self.is_available:
            return {}

        try:
            return await self._redis.hgetall(name)
        except Exception:
            return {}


# Singleton instance
redis_client = RedisClient()
