# Phase 0 — API Gateway & Service Routing

> **Codename:** `Spinal Cord` **Depends on:** Nothing (foundation layer)
> **Unlocks:** Every subsequent phase and every frontend phase **Estimated
> effort:** 2–3 days

---

## Why This Exists

Noema's backend is a polyglot microservice architecture: 6 services on 6
different ports (user-service on 3001, session-service on 3002, content-service
on 3005, knowledge-graph-service on 3006, scheduler-service on 3014, hlr-sidecar
on 8020). The frontend's `@noema/api-client` package takes a **single
`baseUrl`** via `configureApiClient()` — it literally cannot talk to more than
one service.

Without a unified routing layer, the frontend is dead on arrival. Every single
frontend phase — from the Dashboard loading data from 4 services simultaneously,
to the Session Engine committing schedules, to the Admin App managing users and
CKG mutations — requires cross-service communication through one origin.

The spinal cord is the body's central relay — every signal between brain and
body passes through it. This phase builds Noema's equivalent.

---

## Problem Statement

1. **Six services, six ports, one client.** The browser enforces same-origin
   policy. A web app on `localhost:3000` cannot fetch from `localhost:3001`,
   `localhost:3005`, and `localhost:3006` simultaneously without either CORS
   headers on every service (fragile, maintenance nightmare) or a unified
   gateway.

2. **CORS is inconsistent.** User-service allows 3 origins.
   Knowledge-graph-service allows 16. Scheduler-service follows a third pattern.
   No two services have identical CORS configuration.

3. **MinIO presigned URLs bypass the gateway.** Media download URLs point to
   `localhost:9000` (MinIO), which has no CORS configuration. Images and audio
   in cards will fail to load in `<img>` and `<audio>` tags.

4. **No central middleware layer.** Rate limiting, request logging, and auth
   token validation are duplicated across 5 TypeScript services. A gateway
   provides a single enforcement point.

---

## Tasks

### T0.1 — Choose and Configure an API Gateway

Select a reverse proxy that routes requests from one origin to the correct
backend service based on URL path prefix.

**Requirements:**

- Runs as a single container alongside the existing services
- Routes by path prefix to the correct upstream service
- Strips or preserves the prefix as appropriate per service
- Supports WebSocket upgrade (future-proofing for Phoenix Channels)
- Minimal configuration — should not add operational complexity
- Works identically in local development and production

**Routing table:**

| Path Prefix                              | Upstream Service                                 | Port | Notes                                              |
| ---------------------------------------- | ------------------------------------------------ | ---- | -------------------------------------------------- |
| `/api/auth/*`                            | user-service                                     | 3001 | Strip `/api` prefix → `/auth/*`                    |
| `/api/users/*`                           | user-service                                     | 3001 | Strip `/api` prefix → `/users/*`                   |
| `/api/me/*`                              | user-service                                     | 3001 | Strip `/api` prefix → `/me/*`                      |
| `/api/v1/cards/*`                        | content-service                                  | 3005 | Strip `/api` prefix                                |
| `/api/v1/templates/*`                    | content-service                                  | 3005 | Strip `/api` prefix                                |
| `/api/v1/media/*`                        | content-service                                  | 3005 | Strip `/api` prefix                                |
| `/api/v1/scheduler/*`                    | scheduler-service                                | 3014 | Strip `/api` prefix                                |
| `/api/v1/sessions/*`                     | session-service                                  | 3002 | Strip `/api` prefix                                |
| `/api/v1/offline-intents/*`              | session-service                                  | 3002 | Strip `/api` prefix                                |
| `/api/v1/users/:userId/pkg/*`            | knowledge-graph-service                          | 3006 | Pass through as-is (service expects `/api/v1/...`) |
| `/api/v1/ckg/*`                          | knowledge-graph-service                          | 3006 | Pass through as-is                                 |
| `/api/v1/users/:userId/metrics/*`        | knowledge-graph-service                          | 3006 | Pass through as-is                                 |
| `/api/v1/users/:userId/misconceptions/*` | knowledge-graph-service                          | 3006 | Pass through as-is                                 |
| `/api/v1/users/:userId/health/*`         | knowledge-graph-service                          | 3006 | Pass through as-is                                 |
| `/api/v1/users/:userId/comparison/*`     | knowledge-graph-service                          | 3006 | Pass through as-is                                 |
| `/api/hlr/*`                             | hlr-sidecar                                      | 8020 | Strip `/api/hlr` prefix → `/*`                     |
| `/health/*`                              | Per-service health aggregation or gateway health | —    | See T0.4                                           |

**Recommended approach:** Traefik or Caddy as a lightweight reverse proxy
defined in `docker-compose.local.yml`. Alternatively, a simple Node.js
`http-proxy` gateway if the team prefers keeping everything in the monorepo's
language. Choose whichever the team can operate with least friction.

**Why not Next.js API routes as a proxy?** While possible, it couples the
frontend's build/deploy with backend routing, adds latency (double-hop through
Next.js server), and doesn't support WebSockets cleanly. A dedicated reverse
proxy is the standard pattern.

