"""SQLite-backed telemetry, transcript export, and config persistence."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Iterator


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _json_loads(value: str | None, *, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    return json.loads(value)


@dataclass(slots=True)
class ToolCallRecord:
    seq: int
    source_kind: str
    service: str
    tool_name: str
    latency_ms: int
    success: bool
    request_payload: dict[str, Any]
    response_payload: dict[str, Any] | None
    error_message: str | None
    occurred_at: str


@dataclass(slots=True)
class RunEventRecord:
    seq: int
    event_type: str
    occurred_at: str
    payload: dict[str, Any]


@dataclass(slots=True)
class RunRecorder:
    run_id: str
    agent_name: str
    started_at: str
    _tool_calls: list[ToolCallRecord] = field(default_factory=list)
    _events: list[RunEventRecord] = field(default_factory=list)

    def record_event(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        self._events.append(
            RunEventRecord(
                seq=len(self._events) + 1,
                event_type=event_type,
                occurred_at=_now_iso(),
                payload=payload or {},
            )
        )

    def record_tool_call(
        self,
        *,
        source_kind: str,
        service: str,
        tool_name: str,
        latency_ms: int,
        success: bool,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        self._tool_calls.append(
            ToolCallRecord(
                seq=len(self._tool_calls) + 1,
                source_kind=source_kind,
                service=service,
                tool_name=tool_name,
                latency_ms=latency_ms,
                success=success,
                request_payload=request_payload,
                response_payload=response_payload,
                error_message=error_message,
                occurred_at=_now_iso(),
            )
        )

    @property
    def tool_calls(self) -> list[ToolCallRecord]:
        return list(self._tool_calls)

    @property
    def events(self) -> list[RunEventRecord]:
        return list(self._events)


_CURRENT_RECORDER: ContextVar[RunRecorder | None] = ContextVar("agent_run_recorder", default=None)


def get_current_run_recorder() -> RunRecorder | None:
    return _CURRENT_RECORDER.get()


@contextmanager
def active_run_recorder(recorder: RunRecorder) -> Iterator[RunRecorder]:
    token = _CURRENT_RECORDER.set(recorder)
    try:
        yield recorder
    finally:
        _CURRENT_RECORDER.reset(token)


class AgentTelemetryStore:
    def __init__(self, db_path: str | None = None) -> None:
        resolved_path = db_path or os.getenv(
            "AGENTS_ADMIN_DB_PATH",
            str(Path(__file__).resolve().parents[2] / ".artifacts" / "agents-admin.sqlite3"),
        )
        self._db_path = Path(str(resolved_path))
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS agent_runs (
                    run_id TEXT PRIMARY KEY,
                    agent_name TEXT NOT NULL,
                    family TEXT NOT NULL,
                    execution_mode TEXT NOT NULL,
                    output_kind TEXT NOT NULL,
                    write_authority TEXT NOT NULL,
                    provider TEXT,
                    model TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    config_version_id TEXT,
                    status TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    session_id TEXT,
                    curriculum_id TEXT,
                    step_id TEXT,
                    request_json TEXT NOT NULL,
                    preflight_json TEXT,
                    context_pack_json TEXT,
                    prompt_json TEXT,
                    execution_json TEXT,
                    transcript_json TEXT,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    total_tokens INTEGER,
                    cost_usd REAL,
                    latency_ms INTEGER,
                    error_code TEXT,
                    error_message TEXT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS agent_run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS agent_run_tool_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    source_kind TEXT NOT NULL,
                    service TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    success INTEGER NOT NULL,
                    request_json TEXT NOT NULL,
                    response_json TEXT,
                    error_message TEXT,
                    occurred_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS agent_run_exports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    format TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    generated_at TEXT NOT NULL,
                    UNIQUE(run_id, format)
                );
                CREATE TABLE IF NOT EXISTS agent_config_versions (
                    version_id TEXT PRIMARY KEY,
                    agent_name TEXT NOT NULL,
                    version_number INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    actor_user_id TEXT,
                    notes TEXT,
                    wrapper_json TEXT NOT NULL,
                    tool_belt_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    activated_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_time
                    ON agent_runs(agent_name, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_runs_user_time
                    ON agent_runs(user_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_runs_status_time
                    ON agent_runs(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run
                    ON agent_run_tool_calls(run_id, seq);
                CREATE INDEX IF NOT EXISTS idx_agent_events_run
                    ON agent_run_events(run_id, seq);
                CREATE INDEX IF NOT EXISTS idx_agent_config_versions_agent
                    ON agent_config_versions(agent_name, version_number DESC);
                """
            )

    def bootstrap_configs(
        self,
        wrappers: dict[str, dict[str, Any]],
        tool_belts: dict[str, dict[str, Any]],
    ) -> None:
        with self._lock, self._connect() as connection:
            for agent_name, wrapper in wrappers.items():
                row = connection.execute(
                    "SELECT COUNT(*) AS count FROM agent_config_versions WHERE agent_name = ?",
                    (agent_name,),
                ).fetchone()
                count = 0 if row is None else int(cast("int", row["count"]))
                if count > 0:
                    active = connection.execute(
                        """
                        SELECT version_id, actor_user_id, wrapper_json, tool_belt_json
                        FROM agent_config_versions
                        WHERE agent_name = ? AND status = 'active'
                        ORDER BY version_number DESC
                        LIMIT 1
                        """,
                        (agent_name,),
                    ).fetchone()
                    if active is not None and str(active["actor_user_id"]) == "system_bootstrap":
                        tool_belt_id = str(wrapper["toolBeltId"])
                        latest_wrapper_json = _json_dumps(wrapper)
                        latest_tool_belt_json = _json_dumps(tool_belts[tool_belt_id])
                        if (
                            str(active["wrapper_json"]) != latest_wrapper_json
                            or str(active["tool_belt_json"]) != latest_tool_belt_json
                        ):
                            connection.execute(
                                """
                                UPDATE agent_config_versions
                                SET wrapper_json = ?, tool_belt_json = ?, updated_at = ?
                                WHERE version_id = ?
                                """,
                                (
                                    latest_wrapper_json,
                                    latest_tool_belt_json,
                                    _now_iso(),
                                    str(active["version_id"]),
                                ),
                            )
                    continue
                tool_belt_id = str(wrapper["toolBeltId"])
                version_id = f"cfg_{uuid.uuid4().hex[:24]}"
                now = _now_iso()
                connection.execute(
                    """
                    INSERT INTO agent_config_versions (
                        version_id, agent_name, version_number, status, actor_user_id, notes,
                        wrapper_json, tool_belt_json, created_at, updated_at, activated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        version_id,
                        agent_name,
                        1,
                        "active",
                        "system_bootstrap",
                        "Bootstrapped from runtime defaults.",
                        _json_dumps(wrapper),
                        _json_dumps(tool_belts[tool_belt_id]),
                        now,
                        now,
                        now,
                    ),
                )

    def get_runtime_state(
        self,
        default_wrappers: dict[str, dict[str, Any]],
        default_tool_belts: dict[str, dict[str, Any]],
    ) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
        self.bootstrap_configs(default_wrappers, default_tool_belts)
        wrappers: dict[str, dict[str, Any]] = {}
        tool_belts: dict[str, dict[str, Any]] = {}
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT agent_name, wrapper_json, tool_belt_json
                FROM agent_config_versions
                WHERE status = 'active'
                ORDER BY agent_name ASC
                """
            ).fetchall()
        for row in rows:
            wrapper = cast("dict[str, Any]", _json_loads(row["wrapper_json"], fallback={}))
            tool_belt = cast("dict[str, Any]", _json_loads(row["tool_belt_json"], fallback={}))
            wrappers[str(row["agent_name"])] = wrapper
            tool_belts[str(tool_belt["id"])] = tool_belt
        return wrappers, tool_belts

    def list_configs(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT agent_name, version_id, version_number, status, actor_user_id, notes,
                       wrapper_json, tool_belt_json, created_at, updated_at, activated_at
                FROM agent_config_versions
                WHERE status = 'active'
                ORDER BY agent_name ASC
                """
            ).fetchall()
        return [self._config_row_to_payload(row) for row in rows]

    def get_agent_config(self, agent_name: str) -> dict[str, Any]:
        with self._connect() as connection:
            active = connection.execute(
                """
                SELECT * FROM agent_config_versions
                WHERE agent_name = ? AND status = 'active'
                ORDER BY version_number DESC
                LIMIT 1
                """,
                (agent_name,),
            ).fetchone()
            drafts = connection.execute(
                """
                SELECT * FROM agent_config_versions
                WHERE agent_name = ? AND status = 'draft'
                ORDER BY version_number DESC
                """,
                (agent_name,),
            ).fetchall()
            history = connection.execute(
                """
                SELECT * FROM agent_config_versions
                WHERE agent_name = ?
                ORDER BY version_number DESC
                """,
                (agent_name,),
            ).fetchall()
        if active is None and not drafts and not history:
            raise KeyError(agent_name)
        return {
            "agentName": agent_name,
            "active": None if active is None else self._config_row_to_payload(active),
            "drafts": [self._config_row_to_payload(row) for row in drafts],
            "history": [self._config_row_to_payload(row) for row in history],
        }

    def create_config_draft(
        self,
        *,
        agent_name: str,
        actor_user_id: str,
        wrapper: dict[str, Any],
        tool_belt: dict[str, Any],
        notes: str | None,
    ) -> dict[str, Any]:
        version_id = f"cfg_{uuid.uuid4().hex[:24]}"
        now = _now_iso()
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT COALESCE(MAX(version_number), 0) AS version_number FROM agent_config_versions WHERE agent_name = ?",
                (agent_name,),
            ).fetchone()
            version_number = (0 if row is None else int(cast("int", row["version_number"]))) + 1
            connection.execute(
                """
                INSERT INTO agent_config_versions (
                    version_id, agent_name, version_number, status, actor_user_id, notes,
                    wrapper_json, tool_belt_json, created_at, updated_at, activated_at
                ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    version_id,
                    agent_name,
                    version_number,
                    actor_user_id,
                    notes,
                    _json_dumps(wrapper),
                    _json_dumps(tool_belt),
                    now,
                    now,
                ),
            )
            created = connection.execute(
                "SELECT * FROM agent_config_versions WHERE version_id = ?",
                (version_id,),
            ).fetchone()
        if created is None:
            raise RuntimeError("Failed to create config draft")
        return self._config_row_to_payload(created)

    def update_config_draft(
        self,
        *,
        version_id: str,
        actor_user_id: str,
        wrapper: dict[str, Any],
        tool_belt: dict[str, Any],
        notes: str | None,
    ) -> dict[str, Any]:
        now = _now_iso()
        with self._lock, self._connect() as connection:
            current = connection.execute(
                "SELECT * FROM agent_config_versions WHERE version_id = ?",
                (version_id,),
            ).fetchone()
            if current is None:
                raise KeyError(version_id)
            if str(current["status"]) != "draft":
                raise ValueError("Only draft config versions can be edited.")
            connection.execute(
                """
                UPDATE agent_config_versions
                SET actor_user_id = ?, notes = ?, wrapper_json = ?, tool_belt_json = ?, updated_at = ?
                WHERE version_id = ?
                """,
                (
                    actor_user_id,
                    notes,
                    _json_dumps(wrapper),
                    _json_dumps(tool_belt),
                    now,
                    version_id,
                ),
            )
            updated = connection.execute(
                "SELECT * FROM agent_config_versions WHERE version_id = ?",
                (version_id,),
            ).fetchone()
        if updated is None:
            raise RuntimeError("Failed to update config draft")
        return self._config_row_to_payload(updated)

    def activate_config_draft(self, *, version_id: str, actor_user_id: str) -> dict[str, Any]:
        now = _now_iso()
        with self._lock, self._connect() as connection:
            target = connection.execute(
                "SELECT * FROM agent_config_versions WHERE version_id = ?",
                (version_id,),
            ).fetchone()
            if target is None:
                raise KeyError(version_id)
            if str(target["status"]) != "draft":
                raise ValueError("Only draft config versions can be activated.")
            agent_name = str(target["agent_name"])
            connection.execute(
                "UPDATE agent_config_versions SET status = 'superseded' WHERE agent_name = ? AND status = 'active'",
                (agent_name,),
            )
            connection.execute(
                """
                UPDATE agent_config_versions
                SET status = 'active', actor_user_id = ?, updated_at = ?, activated_at = ?
                WHERE version_id = ?
                """,
                (actor_user_id, now, now, version_id),
            )
            activated = connection.execute(
                "SELECT * FROM agent_config_versions WHERE version_id = ?",
                (version_id,),
            ).fetchone()
        if activated is None:
            raise RuntimeError("Failed to activate config draft")
        return self._config_row_to_payload(activated)

    def create_rollback_draft(self, *, agent_name: str, actor_user_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            active = connection.execute(
                """
                SELECT * FROM agent_config_versions
                WHERE agent_name = ? AND status = 'active'
                ORDER BY version_number DESC
                LIMIT 1
                """,
                (agent_name,),
            ).fetchone()
        if active is None:
            raise KeyError(agent_name)
        wrapper = cast("dict[str, Any]", _json_loads(active["wrapper_json"], fallback={}))
        tool_belt = cast("dict[str, Any]", _json_loads(active["tool_belt_json"], fallback={}))
        return self.create_config_draft(
            agent_name=agent_name,
            actor_user_id=actor_user_id,
            wrapper=wrapper,
            tool_belt=tool_belt,
            notes="Rollback draft seeded from current active config.",
        )

    def start_run(
        self,
        *,
        run_id: str,
        agent_name: str,
        family: str,
        execution_mode: str,
        output_kind: str,
        write_authority: str,
        provider: str | None,
        model: str | None,
        enabled: bool,
        config_version_id: str | None,
        user_id: str,
        session_id: str | None,
        curriculum_id: str | None,
        step_id: str | None,
        request_payload: dict[str, Any],
        started_at: str,
    ) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO agent_runs (
                    run_id, agent_name, family, execution_mode, output_kind, write_authority,
                    provider, model, enabled, config_version_id, status, user_id, session_id,
                    curriculum_id, step_id, request_json, started_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    agent_name,
                    family,
                    execution_mode,
                    output_kind,
                    write_authority,
                    provider,
                    model,
                    1 if enabled else 0,
                    config_version_id,
                    user_id,
                    session_id,
                    curriculum_id,
                    step_id,
                    _json_dumps(request_payload),
                    started_at,
                    started_at,
                ),
            )

    def finalize_run(
        self,
        *,
        run_id: str,
        status: str,
        preflight: dict[str, Any] | None,
        context_pack: dict[str, Any] | None,
        prompt: dict[str, Any] | None,
        execution: dict[str, Any] | None,
        transcript: dict[str, Any],
        latency_ms: int,
        usage: dict[str, Any],
        error_code: str | None,
        error_message: str | None,
        completed_at: str,
        recorder: RunRecorder,
    ) -> None:
        effective_provider = _effective_provider(execution)
        effective_model = _effective_model(execution)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE agent_runs
                SET status = ?, preflight_json = ?, context_pack_json = ?, prompt_json = ?,
                    execution_json = ?, transcript_json = ?, input_tokens = ?, output_tokens = ?,
                    total_tokens = ?, cost_usd = ?, latency_ms = ?, error_code = ?, error_message = ?,
                    provider = COALESCE(?, provider), model = COALESCE(?, model), completed_at = ?
                WHERE run_id = ?
                """,
                (
                    status,
                    _json_dumps(preflight) if preflight is not None else None,
                    _json_dumps(context_pack) if context_pack is not None else None,
                    _json_dumps(prompt) if prompt is not None else None,
                    _json_dumps(execution) if execution is not None else None,
                    _json_dumps(transcript),
                    usage.get("inputTokens"),
                    usage.get("outputTokens"),
                    usage.get("totalTokens"),
                    usage.get("costUsd"),
                    latency_ms,
                    error_code,
                    error_message,
                    effective_provider,
                    effective_model,
                    completed_at,
                    run_id,
                ),
            )
            connection.executemany(
                """
                INSERT INTO agent_run_events (run_id, seq, event_type, occurred_at, payload_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (
                        run_id,
                        event.seq,
                        event.event_type,
                        event.occurred_at,
                        _json_dumps(event.payload),
                    )
                    for event in recorder.events
                ],
            )
            connection.executemany(
                """
                INSERT INTO agent_run_tool_calls (
                    run_id, seq, source_kind, service, tool_name, latency_ms, success,
                    request_json, response_json, error_message, occurred_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        run_id,
                        tool.seq,
                        tool.source_kind,
                        tool.service,
                        tool.tool_name,
                        tool.latency_ms,
                        1 if tool.success else 0,
                        _json_dumps(tool.request_payload),
                        _json_dumps(tool.response_payload) if tool.response_payload is not None else None,
                        tool.error_message,
                        tool.occurred_at,
                    )
                    for tool in recorder.tool_calls
                ],
            )

    def list_runs(
        self,
        *,
        filters: dict[str, Any] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        filters = filters or {}
        where_clauses: list[str] = []
        values: list[Any] = []
        for key, column in (
            ("agentName", "agent_name"),
            ("userId", "user_id"),
            ("status", "status"),
            ("executionMode", "execution_mode"),
            ("provider", "provider"),
            ("model", "model"),
        ):
            value = filters.get(key)
            if isinstance(value, str) and value:
                where_clauses.append(f"{column} = ?")
                values.append(value)
        if isinstance(filters.get("dateFrom"), str):
            where_clauses.append("created_at >= ?")
            values.append(filters["dateFrom"])
        if isinstance(filters.get("dateTo"), str):
            where_clauses.append("created_at <= ?")
            values.append(filters["dateTo"])
        if isinstance(filters.get("agentNames"), list) and filters["agentNames"]:
            placeholders = ", ".join("?" for _ in filters["agentNames"])
            where_clauses.append(f"agent_name IN ({placeholders})")
            values.extend(filters["agentNames"])
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        with self._connect() as connection:
            total_row = connection.execute(
                f"SELECT COUNT(*) AS count FROM agent_runs {where_sql}",
                values,
            ).fetchone()
            rows = connection.execute(
                f"""
                SELECT run_id, agent_name, family, execution_mode, provider, model, user_id,
                       status, input_tokens, output_tokens, total_tokens, cost_usd, latency_ms,
                       created_at, completed_at, error_message, config_version_id
                FROM agent_runs
                {where_sql}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                [*values, limit, offset],
            ).fetchall()
        return {
            "items": [self._run_list_row_to_payload(row) for row in rows],
            "total": 0 if total_row is None else int(cast("int", total_row["count"])),
            "limit": limit,
            "offset": offset,
        }

    def get_run_detail(self, run_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            run = connection.execute(
                "SELECT * FROM agent_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            events = connection.execute(
                "SELECT * FROM agent_run_events WHERE run_id = ? ORDER BY seq ASC",
                (run_id,),
            ).fetchall()
            tool_calls = connection.execute(
                "SELECT * FROM agent_run_tool_calls WHERE run_id = ? ORDER BY seq ASC",
                (run_id,),
            ).fetchall()
        if run is None:
            raise KeyError(run_id)
        return {
            **self._run_row_to_payload(run),
            "events": [self._event_row_to_payload(row) for row in events],
            "toolCalls": [self._tool_call_row_to_payload(row) for row in tool_calls],
        }

    def get_stats(self, *, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        filters = filters or {}
        run_list = self.list_runs(filters=filters, limit=10000, offset=0)
        items = cast("list[dict[str, Any]]", run_list["items"])
        totals = {
            "totalRuns": len(items),
            "successRuns": sum(1 for item in items if item["status"] == "completed"),
            "failedRuns": sum(1 for item in items if item["status"] == "failed"),
            "totalInputTokens": sum(int(item["inputTokens"] or 0) for item in items),
            "totalOutputTokens": sum(int(item["outputTokens"] or 0) for item in items),
            "totalTokens": sum(int(item["totalTokens"] or 0) for item in items),
            "totalCostUsd": round(sum(float(item["costUsd"] or 0.0) for item in items), 6),
            "averageLatencyMs": round(
                sum(int(item["latencyMs"] or 0) for item in items) / len(items), 2
            )
            if items
            else 0.0,
        }
        by_agent: dict[str, dict[str, Any]] = {}
        by_user: dict[str, dict[str, Any]] = {}
        for item in items:
            for bucket, key in ((by_agent, str(item["agentName"])), (by_user, str(item["userId"]))):
                current = bucket.setdefault(
                    key,
                    {
                        "key": key,
                        "runCount": 0,
                        "totalTokens": 0,
                        "totalCostUsd": 0.0,
                        "averageLatencyMs": 0.0,
                        "successRuns": 0,
                        "failedRuns": 0,
                    },
                )
                current["runCount"] += 1
                current["totalTokens"] += int(item["totalTokens"] or 0)
                current["totalCostUsd"] += float(item["costUsd"] or 0.0)
                current["averageLatencyMs"] += int(item["latencyMs"] or 0)
                if item["status"] == "completed":
                    current["successRuns"] += 1
                elif item["status"] == "failed":
                    current["failedRuns"] += 1
        for bucket in (by_agent, by_user):
            for current in bucket.values():
                if current["runCount"] > 0:
                    current["averageLatencyMs"] = round(
                        current["averageLatencyMs"] / current["runCount"], 2
                    )
                    current["totalCostUsd"] = round(current["totalCostUsd"], 6)
        return {
            "totals": totals,
            "byAgent": list(by_agent.values()),
            "byUser": list(by_user.values()),
        }

    def get_tool_stats(self, *, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        filters = filters or {}
        where_clauses = ["1 = 1"]
        values: list[Any] = []
        if isinstance(filters.get("agentName"), str) and filters["agentName"]:
            where_clauses.append("r.agent_name = ?")
            values.append(filters["agentName"])
        if isinstance(filters.get("userId"), str) and filters["userId"]:
            where_clauses.append("r.user_id = ?")
            values.append(filters["userId"])
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT r.agent_name, t.source_kind, t.service, t.tool_name,
                       COUNT(*) AS call_count,
                       AVG(t.latency_ms) AS average_latency_ms,
                       SUM(CASE WHEN t.success = 1 THEN 1 ELSE 0 END) AS success_count,
                       SUM(CASE WHEN t.success = 0 THEN 1 ELSE 0 END) AS failure_count
                FROM agent_run_tool_calls t
                INNER JOIN agent_runs r ON r.run_id = t.run_id
                WHERE {' AND '.join(where_clauses)}
                GROUP BY r.agent_name, t.source_kind, t.service, t.tool_name
                ORDER BY call_count DESC, r.agent_name ASC, t.tool_name ASC
                """
                ,
                values,
            ).fetchall()
        return {
            "items": [
                {
                    "agentName": str(row["agent_name"]),
                    "sourceKind": str(row["source_kind"]),
                    "service": str(row["service"]),
                    "toolName": str(row["tool_name"]),
                    "callCount": int(cast("int", row["call_count"])),
                    "averageLatencyMs": round(float(cast("float", row["average_latency_ms"] or 0.0)), 2),
                    "successCount": int(cast("int", row["success_count"])),
                    "failureCount": int(cast("int", row["failure_count"])),
                }
                for row in rows
            ]
        }

    def list_completed_events(self, *, after_id: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT e.id, e.run_id, e.event_type, e.occurred_at, e.payload_json,
                       r.agent_name, r.user_id, r.status, r.provider, r.model,
                       r.latency_ms, r.total_tokens, r.cost_usd
                FROM agent_run_events e
                INNER JOIN agent_runs r ON r.run_id = e.run_id
                WHERE e.id > ? AND e.event_type IN ('execution_completed', 'execution_failed')
                ORDER BY e.id ASC
                LIMIT ?
                """,
                (after_id, limit),
            ).fetchall()
        return [
            {
                "eventId": int(cast("int", row["id"])),
                "runId": str(row["run_id"]),
                "eventType": str(row["event_type"]),
                "occurredAt": str(row["occurred_at"]),
                "payload": cast("dict[str, Any]", _json_loads(row["payload_json"], fallback={})),
                "agentName": str(row["agent_name"]),
                "userId": str(row["user_id"]),
                "status": str(row["status"]),
                "provider": row["provider"],
                "model": row["model"],
                "latencyMs": row["latency_ms"],
                "totalTokens": row["total_tokens"],
                "costUsd": row["cost_usd"],
            }
            for row in rows
        ]

    def get_or_create_export(self, run_id: str, export_format: str) -> dict[str, Any]:
        detail = self.get_run_detail(run_id)
        with self._lock, self._connect() as connection:
            existing = connection.execute(
                "SELECT * FROM agent_run_exports WHERE run_id = ? AND format = ?",
                (run_id, export_format),
            ).fetchone()
            if existing is not None:
                return {
                    "runId": run_id,
                    "format": export_format,
                    "fileName": str(existing["file_name"]),
                    "content": str(existing["content"]),
                    "generatedAt": str(existing["generated_at"]),
                }
            now = _now_iso()
            if export_format == "json":
                content = _json_dumps(detail)
                file_name = f"{run_id}.json"
            elif export_format == "md":
                content = self._markdown_transcript(detail)
                file_name = f"{run_id}.md"
            else:
                raise ValueError(f"Unsupported export format: {export_format}")
            connection.execute(
                """
                INSERT INTO agent_run_exports (run_id, format, file_name, content, generated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, export_format, file_name, content, now),
            )
        return {
            "runId": run_id,
            "format": export_format,
            "fileName": file_name,
            "content": content,
            "generatedAt": now,
        }

    def _config_row_to_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "versionId": str(row["version_id"]),
            "agentName": str(row["agent_name"]),
            "versionNumber": int(cast("int", row["version_number"])),
            "status": str(row["status"]),
            "actorUserId": row["actor_user_id"],
            "notes": row["notes"],
            "wrapper": cast("dict[str, Any]", _json_loads(row["wrapper_json"], fallback={})),
            "toolBelt": cast("dict[str, Any]", _json_loads(row["tool_belt_json"], fallback={})),
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
            "activatedAt": row["activated_at"],
        }

    def _run_list_row_to_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "runId": str(row["run_id"]),
            "agentName": str(row["agent_name"]),
            "family": str(row["family"]),
            "executionMode": str(row["execution_mode"]),
            "provider": row["provider"],
            "model": row["model"],
            "userId": str(row["user_id"]),
            "status": str(row["status"]),
            "inputTokens": row["input_tokens"],
            "outputTokens": row["output_tokens"],
            "totalTokens": row["total_tokens"],
            "costUsd": row["cost_usd"],
            "latencyMs": row["latency_ms"],
            "createdAt": str(row["created_at"]),
            "completedAt": row["completed_at"],
            "errorMessage": row["error_message"],
            "configVersionId": row["config_version_id"],
        }

    def _run_row_to_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "runId": str(row["run_id"]),
            "agentName": str(row["agent_name"]),
            "family": str(row["family"]),
            "executionMode": str(row["execution_mode"]),
            "outputKind": str(row["output_kind"]),
            "writeAuthority": str(row["write_authority"]),
            "provider": row["provider"],
            "model": row["model"],
            "enabled": bool(row["enabled"]),
            "configVersionId": row["config_version_id"],
            "status": str(row["status"]),
            "userId": str(row["user_id"]),
            "sessionId": row["session_id"],
            "curriculumId": row["curriculum_id"],
            "stepId": row["step_id"],
            "request": cast("dict[str, Any]", _json_loads(row["request_json"], fallback={})),
            "preflight": cast("dict[str, Any]", _json_loads(row["preflight_json"], fallback={})),
            "contextPack": cast("dict[str, Any]", _json_loads(row["context_pack_json"], fallback={})),
            "prompt": cast("dict[str, Any]", _json_loads(row["prompt_json"], fallback={})),
            "execution": cast("dict[str, Any] | None", _json_loads(row["execution_json"], fallback=None)),
            "transcript": cast("dict[str, Any]", _json_loads(row["transcript_json"], fallback={})),
            "inputTokens": row["input_tokens"],
            "outputTokens": row["output_tokens"],
            "totalTokens": row["total_tokens"],
            "costUsd": row["cost_usd"],
            "latencyMs": row["latency_ms"],
            "errorCode": row["error_code"],
            "errorMessage": row["error_message"],
            "startedAt": str(row["started_at"]),
            "completedAt": row["completed_at"],
            "createdAt": str(row["created_at"]),
        }

    def _event_row_to_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "seq": int(cast("int", row["seq"])),
            "eventType": str(row["event_type"]),
            "occurredAt": str(row["occurred_at"]),
            "payload": cast("dict[str, Any]", _json_loads(row["payload_json"], fallback={})),
        }

    def _tool_call_row_to_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "seq": int(cast("int", row["seq"])),
            "sourceKind": str(row["source_kind"]),
            "service": str(row["service"]),
            "toolName": str(row["tool_name"]),
            "latencyMs": int(cast("int", row["latency_ms"])),
            "success": bool(row["success"]),
            "request": cast("dict[str, Any]", _json_loads(row["request_json"], fallback={})),
            "response": cast("dict[str, Any] | None", _json_loads(row["response_json"], fallback=None)),
            "errorMessage": row["error_message"],
            "occurredAt": str(row["occurred_at"]),
        }

    def _markdown_transcript(self, detail: dict[str, Any]) -> str:
        lines = [
            f"# Agent Run {detail['runId']}",
            "",
            f"- Agent: `{detail['agentName']}`",
            f"- User: `{detail['userId']}`",
            f"- Status: `{detail['status']}`",
            f"- Created At: `{detail['createdAt']}`",
            "",
            "## Prompt",
            "",
            "```json",
            _json_dumps(detail.get("prompt", {})),
            "```",
            "",
            "## Context Pack",
            "",
            "```json",
            _json_dumps(detail.get("contextPack", {})),
            "```",
            "",
            "## Tool Calls",
            "",
        ]
        for tool_call in cast("list[dict[str, Any]]", detail.get("toolCalls", [])):
            lines.extend(
                [
                    f"### {tool_call['seq']}. {tool_call['service']} :: {tool_call['toolName']}",
                    "",
                    f"- Success: `{tool_call['success']}`",
                    f"- Latency: `{tool_call['latencyMs']} ms`",
                    "",
                    "```json",
                    _json_dumps(tool_call),
                    "```",
                    "",
                ]
            )
        lines.extend(
            [
                "## Execution",
                "",
                "```json",
                _json_dumps(detail.get("execution", {})),
                "```",
                "",
            ]
        )
        return "\n".join(lines)


def create_run_id() -> str:
    return f"agentrun_{uuid.uuid4().hex[:24]}"


def build_transcript(
    *,
    agent_name: str,
    request_payload: dict[str, Any],
    preflight: dict[str, Any] | None,
    prompt: dict[str, Any] | None,
    context_pack: dict[str, Any] | None,
    execution: dict[str, Any] | None,
    recorder: RunRecorder,
) -> dict[str, Any]:
    return {
        "agentName": agent_name,
        "request": request_payload,
        "preflight": preflight,
        "prompt": prompt,
        "contextPack": context_pack,
        "execution": execution,
        "toolCalls": [
            {
                "seq": tool.seq,
                "sourceKind": tool.source_kind,
                "service": tool.service,
                "toolName": tool.tool_name,
                "latencyMs": tool.latency_ms,
                "success": tool.success,
                "request": tool.request_payload,
                "response": tool.response_payload,
                "errorMessage": tool.error_message,
                "occurredAt": tool.occurred_at,
            }
            for tool in recorder.tool_calls
        ],
        "events": [
            {
                "seq": event.seq,
                "eventType": event.event_type,
                "occurredAt": event.occurred_at,
                "payload": event.payload,
            }
            for event in recorder.events
        ],
    }


def extract_usage(execution: dict[str, Any] | None) -> dict[str, Any]:
    if execution is None:
        return {
            "inputTokens": None,
            "outputTokens": None,
            "totalTokens": None,
            "costUsd": None,
        }
    result = cast("dict[str, Any]", execution.get("result", execution))
    usage = cast("dict[str, Any]", result.get("usage", {}))
    input_tokens = usage.get("inputTokens")
    output_tokens = usage.get("outputTokens")
    total_tokens = usage.get("totalTokens")
    if total_tokens is None and isinstance(input_tokens, int) and isinstance(output_tokens, int):
        total_tokens = input_tokens + output_tokens
    return {
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "costUsd": usage.get("costUsd"),
    }


def _model_routing(execution: dict[str, Any] | None) -> dict[str, Any]:
    if execution is None:
        return {}
    routing = execution.get("modelRouting")
    return cast("dict[str, Any]", routing) if isinstance(routing, dict) else {}


def _effective_provider(execution: dict[str, Any] | None) -> str | None:
    provider = _model_routing(execution).get("effectiveProvider")
    return str(provider) if isinstance(provider, str) and provider else None


def _effective_model(execution: dict[str, Any] | None) -> str | None:
    model = _model_routing(execution).get("effectiveModel")
    return str(model) if isinstance(model, str) and model else None


def now_monotonic_ms() -> int:
    return int(time.perf_counter() * 1000)
