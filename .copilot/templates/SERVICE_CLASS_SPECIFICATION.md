# Service Class Specification

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Category:** Domain Services / Business Logic

---

## Purpose

This specification defines the REQUIRED structure for all domain service classes in Noema. All services MUST conform to this specification to ensure consistent patterns for CRUD operations, validation, authorization, and event publishing.

---

## Context

Noema has 15 microservices, each containing multiple domain services. Domain services encapsulate business logic for specific entities (e.g., CardService, DeckService). Services must:
- Validate inputs
- Check business rules
- Enforce authorization
- Publish domain events
- Handle errors gracefully
- Be fully observable

---

**Note:** This is the MINIMUM service structure. Add domain-specific methods (e.g., `activate()`, `archive()`, `transfer()`), additional validation layers, caching strategies, transaction management, saga patterns, or any specialized business logic as your domain requires.

---

## Decision

All domain service classes MUST implement the following structure.

---

## REQUIRED: Class Structure

### File Location
`src/domain/{entity}/{entity}.service.ts`

### Class Declaration
```typescript
@injectable()
export class {Entity}Service {
  // Implementation
}
```

MUST use dependency injection decorator.

---

## REQUIRED: Constructor & Dependencies

### Constructor Signature
```typescript
constructor(
  private readonly repository: {Entity}Repository,  // REQUIRED
  private readonly eventPublisher: EventPublisher,  // REQUIRED
  private readonly logger: Logger,                  // REQUIRED
  // Additional dependencies as needed
) {}
```

### Required Dependencies
1. **Repository** (REQUIRED)
   - Interface for data access
   - Type: `{Entity}Repository`
   - MUST be injected via constructor

2. **EventPublisher** (REQUIRED)
   - For publishing domain events
   - Type: `EventPublisher`
   - MUST be injected via constructor

3. **Logger** (REQUIRED)
   - For observability
   - Type: `Logger`
   - MUST create child logger with service name

### Optional Dependencies
May include:
- Cache service
- Vector service
- Other domain services
- External API clients

---

## REQUIRED: Public Methods

### 1. Create Operations

#### create() - Single Entity
MUST implement:
```typescript
async create(
  input: Create{Entity}Input,
  context: ExecutionContext,
): Promise<ServiceResult<{Entity}>>
```

**Requirements:**
- Validate input
- Check business rules
- Check authorization
- Create entity via repository
- Publish created event
- Return ServiceResult
- Handle errors

**Flow:**
1. Validate input with validateCreateInput()
2. Check business rules with checkCreateRules()
3. Create entity via repository
4. Publish event with publishCreatedEvent()
5. Log operation
6. Return ServiceResult

#### createBatch() - Multiple Entities
MUST implement:
```typescript
async createBatch(
  inputs: Create{Entity}Input[],
  context: ExecutionContext,
): Promise<BatchResult<{Entity}>>
```

**Requirements:**
- Validate all inputs
- Create in single transaction
- Publish events for all
- Return partial results (some may fail)

### 2. Read Operations

#### findById() - Single Entity
MUST implement:
```typescript
async findById(
  id: string,
  context: ExecutionContext,
): Promise<ServiceResult<{Entity}>>
```

**Requirements:**
- Query repository
- Check authorization
- Return ServiceResult
- Throw NotFoundError if missing

#### find() - Multiple Entities with Filters
MUST implement:
```typescript
async find(
  filters: {Entity}Filters,
  context: ExecutionContext,
): Promise<ServiceResult<PaginatedResult<{Entity}>>>
```

**Requirements:**
- Apply authorization filters
- Query repository with filters
- Return paginated results
- Include total count

#### search() - Semantic Search (if applicable)
MUST implement:
```typescript
async search(
  query: string,
  filters: Partial<{Entity}Filters>,
  context: ExecutionContext,
): Promise<ServiceResult<{Entity}[]>>
```

**Requirements:**
- Use vector service for semantic search
- Apply filters
- Return ranked results

### 3. Update Operations

#### update() - Partial Update
MUST implement:
```typescript
async update(
  id: string,
  input: Update{Entity}Input,
  context: ExecutionContext,
): Promise<ServiceResult<{Entity}>>
```

**Requirements:**
- Fetch existing entity
- Check authorization
- Validate input
- Check business rules
- Update with optimistic locking (check version)
- Publish updated event
- Return ServiceResult
- Throw VersionConflictError on version mismatch

### 4. Delete Operations

#### delete() - Soft or Hard Delete
MUST implement:
```typescript
async delete(
  id: string,
  soft: boolean = true,
  context: ExecutionContext,
): Promise<ServiceResult<void>>
```

**Requirements:**
- Fetch existing entity
- Check authorization
- Check business rules (can it be deleted?)
- Perform soft or hard delete
- Publish deleted event
- Return ServiceResult

