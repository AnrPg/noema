# Closed-Loop Verification

## Purpose

Batch 13 introduces a reusable verification harness for the Step-first runtime.
The harness is designed to prove cross-service convergence from ingestion
through learner-visible projections and to capture replay/load/chaos evidence in
one place.

Artifacts are written under:

- `C:\Users\anr\Apps\noema\.closed-loop\artifacts`

Runtime pid/log files are written under:

- `C:\Users\anr\Apps\noema\.closed-loop\runtime`

## Commands

- `pnpm test:closed-loop`
  Runs the deterministic verification flow.
- `pnpm test:closed-loop:web`
  Runs the learner-facing Playwright proof after closed-loop health checks.
- `pnpm test:closed-loop:replay`
  Runs the deterministic flow twice and captures a replay comparison artifact.
- `pnpm test:closed-loop:load`
  Runs the configurable concurrent session profile.
- `pnpm test:closed-loop:chaos`
  Restarts `metacognition-service` during an in-flight answer and captures the
  post-restart projection state.
- `node C:\Users\anr\Apps\noema\scripts\closed-loop\stack.cjs start`
  Boots the full platform stack and leaves it running.
- `node C:\Users\anr\Apps\noema\scripts\closed-loop\stack.cjs stop`
  Stops the full platform stack.
- `node C:\Users\anr\Apps\noema\scripts\closed-loop\stack.cjs restart <service-name>`
  Restarts one service for manual replay/chaos work.

## Harness Contract

The harness standardizes four kinds of inputs:

- environment bootstrap inputs
  Service definitions, ports, health paths, optional env overrides, and infra
  dependencies.
- seeded fixture descriptors
  The deterministic fixture in `scripts/closed-loop/config.cjs` defines the
  baseline user, document, curriculum, and lesson-plan payloads.
- eventual-convergence assertions
  The harness records health, session, evaluation, stability, and gamification
  outputs as artifacts for each mode.
- fault-injection instructions
  The chaos mode restarts `metacognition-service` during an in-flight answer;
  the stack runner can also restart individual services directly.

## Expected Artifacts

Each run produces a timestamped artifact directory. Typical files include:

- `health.json`
  Per-service health status snapshot before scenario execution.
- `deterministic.json`
  Deterministic scenario payloads and projection outputs.
- `replay-comparison.json`
  Baseline vs replay comparison summary.
- `load.json`
  Concurrent-session execution results.
- `chaos.json`
  Restart target, answered Step metadata, and post-restart projections.
- `playwright-results.xml`
  Browser proof output when running the web profile.

## Convergence Windows

- deterministic health wait
  Up to 90 seconds per service bootstrap.
- deterministic projection settling
  The harness currently waits a short fixed drain window after Step answers.
  Tighten this into explicit eventual assertions as Batch 13 scenario coverage
  expands.
- chaos replay settling
  A longer fixed drain window is used after the `metacognition-service`
  restart.
- load profile
  Concurrency is controlled by `CLOSED_LOOP_LOAD_CONCURRENCY`; the default is a
  low local-dev profile, not the dedicated 1k-session signoff profile.

## Failure Signatures

- health timeout
  A service did not reach its configured health path after bootstrap.
- ingestion bootstrap failure
  The document upload or ingestion run call failed before a curriculum handoff
  completed.
- lesson-plan creation failure
  Session runtime could not materialize the Step queue from the chosen fixture.
- projection read failure
  KG or gamification projections were unavailable after Step evaluation.
- browser proof mismatch
  The authenticated Step/dashboard pages no longer match the learner flow
  contract in `apps/web/tests/e2e/closed-loop.spec.ts`.

## Recovery And Rebuild

- restart one service
  `node C:\Users\anr\Apps\noema\scripts\closed-loop\stack.cjs restart <service-name>`
- restart the whole stack
  Run the `stop` command, then `start`.
- rebuild all closed-loop services
  Re-run any `pnpm test:closed-loop*` command; the stack runner rebuilds
  packages and the configured services before start.
- inspect logs
  Review `.closed-loop/runtime/logs/*.out.log` and `*.err.log`.
- inspect replay evidence
  Compare the most recent deterministic, replay, and chaos artifact directories
  under `.closed-loop/artifacts`.

## CI Adoption

Main CI now has explicit opt-in jobs for:

- deterministic closed-loop proof
- browser closed-loop proof

Dedicated stress and chaos execution lives in:

- `.github/workflows/closed-loop-nightly.yml`

Those jobs are intended for a prepared environment that can boot the full
service topology and tolerate the heavier runtime cost.
