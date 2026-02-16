# Event Schema Specification

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Category:** Event-Driven Architecture / Domain Events

---

## Purpose

This specification defines the REQUIRED structure for all events in Noema's event-driven architecture. All events MUST conform to this specification to ensure consistency, traceability, and event replay capability.

---

## Context

Noema uses event-driven architecture where services communicate via immutable events. Events are published to Redis Streams (development) and Kafka (production). Events must be:
- Immutable (never modified after creation)
- Complete (contain all necessary data)
- Traceable (linked via correlation/causation IDs)
- Versioned (support schema evolution)
- Replayable (can rebuild state from events)

---
**Note:** This is the MINIMUM event structure. Add domain-specific fields to payload, additional metadata for compliance, or specialized event types as your use case requires.

---

## Decision

All events MUST implement the following structure.

---

## REQUIRED: Base Event Structure

Every event MUST have these fields:

### 1. Event Identity (REQUIRED)
- **eventId** (string, REQUIRED)
  - Format: UUID v4
  - Generated when event is created
  - MUST be globally unique
  - MUST NOT be reused

- **eventType** (string, REQUIRED)
  - Format: `{aggregate}.{action}` or `{aggregate}.{subresource}.{action}`
  - Examples: "card.created", "user.settings.changed", "session.completed"
  - MUST use past tense for action (created, not create)
  - MUST use lowercase with dots as separators
  - MUST be consistent (same event always same type)
  - Maximum 3 parts (aggregate.subresource.action)

- **aggregateType** (string, REQUIRED)
  - Entity the event is about
  - Examples: "Card", "User", "Session", "Deck"
  - MUST use PascalCase
  - MUST match domain entity name

- **aggregateId** (string, REQUIRED)
  - ID of the specific entity instance
  - Examples: "card_123", "user_456"
  - MUST be the actual entity ID (not a temporary ID)

### 2. Versioning (REQUIRED)
- **version** (number, REQUIRED)
  - Schema version of this event
  - Start at 1
  - Increment when schema changes
  - Enables event schema evolution
  - Consumer must handle multiple versions

### 3. Temporal (REQUIRED)
- **timestamp** (string, REQUIRED)
  - When the event occurred
  - Format: ISO 8601 with UTC timezone
  - Example: "2024-01-15T10:30:00.000Z"
  - MUST be set when event is created (not when published)
  - MUST use UTC, not local timezone

### 4. Metadata (REQUIRED)
- **metadata** (object, REQUIRED)
  - See Metadata Structure section below

### 5. Payload (REQUIRED)
- **payload** (object, REQUIRED)
  - Event-specific data
  - See Payload Patterns section below
  - MUST be serializable to JSON
  - MUST be complete (no references to external data)

---

## REQUIRED: Metadata Structure

Every event metadata MUST have:

### Service Information (REQUIRED)
- **serviceName** (string, REQUIRED)
  - Which service published the event
  - Examples: "content-service", "user-service"
  - MUST match actual service name

- **serviceVersion** (string, REQUIRED)
  - Version of the service that published
  - Format: Semantic versioning "1.2.3"
  - Used for debugging and compatibility

- **environment** (enum, REQUIRED)
  - One of: 'development', 'staging', 'production'
  - Indicates which environment published the event
  - Used for event filtering and routing

### Tracing (REQUIRED for non-system events)
- **userId** (string, OPTIONAL)
  - User who triggered the event
  - null for system-triggered events
  - MUST be included for user-initiated actions

- **sessionId** (string, OPTIONAL)
  - Current session when event occurred
  - Used for session-based analytics

- **correlationId** (string, REQUIRED for multi-service flows)
  - UUID linking all events in a request
  - Same for all events in one user action
  - Used for distributed tracing

- **causationId** (string, OPTIONAL but RECOMMENDED)
  - eventId of the event that caused this event
  - Forms event chains: A caused B caused C
  - Enables causal analysis

### Additional Context (OPTIONAL)
- **agentId** (string, OPTIONAL)
  - Which agent triggered the event (if agent-initiated)

