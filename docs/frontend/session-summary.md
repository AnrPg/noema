# Session Summary

## Purpose

The post-session summary at `/session/[sessionId]/summary` closes the loop
between one study session and longer-term progress in the active mode.

It should answer:

- what happened in this session
- how that session fits into current mode-scoped mastery and readiness

## Mode-Scoped Snapshot

The summary page now combines two read models:

- node mastery summary from the knowledge-graph service
- scheduler progress summary from the scheduler service

This matters because a strong session can still leave the learner with:

- a large due backlog
- many fragile cards
- low tracked coverage

or, conversely, modest raw accuracy inside a session while the broader deck is
healthy and stable.

## Current Sections

- session vitals
- session accuracy
- mode snapshot
- card results
- post-session reflection
- next actions

## Data Boundaries

- session-service owns the session and attempt history
- knowledge-graph-service owns node mastery summary
- scheduler-service owns deck/readiness summary

The UI composes these sources, but it should not infer scheduler health or graph
mastery by itself.
