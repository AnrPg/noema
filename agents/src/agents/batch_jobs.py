"""Durable batch job persistence and outbox state for agent batch execution."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import tempfile
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, cast
from urllib.parse import urlparse

import asyncpg


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _json_loads(value: str | None, *, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    return json.loads(value)


class BatchJobStatus:
    QUEUED = "queued"
    SUBMITTED = "submitted"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    FINALIZATION_FAILED = "finalization_failed"


class BatchAttemptKind:
    SUBMIT = "submit"
    POLL = "poll"
    FINALIZE = "finalize"


class OutboxStatus:
    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"


@dataclass(slots=True)
class AgentBatchJob:
    job_id: str
    run_id: str
    agent_name: str
    provider: str
    model: str
    execution_strategy: str
    status: str
    request_json: dict[str, Any]
    context_pack_json: dict[str, Any] | None
    prompt_json: dict[str, Any] | None
    provider_batch_id: str | None
    provider_status: str | None
    result_json: dict[str, Any] | None
    error_message: str | None
    submitted_at: str | None
    completed_at: str | None
    created_at: str
    updated_at: str


@dataclass(slots=True)
class AgentBatchAttempt:
    attempt_id: str
    job_id: str
    attempt_kind: str
    status: str
    request_json: dict[str, Any] | None
    response_json: dict[str, Any] | None
    error_message: str | None
    started_at: str
    finished_at: str | None


@dataclass(slots=True)
class AgentOutboxEvent:
    event_id: str
    topic: str
    aggregate_type: str
    aggregate_id: str
    payload_json: dict[str, Any]
    status: str
    created_at: str
    published_at: str | None


@dataclass(slots=True)
class BatchSubmissionEnvelope:
    run_id: str
    job_id: str
    agent: dict[str, Any]
    execution_plan: dict[str, Any]
    status: str
    provider: str
    model: str
    provider_batch_id: str | None
    poll_after_seconds: int


class BatchJobStore(Protocol):
    async def initialize(self) -> None: ...

    async def enqueue_job(
        self,
        *,
        run_id: str,
        agent_name: str,
        provider: str,
        model: str,
        execution_strategy: str,
        request_json: dict[str, Any],
        context_pack_json: dict[str, Any] | None,
        prompt_json: dict[str, Any] | None,
        queued_event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def get_job(self, job_id: str) -> AgentBatchJob: ...

    async def list_jobs(
        self,
        *,
        status: str | None = None,
        agent_name: str | None = None,
        provider: str | None = None,
        limit: int = 100,
    ) -> list[AgentBatchJob]: ...

    async def list_outbox_events_for_job(self, job_id: str) -> list[AgentOutboxEvent]: ...

    async def list_attempts_for_job(self, job_id: str) -> list[AgentBatchAttempt]: ...

    async def list_pending_outbox_events(self, *, limit: int = 100) -> list[AgentOutboxEvent]: ...

    async def mark_outbox_published(self, event_ids: Sequence[str]) -> None: ...

    async def mark_outbox_failed(self, event_ids: Sequence[str]) -> None: ...

    async def list_jobs_for_submission(self, *, limit: int = 50) -> list[AgentBatchJob]: ...

    async def list_jobs_for_polling(self, *, limit: int = 50) -> list[AgentBatchJob]: ...

    async def list_jobs_for_finalization(self, *, limit: int = 50) -> list[AgentBatchJob]: ...

    async def record_attempt_start(
        self,
        *,
        job_id: str,
        attempt_kind: str,
        request_json: dict[str, Any] | None = None,
    ) -> str: ...

    async def finish_attempt(
        self,
        *,
        attempt_id: str,
        status: str,
        response_json: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None: ...

    async def mark_job_submitted(
        self,
        *,
        job_id: str,
        provider_batch_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def mark_job_running(
        self,
        *,
        job_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def store_polled_result(
        self,
        *,
        job_id: str,
        provider_status: str,
        result_json: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def mark_job_completed(
        self,
        *,
        job_id: str,
        result_json: dict[str, Any],
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def mark_job_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def mark_job_cancelled(
        self,
        *,
        job_id: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...

    async def mark_job_finalization_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob: ...


def create_batch_job_id() -> str:
    return f"agentjob_{uuid.uuid4().hex[:24]}"


def create_attempt_id() -> str:
    return f"agentattempt_{uuid.uuid4().hex[:24]}"


def create_event_id() -> str:
    return f"agentevent_{uuid.uuid4().hex[:24]}"


class SQLiteBatchJobStore:
    def __init__(self, db_path: str | None = None) -> None:
        resolved_path = db_path or os.getenv(
            "AGENTS_BATCH_DB_PATH",
            str(Path(__file__).resolve().parents[2] / ".artifacts" / "agents-batch.sqlite3"),
        )
        self._db_path = Path(str(resolved_path))
        self._db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize_sync)

    def _initialize_sync(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS agent_batch_jobs (
                    job_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    execution_strategy TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    context_pack_json TEXT,
                    prompt_json TEXT,
                    provider_batch_id TEXT,
                    provider_status TEXT,
                    result_json TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    submitted_at TEXT,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_status_created
                    ON agent_batch_jobs(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_agent_status
                    ON agent_batch_jobs(agent_name, status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_provider_status
                    ON agent_batch_jobs(provider, provider_status, created_at DESC);
                CREATE TABLE IF NOT EXISTS agent_batch_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    attempt_kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_json TEXT,
                    response_json TEXT,
                    error_message TEXT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_batch_attempts_job
                    ON agent_batch_attempts(job_id, started_at DESC);
                CREATE TABLE IF NOT EXISTS agent_event_outbox (
                    event_id TEXT PRIMARY KEY,
                    topic TEXT NOT NULL,
                    aggregate_type TEXT NOT NULL,
                    aggregate_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    published_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_event_outbox_status_created
                    ON agent_event_outbox(status, created_at ASC);
                CREATE INDEX IF NOT EXISTS idx_agent_event_outbox_aggregate
                    ON agent_event_outbox(aggregate_type, aggregate_id, created_at ASC);
                """
            )

    async def enqueue_job(
        self,
        *,
        run_id: str,
        agent_name: str,
        provider: str,
        model: str,
        execution_strategy: str,
        request_json: dict[str, Any],
        context_pack_json: dict[str, Any] | None,
        prompt_json: dict[str, Any] | None,
        queued_event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        job_id = create_batch_job_id()
        now = _now_iso()
        queued_payload = {**queued_event_payload, "jobId": job_id}
        await asyncio.to_thread(
            self._enqueue_job_sync,
            job_id,
            run_id,
            agent_name,
            provider,
            model,
            execution_strategy,
            request_json,
            context_pack_json,
            prompt_json,
            queued_payload,
            now,
        )
        return await self.get_job(job_id)

    def _enqueue_job_sync(
        self,
        job_id: str,
        run_id: str,
        agent_name: str,
        provider: str,
        model: str,
        execution_strategy: str,
        request_json: dict[str, Any],
        context_pack_json: dict[str, Any] | None,
        prompt_json: dict[str, Any] | None,
        queued_event_payload: dict[str, Any],
        now: str,
    ) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN")
            connection.execute(
                """
                INSERT INTO agent_batch_jobs (
                    job_id, run_id, agent_name, provider, model, execution_strategy, status,
                    request_json, context_pack_json, prompt_json, provider_batch_id,
                    provider_status, result_json, error_message, created_at, updated_at,
                    submitted_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL)
                """,
                (
                    job_id,
                    run_id,
                    agent_name,
                    provider,
                    model,
                    execution_strategy,
                    BatchJobStatus.QUEUED,
                    _json_dumps(request_json),
                    None if context_pack_json is None else _json_dumps(context_pack_json),
                    None if prompt_json is None else _json_dumps(prompt_json),
                    now,
                    now,
                ),
            )
            self._insert_outbox_event_sync(
                connection,
                topic="agent_batch_job.queued",
                aggregate_type="agent_batch_job",
                aggregate_id=job_id,
                payload_json=queued_event_payload,
                created_at=now,
            )
            connection.commit()

    async def get_job(self, job_id: str) -> AgentBatchJob:
        row = await asyncio.to_thread(self._get_row_sync, "SELECT * FROM agent_batch_jobs WHERE job_id = ?", (job_id,))
        if row is None:
            raise KeyError(job_id)
        return self._job_from_row(row)

    def _get_row_sync(self, query: str, params: tuple[Any, ...]) -> sqlite3.Row | None:
        with self._connect() as connection:
            return connection.execute(query, params).fetchone()

    async def list_jobs(
        self,
        *,
        status: str | None = None,
        agent_name: str | None = None,
        provider: str | None = None,
        limit: int = 100,
    ) -> list[AgentBatchJob]:
        rows = await asyncio.to_thread(self._list_jobs_sync, status, agent_name, provider, limit)
        return [self._job_from_row(row) for row in rows]

    def _list_jobs_sync(
        self,
        status: str | None,
        agent_name: str | None,
        provider: str | None,
        limit: int,
    ) -> list[sqlite3.Row]:
        clauses = ["1 = 1"]
        params: list[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if agent_name:
            clauses.append("agent_name = ?")
            params.append(agent_name)
        if provider:
            clauses.append("provider = ?")
            params.append(provider)
        with self._connect() as connection:
            return connection.execute(
                f"""
                SELECT * FROM agent_batch_jobs
                WHERE {' AND '.join(clauses)}
                ORDER BY created_at DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

    async def list_outbox_events_for_job(self, job_id: str) -> list[AgentOutboxEvent]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            "SELECT * FROM agent_event_outbox WHERE aggregate_type = ? AND aggregate_id = ? ORDER BY created_at ASC",
            ("agent_batch_job", job_id),
        )
        return [self._outbox_from_row(row) for row in rows]

    async def list_attempts_for_job(self, job_id: str) -> list[AgentBatchAttempt]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            "SELECT * FROM agent_batch_attempts WHERE job_id = ? ORDER BY started_at ASC",
            (job_id,),
        )
        return [self._attempt_from_row(row) for row in rows]

    async def list_pending_outbox_events(self, *, limit: int = 100) -> list[AgentOutboxEvent]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            """
            SELECT * FROM agent_event_outbox
            WHERE status IN (?, ?)
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (OutboxStatus.PENDING, OutboxStatus.FAILED, limit),
        )
        return [self._outbox_from_row(row) for row in rows]

    def _list_rows_sync(self, query: str, params: tuple[Any, ...]) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(query, params).fetchall()

    async def mark_outbox_published(self, event_ids: Sequence[str]) -> None:
        if not event_ids:
            return
        await asyncio.to_thread(self._mark_outbox_status_sync, event_ids, OutboxStatus.PUBLISHED)

    async def mark_outbox_failed(self, event_ids: Sequence[str]) -> None:
        if not event_ids:
            return
        await asyncio.to_thread(self._mark_outbox_failed_sync, event_ids)

    def _mark_outbox_status_sync(self, event_ids: Sequence[str], status: str) -> None:
        placeholders = ", ".join("?" for _ in event_ids)
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE agent_event_outbox
                SET status = ?, published_at = ?
                WHERE event_id IN ({placeholders})
                """,
                [status, _now_iso(), *event_ids],
            )
            connection.commit()

    def _mark_outbox_failed_sync(self, event_ids: Sequence[str]) -> None:
        placeholders = ", ".join("?" for _ in event_ids)
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE agent_event_outbox
                SET status = ?
                WHERE event_id IN ({placeholders})
                """,
                [OutboxStatus.FAILED, *event_ids],
            )
            connection.commit()

    async def list_jobs_for_submission(self, *, limit: int = 50) -> list[AgentBatchJob]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            """
            SELECT job.*
            FROM agent_batch_jobs AS job
            WHERE job.status = ?
              AND NOT EXISTS (
                SELECT 1
                FROM agent_batch_attempts AS attempt
                WHERE attempt.job_id = job.job_id
                  AND attempt.attempt_kind = ?
                  AND attempt.status = ?
                  AND attempt.finished_at IS NULL
              )
            ORDER BY job.created_at ASC
            LIMIT ?
            """,
            (BatchJobStatus.QUEUED, BatchAttemptKind.SUBMIT, "started", limit),
        )
        return [self._job_from_row(row) for row in rows]

    async def list_jobs_for_polling(self, *, limit: int = 50) -> list[AgentBatchJob]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            """
            SELECT * FROM agent_batch_jobs
            WHERE status IN (?, ?)
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (BatchJobStatus.SUBMITTED, BatchJobStatus.RUNNING, limit),
        )
        return [self._job_from_row(row) for row in rows]

    async def list_jobs_for_finalization(self, *, limit: int = 50) -> list[AgentBatchJob]:
        rows = await asyncio.to_thread(
            self._list_rows_sync,
            """
            SELECT * FROM agent_batch_jobs
            WHERE status IN (?, ?)
              AND result_json IS NOT NULL
            ORDER BY updated_at ASC
            LIMIT ?
            """,
            (BatchJobStatus.RUNNING, BatchJobStatus.FINALIZATION_FAILED, limit),
        )
        return [self._job_from_row(row) for row in rows]

    async def record_attempt_start(
        self,
        *,
        job_id: str,
        attempt_kind: str,
        request_json: dict[str, Any] | None = None,
    ) -> str:
        attempt_id = create_attempt_id()
        started_at = _now_iso()
        await asyncio.to_thread(
            self._record_attempt_start_sync,
            attempt_id,
            job_id,
            attempt_kind,
            request_json,
            started_at,
        )
        return attempt_id

    def _record_attempt_start_sync(
        self,
        attempt_id: str,
        job_id: str,
        attempt_kind: str,
        request_json: dict[str, Any] | None,
        started_at: str,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO agent_batch_attempts (
                    attempt_id, job_id, attempt_kind, status, request_json,
                    response_json, error_message, started_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL)
                """,
                (
                    attempt_id,
                    job_id,
                    attempt_kind,
                    "started",
                    None if request_json is None else _json_dumps(request_json),
                    started_at,
                ),
            )
            connection.commit()

    async def finish_attempt(
        self,
        *,
        attempt_id: str,
        status: str,
        response_json: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        await asyncio.to_thread(
            self._finish_attempt_sync,
            attempt_id,
            status,
            response_json,
            error_message,
        )

    def _finish_attempt_sync(
        self,
        attempt_id: str,
        status: str,
        response_json: dict[str, Any] | None,
        error_message: str | None,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE agent_batch_attempts
                SET status = ?, response_json = ?, error_message = ?, finished_at = ?
                WHERE attempt_id = ?
                """,
                (
                    status,
                    None if response_json is None else _json_dumps(response_json),
                    error_message,
                    _now_iso(),
                    attempt_id,
                ),
            )
            connection.commit()

    async def mark_job_submitted(
        self,
        *,
        job_id: str,
        provider_batch_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.SUBMITTED,
            provider_batch_id,
            provider_status,
            None,
            None,
            "agent_batch_job.submitted",
            event_payload,
            True,
        )
        return await self.get_job(job_id)

    async def mark_job_running(
        self,
        *,
        job_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.RUNNING,
            None,
            provider_status,
            None,
            None,
            "agent_batch_job.running",
            event_payload,
            False,
        )
        return await self.get_job(job_id)

    async def store_polled_result(
        self,
        *,
        job_id: str,
        provider_status: str,
        result_json: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.RUNNING,
            None,
            provider_status,
            result_json,
            None,
            None,
            None,
            False,
        )
        return await self.get_job(job_id)

    async def mark_job_completed(
        self,
        *,
        job_id: str,
        result_json: dict[str, Any],
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.COMPLETED,
            None,
            "completed",
            result_json,
            None,
            "agent_batch_job.completed",
            event_payload,
            False,
            True,
        )
        return await self.get_job(job_id)

    async def mark_job_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.FAILED,
            None,
            provider_status,
            None,
            error_message,
            "agent_batch_job.failed",
            event_payload,
            False,
            True,
        )
        return await self.get_job(job_id)

    async def mark_job_cancelled(
        self,
        *,
        job_id: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.CANCELLED,
            None,
            provider_status,
            None,
            None,
            "agent_batch_job.cancelled",
            event_payload,
            False,
            True,
        )
        return await self.get_job(job_id)

    async def mark_job_finalization_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await asyncio.to_thread(
            self._update_job_state_sync,
            job_id,
            BatchJobStatus.FINALIZATION_FAILED,
            None,
            "completed",
            None,
            error_message,
            "agent_batch_job.finalization_failed",
            event_payload,
            False,
            True,
        )
        return await self.get_job(job_id)

    def _update_job_state_sync(
        self,
        job_id: str,
        status: str,
        provider_batch_id: str | None,
        provider_status: str | None,
        result_json: dict[str, Any] | None,
        error_message: str | None,
        topic: str | None,
        event_payload: dict[str, Any] | None,
        update_submitted_at: bool = False,
        update_completed_at: bool = False,
    ) -> None:
        now = _now_iso()
        with self._connect() as connection:
            connection.execute("BEGIN")
            current = connection.execute(
                "SELECT * FROM agent_batch_jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            if current is None:
                connection.rollback()
                raise KeyError(job_id)
            current_status = str(current["status"])
            if current_status == BatchJobStatus.CANCELLED and status != BatchJobStatus.CANCELLED:
                connection.rollback()
                return
            connection.execute(
                """
                UPDATE agent_batch_jobs
                SET status = ?,
                    provider_batch_id = COALESCE(?, provider_batch_id),
                    provider_status = COALESCE(?, provider_status),
                    result_json = COALESCE(?, result_json),
                    error_message = COALESCE(?, error_message),
                    updated_at = ?,
                    submitted_at = CASE WHEN ? THEN ? ELSE submitted_at END,
                    completed_at = CASE WHEN ? THEN ? ELSE completed_at END
                WHERE job_id = ?
                """,
                (
                    status,
                    provider_batch_id,
                    provider_status,
                    None if result_json is None else _json_dumps(result_json),
                    error_message,
                    now,
                    1 if update_submitted_at else 0,
                    now,
                    1 if update_completed_at else 0,
                    now,
                    job_id,
                ),
            )
            if topic is not None and event_payload is not None:
                self._insert_outbox_event_sync(
                    connection,
                    topic=topic,
                    aggregate_type="agent_batch_job",
                    aggregate_id=job_id,
                    payload_json=event_payload,
                    created_at=now,
                )
            connection.commit()

    def _insert_outbox_event_sync(
        self,
        connection: sqlite3.Connection,
        *,
        topic: str,
        aggregate_type: str,
        aggregate_id: str,
        payload_json: dict[str, Any],
        created_at: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO agent_event_outbox (
                event_id, topic, aggregate_type, aggregate_id, payload_json,
                status, created_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                create_event_id(),
                topic,
                aggregate_type,
                aggregate_id,
                _json_dumps(payload_json),
                OutboxStatus.PENDING,
                created_at,
            ),
        )

    def _job_from_row(self, row: sqlite3.Row) -> AgentBatchJob:
        return AgentBatchJob(
            job_id=str(row["job_id"]),
            run_id=str(row["run_id"]),
            agent_name=str(row["agent_name"]),
            provider=str(row["provider"]),
            model=str(row["model"]),
            execution_strategy=str(row["execution_strategy"]),
            status=str(row["status"]),
            request_json=cast("dict[str, Any]", _json_loads(row["request_json"], fallback={})),
            context_pack_json=cast(
                "dict[str, Any] | None", _json_loads(row["context_pack_json"], fallback=None)
            ),
            prompt_json=cast("dict[str, Any] | None", _json_loads(row["prompt_json"], fallback=None)),
            provider_batch_id=row["provider_batch_id"],
            provider_status=row["provider_status"],
            result_json=cast("dict[str, Any] | None", _json_loads(row["result_json"], fallback=None)),
            error_message=row["error_message"],
            submitted_at=row["submitted_at"],
            completed_at=row["completed_at"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def _outbox_from_row(self, row: sqlite3.Row) -> AgentOutboxEvent:
        return AgentOutboxEvent(
            event_id=str(row["event_id"]),
            topic=str(row["topic"]),
            aggregate_type=str(row["aggregate_type"]),
            aggregate_id=str(row["aggregate_id"]),
            payload_json=cast("dict[str, Any]", _json_loads(row["payload_json"], fallback={})),
            status=str(row["status"]),
            created_at=str(row["created_at"]),
            published_at=row["published_at"],
        )

    def _attempt_from_row(self, row: sqlite3.Row) -> AgentBatchAttempt:
        return AgentBatchAttempt(
            attempt_id=str(row["attempt_id"]),
            job_id=str(row["job_id"]),
            attempt_kind=str(row["attempt_kind"]),
            status=str(row["status"]),
            request_json=cast("dict[str, Any] | None", _json_loads(row["request_json"], fallback=None)),
            response_json=cast("dict[str, Any] | None", _json_loads(row["response_json"], fallback=None)),
            error_message=cast("str | None", row["error_message"]),
            started_at=str(row["started_at"]),
            finished_at=cast("str | None", row["finished_at"]),
        )


class PostgresBatchJobStore:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._pool: asyncpg.Pool | None = None

    async def initialize(self) -> None:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(self._database_url, min_size=1, max_size=5)
        assert self._pool is not None
        async with self._pool.acquire() as connection:
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_batch_jobs (
                    job_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    execution_strategy TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_json JSONB NOT NULL,
                    context_pack_json JSONB,
                    prompt_json JSONB,
                    provider_batch_id TEXT,
                    provider_status TEXT,
                    result_json JSONB,
                    error_message TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    submitted_at TIMESTAMPTZ,
                    completed_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_status_created
                    ON agent_batch_jobs(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_agent_status
                    ON agent_batch_jobs(agent_name, status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_batch_jobs_provider_status
                    ON agent_batch_jobs(provider, provider_status, created_at DESC);
                CREATE TABLE IF NOT EXISTS agent_batch_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL REFERENCES agent_batch_jobs(job_id) ON DELETE CASCADE,
                    attempt_kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_json JSONB,
                    response_json JSONB,
                    error_message TEXT,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    finished_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_agent_batch_attempts_job
                    ON agent_batch_attempts(job_id, started_at DESC);
                CREATE TABLE IF NOT EXISTS agent_event_outbox (
                    event_id TEXT PRIMARY KEY,
                    topic TEXT NOT NULL,
                    aggregate_type TEXT NOT NULL,
                    aggregate_id TEXT NOT NULL,
                    payload_json JSONB NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    published_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_agent_event_outbox_status_created
                    ON agent_event_outbox(status, created_at ASC);
                CREATE INDEX IF NOT EXISTS idx_agent_event_outbox_aggregate
                    ON agent_event_outbox(aggregate_type, aggregate_id, created_at ASC);
                """
            )

    async def enqueue_job(
        self,
        *,
        run_id: str,
        agent_name: str,
        provider: str,
        model: str,
        execution_strategy: str,
        request_json: dict[str, Any],
        context_pack_json: dict[str, Any] | None,
        prompt_json: dict[str, Any] | None,
        queued_event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        job_id = create_batch_job_id()
        now = datetime.now(UTC)
        queued_payload = {**queued_event_payload, "jobId": job_id}
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                INSERT INTO agent_batch_jobs (
                    job_id, run_id, agent_name, provider, model, execution_strategy, status,
                    request_json, context_pack_json, prompt_json, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $11)
                """,
                job_id,
                run_id,
                agent_name,
                provider,
                model,
                execution_strategy,
                BatchJobStatus.QUEUED,
                _json_dumps(request_json),
                None if context_pack_json is None else _json_dumps(context_pack_json),
                None if prompt_json is None else _json_dumps(prompt_json),
                now,
            )
            await connection.execute(
                """
                INSERT INTO agent_event_outbox (
                    event_id, topic, aggregate_type, aggregate_id, payload_json, status, created_at
                ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                """,
                create_event_id(),
                "agent_batch_job.queued",
                "agent_batch_job",
                job_id,
                _json_dumps(queued_payload),
                OutboxStatus.PENDING,
                now,
            )
        return await self.get_job(job_id)

    async def get_job(self, job_id: str) -> AgentBatchJob:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            row = await connection.fetchrow("SELECT * FROM agent_batch_jobs WHERE job_id = $1", job_id)
        if row is None:
            raise KeyError(job_id)
        return self._job_from_pg_row(row)

    async def list_jobs(
        self,
        *,
        status: str | None = None,
        agent_name: str | None = None,
        provider: str | None = None,
        limit: int = 100,
    ) -> list[AgentBatchJob]:
        clauses = ["TRUE"]
        values: list[Any] = []
        position = 1
        if status is not None:
            clauses.append(f"status = ${position}")
            values.append(status)
            position += 1
        if agent_name is not None:
            clauses.append(f"agent_name = ${position}")
            values.append(agent_name)
            position += 1
        if provider is not None:
            clauses.append(f"provider = ${position}")
            values.append(provider)
            position += 1
        limit_placeholder = position
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                f"""
                SELECT * FROM agent_batch_jobs
                WHERE {' AND '.join(clauses)}
                ORDER BY created_at DESC
                LIMIT ${limit_placeholder}
                """,
                *values,
                limit,
            )
        return [self._job_from_pg_row(row) for row in rows]

    async def list_outbox_events_for_job(self, job_id: str) -> list[AgentOutboxEvent]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT * FROM agent_event_outbox
                WHERE aggregate_type = $1 AND aggregate_id = $2
                ORDER BY created_at ASC
                """,
                "agent_batch_job",
                job_id,
            )
        return [self._outbox_from_pg_row(row) for row in rows]

    async def list_attempts_for_job(self, job_id: str) -> list[AgentBatchAttempt]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT * FROM agent_batch_attempts
                WHERE job_id = $1
                ORDER BY started_at ASC
                """,
                job_id,
            )
        return [self._attempt_from_pg_row(row) for row in rows]

    async def list_pending_outbox_events(self, *, limit: int = 100) -> list[AgentOutboxEvent]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT * FROM agent_event_outbox
                WHERE status = ANY($1::text[])
                ORDER BY created_at ASC
                LIMIT $2
                """,
                [OutboxStatus.PENDING, OutboxStatus.FAILED],
                limit,
            )
        return [self._outbox_from_pg_row(row) for row in rows]

    async def mark_outbox_published(self, event_ids: Sequence[str]) -> None:
        if not event_ids:
            return
        pool = self._require_pool()
        async with pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE agent_event_outbox
                SET status = $1, published_at = now()
                WHERE event_id = ANY($2::text[])
                """,
                OutboxStatus.PUBLISHED,
                list(event_ids),
            )

    async def mark_outbox_failed(self, event_ids: Sequence[str]) -> None:
        if not event_ids:
            return
        pool = self._require_pool()
        async with pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE agent_event_outbox
                SET status = $1
                WHERE event_id = ANY($2::text[])
                """,
                OutboxStatus.FAILED,
                list(event_ids),
            )

    async def list_jobs_for_submission(self, *, limit: int = 50) -> list[AgentBatchJob]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT job.*
                FROM agent_batch_jobs AS job
                WHERE job.status = $1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM agent_batch_attempts AS attempt
                    WHERE attempt.job_id = job.job_id
                      AND attempt.attempt_kind = $2
                      AND attempt.status = $3
                      AND attempt.finished_at IS NULL
                  )
                ORDER BY job.created_at ASC
                LIMIT $4
                """,
                BatchJobStatus.QUEUED,
                BatchAttemptKind.SUBMIT,
                "started",
                limit,
            )
        return [self._job_from_pg_row(row) for row in rows]

    async def list_jobs_for_polling(self, *, limit: int = 50) -> list[AgentBatchJob]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT * FROM agent_batch_jobs
                WHERE status = ANY($1::text[])
                ORDER BY created_at ASC
                LIMIT $2
                """,
                [BatchJobStatus.SUBMITTED, BatchJobStatus.RUNNING],
                limit,
            )
        return [self._job_from_pg_row(row) for row in rows]

    async def list_jobs_for_finalization(self, *, limit: int = 50) -> list[AgentBatchJob]:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT * FROM agent_batch_jobs
                WHERE status = ANY($1::text[]) AND result_json IS NOT NULL
                ORDER BY updated_at ASC
                LIMIT $2
                """,
                [BatchJobStatus.RUNNING, BatchJobStatus.FINALIZATION_FAILED],
                limit,
            )
        return [self._job_from_pg_row(row) for row in rows]

    async def record_attempt_start(
        self,
        *,
        job_id: str,
        attempt_kind: str,
        request_json: dict[str, Any] | None = None,
    ) -> str:
        attempt_id = create_attempt_id()
        pool = self._require_pool()
        async with pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO agent_batch_attempts (
                    attempt_id, job_id, attempt_kind, status, request_json
                ) VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                attempt_id,
                job_id,
                attempt_kind,
                "started",
                None if request_json is None else _json_dumps(request_json),
            )
        return attempt_id

    async def finish_attempt(
        self,
        *,
        attempt_id: str,
        status: str,
        response_json: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        pool = self._require_pool()
        async with pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE agent_batch_attempts
                SET status = $1, response_json = $2::jsonb, error_message = $3, finished_at = now()
                WHERE attempt_id = $4
                """,
                status,
                None if response_json is None else _json_dumps(response_json),
                error_message,
                attempt_id,
            )

    async def mark_job_submitted(
        self,
        *,
        job_id: str,
        provider_batch_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.SUBMITTED,
            provider_batch_id=provider_batch_id,
            provider_status=provider_status,
            result_json=None,
            error_message=None,
            topic="agent_batch_job.submitted",
            event_payload=event_payload,
            update_submitted_at=True,
            update_completed_at=False,
        )
        return await self.get_job(job_id)

    async def mark_job_running(
        self,
        *,
        job_id: str,
        provider_status: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.RUNNING,
            provider_batch_id=None,
            provider_status=provider_status,
            result_json=None,
            error_message=None,
            topic="agent_batch_job.running",
            event_payload=event_payload,
            update_submitted_at=False,
            update_completed_at=False,
        )
        return await self.get_job(job_id)

    async def store_polled_result(
        self,
        *,
        job_id: str,
        provider_status: str,
        result_json: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.RUNNING,
            provider_batch_id=None,
            provider_status=provider_status,
            result_json=result_json,
            error_message=None,
            topic=None,
            event_payload=None,
            update_submitted_at=False,
            update_completed_at=False,
        )
        return await self.get_job(job_id)

    async def mark_job_completed(
        self,
        *,
        job_id: str,
        result_json: dict[str, Any],
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.COMPLETED,
            provider_batch_id=None,
            provider_status="completed",
            result_json=result_json,
            error_message=None,
            topic="agent_batch_job.completed",
            event_payload=event_payload,
            update_submitted_at=False,
            update_completed_at=True,
        )
        return await self.get_job(job_id)

    async def mark_job_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.FAILED,
            provider_batch_id=None,
            provider_status=provider_status,
            result_json=None,
            error_message=error_message,
            topic="agent_batch_job.failed",
            event_payload=event_payload,
            update_submitted_at=False,
            update_completed_at=True,
        )
        return await self.get_job(job_id)

    async def mark_job_cancelled(
        self,
        *,
        job_id: str,
        provider_status: str | None,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.CANCELLED,
            provider_batch_id=None,
            provider_status=provider_status,
            result_json=None,
            error_message=None,
            topic="agent_batch_job.cancelled",
            event_payload=event_payload,
            update_submitted_at=False,
            update_completed_at=True,
        )
        return await self.get_job(job_id)

    async def mark_job_finalization_failed(
        self,
        *,
        job_id: str,
        error_message: str,
        event_payload: dict[str, Any],
    ) -> AgentBatchJob:
        await self._update_job_state(
            job_id=job_id,
            status=BatchJobStatus.FINALIZATION_FAILED,
            provider_batch_id=None,
            provider_status="completed",
            result_json=None,
            error_message=error_message,
            topic="agent_batch_job.finalization_failed",
            event_payload=event_payload,
            update_submitted_at=False,
            update_completed_at=True,
        )
        return await self.get_job(job_id)

    async def _update_job_state(
        self,
        *,
        job_id: str,
        status: str,
        provider_batch_id: str | None,
        provider_status: str | None,
        result_json: dict[str, Any] | None,
        error_message: str | None,
        topic: str | None,
        event_payload: dict[str, Any] | None,
        update_submitted_at: bool,
        update_completed_at: bool,
    ) -> None:
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            current = await connection.fetchrow(
                """
                SELECT status
                FROM agent_batch_jobs
                WHERE job_id = $1
                """,
                job_id,
            )
            if current is None:
                raise KeyError(job_id)
            current_status = str(current["status"])
            if current_status == BatchJobStatus.CANCELLED and status != BatchJobStatus.CANCELLED:
                return
            await connection.execute(
                """
                UPDATE agent_batch_jobs
                SET status = $1,
                    provider_batch_id = COALESCE($2, provider_batch_id),
                    provider_status = COALESCE($3, provider_status),
                    result_json = COALESCE($4::jsonb, result_json),
                    error_message = COALESCE($5, error_message),
                    updated_at = now(),
                    submitted_at = CASE WHEN $6 THEN now() ELSE submitted_at END,
                    completed_at = CASE WHEN $7 THEN now() ELSE completed_at END
                WHERE job_id = $8
                """,
                status,
                provider_batch_id,
                provider_status,
                None if result_json is None else _json_dumps(result_json),
                error_message,
                update_submitted_at,
                update_completed_at,
                job_id,
            )
            if topic is not None and event_payload is not None:
                await connection.execute(
                    """
                    INSERT INTO agent_event_outbox (
                        event_id, topic, aggregate_type, aggregate_id, payload_json, status, created_at
                    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
                    """,
                    create_event_id(),
                    topic,
                    "agent_batch_job",
                    job_id,
                    _json_dumps(event_payload),
                    OutboxStatus.PENDING,
                )

    def _job_from_pg_row(self, row: asyncpg.Record) -> AgentBatchJob:
        return AgentBatchJob(
            job_id=str(row["job_id"]),
            run_id=str(row["run_id"]),
            agent_name=str(row["agent_name"]),
            provider=str(row["provider"]),
            model=str(row["model"]),
            execution_strategy=str(row["execution_strategy"]),
            status=str(row["status"]),
            request_json=cast("dict[str, Any]", row["request_json"]),
            context_pack_json=cast("dict[str, Any] | None", row["context_pack_json"]),
            prompt_json=cast("dict[str, Any] | None", row["prompt_json"]),
            provider_batch_id=cast("str | None", row["provider_batch_id"]),
            provider_status=cast("str | None", row["provider_status"]),
            result_json=cast("dict[str, Any] | None", row["result_json"]),
            error_message=cast("str | None", row["error_message"]),
            submitted_at=None if row["submitted_at"] is None else row["submitted_at"].isoformat(),
            completed_at=None if row["completed_at"] is None else row["completed_at"].isoformat(),
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat(),
        )

    def _outbox_from_pg_row(self, row: asyncpg.Record) -> AgentOutboxEvent:
        return AgentOutboxEvent(
            event_id=str(row["event_id"]),
            topic=str(row["topic"]),
            aggregate_type=str(row["aggregate_type"]),
            aggregate_id=str(row["aggregate_id"]),
            payload_json=cast("dict[str, Any]", row["payload_json"]),
            status=str(row["status"]),
            created_at=row["created_at"].isoformat(),
            published_at=None if row["published_at"] is None else row["published_at"].isoformat(),
        )

    def _attempt_from_pg_row(self, row: asyncpg.Record) -> AgentBatchAttempt:
        return AgentBatchAttempt(
            attempt_id=str(row["attempt_id"]),
            job_id=str(row["job_id"]),
            attempt_kind=str(row["attempt_kind"]),
            status=str(row["status"]),
            request_json=cast("dict[str, Any] | None", row["request_json"]),
            response_json=cast("dict[str, Any] | None", row["response_json"]),
            error_message=cast("str | None", row["error_message"]),
            started_at=row["started_at"].isoformat(),
            finished_at=None if row["finished_at"] is None else row["finished_at"].isoformat(),
        )

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("PostgresBatchJobStore.initialize() must be called before use.")
        return self._pool


