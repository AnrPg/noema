# Phase 1 — Auth, Error Semantics, Guardrails

## Objective

Make scheduler boundaries safe and machine-readable for agents with scoped,
principal-aware authorization and consistent error responses.

## Covers Gaps

1, 2, 21, 22, 23, 24

## Required Outputs

- Canonical error envelope used by auth middleware, REST routes, and tool
  routes.
- Service-principal claim model:
  - `principalType`: `user | agent | service`
  - `principalId`
  - `scopes: string[]`
  - optional `audienceClass`
- Scope enforcement for routes and tools.
- JWKS verification support with rotation-ready configuration.
- Hard guardrails for `AUTH_DISABLED` in non-dev environments.
- Abuse controls: payload limits, per-principal tool quotas/rate controls.

## Tasks

- [x] Update auth middleware to parse principal context and scopes.
- [x] Add scope policies per route/tool and enforce deny-by-default.
- [x] Normalize all unauthorized/forbidden responses to shared contract.
- [x] Add startup config checks for auth bypass safety.
- [x] Add basic abuse controls at route/tool boundaries.
- [x] Add tests for scope matrix and error envelope conformance.

## Constraints

- Keep existing user flows working while adding agent/service flows.
- Additive changes only; no breaking of existing endpoint names.

## Exit Criteria

- [x] Scope tests pass for user, agent, and service principals.
- [x] All auth-related errors conform to single machine-readable shape.
- [x] Non-dev startup fails fast if insecure auth mode is enabled.