- **clientIp** (string, OPTIONAL)
  - IP address for audit purposes
  - Anonymize if required by privacy regulations

- **userAgent** (string, OPTIONAL)
  - Browser/client user agent
  - Useful for analytics

- **additional** (object, OPTIONAL)
  - Flexible field for extra metadata
  - MUST be JSON-serializable
  - Use sparingly

---

## REQUIRED: Payload Patterns

Choose the appropriate pattern based on event type:

### Pattern 1: Created Events
Use for: `*.created` events

MUST include:
- **entity** (object, REQUIRED)
  - Full entity data OR partial data depending on needs
  - Enough data so consumers don't need to query publisher

- **source** (enum, OPTIONAL but RECOMMENDED)
  - One of: 'user', 'agent', 'system', 'import'
  - Who/what created the entity

- **parentId** (string, OPTIONAL)
  - ID of parent entity (if nested)

- **parentType** (string, OPTIONAL)
  - Type of parent entity

Example:
```
{
  entity: { id: "card_123", content: {...}, deckId: "deck_456" },
  source: "user",
  parentId: "deck_456",
  parentType: "Deck"
}
```

### Pattern 2: Updated Events
Use for: `*.updated` events

MUST include:
- **changes** (object, REQUIRED)
  - Only the fields that changed
  - Partial entity with new values

- **previousValues** (object, OPTIONAL but RECOMMENDED)
  - Previous values for changed fields
  - Enables rollback and audit

- **previousVersion** (number, REQUIRED)
  - Entity version before update
  - For optimistic locking verification

- **newVersion** (number, REQUIRED)
  - Entity version after update
  - Should be previousVersion + 1

- **updatedAt** (string, REQUIRED)
  - When update occurred (ISO 8601)

- **reason** (string, OPTIONAL)
  - Why the update was made
  - Useful for audit trail

Example:
```
{
  changes: { difficulty: 5.2 },
  previousValues: { difficulty: 5.0 },
  previousVersion: 3,
  newVersion: 4,
  updatedAt: "2024-01-15T10:30:00Z",
  reason: "FSRS algorithm adjustment"
}
```

### Pattern 3: Deleted Events
Use for: `*.deleted` events

MUST include:
- **deletedId** (string, REQUIRED)
  - ID of deleted entity

- **deletedType** (string, REQUIRED)
  - Type of deleted entity

- **soft** (boolean, OPTIONAL)
  - true: soft delete (marked as deleted)
  - false: hard delete (removed from database)

- **reason** (string, OPTIONAL)
  - Why the entity was deleted

- **snapshot** (object, OPTIONAL)
  - Complete entity before deletion
  - Enables potential restoration
  - Consider privacy implications

Example:
```
{
  deletedId: "card_123",
  deletedType: "Card",
  soft: true,
  reason: "User deleted deck",
  snapshot: { id: "card_123", content: {...} }
}
```

### Pattern 4: State Changed Events
Use for: `*.state.changed` events

MUST include:
- **previousState** (string, REQUIRED)
  - State before the change

- **newState** (string, REQUIRED)
  - State after the change

- **reason** (string, OPTIONAL)
  - Why state changed

- **triggeredBy** (enum, OPTIONAL)
  - One of: 'user', 'agent', 'system', 'timeout'
  - What triggered the state change

- **context** (object, OPTIONAL)
  - Additional context about the state change

Example:
```
{
  previousState: "draft",
  newState: "published",
  reason: "User published deck",
  triggeredBy: "user",
  context: { publishedAt: "2024-01-15T10:30:00Z" }
}
```

### Pattern 5: Telemetry Events
Use for: Analytics and tracking events

MUST include:
- **category** (string, REQUIRED)
  - Event category (e.g., "engagement", "performance")

- **action** (string, REQUIRED)
  - Action performed (e.g., "card_reviewed", "session_completed")

- **label** (string, OPTIONAL)
  - Additional label for grouping

- **value** (number, OPTIONAL)
  - Numeric value associated with event

- **properties** (object, OPTIONAL)
  - Additional event properties