---

## REQUIRED: Private Validation Methods

### validateCreateInput()
```typescript
private async validateCreateInput(
  input: Create{Entity}Input,
): Promise<void>
```

**Requirements:**
- Use Zod schema for validation
- Throw ValidationError if invalid
- Check all required fields
- Validate constraints (min, max, pattern)

### validateUpdateInput()
```typescript
private async validateUpdateInput(
  input: Update{Entity}Input,
  existing: {Entity},
): Promise<void>
```

**Requirements:**
- Validate update data
- Check version field present
- Verify version matches existing
- Throw ValidationError if invalid

---

## REQUIRED: Private Business Rule Methods

### checkCreateRules()
```typescript
private async checkCreateRules(
  input: Create{Entity}Input,
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Check domain-specific rules
- Examples: duplicates, limits, prerequisites
- Throw BusinessRuleError if violated
- Must be synchronous (no external calls if possible)

### checkUpdateRules()
```typescript
private async checkUpdateRules(
  input: Update{Entity}Input,
  existing: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Check update-specific rules
- Examples: state transitions, field constraints
- Throw BusinessRuleError if violated

### checkDeleteRules()
```typescript
private async checkDeleteRules(
  existing: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Check if entity can be deleted
- Examples: dependencies, constraints
- Throw BusinessRuleError if cannot delete

---

## REQUIRED: Private Authorization Methods

### checkReadPermission()
```typescript
private async checkReadPermission(
  entity: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Verify user can read this entity
- Throw AuthorizationError if not authorized
- Check ownership, roles, permissions

### checkUpdatePermission()
```typescript
private async checkUpdatePermission(
  entity: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Verify user can update this entity
- Throw AuthorizationError if not authorized

### checkDeletePermission()
```typescript
private async checkDeletePermission(
  entity: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Verify user can delete this entity
- Throw AuthorizationError if not authorized

### applyAuthorizationFilters()
```typescript
private async applyAuthorizationFilters(
  filters: {Entity}Filters,
  context: ExecutionContext,
): Promise<{Entity}Filters>
```

**Requirements:**
- Add filters based on user permissions
- Non-admin users see only their own data
- Return modified filters

---

## REQUIRED: Private Event Publishing Methods

### publishCreatedEvent()
```typescript
private async publishCreatedEvent(
  entity: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Build event following EVENT_SCHEMA_SPECIFICATION
- Include userId, correlationId, traceId
- Publish via eventPublisher
- Use outbox pattern for consistency

### publishUpdatedEvent()
```typescript
private async publishUpdatedEvent(
  updated: {Entity},
  previous: {Entity},
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Calculate changes with getChanges()
- Include previous values
- Include version numbers
- Publish event

### publishDeletedEvent()
```typescript
private async publishDeletedEvent(
  entity: {Entity},
  soft: boolean,
  context: ExecutionContext,
): Promise<void>
```

**Requirements:**
- Indicate soft vs hard delete
- Include snapshot for potential restore
- Publish event

---

## REQUIRED: Private Helper Methods

### getChanges()
```typescript
private getChanges(
  updated: {Entity},
  previous: {Entity},
): Partial<{Entity}>
```

**Requirements:**
- Compare updated vs previous
- Return only changed fields
- Use for event payload

### handleError()
```typescript
private handleError(
  error: unknown,
): ServiceError
```

**Requirements:**
- Convert exceptions to ServiceError
- Map error types:
  - ValidationError → VALIDATION_ERROR
  - BusinessRuleError → BUSINESS_RULE_ERROR
  - AuthorizationError → AUTHORIZATION_ERROR
  - NotFoundError → NOT_FOUND
  - VersionConflictError → VERSION_CONFLICT
  - Unknown → INTERNAL_ERROR
- MUST NOT leak sensitive information

---

## REQUIRED: Input DTOs

### Create{Entity}Input
```typescript
interface Create{Entity}Input {
  // Required fields
  {requiredField1}: type;
  {requiredField2}: type;
  
  // Optional fields
  {optionalField}?: type;
  
  // Relationships (IDs only)
  {relatedEntityId}?: string;
  
  // Metadata
  metadata?: Record<string, unknown>;
}
```

### Update{Entity}Input
```typescript
interface Update{Entity}Input {
  // All fields optional except version
  {field1}?: type;
  {field2}?: type;
  
  // Version REQUIRED for optimistic locking
  version: number;
  
  // Audit trail
  reason?: string;
}
```

### {Entity}Filters
```typescript
interface {Entity}Filters {
  // ID filters
  ids?: string[];
  userId?: string;
  {relatedEntityId}?: string;
  
  // Field filters
  type?: string[];
  state?: string[];
  
  // Date range filters
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  
  // Search
  search?: string;
  
  // Pagination
  limit?: number;      // Default 20
  offset?: number;     // Default 0
  cursor?: string;
  
  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

---

## REQUIRED: Return Types

### ServiceResult<T>
```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  metadata: {
    executionTime: number;
    cached?: boolean;
  };
}
```

**Requirements:**
- ALWAYS return ServiceResult
- success: true → data present, error null
- success: false → error present, data null
- metadata ALWAYS present

### BatchResult<T>
```typescript
interface BatchResult<T> {
  successful: T[];
  failed: Array<{
    index: number;
    input: unknown;
    error: ServiceError;
  }>;
}
```

### ServiceError
```typescript
interface ServiceError {
  code: string;           // UPPER_SNAKE_CASE
  message: string;        // Human-readable
  details?: unknown;      // Additional context
}
```

### ExecutionContext
```typescript
interface ExecutionContext {
  userId: string;
  isAdmin: boolean;
  sessionId?: string;
  agentId?: string;
  correlationId: string;  // UUID
  traceId: string;        // UUID
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

**Requirements:**
- Passed to ALL service methods
- Contains user identity and request context
- Used for authorization and event metadata

---

## Error Handling Requirements

### Exception Types
Services MUST throw:
- **ValidationError**: Input validation failed
- **BusinessRuleError**: Domain rule violated
- **AuthorizationError**: User not authorized
- **NotFoundError**: Entity doesn't exist
- **VersionConflictError**: Optimistic lock failed

### Try-Catch Pattern
All public methods MUST:
1. Wrap logic in try-catch
2. Log errors with context
3. Return ServiceResult with error
4. NOT throw exceptions (except domain errors above)

---

## Logging Requirements

### MUST Log
- Method entry (with input)
- Method exit (with result summary)
- Errors (with stack trace)
- Entity creation (with ID)
- Entity update (with changes)
- Entity deletion (with ID)
- Authorization failures
- Business rule violations

### Log Format
Include:
- Service name
- Method name
- Entity ID (if applicable)
- User ID
- Correlation ID
- Trace ID

---

## Transaction Requirements

### When to Use Transactions
MUST use transactions for:
- Create with related entities
- Update with event publishing (outbox pattern)
- Delete with cascading deletes
- Batch operations

### How to Use
```typescript
await this.repository.transaction(async (tx) => {
  // All operations in transaction
  await tx.entities.create(...);
  await tx.outbox.create(...);
});
```

---

## Caching Requirements

### When to Cache
Consider caching for:
- Frequently accessed entities
- Rarely changing entities
- Expensive computations

### Cache Invalidation
MUST invalidate cache on:
- Entity update
- Entity deletion
- Related entity changes

---

## Testing Requirements

### Unit Tests (REQUIRED)
Test:
- Each public method
- Validation logic
- Business rules
- Authorization logic
- Event publishing
- Error handling

Mock:
- Repository
- Event publisher
- External dependencies

### Integration Tests (REQUIRED)
Test:
- Full CRUD flow
- Database interactions
- Event publishing to actual event bus
- Transaction handling

---

## Compliance Checklist

Before deploying a service:

- [ ] @injectable decorator present
- [ ] Required dependencies injected
- [ ] All CRUD methods implemented
- [ ] Batch operations where applicable
- [ ] All methods return ServiceResult
- [ ] Validation methods present
- [ ] Business rule methods present
- [ ] Authorization methods present
- [ ] Event publishing methods present
- [ ] Events published for all state changes
- [ ] Optimistic locking for updates
- [ ] Error handling consistent
- [ ] Logging implemented
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests written
- [ ] Input DTOs defined
- [ ] ExecutionContext used

---

## Performance Considerations

### Optimization Opportunities
- Cache frequently accessed entities
- Batch database operations
- Use database indices
- Lazy load relationships
- Denormalize for read-heavy operations

### Avoid
- N+1 queries
- Loading entire collections
- Synchronous external API calls
- Heavy computation in business rules
- Transactions without timeout

---

## Consequences

### Benefits
- ✅ Consistent structure across all services
- ✅ Clear separation of concerns
- ✅ Easy to test and maintain
- ✅ Full audit trail via events
- ✅ Proper authorization
- ✅ Observable with logs

### Drawbacks
- ⚠️ More boilerplate than simple CRUD
- ⚠️ Performance overhead from event publishing
- ⚠️ Complexity for simple operations

### Mitigation
- Generate boilerplate with templates
- Use caching strategically
- Skip event publishing for reads
- Batch operations when possible

---

## References

- Repository Pattern: [link]
- Domain Events: See EVENT_SCHEMA_SPECIFICATION.md
- Dependency Injection: [link]

---

## Changelog

- 1.0.0 (2024-01-15): Initial specification
