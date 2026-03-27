# ADR-0054: Global Learning Mode Toggle and UX Lenses

## Status

Accepted

## Date

2026-03-27

## Context

ADR-0053 establishes `LearningMode` as a first-class domain concept. That
decision is only useful if the active mode becomes visible, stable, and
predictable across the frontend.

Without a clear interaction model, several UX failures are likely:

- graph views silently mixing incompatible relation emphases
- card authoring and batch import defaulting to the wrong assumptions
- sessions starting in a context different from the dashboard or graph
- users feeling that the app behaves like two partially overlapping products

The frontend already has a strong authenticated shell and multiple workspaces.
The system therefore needs one central, coherent mechanism that sets the active
context across the product while preserving room for explicit override where
necessary.

## Decision

### 1) Add a global sticky learning-mode toggle to the authenticated shell

The authenticated shell becomes the canonical UX control for active learning
mode.

Properties:

- visible at shell/header level
- available everywhere after authentication
- sticky across routes
- persisted across reloads

The toggle values are:

- `Language Learning`
- `Knowledge Gaining`

### 2) Treat the selected mode as the default application context

The active mode drives default behavior for:

- dashboard summaries
- graph lenses
- card creation
- batch import
- session setup
- study execution
- analytics read models shown in the UI

Individual advanced workflows may still send an explicit mode to backend APIs,
but the shell state remains the default source of context.

### 3) Use mode lenses rather than separate workspaces

The UI will not split into separate standalone language and knowledge apps.
Instead, shared surfaces gain mode-specific lenses.

Examples:

- knowledge map uses graph lenses
- card flows adapt defaults and hints by mode
- dashboards swap the primary metrics shown by mode

### 4) Persist the mode in both local shell state and user preferences

Persistence is two-tiered:

- immediate local state for responsive shell updates
- durable user preference for cross-session continuity

Local state keeps the UI fast. Stored preference makes mode meaningful over time
and across devices.

### 5) Make active mode visible in every critical workflow

The UI must surface active mode context in:

- the shell itself
- session setup and live study surfaces
- knowledge map
- card batch creation
- node/card detail panels when multi-mode membership matters

The system must never require users to remember the active mode implicitly.

## Rationale

### Why global sticky instead of per-page or per-widget

- Scheduling, mastery, graph lensing, and authoring defaults all depend on the
  same context.
- A global sticky toggle creates predictable behavior.
- Per-page or per-widget toggles would create hidden divergence and increase the
  chance of writing or studying in the wrong mode.

### Why one shell instead of separate navigation trees

- The architecture is shared by design.
- Many items and workflows overlap across modes.
- Shared shell with lenses preserves platform cohesion and avoids duplicate
  navigation structures.

### Why visible mode labeling matters

- Mode changes alter semantics, not just cosmetic presentation.
- Users need confidence that the app is operating in the intended context.
- Explicit labeling reduces accidental state contamination and user confusion.

## Alternatives Considered

| Option                                            | Pros                   | Cons                                                      | Rejected because                                 |
| ------------------------------------------------- | ---------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Per-page toggle                                   | Local flexibility      | Inconsistent behavior across the app                      | It weakens the idea of a stable learning context |
| Session-only mode selection                       | Smaller surface area   | Leaves graph, dashboard, and authoring behavior ambiguous | Mode affects much more than sessions             |
| Separate language and knowledge navigation shells | Very explicit          | Feels like two apps; duplicates UX and fragments identity | It conflicts with the shared-core architecture   |
| Hidden preference without an explicit toggle      | Less visual complexity | Unclear, error-prone, hard to recover from mistakes       | Core context cannot be hidden                    |

## Consequences

### Positive

- users gain a clear mental model of the active context
- shared screens can adapt without splitting the app
- session, graph, and authoring defaults become predictable
- product identity remains unified

### Negative / trade-offs

- shell design grows in importance and complexity
- more screens need active-mode indicators
- mode changes will invalidate/refetch more UI state

### Follow-up tasks created

- add shell toggle and persisted preference contract
- add active-mode badges and contextual copy in key flows
- add mode-aware query invalidation behavior
- document graph and card flow lensing rules

## References

- `architecture.md`
- `docs/frontend/learning-mode-toggle.md`
- `docs/frontend/mode-aware-knowledge-map.md`
- `docs/frontend/mode-aware-card-and-batch-flows.md`
