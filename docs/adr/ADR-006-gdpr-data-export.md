# ADR-006: GDPR Data Export (Right to Data Portability)

| Field       | Value                                                    |
| ----------- | -------------------------------------------------------- |
| **Status**  | Proposed (scheduled for pre-EU-launch)                   |
| **Date**    | 2026-03-04                                               |
| **Phase**   | Cross-cutting — Compliance                               |
| **Authors** | Claude (AI), approved by project owner                   |
| **Audit**   | C8 in `docs/audits/comprehensive-cross-service-audit.md` |

---

## Context

GDPR Article 20 (Right to Data Portability) requires that any application
serving EU users must allow them to download all their personal data in a
structured, commonly used, machine-readable format.

Noema currently has **no data export endpoint**. User data is distributed across
5 bounded contexts:

| Context           | Data                                                      |
| ----------------- | --------------------------------------------------------- |
| user-service      | Profile, preferences, login history, email, jurisdictions |
| session-service   | Study sessions, answers, streaks, heatmap aggregates      |
| content-service   | Cards, templates, decks, media references                 |
| scheduler-service | Review history, scheduling state, retention predictions   |
| messaging (TBD)   | Conversations, messages, attachments                      |

Cross-context data aggregation violates bounded-context isolation rules unless
done through an explicit orchestration layer.

---

## Decision

Implement an **asynchronous GDPR data export** pipeline:

### 1. API Endpoint

```
POST /v1/users/:id/data-export
Authorization: Bearer <token> (must match :id — re-authentication recommended)
Response: 202 Accepted { exportId, estimatedCompletionMinutes }
```

### 2. Architecture

```
API → Oban Job (background) → Per-Service Data Collectors → ZIP assembly → R2 upload → Email notification
```

- **Orchestrator**: A new `DataExportJob` Oban worker in user-service
- **Data collection**: Each service exposes an **internal**
  `collectUserData(userId)` method (not a public API route) callable by the
  orchestrator
- **Assembly**: JSON files per context, bundled into a ZIP archive
- **Storage**: Upload to Cloudflare R2 with a time-limited presigned URL (72h
  TTL)
- **Notification**: Email the user a download link via notification-service
- **Rate limit**: 1 export per user per 24 hours

### 3. Export Contents

| File in ZIP             | Source Service    | Contents                                |
| ----------------------- | ----------------- | --------------------------------------- |
| `profile.json`          | user-service      | Profile, preferences, login history     |
| `sessions.json`         | session-service   | All sessions with answers               |
| `content.json`          | content-service   | Cards, templates, decks                 |
| `learning-history.json` | scheduler-service | Review history, scheduling state        |
| `messages.json`         | messaging-service | Conversations, messages                 |
| `export-metadata.json`  | orchestrator      | Export timestamp, schema version, scope |

### 4. Security

- Re-authentication required (password or MFA confirmation within last 5 min)
- Presigned URL is single-use + time-limited (72h)
- Export job runs with scoped service credentials (read-only per context)
- Audit log entry created for every export request

### 5. Cross-Context Communication

Each service implements an `IDataExportCollector` port:

```typescript
interface IDataExportCollector {
  collectUserData(userId: UserId): Promise<JsonValue>;
}
```

The orchestrator calls each collector via **direct service invocation** (not
HTTP) within the same deployment. This is acceptable because:

- It's a read-only aggregation (no writes)
- The data is owned by the user, not by the context
- The anti-corruption layer is the collector interface itself

---

## Alternatives Considered

### A. Synchronous API Response

Rejected: Large datasets (thousands of cards, years of sessions) would exceed
reasonable request timeouts. Background job is essential.

### B. Per-Service Export Endpoints

Rejected: Puts burden on the user to call 5 separate endpoints and assemble.
GDPR requires a single coherent export.

### C. Event-Sourced Reconstruction

Rejected: Noema doesn't use event sourcing for state. Direct DB reads are
simpler and complete.

### D. gRPC Internal Communication

Deferred: Current deployment is co-located on Fly.io — direct function calls are
sufficient. gRPC would be needed if services move to separate deployments.

---

## Consequences

### Positive

- GDPR Article 20 compliance
- Foundation for Article 17 (Right to Erasure) — same collectors, different
  action
- User trust signal (data sovereignty)

### Negative

- Each service must maintain a `collectUserData` implementation as its schema
  evolves
- ZIP generation for power users with large datasets may be memory-intensive
  (consider streaming ZIP assembly)
- Presigned URL security requires careful TTL management

### Follow-up Work

- [ ] Implement `IDataExportCollector` in each service
- [ ] Create `DataExportJob` Oban worker in user-service
- [ ] Add R2 upload utility (shared/infrastructure)
- [ ] Email notification template for export-ready link
- [ ] Rate limiting (1 per 24h per user)
- [ ] Integration tests with mock collectors
- [ ] OpenAPI spec for `POST /v1/users/:id/data-export` and
      `GET /v1/users/:id/data-export/:exportId/status`
- [ ] Admin endpoint to view export history (for compliance audits)
