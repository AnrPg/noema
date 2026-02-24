# Scheduler Incident Runbook

## Scope

This runbook covers operational incidents for scheduler orchestration
reliability, including DLQ triage, replay safety, queue-lag response, and
auth/scope failures.

## Inputs

- Scheduler operations state endpoint: `/v1/scheduler/operations/state`
- Prometheus metrics endpoint: `/metrics`
- Scheduler dead-letter stream: `REDIS_DEAD_LETTER_STREAM`
- Scheduler source stream and consumer group:
  - `REDIS_SOURCE_STREAM`
  - `REDIS_CONSUMER_GROUP`

## SLI / Backpressure Contract

Backpressure state is machine-readable and stable:

- `healthy`
- `degraded`
- `throttled`

Agents should downshift orchestration intensity when state is not `healthy`.

## DLQ Triage Flow

1. Read current DLQ depth from `/v1/scheduler/operations/state` or
   `scheduler_dlq_depth`.
2. If depth is growing, identify dominant failed `eventType` and
   `schedulerLastError`.
3. Classify failure type:
   - schema/payload mismatch
   - dependency outage (DB/Redis)
   - auth/scope denial
   - handler logic bug
4. Fix root cause before replay.
5. Replay only events linked to resolved failure class.
6. Monitor:
   - `scheduler_dlq_depth`
   - `scheduler_queue_lag`
   - `scheduler_error_rate{...}`

## Replay Safety Checklist

- [ ] Root cause fixed and verified in non-production.
- [ ] Replay slice scoped by linkage IDs (`correlationId`, `proposalId`,
      `decisionId`, `sessionId`, `sessionRevision`).
- [ ] Idempotency key strategy validated for replayed envelope shape.
- [ ] Stale revision guard behavior confirmed (`sessionRevision` monotonic).
- [ ] Backpressure state is not `throttled` before replay.
- [ ] Post-replay verification confirms no duplicate state transitions.

## Queue-Lag Response Playbook

### Trigger Conditions

- `scheduler_queue_lag` exceeds degraded threshold.
- Backpressure state becomes `degraded` or `throttled`.

### Response

1. Confirm dependency health (`/health`, `/health/ready`).
2. Reduce ingress pressure:
   - reduce agent request concurrency
   - pause non-critical orchestration requests
3. Increase consumer capacity if available.
4. Inspect pending recovery status after restart using operations endpoint
   traces.
5. Resume traffic gradually once lag trends downward.

## Auth/Scope Incident Response

### Symptoms

- Elevated `scheduler_error_rate{category="auth"...}`
- Repeated `AUTH_UNAUTHORIZED` or `AUTH_FORBIDDEN_SCOPE`

### Response

1. Confirm token issuer/audience and service auth configuration.
2. Verify principal scope grants for scheduler operations and tools.
3. Validate API gateway policy changes.
4. Retest with known-good token and expected audience class.
5. Monitor auth error rate until baseline normalizes.

## Escalation Matrix

- **Level 1 (Ops):** Backpressure degraded, no data loss indicators.
- **Level 2 (Service Team):** Throttled state, replay required, or sustained
  lag.
- **Level 3 (Platform/Security):** Widespread auth failures or dependency
  outage.

## Exit Criteria

- Backpressure returns to `healthy`.
- Queue lag and DLQ depth trend to baseline.
- Replay verification passes with no duplicate side effects.
- Incident notes captured with linkage IDs and mitigation timeline.