Example:
```
{
  category: "engagement",
  action: "card_reviewed",
  label: "math_deck",
  value: 4,
  properties: { duration: 15000, correct: true }
}
```

---

## Event Naming Conventions

### Format Rules
- Use lowercase with dots: `card.created`
- Use past tense: `created`, not `create`
- Be specific but concise
- Maximum 3 parts: `{aggregate}.{subresource}.{action}`

### Good Examples
- ✅ `card.created`
- ✅ `card.updated`
- ✅ `card.deleted`
- ✅ `card.category.added`
- ✅ `card.category.removed`
- ✅ `user.registered`
- ✅ `user.settings.changed`
- ✅ `session.started`
- ✅ `session.completed`
- ✅ `attempt.recorded`
- ✅ `xp.awarded`
- ✅ `achievement.unlocked`

### Bad Examples
- ❌ `createCard` (command, not event)
- ❌ `CARD_CREATED` (uppercase)
- ❌ `card_created` (underscore)
- ❌ `card-created` (hyphen)
- ❌ `card.create` (present tense)
- ❌ `card.data.content.updated` (too many parts)

---

## Stream Naming Conventions

### Format
`{namespace}:events:{event-type}`

### Examples
- `noema:events:card.created`
- `noema:events:user.registered`
- `noema:events:session.completed`

### Consumer Groups
Format: `{service-name}-{event-type}`

Examples:
- `gamification-service-session.completed`
- `analytics-service-card.created`
- `knowledge-graph-service-card.created`

---

## Event Schema Evolution

### Adding Fields (Non-Breaking)
- Add new optional fields to payload
- Increment minor version (1.0 → 1.1)
- Old consumers ignore new fields
- No migration needed

### Removing Fields (Breaking)
- Mark field as deprecated first
- Wait minimum 90 days
- Increment major version (1.x → 2.0)
- Publish to new stream
- Migrate consumers gradually
- Keep old stream for 180 days

### Changing Field Types (Breaking)
- Create new field with new type
- Deprecate old field
- Publish both fields for transition period
- Increment major version
- Migrate consumers

---

## Validation Requirements

### Pre-Publish Validation
Events MUST be validated before publishing:
1. All required fields present
2. eventId is valid UUID
3. eventType matches naming conventions
4. timestamp is valid ISO 8601
5. version is positive integer
6. payload matches expected schema
7. metadata complete

### Zod Schemas
All event types MUST have Zod schemas for validation.

### Runtime Validation
Use EventBuilder class to ensure all fields set correctly.

---

## Publishing Requirements

### Outbox Pattern (REQUIRED)
To ensure consistency:
1. Save entity changes to database
2. Save event to outbox table
3. Commit transaction
4. Separate process publishes from outbox

This prevents lost events.

### Ordering (REQUIRED)
Events for same aggregate MUST be ordered:
- Use aggregateId as partition key
- Events for card_123 always in order
- Events across different cards can be parallel

### Idempotency (REQUIRED)
Publishers MUST ensure no duplicate events:
- Use idempotency keys
- Check for duplicate eventIds
- Handle retry scenarios

---

## Consumption Requirements

### Idempotent Processing (REQUIRED)
Consumers MUST be idempotent:
- Processing same event twice has same effect as once
- Store processed eventIds
- Skip if already processed

### Consumer Groups (REQUIRED)
Each consumer MUST:
- Use appropriate consumer group name
- Acknowledge events after successful processing
- Handle failures gracefully

### Dead Letter Queue (REQUIRED)
Failed events MUST go to DLQ:
- After 3 retry attempts
- Log failure reason
- Enable manual replay

### Event Replay (MUST SUPPORT)
Consumers MUST support replaying events:
- Can rebuild state from event stream
- Can process old events (handle old schema versions)
- Can skip to specific point in time

---

## Observability Requirements

### Logging (REQUIRED)
MUST log:
- Event published (with eventId, eventType)
- Event consumed (with consumer group, eventId)
- Processing started
- Processing completed
- Processing failed

### Metrics (REQUIRED)
MUST emit:
- Events published count
- Events consumed count
- Processing latency
- Error rate
- DLQ size

