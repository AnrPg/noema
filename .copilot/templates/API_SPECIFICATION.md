# API Specification

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Category:** REST API Design / OpenAPI

---

## Purpose

This specification defines the REQUIRED structure for all REST APIs in Noema. All service APIs MUST conform to this specification (OpenAPI 3.1) to ensure consistency, agent-friendliness, and proper documentation.

---

## Context

Noema has 15 microservices, each exposing REST APIs. APIs are consumed by:
- Mobile app (React Native)
- Web admin dashboard
- LLM agents (10 agents need standardized responses)
- Other services (inter-service communication)

APIs must be agent-first (include agentHints), well-documented, and consistent across all services.

---
**Note:** This is the MINIMUM API structure. Add additional endpoints, custom filters, batch operations, webhooks, GraphQL mutations, or domain-specific operations as your service requires.

---

## Decision

All service APIs MUST implement the following structure.

---

## REQUIRED: OpenAPI Document Structure

Every service MUST have an OpenAPI 3.1.0 specification file:

### File Location
`docs/api/{service-name}.openapi.yaml`

### Document Sections (ALL REQUIRED)

#### 1. Info Section (REQUIRED)
MUST include:
- **title** (string)
  - Format: "Noema {Service Name} API"
  - Example: "Noema Content Service API"

- **version** (string)
  - Semantic versioning: "1.0.0"
  - MUST match service version

- **description** (string)
  - Minimum 100 characters
  - MUST explain:
    - Service purpose
    - Key features (bulleted list)
    - Design principles
    - Rate limits

- **contact** (object)
  - name: "Noema API Team"
  - email: api@noema.app
  - url: https://docs.noema.app

- **license** (object)
  - name: "MIT" (or applicable license)
  - url: License URL

#### 2. Servers Section (REQUIRED)
MUST define:
- Production: `https://api.noema.app/v1/{service-name}`
- Staging: `https://api-staging.noema.app/v1/{service-name}`
- Local: `http://localhost:3000/v1/{service-name}`

#### 3. Security Section (REQUIRED)
MUST define:
```yaml
security:
  - BearerAuth: []

securitySchemes:
  BearerAuth:
    type: http
    scheme: bearer
    bearerFormat: JWT
```

#### 4. Tags Section (REQUIRED)
MUST include tags for:
- Each main resource (e.g., "Cards", "Decks")
- "Health" (for health checks)

#### 5. Components Section (REQUIRED)
See Components Requirements below

#### 6. Paths Section (REQUIRED)
See Endpoint Requirements below

---

## REQUIRED: Components/Schemas

Every API MUST define these schemas:

### 1. Branded ID Types (REQUIRED)
For EVERY entity in the service:
```yaml
UserId:
  type: string
  format: uuid
  description: Unique user identifier
  example: "user_2aB3cD4eF5gH6iJ7kL8mN9oP"

CardId:
  type: string
  format: uuid
  description: Unique card identifier
  example: "card_1aB2cD3eF4gH5iJ6kL7mN8oP"
```

### 2. Enums (REQUIRED)
For each entity, define:
- Type enums (e.g., CardType: atomic | cloze | image_occlusion)
- State enums (e.g., CardState: draft | active | archived)
- Status enums (e.g., ReviewStatus: correct | incorrect | partial)

### 3. Core Entities (REQUIRED)
Full schema for each domain entity with:
- All fields with types
- required vs optional
- Descriptions
- Examples
- Constraints (min, max, pattern, etc.)

### 4. Response Wrappers (CRITICAL - ALWAYS REQUIRED)

#### Single Entity Response
```yaml
{ResourceName}Response:
  type: object
  required:
    - data
    - agentHints
    - metadata
  properties:
    data:
      $ref: '#/components/schemas/{ResourceName}'
    agentHints:
      $ref: '#/components/schemas/AgentHints'
    metadata:
      $ref: '#/components/schemas/ResponseMetadata'
```

#### List Response
```yaml
{ResourceName}ListResponse:
  type: object
  required:
    - data
    - agentHints
    - metadata
    - pagination
  properties:
    data:
      type: array
      items:
        $ref: '#/components/schemas/{ResourceName}'
    agentHints:
      $ref: '#/components/schemas/AgentHints'
    metadata:
      $ref: '#/components/schemas/ResponseMetadata'
    pagination:
      $ref: '#/components/schemas/Pagination'
```

