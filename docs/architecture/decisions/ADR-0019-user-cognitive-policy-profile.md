# ADR-0019: User Cognitive Policy Profile

## Status

**Accepted** — 2026-02-22

## Context

Session adaptation and content seeding required user-level policy constraints,
but user settings did not contain a stable policy object for pacing, hints,
commit gates, and reflection behavior.

## Decision

Extend user settings with a structured `cognitivePolicy` profile and persist it
as part of user settings defaults and validation.

- Add `cognitivePolicy` fields to user types and schemas.
- Extend repository default settings with policy defaults.
- Keep change additive to avoid breaking existing settings consumers.

## Consequences

### Positive

- Session/content services can consume a normalized policy snapshot.
- Adaptation behavior is now user-configurable and explainable.
- Future policy tuning can occur without cross-service schema drift.

### Negative

- Slightly larger settings payload and validation surface.

## References

- [services/user-service/src/types/user.types.ts](services/user-service/src/types/user.types.ts)
- [services/user-service/src/domain/user-service/user.schemas.ts](services/user-service/src/domain/user-service/user.schemas.ts)
- [services/user-service/src/infrastructure/database/prisma-user.repository.ts](services/user-service/src/infrastructure/database/prisma-user.repository.ts)
