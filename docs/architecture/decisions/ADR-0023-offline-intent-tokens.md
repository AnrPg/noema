# ADR-0023: Signed Self-Contained Offline Intent Tokens

## Status

**Accepted** — 2026-02-22

## Context

Offline-first session continuation requires an intent artifact that can be
stored client-side, validated server-side, and replayed without immediate
network state dependencies.

The session deck is composed by the orchestrating agent (learning/strategy
agent), which calls `scheduler-service` for raw scheduling calculations via MCP
tools and combines those with signals from other agents and services. The agent
hands the final deck to `session-service` as immutable — session-service
executes it as-is and tracks in-session parameters of interest to other services
and agents. Because session-service owns the session lifecycle and holds the
session blueprint, it is the natural authority for issuing and validating
offline intent tokens.

## Decision

Use signed JWT-based offline intent tokens issued by `session-service` that
embed session blueprint claims and expiry metadata.

- **session-service issues** the token when an online session is authorized for
  offline continuation.
- The token embeds the session blueprint (deck content, checkpoint signals),
  userId, expiry, and a nonce for replay protection.
- The mobile client stores the token locally for offline use.
- When the client comes back online, **session-service validates** the token
  signature and **reconciles** the offline session state.
- Issue event emitted for auditability.
- `scheduler-service` has **no involvement** in token issuance or verification —
  it is a pure computation engine for scheduling algorithms.

### Token Lifecycle

1. Agent composes the session deck (using scheduler MCP tool + other inputs).
2. Agent passes the deck to session-service to start a session.
3. Session-service stores the blueprint and issues an offline intent token.
4. Client persists the token offline.
5. Client replays the token when reconnecting; session-service validates and
   reconciles.

### Secret Management

- Enforce strict secret management and rotation discipline (see
  [rotation runbook](../../guides/operations/offline-intent-token-rotation-runbook.md)).

## Consequences

### Positive

- Supports disconnected workflows with verifiable replay intent.
- Keeps issuance/verification logic centralized in the service that owns the
  session lifecycle and holds the blueprint.
- Scheduler-service remains a pure computation engine with no token coupling.
- Aligns with the agent/service split (ADR-0009): agents orchestrate,
  session-service executes.

### Negative

- Requires strict secret management and rotation discipline.
- Token payload size grows with blueprint richness.

## References

- [services/session-service/src/domain/session-service/session.service.ts](services/session-service/src/domain/session-service/session.service.ts)
- [services/session-service/src/config/index.ts](services/session-service/src/config/index.ts)
- [ADR-0009: Scheduling Architecture — Agent/Service Split](./ADR-0009-scheduling-architecture-agent-service-split.md)
- [ADR-0022: Dual-Lane Scheduler Planning](./ADR-0022-dual-lane-scheduler.md)
- [docs/guides/operations/offline-intent-token-rotation-runbook.md](../../guides/operations/offline-intent-token-rotation-runbook.md)
