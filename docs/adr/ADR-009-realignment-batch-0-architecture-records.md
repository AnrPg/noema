# ADR-009: Realignment Batch 0 Architecture Records

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADRs                       |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

`IMPLEMENTATION_PLAN_FINAL.md` is now the implementation ground truth for the
Noema pedagogical realignment. The repository already contains older ADRs and
architecture notes that describe card-centric attempts, mastery summaries,
session queue items, standalone session streak state, and scheduler/session
cohort handshakes. Those records were valid when written, but they now conflict
with the realignment's Step-first, reasoning-dominant loop.

The project owner also requires every phase to start with an ADR explaining the
whole phase plan, then to update that ADR after each step and at phase end with
implementation changes and emergent decisions.

## Decision

Batch 0 creates the realignment ADR baseline before source implementation.

Required records:

- `ADR-010`: Step is the atomic learning unit.
- `ADR-011`: Direct rename / no-alias policy.
- `ADR-012`: Realignment service boundaries.
- `ADR-013`: Evaluation is owned by metacognition-service.
- `ADR-014`: Scheduler is concept-first.
- `ADR-015`: Cohort handshake protocol is removed.
- `ADR-016`: Three-choice self-rating replaces four-button grade UI.
- `ADR-020`: Every session has a LessonPlan.
- `ADR-021`: Concept stability is revocable and reasoning-dominant.
- `ADR-022`: Repetition uses transformation cycling.
- `ADR-023`: Pedagogy Guardian is an independent validation gate.
- `ADR-024`: Gamification is a derived projection.
- `ADR-025`: Deterministic eligibility groups own mode routing.

Batch 0 also updates `architecture.md` and `module-graph.md` so the living
architecture points at the realignment target instead of only the previous
mode-aware/card-centric baseline.

## Rationale

- Starting with ADRs keeps the large refactor auditable and gives later batches
  stable references for destructive deletes and renames.
- A phase-level ADR gives one place to record implementation-time deviations
  from the plan without hiding them in individual topical decisions.
- Creating the topical ADRs separately avoids a single overloaded architecture
  record and makes future code reviews easy to map to a decision.

## Alternatives Considered

| Option                                      | Pros                   | Cons                                                              | Rejected because                                |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| One large ADR for all realignment decisions | Fastest to write       | Hard to reference, hard to supersede selectively                  | Batch 1+ tasks need precise decision anchors    |
| Update only `architecture.md`               | Keeps docs compact     | Loses decision history and supersession trail                     | Destructive deletes require ADR-level rationale |
| Start implementation before ADRs            | Moves faster initially | Violates the project owner's phase rule and repo operating manual | ADRs are required before each phase             |

## Phase Plan

1. Read `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md`, current architecture,
   current module graph, task board, decisions log, and representative ADRs.
2. Create the phase ADR and seven topical ADRs under `docs/adr/`.
3. Mark directly conflicting stale ADRs as superseded by the realignment ADRs.
4. Update the living architecture and module graph with the target service loop.
5. Validate touched Markdown formatting.

## Batch 0 Acceptance Matrix

| Ground-truth decision                                                         | Governing ADR                   |
| ----------------------------------------------------------------------------- | ------------------------------- |
| Step is the atomic learner-visible unit; Cards become payloads/templates      | `ADR-010`                       |
| Direct rename, delete, and no-alias clean refactor policy                     | `ADR-011`                       |
| Service ownership and one-source-of-truth boundaries                          | `ADR-012`                       |
| Evaluation belongs to metacognition-service and reasoning dominates           | `ADR-013`                       |
| Scheduler becomes concept-first and preserves scheduling math internally      | `ADR-014`                       |
| Session/scheduler cohort handshake protocol is removed                        | `ADR-015`                       |
| Three-choice self-rating replaces learner-facing scheduler grades             | `ADR-016`                       |
| Every session has a LessonPlan; four active goal cap                          | `ADR-020`                       |
| Concept state is revocable `stable` / `unstable`                              | `ADR-021`                       |
| Repetition cycles cognitive transformations before repeating                  | `ADR-022`                       |
| Pedagogy Guardian is an independent validation service                        | `ADR-023`                       |
| Gamification is derived projection/cache, not learning truth                  | `ADR-024`                       |
| Eligibility groups deterministically route all 30 epistemic modes             | `ADR-025`                       |
| Content-service keeps ingestion and owns generated activity variants          | `ADR-012`, `ADR-022`            |
| Strategy stays inside session-service until it owns independent durable state | `ADR-012`, `ADR-020`, `ADR-023` |
| Analytics adds reasoning-quality-over-time without a new analytics service    | `ADR-013`, `ADR-021`            |

## Current Workspace Caveat

An earlier implementation pass touched Batch 1, Batch 2, and partial Batch 3
code before the project owner clarified that deeper Batch 0 preparation should
come first. Those changes are intentionally kept in the workspace, but this ADR
baseline treats later batches as not signed off. When the project owner gives a
go-ahead for a later batch, the existing edits must be reviewed as if they were
fresh work and refactored or replaced where they are shallow, stale, or
insufficient.

## Step Log

- 2026-05-01: Phase started. Existing docs show the prior baseline is mode-aware
  but still talks in terms of cards, attempts, mastery, and scheduler
  handshakes. Batch 0 will preserve the mode-aware substrate while replacing the
  pedagogical core with the Step-first realignment.
- 2026-05-01: Created the seven required topical realignment ADRs: `ADR-010`
  through `ADR-016`.
- 2026-05-01: Marked directly conflicting stale ADRs as superseded or partially
  superseded, depending on whether the old record was wholly obsolete or still
  useful as an implementation pattern.
- 2026-05-01: Extended stale-ADR supersession to card-centric scheduler read and
  card-seeding/planning records: `ADR-003`, `ADR-0020`, and `ADR-0022`.
- 2026-05-01: Updated `architecture.md` with the realignment baseline, governing
  ADRs, service ownership table, and superseded concepts.
- 2026-05-01: Updated `module-graph.md` with the Step-first closed-loop module
  graph while retaining the prior mode-aware substrate as historical context.
- 2026-05-01: Re-opened Batch 0 at the project owner's direction for a deeper
  architecture pass. Added six more topical ADRs (`ADR-020` through `ADR-025`)
  so every major decision in the ground-truth implementation plan has an ADR
  reference.
- 2026-05-01: Added an explicit acceptance matrix and workspace caveat
  clarifying that premature later-batch code remains in the worktree but is not
  considered accepted implementation.

## Emergent Decisions During Implementation

- Kept the existing mode-aware architecture as an active substrate rather than
  superseding it wholesale. The realignment supersedes card/attempt/mastery
  semantics where they conflict, but still relies on study mode and learning
  mode propagation.
- Used "partially superseded" for ADRs that still contain valid engineering
  patterns, such as shared package centralization and event consumer
  decomposition, while superseding their stale card/cohort vocabulary.
- Split "all decisions in this plan have a referenced ADR" into the required
  seven Batch 0 ADRs plus six additional baseline ADRs. This keeps the mandated
  records intact while giving LessonPlan, stability, transformation cycling,
  Guardian, gamification, and mode-routing decisions first-class references.

## Consequences

- Later implementation batches can reference stable ADR numbers.
- Conflicting older ADRs remain in history but no longer govern new work where
  they conflict with the realignment.
- The living architecture now needs to be maintained after each realignment
  batch, especially when code reveals unanticipated constraints.

## References

- `IMPLEMENTATION_PLAN_FINAL.md`
- `REALIGNMENT.md`
- `architecture.md`
- `module-graph.md`
