# 2026-05-04 — Agent Batch Router and Queue

**Status:** Draft  
**Date:** 2026-05-04  
**Scope:** First real batch execution architecture for Noema agents, turning
existing batch-planning metadata into a working provider router, durable batch
job queue, polling workers, and internal event pipeline.  
**Depends on:**

- Existing `agents/` Python package runtime and registry metadata
- Existing Redis and Postgres local/runtime infrastructure
- Batch 11 content/curriculum/ingestion agent plans
- Pedagogy Guardian validation boundaries

---

## 1. Purpose and Architecture

The current agents package is **batch-aware** but not yet **batch-executing**.
It can decide that a request prefers batch, but it still executes immediately
in-process. This plan replaces that metadata-only state with a real batch system
that can submit deferred work to provider batch APIs, persist durable job
state, poll for completion, finalize results, and emit internal lifecycle
events.

### Locked architecture

Noema uses:

- **polling externally**
- **events internally**

The architecture is:

1. **Provider router** decides provider, model, and execution mode
   (`realtime` vs `batch`) using the existing model and execution registries.
2. **Batch job store** lives durably in Postgres and is the source of truth for
   queue state.
3. **External polling workers** check Gemini and OpenAI batch status on a fixed
   interval and fetch results when jobs complete.
4. **Internal event pipeline** uses Postgres outbox tables as the canonical
   event source and Redis Streams as the delivery/fan-out layer.
5. **Finalizer worker** parses provider output, validates schema, runs Guardian
   when required, persists service-owned artifacts, writes telemetry, and emits
   completion/failure events.
6. **UI/admin visibility** uses job status endpoints immediately. SSE is a
   follow-up optimization, not required for v1 correctness.

### Why this shape

- Gemini batch currently fits a polling model well.
- OpenAI batch also supports polling, so v1 keeps a single cross-provider
  control plane.
- Postgres provides durable state and transactional outbox semantics.
- Redis Streams provides fast, simple internal fan-out without introducing new
  infrastructure.
- Low-latency learner-critical flows stay realtime and never depend on the
  batch queue.

### Core runtime rule

- **realtime for low-latency agents**
- **batch for batch-preferred agents**

Execution mode is resolved from:

1. registry defaults
2. per-request override
3. hard runtime safety rules that force realtime for low-latency paths

The existing agent model registry and execution registry remain the source of
truth for model selection and batch preference.

---

## 2. Scope by Agent

### Batch-capable in v1

These agents can use the generic batch framework:

- `ingestion_concept_extraction`
- `knowledge_graph_agent`
- `curriculum_planner`
- `content_creation_orchestrator`
- `lesson_plan_generator` for deferred generation only
- `taxonomy_curator`
- `research_evaluator_agent`
- `mental_debugger` when generating async summaries or dashboards
- `calibration_coach` when deferred
- `patch_planner_remediation_agent` when deferred
- `ai_mirror_cognitive_copilot`
- `pedagogy_guardian` for non-blocking review queues only
- `watchtower_governance_layer`

### Realtime-only in v1

These agents must stay realtime on learner-critical paths:

- `socratic_tutor`
- `strategy_replanning_agent`
- `mode_preference_helper`
- `lesson_plan_generator` for immediate session-start flows
- `mental_debugger` when shown immediately after a Step
- `calibration_coach` when shown immediately after a Step
- `patch_planner_remediation_agent` when inserted directly into the active
  learner loop
- `pedagogy_guardian` when it blocks or admits learner-facing runtime artifacts

### Runtime resolution policy

Every request resolves execution mode in this order:

1. Read agent defaults from the execution registry.
2. Accept a per-request override (`auto`, `realtime`, `batch`).
3. Apply hard safety rules:
   - any learner-critical active session flow is forced to `realtime`
   - any agent marked non-batchable is forced to `realtime`
   - any deferred/reporting/offline flow may use `batch`
4. Record the final resolved execution plan in telemetry and job state.

---

## 3. Data Model and Persistence

Postgres is the durable source of truth for:

- batch jobs
- batch attempts
- internal outbox events

Redis Streams is **not** the canonical source of truth. It is delivery
infrastructure only.

All job state transitions that matter to downstream consumers must be written
transactionally with their outbox records.

### 3.1 `agent_batch_jobs`

