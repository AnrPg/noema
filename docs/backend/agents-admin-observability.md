# Agents Admin Observability

## Purpose

The Python `agents` runtime now exposes an admin-facing observability and
configuration surface for agent runs.

This layer lets admin consumers:

- list and filter runs across all agent wrappers
- inspect one run in depth
- aggregate tokens, cost, latency, statuses, and tool usage
- stream completed-run monitor events
- download per-run JSON and Markdown transcript exports
- version, draft, activate, and inspect agent wrapper/tool-belt configs

## Runtime storage

The runtime persists admin state in a local SQLite database managed by
`agents/src/agents/telemetry.py`.

Primary tables:

- `agent_runs`
- `agent_run_events`
- `agent_run_tool_calls`
- `agent_run_exports`
- `agent_config_versions`

The database location is controlled by:

- `AGENTS_ADMIN_DB_PATH`

If not set, the runtime stores the file under the `agents/.artifacts/`
workspace directory.

## What is recorded

Each run stores:

- wrapper identity and execution mode
- user/session/curriculum/step references when present
- request envelope
- preflight decision snapshot
- context pack snapshot
- prompt slots snapshot
- execution result payload
- transcript payload
- provider/model metadata
- token and cost fields when the execution payload reports them
- tool-call timeline for composite tools and downstream MCP calls
- lifecycle event timeline

## Admin API

Base service: Python `agents` runtime

Routes:

- `GET /v1/admin/agents/stats`
- `GET /v1/admin/agents/runs`
- `GET /v1/admin/agents/runs/{runId}`
- `GET /v1/admin/agents/tools`
- `GET /v1/admin/agents/users`
- `GET /v1/admin/agents/{agentName}/stats`
- `GET /v1/admin/agents/monitor/stream`
- `GET /v1/admin/agents/runs/{runId}/transcript`
- `GET /v1/admin/agents/runs/{runId}/export.json`
- `GET /v1/admin/agents/runs/{runId}/export.md`
- `GET /v1/admin/agents/configs`
- `GET /v1/admin/agents/{agentName}/config`
- `POST /v1/admin/agents/{agentName}/config/drafts`
- `PUT /v1/admin/agents/{agentName}/config/drafts/{versionId}`
- `POST /v1/admin/agents/{agentName}/config/drafts/{versionId}/activate`
- `POST /v1/admin/agents/{agentName}/config/drafts/{versionId}/rollback-source`
- `GET /v1/admin/agents/{agentName}/config/history`

Common filters:

- `agentName`
- `userId`
- `status`
- `executionMode`
- `provider`
- `model`
- `dateFrom`
- `dateTo`

## Transcript exports

Two export formats are available per run:

- JSON: raw stored run detail
- Markdown: readable transcript summary with prompt, context, tool timeline,
  and execution payload

Exports are generated on first request and then cached in
`agent_run_exports`.

## Config model

Agent runtime config is now versioned rather than edited in place.

Each config version stores:

- wrapper JSON
- tool-belt JSON
- actor
- notes
- version number
- status: `draft`, `active`, or `superseded`

Activation rules:

- active versions are immutable after activation
- edits happen on draft versions only
- activating a draft supersedes the previous active version
- new runs record the config version id they were produced under

## Current limitation

This feature currently assumes trusted internal/admin usage. The admin routes
are productized and versioned, but they are not yet protected by a dedicated
server-side admin authorization layer inside the Python runtime itself.