### 5. AgentHints Schema (REQUIRED - NEVER OMIT)
```yaml
AgentHints:
  type: object
  required:
    - suggestedNextActions
    - relatedResources
    - confidence
    - sourceQuality
    - validityPeriod
    - contextNeeded
    - assumptions
    - riskFactors
    - dependencies
    - estimatedImpact
    - preferenceAlignment
  properties:
    # REQUIRED CORE FIELDS
    suggestedNextActions:
      type: array
      items:
        $ref: '#/components/schemas/Action'
    relatedResources:
      type: array
      items:
        $ref: '#/components/schemas/Resource'
    confidence:
      type: number
      minimum: 0
      maximum: 1
      description: Overall confidence in suggestions
    sourceQuality:
      type: string
      enum: [high, medium, low, unknown]
      description: Quality of data used to generate hints
    validityPeriod:
      type: string
      enum: [immediate, short, medium, long, indefinite]
      description: How long hints remain valid
    contextNeeded:
      type: array
      items:
        type: string
      description: Additional context that would improve hints
    assumptions:
      type: array
      items:
        type: string
      description: Assumptions made when generating hints
    riskFactors:
      type: array
      items:
        $ref: '#/components/schemas/RiskFactor'
    dependencies:
      type: array
      items:
        $ref: '#/components/schemas/ActionDependency'
    estimatedImpact:
      type: object
      required:
        - benefit
        - effort
        - roi
      properties:
        benefit:
          type: number
          minimum: 0
          maximum: 1
        effort:
          type: number
          minimum: 0
          maximum: 1
        roi:
          type: number
        affectedMetrics:
          type: array
          items:
            type: string
    preferenceAlignment:
      type: array
      items:
        $ref: '#/components/schemas/PreferenceAlignment'
    
    # OPTIONAL FIELDS
    reasoning:
      type: string
      description: Human-readable explanation
    warnings:
      type: array
      items:
        $ref: '#/components/schemas/Warning'
    alternatives:
      type: array
      items:
        $ref: '#/components/schemas/Alternative'
    constraints:
      type: array
      items:
        type: string
    metadata:
      type: object
      properties:
        generatedAt:
          type: string
          format: date-time
        generatedBy:
          type: string
        modelVersion:
          type: string
        processingTime:
          type: number
```

### 6. Action Schema (REQUIRED)
```yaml
Action:
  type: object
  required:
    - action
    - priority
  properties:
    action:
      type: string
      description: Action identifier (kebab-case)
    priority:
      type: string
      enum: [critical, high, medium, low]
    data:
      type: object
      additionalProperties: true
    description:
      type: string
    estimatedTime:
      type: number
      description: Milliseconds
    estimatedCost:
      type: number
      description: Arbitrary units or dollars
    
    # Enhanced fields (v2.0.0)
    category:
      type: string
      enum: [exploration, optimization, correction, learning]
    prerequisites:
      type: array
      items:
        type: string
      description: Actions that must complete first
    expectedOutcome:
      type: string
      description: What will happen if executed
    reversible:
      type: boolean
      description: Can this action be undone?
    confidence:
      type: number
      minimum: 0
      maximum: 1
      description: Confidence in this specific action
```

### 7. Resource Schema (REQUIRED)
```yaml
Resource:
  type: object
  required:
    - type
    - id
    - label
    - relevance
  properties:
    type:
      type: string
    id:
      type: string
    label:
      type: string
    relevance:
      type: number
      minimum: 0
      maximum: 1
    
    # Enhanced metadata (v2.0.0)
    metadata:
      type: object
      properties:
        category:
          type: string
        lastAccessed:
          type: string
          format: date-time
        accessCount:
          type: integer
        quality:
          type: string
          enum: [high, medium, low]
        freshness:
          type: string
          enum: [current, recent, stale]
```

### 8. Warning Schema (REQUIRED)
```yaml
Warning:
  type: object
  required:
    - type
    - severity
    - message
  properties:
    type:
      type: string
      enum: [validation, duplicate, conflict, deprecation, performance]
    severity:
      type: string
      enum: [low, medium, high, critical]
    message:
      type: string
    relatedIds:
      type: array
      items:
        type: string
    suggestedFix:
      type: string
    autoFixable:
      type: boolean
```

