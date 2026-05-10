# Agent Workbench

## Graph Readiness

The workbench should treat `graph-intervention-orchestrator` as the default debug surface for graph-agent runs. Its result contains:

- `graphPrompt.pedagogicalContext`: human-readable fields safe to show in reasoning panels.
- `graphPrompt.serviceContract`: IDs, PKG confirmation plan, CKG mutation plan, and review routing for admin/debug panels only.
- `graphPrompt.populationReport`: populated/missing fields grouped by `call_time`, `deterministic_prefetch`, `static_policy`, `llm_generated_by_agent`, and `unavailable`.

Learner-facing surfaces should show labels, summaries, relation explanations, ambiguity copy, and confirmation messages. Admin/debug surfaces may additionally expose concept IDs, node IDs, idempotency keys, and exact CKG DSL payloads.

PKG writes should show one confirmation pop-up sourced from `serviceContract.pkgWritePlan.operations`. Confirming calls `knowledge-graph.confirm-pkg-write-plan`. CKG writes remain routed to mutation review/admin surfaces through `serviceContract.ckgMutationPlan`.

## Purpose

The learner web app now includes an authenticated `Agent Workbench` for the
shared Python agent runtime introduced in the agent-ready platform work.

The surface is intentionally product-facing rather than debug-only:

- browse registered wrappers
- inspect wrapper contracts and tool belts
- preview review routing before execution
- run agents against live app context through the shared runtime envelope
- inspect returned context packs, prompt slots, and execution payloads
- inspect selected prompt routing metadata such as operation, prompt profile, prompt builder, output schema, and scope when applicable

## Routes and entry points

- `C:\Users\anr\Apps\noema\apps\web\src\app\(authenticated)\agents\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web\src\components\agents\agent-workbench.tsx`
- `C:\Users\anr\Apps\noema\apps\web\src\components\dashboard\agent-workbench-preview.tsx`
- `C:\Users\anr\Apps\noema\apps\web\src\components\copilot\copilot-sidebar.tsx`
- `C:\Users\anr\Apps\noema\apps\web\src\app\(authenticated)\layout.tsx`

## Runtime contract

The web app talks to the runtime through `@noema/api-client/agents`, which
wraps:

- `GET /v1/agents`
- `GET /v1/agents/{agent_name}`
- `POST /v1/agents/{agent_name}/preflight`
- `POST /v1/agents/{agent_name}/run`
- `GET /v1/tools`

The agents runtime base URL is configured at app startup with:

- `NEXT_PUBLIC_AGENTS_URL`

Default local expectation:

- `http://localhost:8011`

## UX shape

The workbench is split into responsive product-facing zones:

1. Wrapper catalog
2. Wrapper contract and tool belt inspection
3. Request composer for the wrapper run envelope
4. Preflight/review routing plus run artifact inspection

The top workbench shell uses two responsive columns when space allows: a
collapsible wrapper catalog on the left and a right-side stack containing the
collapsible wrapper contract above the collapsible workbench request. When the
catalog is collapsed, the right-side stack receives the full shell width. When
the contract is collapsed, the request composer receives the right-side space.

The catalog grows naturally with its wrapper list so short catalogs are not
cropped into an unnecessary inner scroller. The preflight routing, run artifact,
and context summary panels occupy the full available width and stack vertically
on all breakpoints. Prompt slots and execution envelope remain stacked inside
the run artifact and are independently collapsible.

This keeps Phase 6 aligned to the platform plan:

- the UI consumes wrapper contracts instead of inventing its own
- review routing is visible before writes or proposals are produced
- context packs and prompt slots are inspectable for provenance-sensitive work

## Dashboard and Copilot linkage

The workbench is not isolated behind a hidden route.

- Dashboard now exposes an `Agent Workbench` preview card
- Cognitive Copilot now deep-links into the workbench using
  `?agent=cognitive-copilot`
- the authenticated sidebar includes a first-class `Agent Workbench` nav item

## Relationship To Admin Agents

The learner workbench is not the observability console.

The operator-facing runtime surfaces now live in the admin app under the
`Agents` section and handle:

- aggregate run telemetry
- per-run transcript archives
- completed-run monitoring
- wrapper/tool-belt config drafting and activation

The workbench remains the end-user/product-side wrapper runner.