```sql
CREATE TABLE agent_batch_jobs (
  job_id TEXT PRIMARY KEY,
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

CREATE INDEX idx_agent_batch_jobs_status_created
  ON agent_batch_jobs(status, created_at DESC);

CREATE INDEX idx_agent_batch_jobs_agent_status
  ON agent_batch_jobs(agent_name, status, created_at DESC);

CREATE INDEX idx_agent_batch_jobs_provider_status
  ON agent_batch_jobs(provider, provider_status, created_at DESC);
```

### 3.2 `agent_batch_attempts`

```sql
CREATE TABLE agent_batch_attempts (
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

CREATE INDEX idx_agent_batch_attempts_job
  ON agent_batch_attempts(job_id, started_at DESC);
```

`attempt_kind` values:

- `submit`
- `poll`
- `finalize`

### 3.3 `agent_event_outbox`

```sql
CREATE TABLE agent_event_outbox (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_event_outbox_status_created
  ON agent_event_outbox(status, created_at ASC);

CREATE INDEX idx_agent_event_outbox_aggregate
  ON agent_event_outbox(aggregate_type, aggregate_id, created_at ASC);
```

Outbox status values:

- `pending`
- `published`
- `failed`

### 3.4 Job status values

The batch job lifecycle is:

- `queued`
- `submitted`
- `running`
- `completed`
- `failed`
- `cancelled`
- `finalization_failed`

`updated_at` must change on every transition. `submitted_at` is set on first
successful provider submission. `completed_at` is set only on terminal
completion or terminal failure.

---

## 4. Event Contract

The internal event backbone uses:

- Postgres outbox as source of truth
- Redis Streams for delivery

### Event names

- `agent_batch_job.queued`
- `agent_batch_job.submitted`
- `agent_batch_job.running`
- `agent_batch_job.completed`
- `agent_batch_job.failed`
- `agent_batch_job.cancelled`
- `agent_batch_job.finalization_failed`

### Minimum payload

Every event payload includes:

```json
{
  "jobId": "job_123",
  "agentName": "content_creation_orchestrator",
  "provider": "google",
  "model": "gemini-2.5-flash",
  "strategy": "batch",
  "status": "completed",
  "providerBatchId": "provider_batch_abc",
  "correlationId": "run_or_request_id",
  "resultRef": {
    "jobId": "job_123",
    "artifactCount": 6
  },
  "error": null,
  "occurredAt": "2026-05-04T10:00:00Z"
}
```

Failure payloads populate `error` with:

- `code`
- `message`
- optional `retryable`

### Redis stream

Redis Streams mirrors all outbox events to:

- `agent-batch-events`

Recommended stream message fields:

- `event_id`
- `topic`
- `aggregate_type`
- `aggregate_id`
- `payload_json`
- `created_at`

### Consumer rules

All consumers must be idempotent:

- key by `event_id` for event processing
- key by `job_id` for result-finalization side effects
- tolerate duplicate stream delivery
- tolerate worker restarts after DB commit but before stream publish

Redis stream publish success never replaces the need for durable outbox state.

---

## 5. Provider Router and Provider Adapters

### New modules

Add these modules under the agents package:

- `agents/src/agents/llm_router.py`
- `agents/src/agents/batch_jobs.py`
- `agents/src/agents/batch_worker.py`
- `agents/src/agents/outbox_dispatcher.py`
- `agents/src/agents/providers/gemini_realtime.py`
- `agents/src/agents/providers/gemini_batch.py`
- `agents/src/agents/providers/openai_realtime.py`
- `agents/src/agents/providers/openai_batch.py`

### Router responsibilities

`llm_router.py` is responsible for:

1. loading agent model config
2. loading execution config
3. resolving realtime vs batch
4. choosing the correct provider adapter
5. creating a durable batch job record for async requests
6. returning immediate submission envelopes for batch requests
7. calling direct provider code for realtime requests

### Adapter responsibilities

Each provider adapter implements:

- `submit_batch(requests) -> provider_batch_id`
- `get_batch_status(provider_batch_id) -> provider_status`
- `fetch_batch_results(provider_batch_id) -> normalized_results`
- `cancel_batch(provider_batch_id) -> status`

Realtime adapters implement direct request execution for existing sync paths.

### Provider-specific v1 rules

- Gemini batch uses provider polling.
- OpenAI batch also uses provider polling in v1.
- OpenAI webhooks are intentionally not used in v1 so Noema has one
  cross-provider batch control plane.
