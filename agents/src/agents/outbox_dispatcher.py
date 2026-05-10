"""Publish durable outbox events to Redis Streams."""

from __future__ import annotations

import os
from typing import Any

from redis.asyncio import Redis

from .batch_jobs import AgentOutboxEvent, BatchJobStore


class OutboxDispatcher:
    def __init__(
        self,
        *,
        batch_store: BatchJobStore,
        redis_url: str | None = None,
        stream_name: str = "agent-batch-events",
    ) -> None:
        self._batch_store = batch_store
        self._redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._stream_name = stream_name
        self._redis: Redis | None = None

    async def _client(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    async def dispatch_pending(self, *, limit: int = 100) -> list[AgentOutboxEvent]:
        events = await self._batch_store.list_pending_outbox_events(limit=limit)
        if not events:
            return []
        client = await self._client()
        published_ids: list[str] = []
        failed_ids: list[str] = []
        for event in events:
            try:
                await client.xadd(
                    self._stream_name,
                    {
                        "event_id": event.event_id,
                        "topic": event.topic,
                        "aggregate_type": event.aggregate_type,
                        "aggregate_id": event.aggregate_id,
                        "payload_json": _serialize(event.payload_json),
                        "created_at": event.created_at,
                    },
                )
                published_ids.append(event.event_id)
            except Exception:
                failed_ids.append(event.event_id)
        if published_ids:
            await self._batch_store.mark_outbox_published(published_ids)
        if failed_ids:
            await self._batch_store.mark_outbox_failed(failed_ids)
        return events


def _serialize(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=True, sort_keys=True)