### 9. RiskFactor Schema (REQUIRED for AgentHints)
```yaml
RiskFactor:
  type: object
  required:
    - type
    - severity
    - description
    - probability
    - impact
  properties:
    type:
      type: string
      enum: [performance, accuracy, cost, complexity, user-experience]
    severity:
      type: string
      enum: [critical, high, medium, low]
    description:
      type: string
    probability:
      type: number
      minimum: 0
      maximum: 1
    impact:
      type: number
      minimum: 0
      maximum: 1
    mitigation:
      type: string
```

### 10. ActionDependency Schema (REQUIRED for AgentHints)
```yaml
ActionDependency:
  type: object
  required:
    - action
    - dependsOn
    - type
  properties:
    action:
      type: string
    dependsOn:
      type: array
      items:
        type: string
    type:
      type: string
      enum: [required, recommended, optional]
    reason:
      type: string
```

### 11. PreferenceAlignment Schema (REQUIRED for AgentHints)
```yaml
PreferenceAlignment:
  type: object
  required:
    - action
    - preference
    - alignment
    - score
  properties:
    action:
      type: string
    preference:
      type: string
    alignment:
      type: string
      enum: [strong, moderate, weak, neutral, conflict]
    score:
      type: number
      minimum: -1
      maximum: 1
    explanation:
      type: string
```

### 12. Alternative Schema (OPTIONAL for AgentHints)
```yaml
Alternative:
  type: object
  required:
    - approach
    - confidence
    - reasoning
  properties:
    approach:
      type: string
    confidence:
      type: number
      minimum: 0
      maximum: 1
    reasoning:
      type: string
    pros:
      type: array
      items:
        type: string
    cons:
      type: array
      items:
        type: string
    estimatedImpact:
      type: number
      minimum: 0
      maximum: 1
```

### 13. Pagination Schema (REQUIRED)
```yaml
Pagination:
  type: object
  required:
    - total
    - limit
    - offset
    - hasMore
  properties:
    total:
      type: integer
      minimum: 0
    limit:
      type: integer
      minimum: 1
      maximum: 100
    offset:
      type: integer
      minimum: 0
    hasMore:
      type: boolean
    nextCursor:
      type: string
```

### 14. ResponseMetadata Schema (REQUIRED)
```yaml
ResponseMetadata:
  type: object
  required:
    - version
    - timestamp
  properties:
    version:
      type: string
    timestamp:
      type: string
      format: date-time
    executionTime:
      type: number
    serviceVersion:
      type: string
    traceId:
      type: string
      format: uuid
```

### 15. Error Schema (REQUIRED)
```yaml
Error:
  type: object
  required:
    - error
    - message
    - statusCode
  properties:
    error:
      type: string
      description: Error code (UPPER_SNAKE_CASE)
    message:
      type: string
    statusCode:
      type: integer
    details:
      type: object
      additionalProperties: true
    requestId:
      type: string
      format: uuid
    timestamp:
      type: string
      format: date-time
```

---

## REQUIRED: CRUD Endpoint Pattern

For EVERY resource, implement these endpoints:

### 1. Create (POST /resources)
MUST include:
- **Request Body**
  - All required fields for creation
  - Optional fields clearly marked
  - Validation rules (min, max, pattern)

- **Responses**
  - 201: Success with {Resource}Response
  - 400: Validation error with Error schema
  - 401: Unauthorized with Error schema
  - 429: Rate limit exceeded with Error schema

- **Examples**
  - At least 1 request example
  - At least 1 response example

### 2. List (GET /resources)
MUST include:
- **Query Parameters**
  - Filtering (by common fields)
  - Pagination (limit, offset, cursor)
  - Sorting (sortBy, sortOrder)
  - Date ranges (createdAfter, createdBefore)

- **Responses**
  - 200: Success with {Resource}ListResponse
  - 400: Invalid parameters with Error schema
  - 401: Unauthorized with Error schema

### 3. Get by ID (GET /resources/{id})
MUST include:
- **Path Parameters**
  - id: Resource ID (required)