- OpenAI webhooks are a later optimization and must not be coupled into v1
  routing, status, or worker semantics.

### Normalized provider statuses

Adapters must normalize provider states into:

- `queued`
- `submitted`
- `running`
- `completed`
- `failed`
- `cancelled`

Provider-specific raw statuses are stored in `provider_status` for audit and
debugging.

---

## 6. Runtime and API Contract Changes

### Runtime changes

`AgentRuntime.run(...)` must branch on the resolved execution plan:

- realtime -> execute immediately
- batch -> persist job and return submission envelope

Preview agents may also use batch when the request is explicitly deferred or
report-oriented.

The existing `executionPlan` metadata remains in the response and becomes
operational rather than informational only.

### Batch submission response

Batch submissions must return:

```json
{
  "runId": "agentrun_123",
  "jobId": "job_123",
  "agent": { "name": "content-creation-orchestrator" },
  "executionPlan": {
    "strategy": "batch"
  },
  "status": "queued",
  "provider": "google",
  "model": "gemini-2.5-flash",
  "providerBatchId": null,
  "pollAfterSeconds": 30
}
```

If the provider batch id is obtained synchronously during submission, return it
immediately. Otherwise return `null` until the submission worker fills it in.

### API additions

Add:

- `POST /v1/agents/{agent_name}/run-async`
- `GET /v1/batch-jobs/{job_id}`
- `GET /v1/batch-jobs?status=&agentName=&provider=`
- `POST /v1/batch-jobs/{job_id}/cancel`

Optional admin/debug routes:

- `GET /v1/admin/batch-jobs`
- `GET /v1/admin/batch-jobs/{job_id}/events`

### API behavior

- `run-async` always resolves execution strategy before enqueueing.
- If the resolved strategy is forced realtime by safety rules, return `422`
  instead of silently enqueueing.
- `GET /v1/batch-jobs/{job_id}` returns status, provider metadata, timestamps,
  attempts, and result summary when available.
- `cancel` marks the job cancelling/cancelled locally and calls the provider
  adapter where supported.

### Cancellation rules

- Jobs in `queued`, `submitted`, or `running` may receive cancellation requests.
- Workers must stop polling cancelled jobs.
- If provider cancellation fails but the provider later completes, finalization
  must still be idempotent and respect terminal-state guards.

---

## 7. Worker Model

Use three periodic workers first.

### 7.1 Submission worker

Responsibilities:

- load `queued` jobs
- call the provider adapter `submit_batch(...)`
- write `provider_batch_id`
- transition job to `submitted`
- create outbox event `agent_batch_job.submitted`

### 7.2 Polling worker

Responsibilities:

- load `submitted` and `running` jobs
- call `get_batch_status(...)`
- update `provider_status`
- transition to `running` when provider indicates active processing
- fetch results when provider indicates completion
- write raw/normalized results to `result_json`
- transition to `completed` before finalization only if result fetch succeeded

Recommended polling interval:

- 30–60 seconds

Retry rules:

- exponential backoff for transient provider/network failures
- bounded retry count per job attempt kind
- record every submit/poll attempt in `agent_batch_attempts`

### 7.3 Finalizer worker

Responsibilities:

- load completed-but-not-finalized results
- normalize provider payloads into Noema agent result shapes
- validate structured output/schema
- run Guardian when required
- persist accepted artifacts to the correct owning service path
- write usage and cost telemetry
- emit:
  - `agent_batch_job.completed`
  - `agent_batch_job.failed`
  - `agent_batch_job.finalization_failed`

### Dead-letter behavior

No separate broker-level dead-letter queue is introduced in v1.

Instead:

- unrecoverable provider submission/poll errors -> job `failed`
- unrecoverable post-result finalization errors -> job `finalization_failed`
- both terminal states emit outbox events and preserve error details

This keeps the operational model simple and durable in Postgres.

---

## 8. Result Finalization Rules

Provider results are **never** treated as final truth automatically.

The finalizer must:

1. parse provider output into a normalized agent result shape
2. validate structured output/schema
3. preserve prompt, context, model, and provider provenance
4. run Guardian when the artifact path requires it
5. write accepted results through the owning service path
6. store usage and cost telemetry
7. emit completion or failure events

### Required artifact handling

