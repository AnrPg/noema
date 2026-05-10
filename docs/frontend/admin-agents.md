# Admin Agents

## Purpose

`apps/web-admin` now includes a first-class `Agents` section for observing,
inspecting, and configuring the shared Python agent runtime.

This is the operator-facing counterpart to the learner-facing `Agent
Workbench`.

## Routes

- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\runs\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\runs\[runId]\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\[agentName]\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\monitor\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\config\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\agents\config\[agentName]\page.tsx`

## Screens

### Overview

Shows:

- total runs
- success/failure counts
- token and cost totals
- average latency
- per-agent aggregate cards
- top tool usage

### Runs

Shows a filterable run table with:

- agent
- user
- status
- total tokens
- cost
- latency
- creation time

### Run Detail

Shows:

- run metadata
- transcript payload
- prompt/context snapshot
- tool-call timeline
- event timeline
- download actions for JSON and Markdown exports

### Agent Detail

Shows one-agent aggregates plus recent runs and tool breakdown.

### Monitor

Uses server-sent events from the agents runtime to show completed runs in
near-real time.

V1 intentionally monitors completed runs only; it does not stream mid-run
token-by-token output.

### Configuration

Shows the active config set for every wrapper and a detail editor for:

- draft creation
- draft editing
- activation
- rollback draft seeding
- version history review

## Data source

The admin UI talks to the agents runtime through `@noema/api-client/agents`.

Environment variable:

- `NEXT_PUBLIC_AGENTS_URL`

Default local expectation:

- `http://localhost:8011`

## UX note

The config detail screen currently edits wrapper and tool-belt payloads as raw
JSON. This keeps V1 exhaustive and low-friction for internal operators, while a
more guided form editor can be layered on later.
