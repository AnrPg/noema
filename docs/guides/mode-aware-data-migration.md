# Mode-Aware Data Migration Guide

## Purpose

This guide describes how to migrate Noema from mode-less or implicitly scoped
records to the new mode-aware architecture.

It is intentionally operational and rollout-oriented. The ADRs define the
architecture; this guide describes how to change live data and contracts safely.

## Migration Goals

- preserve current production behavior
- introduce `LearningMode` without breaking clients
- backfill historical records safely
- prevent cross-mode contamination
- enable incremental rollout across services

## Default Migration Assumption

All legacy data is treated as:

- `knowledge_gaining`

This is the baseline assumption unless records are explicitly reclassified in a
later workflow.

## Why the Default Is Conservative

Noema's current graph/content/scheduler semantics are more aligned with
knowledge-oriented learning than with the new, richer language mode.

Using `knowledge_gaining` as the migration default:

- preserves continuity
- avoids false confidence in language-specific classification
- reduces risk of corrupted schedule/mastery state

## Rollout Sequence

## Step 1. Add shared contracts and transport support

Before migrating persisted data, ensure:

- `LearningMode` exists in shared types
- API contracts can carry mode
- events can carry mode where necessary

Goal:

- prepare the system to speak the new language before changing storage

## Step 2. Add persistence support and indexes

Introduce:

- mode-scoped keys/indexes for scheduler state
- mode fields for session/attempt persistence
- mode membership fields for nodes/cards where required

Goal:

- make storage capable of representing the new architecture

## Step 3. Backfill legacy records

Backfill or interpret legacy records as `knowledge_gaining`.

Targets:

- schedule state
- sessions and attempts where required
- mastery/read-model rows
- any other progress-bearing records

Goal:

- guarantee deterministic scope for all historical state

## Step 4. Ship application defaults and frontend shell toggle

Add:

- active mode preference
- shell toggle
- mode propagation in frontend workflows

Goal:

- let new behavior start flowing through the system while compatibility remains
  safe

## Step 5. Tighten service enforcement

After critical consumers are upgraded:

- require explicit mode in the most important write paths
- reduce reliance on compatibility inference

Goal:

- converge from “supported” to “architecturally enforced”

## Backfill Rules

## Scheduler state

Legacy rows become:

- `learningMode = knowledge_gaining`

Validation check:

- no schedule read path should return an unscoped row once migration is complete

## Session and attempt records

Legacy rows become:

- `learningMode = knowledge_gaining`

Validation check:

- historical sessions remain queryable and labeled clearly

## Mastery / analytics state

Legacy rollups or state become:

- `learningMode = knowledge_gaining`

Validation check:

- dashboards do not merge migrated and new mode-specific state ambiguously

## Cards and nodes

Membership can initially default conservatively.

Typical first-pass defaults:

- existing concept-centric nodes/cards -> `['knowledge_gaining']`

Do not try to infer language-specific membership automatically in v1 unless the
evidence is explicit and highly trustworthy.

## Compatibility Behavior During Transition

## Read paths

Read paths may:

- use active mode when present
- fall back to `knowledge_gaining` for legacy data

## Write paths

Write paths should move steadily toward explicit mode, especially for:

- session creation
- attempt capture
- schedule updates
- batch execution

Temporary defaults are acceptable early in rollout but should not remain the
only contract.

## Validation Checklist

## Data integrity

- no orphaned progress rows without mode
- no duplicate keys caused by incomplete backfill
- no unscoped repository reads on progress-bearing tables/collections

## Product integrity

- old users still see their existing progress as expected
- active mode changes affect only new mode-aware reads/writes
- migrated `knowledge_gaining` state behaves exactly like the old default system

## Analytical integrity

- reports label their scope clearly
- cross-mode comparisons are explicit, not accidental

## Rollback Guidance

If rollout issues appear:

- prefer disabling strict enforcement before removing migrated data
- keep migrated mode fields intact where possible
- use application-layer fallbacks while fixing propagation bugs

Do not roll back by reintroducing mode-less writes if that would create mixed
semantics in live data.

## Post-Migration Follow-Up

Once the architecture is stable:

- add explicit reassignment tools for items that should support language mode
- add admin/author workflows for multi-mode membership
- tighten mode requirements on write contracts
- expand analytics and QA coverage for dual-mode items

## Acceptance Criteria

Migration is considered successful when:

- legacy progress behaves as `knowledge_gaining`
- new mode-aware records are written consistently
- no service silently merges progress across modes
- old clients continue functioning during the transition window

## Related Documents

- `docs/architecture/decisions/ADR-0058-mode-aware-migration-and-backward-compatibility.md`
- `docs/backend/mode-aware-learning-core.md`
- `docs/backend/mode-aware-scheduler-and-session.md`
- `architecture.md`
