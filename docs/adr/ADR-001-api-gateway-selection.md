# ADR-001: API Gateway Selection — Traefik

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| **Status**  | Accepted                                  |
| **Date**    | 2026-03-03                                |
| **Phase**   | Phase 00 — Spinal Cord (API Gateway)      |
| **Authors** | Claude (AI), approved by project owner    |

---

## Context

Noema is a polyglot microservice architecture with 6 backend services running on
separate ports (user-service:3002, session-service:3003, content-service:3005,
knowledge-graph-service:3006, scheduler-service:3009, hlr-sidecar:8020). The
frontend `@noema/api-client` package requires a single `baseUrl` — it cannot
target multiple origins simultaneously. Without a unified routing layer, the
browser's same-origin policy blocks cross-service communication.

Additionally:
- CORS configurations are inconsistent across services (3 origins vs 16 origins)
- MinIO presigned URLs bypass any middleware
- No central point for rate limiting, auth forwarding, or request logging
- The Phase 00 spec requires a single gateway at `:8080`

---

## Decision

**Use Traefik v3 as the API gateway**, deployed as a Docker container in
`docker-compose.local.yml` with file-based dynamic routing configuration.

### Gateway Configuration

| Component | Technology | Location |
| --------- | ---------- | -------- |
| Reverse proxy | Traefik v3.2 | `docker-compose.local.yml` |
| Static config | YAML | `infrastructure/gateway/traefik.yml` |
| Dynamic routing | YAML (file provider) | `infrastructure/gateway/dynamic.yml` |
| Health aggregation | Alpine + socat + curl | `infrastructure/gateway/health/` |
| Gateway port | 8080 | Exposed via docker-compose |
| Dashboard | 8082 | Development only |

### Routing Strategy

All API traffic enters at `http://localhost:8080/api/*` and is routed by path
prefix:

| Pattern | Service | Middleware |
| ------- | ------- | ---------- |
| `/api/auth/*`, `/api/users/*`, `/api/me/*` | user-service:3002 | Strip `/api` |
| `/api/v1/cards/*`, `/api/v1/templates/*`, `/api/v1/media/*` | content-service:3005 | Strip `/api` |
| `/api/v1/sessions/*`, `/api/v1/offline-intents/*` | session-service:3003 | Strip `/api` |
| `/api/v1/scheduler/*`, `/api/v1/schedule/*` | scheduler-service:3009 | Strip `/api` |
| `/api/v1/ckg/*`, `/api/v1/users/:userId/*` | knowledge-graph-service:3006 | **Pass-through** (service expects `/api/v1/`) |
| `/api/hlr/*` | hlr-sidecar:8020 | Strip `/api/hlr` |
| `/health` | health-aggregator:8090 | — |

### CORS Unification

Gateway handles CORS centrally:
- `Access-Control-Allow-Origin`: `http://localhost:3000`, `http://localhost:3004`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods`: GET, POST, PATCH, PUT, DELETE, OPTIONS
- `Access-Control-Allow-Headers`: Authorization, Content-Type, X-Request-ID,
  X-Correlation-Id, X-User-Id
- `Access-Control-Max-Age`: 86400

Individual services can retain their CORS configs for direct-access development
scenarios, but the gateway is the authority for browser traffic.

### MinIO Media CORS

MinIO receives `MINIO_API_CORS_ALLOW_ORIGIN` environment variable in
`docker-compose.yml` to allow browser access to presigned URLs. This matches the
production pattern where Cloudflare R2/CDN serves media directly without a proxy.

### API Client Changes

The `buildUrl()` function in `@noema/api-client` was modified to support
path-prefixed base URLs (e.g., `http://localhost:8080/api`). The previous
implementation used `new URL(path, baseUrl)` which discards the base URL's path
component when `path` starts with `/`. The fix uses string concatenation to
preserve the base path prefix.

### Port Conflict Resolution

- `@noema/web` dev port changed from 3003 → 3000 (standard Next.js port)
- Grafana dev port changed from 3000 → 3030 (avoids conflict with web app)
- Session-service remains on 3003 (no conflict now)

---

## Alternatives Considered

### 1. Caddy

**Pros:**
- Simpler Caddyfile syntax
- Built-in automatic HTTPS/TLS
- Smaller binary (~30MB)

**Cons:**
- Less Docker-native (no auto-discovery)
- Fewer built-in middleware options
- Less common in Kubernetes environments
- No built-in observability dashboard

**Rejected because:** Traefik's Kubernetes IngressRoute CRD support and
Docker-native design better fit the production infrastructure path described in
`PROJECT_CONTEXT.md`.

### 2. Node.js http-proxy Gateway

**Pros:**
- Same language as all services
- Can share types/config from monorepo
- Testable with vitest

**Cons:**
- Reinvents proxy features (connection pooling, retries, circuit breaking)
- Another service to build and maintain
- Worse performance for large payloads
- WebSocket proxying is non-trivial to implement correctly

**Rejected because:** Duplicating battle-tested reverse proxy functionality in
application code introduces maintenance burden and reliability risk.

### 3. Kong

**Pros:**
- Enterprise-grade API gateway
- Rich plugin ecosystem (rate limiting, auth, analytics)

**Cons:**
- Heavyweight for development (~100MB+)
- Requires PostgreSQL/Cassandra backend
- Complex configuration
- Overkill for current scale

**Rejected because:** Operational complexity is disproportionate to current
needs. Can be revisited if enterprise features become necessary.

### 4. MinIO Gateway Media Proxy (Option A)

Instead of CORS headers on MinIO, route `/api/media-proxy/*` through Traefik.

**Rejected because:** Proxying potentially large media files (audio, images)
through the gateway adds latency and memory pressure. The production path uses
CDN-direct serving, and CORS headers match that pattern locally.

### 5. Node.js Health Aggregator

Instead of Alpine + socat, use a TypeScript micro-service.

**Rejected because:** Adds a build target and Node.js dependency for what is
fundamentally an infrastructure concern. The shell script approach is zero-build,
minimal footprint, and clearly separated from application logic.

---

## Consequences

### Positive
- Single origin for all frontend API calls (`http://localhost:8080/api`)
- Unified CORS configuration at one layer
- Foundation for production deployment (Traefik → K8s IngressRoute)
- Traefik dashboard provides routing observability during development
- Health aggregation endpoint for future monitoring/admin features
- Eliminates port 3003 conflict between web app and session-service

### Negative
- Docker must be running for the gateway to function (existing requirement for
  infra services)
- Adds ~50MB to development Docker image footprint
- Services running on host require `host.docker.internal` resolution
- Slight added complexity in understanding the routing layer

### Risks
- `host.docker.internal` DNS resolution on some Linux distributions may require
  Docker Engine 20.10+ or explicit network configuration
- Traefik file provider doesn't support parametric routes (`:userId`) — relies
  on prefix matching, which works for the current routing table

---

## Follow-up Work

Items explicitly deferred from this phase:

1. **Service-specific agent tool routing** — Multiple services expose
   `/v1/tools/` endpoints. Routing agent tool calls to the correct service
   requires a dispatch mechanism not implemented here.
2. **TLS termination** — The gateway entrypoint is HTTP-only. Production
   deployment will need TLS configuration.
3. **Rate limiting at gateway level** — Traefik supports rate limiting
   middleware, but configuration is deferred to Phase 01 (Auth & JWT).
4. **WebSocket upgrade** — Traefik supports WebSocket natively, but no
   real-time features are implemented yet.
5. **Production Kubernetes deployment** — The Traefik config translates to
   IngressRoute CRDs, but the K8s manifests in `infrastructure/kubernetes/`
   are not yet populated.