def build_batch_job_store() -> BatchJobStore:
    database_url = os.getenv("AGENTS_BATCH_DATABASE_URL") or os.getenv("DATABASE_URL")
    if database_url:
        parsed = urlparse(database_url)
        if parsed.scheme.startswith("postgres"):
            return PostgresBatchJobStore(database_url)
        if parsed.scheme.startswith("sqlite") and _sqlite_fallback_allowed():
            path = parsed.path
            if parsed.netloc:
                path = f"//{parsed.netloc}{parsed.path}"
            return SQLiteBatchJobStore(path)
        raise RuntimeError(
            "Agent batch execution requires a Postgres database URL. "
            "Set AGENTS_BATCH_ALLOW_SQLITE=1 only for local development or tests."
        )
    if _sqlite_fallback_allowed():
        return SQLiteBatchJobStore()
    raise RuntimeError(
        "AGENTS_BATCH_DATABASE_URL must point to Postgres for durable agent batch execution. "
        "Set AGENTS_BATCH_ALLOW_SQLITE=1 only for local development or tests."
    )


def _sqlite_fallback_allowed() -> bool:
    value = (os.getenv("AGENTS_BATCH_ALLOW_SQLITE") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


class TemporarySQLiteBatchJobStore(SQLiteBatchJobStore):
    def __init__(self) -> None:
        super().__init__(str(Path(tempfile.mkdtemp()) / "agents-batch.sqlite3"))