### Tracing (REQUIRED)
MUST include:
- traceId in all logs
- Propagate traceId through event metadata
- Link related events via correlationId

---

## Compliance

### MUST NEVER
- ❌ Modify events after publishing
- ❌ Delete events from stream
- ❌ Use present tense in event names
- ❌ Include sensitive data without encryption
- ❌ Publish without validation
- ❌ Skip outbox pattern for critical events
- ❌ Process events non-idempotently
- ❌ Ignore schema versions

### MUST ALWAYS
- ✅ Use past tense in event names
- ✅ Include all required fields
- ✅ Validate before publishing
- ✅ Use outbox pattern for consistency
- ✅ Order events by aggregate
- ✅ Make consumers idempotent
- ✅ Handle schema evolution
- ✅ Support event replay
- ✅ Log and monitor events

---

## Verification Checklist

Before deploying an event:

- [ ] Event type is past tense
- [ ] Event type follows naming convention
- [ ] All required base fields present
- [ ] eventId is UUID v4
- [ ] timestamp is ISO 8601 UTC
- [ ] version is set correctly
- [ ] metadata has serviceName, serviceVersion, environment
- [ ] correlationId included (if multi-service)
- [ ] Payload follows appropriate pattern
- [ ] Payload is complete (no external references)
- [ ] Zod schema created
- [ ] EventBuilder used
- [ ] Outbox pattern implemented
- [ ] Publisher uses correct stream name
- [ ] Consumer group named correctly
- [ ] Consumer is idempotent
- [ ] DLQ configured
- [ ] Logging implemented
- [ ] Metrics emitted
- [ ] Tests written

---

## Testing Requirements

MUST test:
1. Event structure validation
2. Publish → Consume flow
3. Idempotent consumption
4. Failure handling
5. DLQ processing
6. Event replay
7. Schema evolution (old consumers, new events)

---

## Examples

### Minimal Valid Event
```
eventId: "550e8400-e29b-41d4-a716-446655440000"
eventType: "card.created"
aggregateType: "Card"
aggregateId: "card_123"
version: 1
timestamp: "2024-01-15T10:30:00.000Z"
metadata: {
  serviceName: "content-service",
  serviceVersion: "1.2.3",
  environment: "production",
  userId: "user_456",
  correlationId: "req_789"
}
payload: {
  entity: {
    id: "card_123",
    type: "atomic",
    content: { front: "Q", back: "A" },
    deckId: "deck_456"
  },
  source: "user"
}
```

### Event with Full Tracing
```
eventId: "..."
eventType: "card.reviewed"
aggregateType: "Card"
aggregateId: "card_123"
version: 1
timestamp: "2024-01-15T10:30:00.000Z"
metadata: {
  serviceName: "session-service",
  serviceVersion: "1.0.5",
  environment: "production",
  userId: "user_456",
  sessionId: "session_789",
  correlationId: "req_abc",
  causationId: "event_previous",
  agentId: null
}
payload: {
  changes: { difficulty: 5.2, interval: 30 },
  previousValues: { difficulty: 5.0, interval: 21 },
  previousVersion: 5,
  newVersion: 6,
  updatedAt: "2024-01-15T10:30:00.000Z",
  reason: "Successful review, FSRS adjustment"
}
```

---

## Consequences

### Benefits
- ✅ Complete audit trail
- ✅ State can be rebuilt from events
- ✅ Services loosely coupled
- ✅ Async processing
- ✅ Event replay for debugging
- ✅ Schema evolution support

### Drawbacks
- ⚠️ More complex than direct DB writes
- ⚠️ Eventual consistency
- ⚠️ Need to manage event ordering
- ⚠️ Storage requirements for all events

### Mitigation
- Use outbox pattern for consistency
- Document ordering requirements
- Implement event retention policies
- Provide tools for event replay

---

## References

- Event Sourcing Pattern: [link]
- Outbox Pattern: [link]
- Zod Documentation: https://zod.dev
- Event Naming: See [internal wiki]

---

## Changelog

- 1.0.0 (2024-01-15): Initial specification
