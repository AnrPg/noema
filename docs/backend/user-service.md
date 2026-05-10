# User Service

## Purpose

`user-service` owns user identity, authentication, settings, and administrative
status changes for the Noema platform.

## Health And Metrics

The service exposes:

- `GET /health` for a combined database and Redis status snapshot
- `GET /health/live` for liveness probes
- `GET /health/ready` for readiness probes
- `GET /metrics` for Prometheus-formatted uptime, database, and Redis gauges

The metrics endpoint is intentionally lightweight so local development and
Docker health scrapers can probe the service without triggering noisy `404`
logs during `pnpm dev:web+api`.

## Related Files

- `services/user-service/src/index.ts`
- `services/user-service/src/api/rest/health.routes.ts`
- `services/user-service/src/api/rest/user.routes.ts`
- `services/user-service/src/domain/user-service/user.service.ts`
