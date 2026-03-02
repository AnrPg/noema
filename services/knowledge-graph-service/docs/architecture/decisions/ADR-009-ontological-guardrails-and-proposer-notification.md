# ADR-009: Ontological Guardrails and Proposer Notification (Tech Debt)

## Status

Accepted

## Date

2026-02-27

## Context

Phase 8e introduces ontological guardrails to the CKG mutation pipeline — a new
`OntologicalConsistencyStage` (order 250) that detects conflicts between IS_A
and PART_OF edges on the same node pair and escalates affected mutations to a
`pending_review` state for human review.

During the design of the escalation mechanism, a **systemic gap** was identified
in the mutation pipeline: there is **no push notification mechanism** for
informing mutation proposers about outcomes. This affects not only ontological
escalations but all mutation lifecycle events (rejection, commit, conflict
warnings).

### Current State of Proposer Feedback

When a CKG mutation is rejected or requires review:

| Mechanism                              | Exists? | Details                                                                                                                                             |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| State persisted in Postgres            | ✓       | `ICkgMutation.state` transitions to `rejected`, `committed`, or `pending_review`                                                                    |
| Audit log entries                      | ✓       | `appendAuditEntry()` records every state transition with reason and context metadata                                                                |
| Domain events on event bus             | ✓       | `CKG_MUTATION_REJECTED`, `CKG_MUTATION_COMMITTED`, (new) `CKG_MUTATION_ESCALATED` published via `IEventPublisher`                                   |
| Validation violations in audit context | ✓       | Full `IValidationViolation[]` with codes, messages, severity, metadata stored in audit entry context                                                |
| Agent hints in REST response           | ✓       | `wrapResponse()` attaches `agentHints` to API responses — but only available on subsequent `GET` calls due to fire-and-forget pipeline (ADR-005 D3) |
| **Push notification to proposer**      | ✗       | No WebSocket push, no in-app notification, no webhook callback                                                                                      |
| **Email notification**                 | ✗       | notification-service exists in the architecture but has no integration with KG events                                                               |
| **Agent callback**                     | ✗       | Agent proposers cannot register a callback for mutation outcome notification                                                                        |

### Impact

1. **Admin users** who propose CKG mutations via the REST API must poll
   `GET /api/v1/ckg/mutations/:id` to discover whether their mutation was
   validated, escalated, or rejected. There is no real-time feedback channel.

2. **Agents** that propose mutations fire-and-forget (by design — ADR-005 D3)
   but have no mechanism to be notified when the outcome is ready. An agent
   planning further mutations based on a pending one would need to poll.

3. **Escalated mutations** (`pending_review` state, introduced in Phase 8e) are
   particularly affected: a mutation is held for human review, but the admin who
   should review it is not proactively notified. Discovery depends on dashboard
   polling or log monitoring.

4. **Aggregation pipeline** mutations (`agent_aggregation-pipeline` proposer ID)
   are autonomous — there is typically no human watching for their outcome in
   real time.

---

## Decision

### D1: Acknowledge this as technical debt

The absence of a proposer notification mechanism is accepted as **known
technical debt** to be resolved in a future phase. Phase 8e implements
escalation using the mechanisms that _do_ exist (event bus, audit log,
structured logging, agent hints on GET) and explicitly defers push notification.

### D2: Interim mitigations for Phase 8e

| Mitigation             | Description                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structured logging** | Agent-proposed escalations are logged at `INFO` level with full conflict context and the agent's `rationale` field. Ops teams can set up log-based alerts. |
| **Event bus**          | `CKG_MUTATION_ESCALATED` events are published to the event bus. A future notification-service consumer can subscribe and route alerts.                     |
| **Agent hints on GET** | `GET /api/v1/ckg/mutations/:id` returns `agentHints.escalation` with conflict details and available actions (`approve`, `reject`).                         |
| **List by state**      | `GET /api/v1/ckg/mutations?state=pending_review` allows dashboards and agents to query for mutations awaiting review.                                      |

### D3: Future notification architecture (deferred)

The full notification mechanism should deliver:

| Feature                              | Description                                                                                                                                 | Consumer                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **WebSocket push**                   | Real-time notification to connected admin clients when a mutation they proposed is escalated or rejected                                    | web-admin frontend             |
| **Event bus → notification-service** | `CKG_MUTATION_ESCALATED` and `CKG_MUTATION_REJECTED` events consumed by notification-service, which routes to the appropriate channel       | Admin users, governance agents |
| **In-app notification**              | Persistent notification stored in notification-service, surfaced in web-admin UI                                                            | Admin users                    |
| **Agent callback registration**      | Allow agents to register a callback URL or event topic when proposing a mutation, so the pipeline can notify them when processing completes | Agents                         |
| **Webhook**                          | External integration point for CI/CD pipelines or monitoring tools                                                                          | External systems               |

#### Recommended implementation path

1. **Phase 1: Event consumer in notification-service** — Subscribe to
   `CKG_MUTATION_ESCALATED` and `CKG_MUTATION_REJECTED` events. Route to in-app
   notification creation. This leverages existing event infrastructure
   (`@noema/events` package, Redis pub/sub).

2. **Phase 2: WebSocket to web-admin** — Add a WebSocket channel for real-time
   push. The notification-service bridges event bus → WebSocket for connected
   admin sessions.

3. **Phase 3: Agent callback** — Extend `proposeMutation` to accept an optional
   `callbackConfig` (topic name or webhook URL). The pipeline publishes to the
   specified destination on completion.

---

## Consequences

### Positive

- Ontological guardrails can ship without blocking on notification
  infrastructure.
- The escalation flow works end-to-end using existing audit log, events, and
  polling.
- The technical debt is explicitly documented and scoped, preventing it from
  becoming invisible.

### Negative

- Admin users must actively check for escalated mutations (poll or dashboard).
- Agent-initiated escalations rely on log monitoring for human visibility.
- The `pending_review` → `approved` flow has latency proportional to how
  frequently admins check the mutation queue.

### Risks

- If escalated mutations accumulate without review (because admins are not
  notified), the `pending_review` queue could grow unbounded. **Mitigation**:
  add a `pending_review` count to the `getPipelineHealth()` metrics endpoint and
  set alerts on queue depth.
- Agents may repeatedly propose the same conflicting mutation without realising
  it was previously escalated. **Mitigation**: the `ConflictDetectionStage`
  (order 300) already detects overlapping in-flight mutations, which covers
  `pending_review` mutations.

---

## Related

- **ADR-005**: CKG Mutation Pipeline design (8-state machine, fire-and-forget
  async model)
- **ADR-008**: ProposerId union type (AgentId | UserId) for admin CKG mutations
- **Phase 8e**: Ontological guardrails specification
  (`PHASE-8e-ONTOLOGICAL-GUARDRAILS.md`)
- **notification-service**: Exists in `services/notification-service/` but has
  no current integration with knowledge-graph events