- `content_creation_orchestrator`
  - validate drafts
  - run Guardian where required
  - persist drafts/results through the content-service path
  - emit `agent_batch_job.completed`

- `lesson_plan_generator`
  - validate LessonPlan draft structure
  - run Guardian
  - persist draft through the session-service path
  - emit completion event

- `research_evaluator_agent`
  - store report artifact and metadata
  - emit completion event

- `taxonomy_curator`
  - store reviewable proposal artifact
  - emit completion event

### Partial failure policy

If a batch contains multiple requests and only some succeed:

- preserve per-request result/error details
- finalize successful sub-results idempotently
- store partial failure summary in `result_json`
- mark the overall job:
  - `completed` if the requested contract allows partial success
  - `failed` if the request contract requires all-or-nothing finalization

The provider adapter must normalize this explicitly; it must not be left to
downstream callers to guess from raw provider payloads.

---

## 9. Rollout Order

### Phase 1 — Shared persistence

Implement:

1. Postgres `agent_batch_jobs`
2. Postgres `agent_batch_attempts`
3. Postgres `agent_event_outbox`
4. Redis Streams publisher/dispatcher

### Phase 2 — Shared runtime

Implement:

1. provider router
2. async submission API
3. batch job status API
4. worker scaffolding

### Phase 3 — Provider adapters

Implement in this order:

1. Gemini realtime
2. Gemini batch
3. OpenAI realtime
4. OpenAI batch

### Phase 4 — First complete proving flow

Fully complete:

1. `content_creation_orchestrator`

This is the proving path even though the framework is generic from day one.

### Phase 5 — Remaining generic rollout

Roll out in this order:

1. `research_evaluator_agent`
2. `taxonomy_curator`
3. `ingestion_concept_extraction`
4. `knowledge_graph_agent`
5. `curriculum_planner`
6. deferred `lesson_plan_generator`
7. deferred reflective/governance agents

### Explicit non-goals for v1

- OpenAI webhook ingestion
- SSE as a correctness dependency
- new external broker infrastructure
- active-session batch execution

---

## 10. Public Module and Ownership Map

### New modules

- `llm_router.py`
  - route request to realtime or batch
  - choose provider adapter

- `batch_jobs.py`
  - Postgres persistence for job and attempt state
  - transactional outbox writes

- `batch_worker.py`
  - submission, polling, and finalization worker loops

- `outbox_dispatcher.py`
  - publish pending outbox events to Redis Streams
  - mark outbox rows published

- `providers/*`
  - provider-specific realtime and batch implementations

### Ownership boundaries

- agents package owns routing, queueing, polling, normalization, and event
  emission
- content/session/other domain services remain owners of durable domain
  artifacts
- Redis owns event transport only
- Postgres owns job and outbox truth

---

## 11. Test Plan

### Unit tests

- execution plan resolution for every agent
- provider router picks correct provider/model/strategy
- batch disallowed agents downgrade to realtime when batch is requested
- outbox records are created transactionally with job state changes
- provider result normalization handles partial failures and malformed responses

### Integration tests

- submit async content-generation job -> persisted as `queued` / `submitted`
- polling worker transitions `submitted` -> `running` -> `completed`
- finalizer stores result and emits `agent_batch_job.completed`
- provider failure yields `failed` with durable error record
- finalization failure yields `finalization_failed` and retry behavior
- Redis stream publish is idempotent when dispatcher restarts
- cancelled jobs stop being polled
- realtime flows remain unaffected

### End-to-end scenarios

- Gemini batch content generation
- OpenAI batch evaluator run
- mixed realtime + batch jobs coexisting
- restart workers mid-flight and recover from Postgres state
- duplicate polling result handling without duplicate finalization

---

## 12. Implementation Defaults and Assumptions

- File path is `docs/plans/2026-05-04-agent-batch-router-and-queue.md`
- This document is an implementation spec, not an ADR
- Postgres is the durable source of truth for jobs and outbox
- Redis Streams is used for internal event delivery because Redis already exists
  in Noema infrastructure
- External provider completion is handled by polling for both Gemini and OpenAI
  in v1
- OpenAI webhooks are deferred to a later optimization pass
- UI/admin consumption uses status endpoints first; SSE can be added after the
  core queue is stable
- Batch work is only used when latency is not on the learner-critical path
- All consumers and workers must be idempotent
- `content_creation_orchestrator` is the first fully completed production flow, even
  though the framework is generic from day one