### T0.2 — Unify CORS Configuration

Once the gateway is the single origin facing the browser, individual service
CORS configs become unnecessary (or can be locked down to only accept requests
from the gateway's internal network).

**Steps:**

1. Configure the gateway to set CORS headers on all responses:
   - `Access-Control-Allow-Origin`: the frontend's origin (e.g.,
     `http://localhost:3000` in dev, the production domain in prod)
   - `Access-Control-Allow-Credentials: true`
   - `Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS`
   - `Access-Control-Allow-Headers: Authorization, Content-Type, X-Request-ID`
   - `Access-Control-Max-Age: 86400` (cache preflight for 24 hours)

2. Simplify individual service CORS configs to either:
   - Accept all origins (since they only receive traffic from the gateway), or
   - Accept only the gateway's internal hostname

3. This eliminates the inconsistency problem — user-service allowing 3 origins
   vs knowledge-graph-service allowing 16 becomes irrelevant.

### T0.3 — MinIO Media Proxy

Media presigned URLs from the content-service point to `localhost:9000` (MinIO
internal endpoint). The browser will block direct loads from this origin.

**Two approaches (pick one):**

**Option A — Gateway media proxy route:**

- Add a gateway route `/api/media-proxy/*` that reverse-proxies to MinIO
- The content-service's `GET /v1/media/:id/download-url` would return a
  gateway-relative URL instead of a direct MinIO URL
- Pros: clean, no MinIO config changes. Cons: all media traffic flows through
  the gateway

**Option B — MinIO CORS headers:**

- Configure MinIO with CORS headers in `docker-compose.local.yml` via
  environment variables (`MINIO_API_CORS_ALLOW_ORIGIN`)
- The presigned URLs continue pointing to MinIO directly
- Pros: no proxy overhead for potentially large files. Cons: requires MinIO
  configuration changes and different handling in production (CDN)

**Recommendation:** Option B for development (simpler, matches production where
a CDN/Cloudflare R2 will serve media directly). Add MinIO CORS env vars to
`docker-compose.local.yml`.

### T0.4 — Health Aggregation Endpoint

The gateway should expose a single `/health` endpoint that aggregates the health
of all downstream services.

**Behavior:**

- Calls each service's `/health/ready` endpoint in parallel
- Returns a JSON response with per-service status:
  ```
  { services: { "user-service": "healthy", "content-service": "healthy", ... }, overall: "healthy" }
  ```
- If any critical service is unhealthy, `overall` becomes `"degraded"` or
  `"unhealthy"`
- The HLR sidecar is non-critical — its failure only degrades the calibration
  lane, not the entire platform

**Why:** The frontend's future health monitoring and the admin dashboard's
"System Health" section (Phase 11) both need a single health check that covers
the whole platform.

### T0.5 — Update `@noema/api-client` Base URL Configuration

Once the gateway is running, the API client needs a single update:

- `configureApiClient({ baseUrl: 'http://localhost:8080/api' })` (or whatever
  port the gateway runs on)
- All existing service module paths (`/auth/login`, `/v1/cards`, `/v1/sessions`,
  etc.) should work as-is through the gateway's prefix routing
- Remove any references to individual service ports from frontend configuration

**Also update:**

- `apps/web/.env.local` — set `NEXT_PUBLIC_API_URL=http://localhost:8080/api`
- `apps/web-admin/.env.local` — same
- `docker-compose.local.yml` — add the gateway service, expose port 8080

---

## Acceptance Criteria

- [ ] A single URL (`http://localhost:8080/api`) routes to all 6 backend
      services correctly
- [ ] `POST /api/auth/login` → user-service responds
- [ ] `GET /api/v1/cards/stats` → content-service responds
- [ ] `POST /api/v1/scheduler/dual-lane/plan` → scheduler-service responds
- [ ] `GET /api/v1/sessions` → session-service responds
- [ ] `GET /api/v1/users/:userId/pkg/nodes` → knowledge-graph-service responds
- [ ] `POST /api/hlr/predict` → hlr-sidecar responds
- [ ] CORS headers are set on all responses — frontend on `localhost:3000` can
      make credentialed requests without browser errors
- [ ] MinIO-hosted media loads in `<img>` tags without CORS errors
- [ ] `/health` returns aggregated health of all services
- [ ] `pnpm dev` in the web app successfully calls at least 2 different backend
      services through the gateway

---

## Files Created / Touched

| File                                                 | Action                                    |
| ---------------------------------------------------- | ----------------------------------------- |
| `docker-compose.local.yml`                           | Add gateway service + MinIO CORS config   |
| `infrastructure/gateway/`                            | **New** — gateway configuration directory |
| `infrastructure/gateway/traefik.yml` (or equivalent) | **New** — routing rules                   |
| `apps/web/.env.local`                                | Update `NEXT_PUBLIC_API_URL`              |
| `apps/web-admin/.env.local`                          | Update `NEXT_PUBLIC_API_URL`              |
| `packages/api-client/src/client.ts`                  | Verify single-baseUrl works with gateway  |
