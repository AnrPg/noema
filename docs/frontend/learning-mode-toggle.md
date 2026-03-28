# Learning Mode Toggle

## Purpose

This document defines the UX contract for the global sticky learning-mode toggle
in the authenticated shell.

The toggle is the learner's primary control for switching between:

- `Language Learning`
- `Knowledge Gaining`

It is not decorative. It changes the active semantic context of the app.

## Placement

The toggle belongs in the authenticated shell/header where it is:

- always visible on desktop
- easy to reach on tablet/mobile
- adjacent to other high-level workspace controls

It should not be buried inside individual pages.

## Interaction Model

### Behavior

- changing the toggle updates the app-wide active mode
- the selection persists across routes
- the selection survives reload
- the selection syncs to durable user preferences when possible

### Visual contract

The shell should make the active mode obvious through:

- selected-state styling
- concise label text
- optional badge or pill treatment
- subtle but persistent presence, not modal interruption

## App-Wide Effects

Changing mode updates defaults for:

- dashboard summaries
- knowledge map lens
- card creation defaults
- batch import defaults
- session setup defaults
- study and analytics context

In the current implementation, this already reaches:

- dashboard vitals and review forecast
- reviews workspace analytics
- goals workspace summaries
- knowledge map and comparison reads
- card and batch creation flows
- session summary context

The UI should not require the user to rediscover this on each page.

## Current Implementation Notes

The current implementation now uses one shared study-mode controller between:

- the authenticated shell toggle
- the Settings page study-mode picker
- downstream pages that only need the current active mode

That means the shell and Settings page no longer maintain separate local copies
of mode-selection logic.

Supporting utilities now centralize:

- reading the stored mode from local storage
- persisting the chosen mode
- deriving the mode from authenticated settings when available

This reduces drift between shell state and settings state while keeping the same
two-tier persistence model.

## Screen-Level Indicators

Beyond the shell toggle itself, critical flows should reinforce active mode:

- knowledge map page header
- card and batch creation headers
- session setup and in-session UI
- detail panels where a node/card supports multiple modes

The app should never make a user wonder which mode a high-impact action applies
to.

## Persistence Rules

Two-tier persistence:

- immediate local state for responsive shell updates
- durable preference save for continuity

Failure behavior:

- if preference save fails, keep local mode for the current app session and show
  a non-blocking warning if needed

## Cache and Data Refresh Behavior

Mode changes are semantic changes. The frontend should:

- invalidate/refetch mode-scoped queries
- refresh graph/card/session dashboard views
- avoid silently reusing stale data from the previous mode

Optimistic shell update is fine, but data surfaces must catch up quickly and
reliably.

## Edge Cases

### Multi-mode items

If a node/card exists in both modes:

- it may still appear after toggle switch
- badges or detail UI should clarify shared support when relevant
- progress overlays must reflect the active mode only

### Mode-incompatible items

If the user navigates to an item or view that is not valid in the active mode:

- explain why
- offer a clear switch-mode action if appropriate
- avoid dead-end error states

### Active session

Switching mode while a session is active should be handled carefully in later
implementation. The default expectation should be:

- shell mode changes future defaults
- the current session remains in its original mode

The UI must not imply the active session changed mode mid-flight.

## Acceptance Criteria

- toggle is global, visible, and sticky
- changing it changes workflow defaults across the app
- the active mode is reinforced in critical surfaces
- mode changes trigger correct data refresh behavior
- session context remains coherent even if shell mode changes later

## Related Documents

- `docs/architecture/decisions/ADR-0054-global-learning-mode-toggle-and-ux-lenses.md`
- `docs/frontend/mode-aware-knowledge-map.md`
- `docs/frontend/mode-aware-card-and-batch-flows.md`
