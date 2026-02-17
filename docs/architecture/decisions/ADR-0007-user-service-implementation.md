# ADR-0007: User Service Implementation

## Status

Accepted

## Date

2026-02-17

## Context

The Noema platform requires a User Service to manage user identity,
authentication, profiles, and settings. This service is foundational to the
entire system as it:

1. Provides user registration and authentication (local + OAuth providers)
2. Manages user profiles and preferences
3. Handles user settings for learning customization
4. Issues and validates JWT tokens for API access
5. Publishes domain events for other services to react to user lifecycle changes

The implementation must follow Noema's established architectural patterns:

- Agent-first design with `IAgentHints` in all responses
- API-first with typed contracts from `@noema/contracts`
- Event-driven communication via `@noema/events`
- Validation with Zod schemas from `@noema/validation`
- Repository pattern for data access abstraction

## Decision

We implement the User Service with the following architecture:

### 1. Domain Layer Structure

```
services/user-service/
├── src/
│   ├── domain/
│   │   ├── user-service/
│   │   │   ├── user.service.ts      # Core business logic
│   │   │   ├── user.repository.ts   # Data access interface
│   │   │   └── user.errors.ts       # Domain-specific errors
│   │   └── token-service/
│   │       └── token.service.ts     # JWT token management
│   └── index.ts
├── prisma/
│   └── schema.prisma                # Database schema
└── tests/
```

### 2. Service Operations

The `UserService` class implements these operation categories:

**Create Operations:**

- `create(input, context)` - Register new user with validation, password
  hashing, ID generation

**Read Operations:**

- `findById(id, context)` - Get user by ID with authorization check
- `findByEmail(email, context)` - Get user by email (admin only)
- `getPublicProfileById(id, context)` - Get public profile (no auth required)
- `search(query, context)` - Search users with pagination (admin only)

**Update Operations:**

- `updateProfile(id, input, version, context)` - Update user profile with
  optimistic locking
- `updateSettings(id, input, version, context)` - Update user settings
- `changePassword(id, input, context)` - Change password with current password
  verification

**Authentication Operations:**

- `login(email, password, context)` - Authenticate with email/password, handle
  MFA, track login history
- `refreshToken(refreshToken, context)` - Refresh access token

**Delete Operations:**

- `delete(id, soft, context)` - Soft or hard delete with authorization

### 3. Security Features

- **Password Hashing:** bcrypt with configurable salt rounds (default: 12)
- **Account Locking:** After 5 failed attempts, lock for 15 minutes
- **JWT Tokens:** Access (15min) + Refresh (7 days) token pair
- **MFA Support:** Time-based TOTP with placeholder for full implementation
- **Authorization:** Role-based access control (USER, MODERATOR, ADMIN,
  SUPER_ADMIN)

### 4. Agent-First Design

All operations return `IServiceResult<T>` with `IAgentHints`:

```typescript
interface IServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}
```

Agent hints include:

- `suggestedNextActions` - Contextual next steps for agents
- `relatedResources` - Links to related entities
- `confidence` - Numeric confidence score (0.0-1.0)
- `estimatedImpact` - Benefit/effort/ROI metrics
- `riskFactors` - Potential issues with operations
- `reasoning` - Human-readable explanation

### 5. Event Publishing

The service publishes domain events for:

- `user.created` - New user registration
- `user.profile.updated` - Profile changes
- `user.settings.changed` - Settings modifications
- `user.logged_in` - Successful authentication
- `user.password.changed` - Password updates
- `user.deactivated` / `user.deleted` - Account removal

### 6. Repository Pattern

The `IUserRepository` interface abstracts data access:

```typescript
interface IUserRepository {
  create(input): Promise<IUser>;
  findById(id): Promise<IUser | null>;
  findByEmail(email): Promise<IUser | null>;
  findByUsername(username): Promise<IUser | null>;
  updateProfile(id, input, version): Promise<IUser>;
  updateSettings(id, input, version): Promise<IUser>;
  updateLoginTracking(id, tracking, historyEntry): Promise<void>;
  softDelete(id): Promise<void>;
  hardDelete(id): Promise<void>;
  // ... additional methods
}
```

### 7. Database Schema

PostgreSQL with Prisma ORM:

- `users` table with JSONB for `profile`, `settings`, `loginHistory`
- Unique constraints on `email` and `username`
- Indexes on frequently queried fields
- Soft delete via `status` and `deletedAt` fields

## Consequences

### Positive

1. **Consistent Architecture:** Follows established Noema patterns making it
   easy for other services to integrate
2. **Agent-Ready:** Full `IAgentHints` support enables AI agents to orchestrate
   user workflows effectively
3. **Security-First:** Comprehensive security measures (password hashing,
   account locking, MFA support)
4. **Event-Driven:** Other services can react to user lifecycle events without
   coupling
5. **Testable:** Repository pattern enables easy mocking for unit tests
6. **Extensible:** Clear separation allows adding OAuth providers, additional
   MFA methods

### Negative

1. **Complexity:** Full implementation requires more code than minimal CRUD
2. **Event Bus Dependency:** Requires functioning event infrastructure
3. **Token Management:** JWT secret rotation needs operational procedures

### Risks

1. **Prisma 7.x Migration:** The Prisma schema needs updating for Prisma 7.x
   datasource configuration
2. **MFA Implementation:** Current MFA is placeholder; full TOTP implementation
   needed before production

## Alternatives Considered

### 1. External Identity Provider (Auth0, Cognito)

**Rejected because:**

- Loss of control over user data
- Vendor lock-in concerns
- Cost at scale
- Integration complexity with agent-first architecture

### 2. Simpler Service Without Agent Hints

**Rejected because:**

- Violates Noema's core architectural principle
- Would require retrofitting later
- Loses orchestration capabilities

### 3. Shared Database with Other Services

**Rejected because:**

- Violates microservices database-per-service principle
- Creates tight coupling
- Complicates independent scaling

## Related Documents

- [PROJECT_CONTEXT.md](../../../.copilot/instructions/PROJECT_CONTEXT.md) -
  Overall architecture
- [SERVICE_CLASS_SPECIFICATION.md](../../../.copilot/templates/SERVICE_CLASS_SPECIFICATION.md) -
  Service patterns
- [IAgentHints](../../../packages/contracts/src/common/agent-hints.types.ts) -
  Agent hints contract

## Notes

- Login history is stored in JSONB with a rolling window (last 100 entries)
- The service uses nanoid for ID generation with Noema's branded ID prefixes
- Password changes require current password verification for security
- Public profiles expose limited fields (displayName, bio, avatarUrl, etc.)
