# Agents Admin Observability Runbook

## Purpose

This runbook covers the operational behavior of the agent-admin observability
and configuration subsystem inside the Python `agents` runtime.

## Storage

Environment variable:

- `AGENTS_ADMIN_DB_PATH`

If unset, the runtime stores the SQLite database in:

- `C:\Users\anr\Apps\noema\agents\.artifacts\agents-admin.sqlite3`

The database contains:

- immutable run envelopes
- run event timelines
- tool-call timelines
- generated export artifacts
- config version history

## Backup guidance

The SQLite file is now operationally important. Back it up if you need to
preserve:

- historical run telemetry
- transcript exports
- config version history

At minimum, include the file in local environment snapshots before destructive
reset work on the agents runtime.

## Retention

V1 keeps all stored telemetry and transcript artifacts indefinitely.

There is currently no built-in TTL or pruning job.

## Monitoring behavior

The admin monitor stream is:

- SSE-based
- completed-run only
- backed by persisted run events

It is not a live token stream. If you need exact run detail, use the run-detail
screen or transcript exports after completion.

## Config changes

Config changes are versioned:

- create draft
- update draft
- activate draft
- keep prior active version as superseded history

Do not edit the SQLite file manually to change live config. Use the admin API or
admin UI so activation history remains coherent.

## Current trust model

The Python runtime admin endpoints are currently intended for trusted internal
usage. Treat them as an internal operator surface until a dedicated server-side
admin authorization layer is added.
