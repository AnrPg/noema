# ADR-0023: Signed Self-Contained Offline Intent Tokens

## Status

**Accepted** — 2026-02-22

## Context

Offline-first session continuation required an intent artifact that can be
stored client-side, validated server-side, and replayed without immediate
network state dependencies.

## Decision

Use signed JWT-based offline intent tokens in `scheduler-service` that embed
session blueprint claims and expiry metadata.

- Issue token with issuer/audience/jti/expiry constraints.
- Verify token and return replay-safe extracted claims.
- Emit issue event for auditability.

## Consequences

### Positive

- Supports disconnected workflows with verifiable replay intent.
- Keeps issuance/verification logic centralized.

### Negative

- Requires strict secret management and rotation discipline.
- Token payload size grows with blueprint richness.

## References

- [services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts](services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts)
- [services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts](services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts)
- [services/scheduler-service/src/types/scheduler.types.ts](services/scheduler-service/src/types/scheduler.types.ts)
- [services/scheduler-service/src/api/rest/scheduler.routes.ts](services/scheduler-service/src/api/rest/scheduler.routes.ts)