- **Responses**
  - 200: Success with {Resource}Response
  - 404: Not found with Error schema
  - 401: Unauthorized with Error schema

### 4. Update (PATCH /resources/{id})
MUST include:
- **Path Parameters**
  - id: Resource ID (required)

- **Request Body**
  - Partial update (all fields optional except version)
  - version: Current version (for optimistic locking)
  - reason: Optional audit trail

- **Responses**
  - 200: Success with {Resource}Response
  - 400: Invalid request with Error schema
  - 404: Not found with Error schema
  - 409: Version conflict with Error schema
  - 401: Unauthorized with Error schema

### 5. Delete (DELETE /resources/{id})
MUST include:
- **Path Parameters**
  - id: Resource ID (required)

- **Query Parameters**
  - soft: boolean (default true)

- **Responses**
  - 204: Success (no content)
  - 404: Not found with Error schema
  - 401: Unauthorized with Error schema

### 6. Search (POST /resources/search) - IF APPLICABLE
MUST include:
- **Request Body**
  - query: Search query string
  - filters: Additional filters
  - limit: Result limit

- **Responses**
  - 200: Success with {Resource}ListResponse
  - 400: Invalid query with Error schema
  - 401: Unauthorized with Error schema

---

## REQUIRED: Health Check Endpoints

Every service MUST implement:

### 1. Health (GET /health)
```yaml
/health:
  get:
    summary: Health check
    security: []  # No auth required
    responses:
      '200':
        description: Service is healthy
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                  enum: [healthy, degraded, unhealthy]
                timestamp:
                  type: string
                  format: date-time
                version:
                  type: string
```

### 2. Readiness (GET /ready)
```yaml
/ready:
  get:
    summary: Readiness check
    security: []  # No auth required
    responses:
      '200':
        description: Service is ready
        content:
          application/json:
            schema:
              type: object
              properties:
                ready:
                  type: boolean
                dependencies:
                  type: object
                  additionalProperties:
                    type: boolean
```

---

## Response Structure Requirements

### Every 2xx Response MUST Include

1. **data** (REQUIRED)
   - Primary response data
   - Type matches declared schema

2. **agentHints** (REQUIRED - NEVER OMIT)
   - suggestedNextActions (array, can be empty)
   - relatedResources (array, can be empty)
   - confidence (number, 0-1)
   - reasoning (optional but recommended)
   - warnings (optional)

3. **metadata** (REQUIRED)
   - version (API version)
   - timestamp (when response generated)
   - executionTime (optional, milliseconds)
   - serviceVersion (optional)
   - traceId (optional but recommended)

4. **pagination** (REQUIRED for list responses)
   - total (total count)
   - limit (page size)
   - offset (items skipped)
   - hasMore (boolean)
   - nextCursor (optional)

---

## Endpoint Requirements

### Operation Metadata (REQUIRED for each endpoint)
- **summary** (string, REQUIRED)
  - One-line description

- **description** (string, REQUIRED)
  - Detailed explanation
  - When to use
  - What it returns

- **operationId** (string, REQUIRED)
  - Unique identifier
  - camelCase
  - Example: getCardById, createDeck

- **tags** (array, REQUIRED)
  - At least one tag
  - Groups related endpoints

### Request Body (if applicable)
MUST include:
- Schema reference
- required: true/false
- Examples (at least 1)

### Parameters (if applicable)
Each parameter MUST have:
- name
- in: path | query | header
- required: true/false
- schema
- description
- example

### Responses (ALL status codes)
Each response MUST have:
- Description
- Content with schema
- Examples

### Examples (REQUIRED)
MUST provide:
- At least 1 request example per endpoint
- At least 1 success response example
- At least 1 error response example

---

## Validation Rules

### Request Validation
APIs MUST validate:
- Required fields present
- Field types correct
- String lengths (min/max)
- Number ranges (min/max)
- Patterns (regex for formatted fields)
- Enums (only allowed values)
- Foreign keys (referenced entities exist)

### Response Validation
APIs MUST ensure:
- Response matches declared schema
- All required fields present
- agentHints included
- Proper HTTP status codes

---

## Error Handling Requirements

### Standard Error Codes
MUST use these status codes appropriately:
- 400: Bad Request (validation failure)
- 401: Unauthorized (missing/invalid auth)
- 403: Forbidden (insufficient permissions)
- 404: Not Found (resource doesn't exist)
- 409: Conflict (optimistic lock failure, duplicate)
- 422: Unprocessable Entity (business rule violation)
- 429: Too Many Requests (rate limit)
- 500: Internal Server Error (unexpected)
- 503: Service Unavailable (dependency down)

### Error Response Format
ALL errors MUST return Error schema:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Field 'name' is required",
  "statusCode": 400,
  "details": {
    "field": "name",
    "constraint": "required"
  },
  "requestId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Versioning Requirements

### URL Versioning (REQUIRED)
All endpoints MUST include version in URL:
`/v1/cards`, `/v2/cards`

### Version Compatibility
- v1 MUST remain compatible until deprecated
- Breaking changes require new version
- Deprecation notice minimum 90 days
- Support minimum 2 versions concurrently

---

## Rate Limiting Requirements

Every API MUST:
1. Implement rate limiting
2. Return 429 when limit exceeded
3. Include headers:
   - X-RateLimit-Limit: Max requests
   - X-RateLimit-Remaining: Requests left
   - X-RateLimit-Reset: When limit resets
4. Document rate limits in API description

---

## Security Requirements

### Authentication (REQUIRED)
- All endpoints except /health and /ready MUST require auth
- Use Bearer JWT tokens
- Tokens MUST include userId, roles, permissions

### Authorization (REQUIRED)
- Verify user has permission for operation
- Check resource ownership where applicable
- Return 403 for insufficient permissions

### Input Sanitization (REQUIRED)
- Sanitize all user input
- Prevent SQL injection
- Prevent XSS
- Validate file uploads

---

## Observability Requirements

### Logging (REQUIRED)
Log:
- Request received (method, path, userId)
- Response sent (status, duration)
- Errors (with stack trace)
- Slow requests (>1s)

### Metrics (REQUIRED)
Emit:
- Request count
- Response time
- Error rate
- Status code distribution

### Tracing (REQUIRED)
- Generate traceId for each request
- Include in logs
- Include in response metadata
- Propagate to downstream services

---

## Compliance Checklist

Before deploying an API:

- [ ] OpenAPI spec created
- [ ] All CRUD endpoints implemented
- [ ] Health and readiness checks added
- [ ] All responses include agentHints
- [ ] All responses include metadata
- [ ] Pagination implemented for lists
- [ ] All schemas defined in components
- [ ] Validation rules implemented
- [ ] Error handling consistent
- [ ] Rate limiting configured
- [ ] Authentication required (except health)
- [ ] Authorization checked
- [ ] Examples provided for all endpoints
- [ ] Logging implemented
- [ ] Metrics emitted
- [ ] Tracing added
- [ ] Tests written
- [ ] Documentation generated from spec

---

## Testing Requirements

MUST test:
1. All endpoints (happy path)
2. All error cases (4xx, 5xx)
3. Input validation
4. Authorization
5. Rate limiting
6. Response schema compliance
7. agentHints presence and structure
8. Pagination
9. Filtering and sorting

---

## Documentation Generation

From OpenAPI spec, MUST generate:
1. Interactive API docs (Swagger UI)
2. Client SDKs (TypeScript, Python)
3. Postman collection
4. Mock server (for development)

---

## Consequences

### Benefits
- ✅ Consistent APIs across all services
- ✅ Agent-friendly responses
- ✅ Auto-generated documentation
- ✅ Type-safe client SDKs
- ✅ Easy to test and mock

### Drawbacks
- ⚠️ Verbose response format (agentHints overhead)
- ⚠️ Requires maintaining OpenAPI spec
- ⚠️ More boilerplate

### Mitigation
- Use code generation for boilerplate
- Provide helper functions for agentHints
- Automate spec validation in CI/CD

---

## References

- OpenAPI 3.1 Spec: https://spec.openapis.org/oas/v3.1.0
- **Enhanced AgentHints v2.0.0**: See ENHANCED_AGENT_HINTS.ts for complete TypeScript structure
- Events: See EVENT_SCHEMA_SPECIFICATION.md
- Design Patterns: See DESIGN_PATTERNS_FOR_NOEMA.md

---

## Changelog

- 1.0.0 (2024-01-15): Initial specification
