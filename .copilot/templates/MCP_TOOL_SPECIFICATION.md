# MCP Tool Interface Specification

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Category:** Agent Tools / MCP Integration

---

## Purpose

This specification defines the REQUIRED structure for all agent tools using the Model Context Protocol (MCP) format. All tools MUST conform to this specification to ensure consistency across services and enable proper agent orchestration.

---

## Context

Noema uses 10 LLM agents that interact with 15 microservices through standardized tools. Each tool is a discrete capability that an agent can invoke. Tools must return structured responses that guide agents on what to do next (agentHints).

---
**Note:** This is the MINIMUM structure. Add tool-specific validation, caching logic, retry mechanisms, circuit breakers, or any domain-specific functionality as needed.

---

## Decision

All MCP tools MUST implement the following structure.

---

## REQUIRED: Tool Definition

Every tool MUST have these fields:

### 1. Identity & Description
- **name** (string, REQUIRED)
  - Format: kebab-case
  - Must be unique within the service
  - Pattern: `{verb}-{noun}` (e.g., "create-card", "search-decks")
  - MUST NOT change once published

- **description** (string, REQUIRED)
  - Minimum 50 characters
  - MUST explain: what the tool does, when to use it, what it returns
  - MUST include example use cases
  - Format: Plain English, no jargon

- **permissions** (array of strings, REQUIRED)
  - Can be empty array if no special permissions needed
  - Format: `{resource}:{action}` (e.g., "cards:create", "decks:read")
  - MUST include all required permissions

### 2. Parameters
- **parameters** (Zod schema, REQUIRED)
  - MUST validate all input at runtime
  - MUST use branded types for IDs (e.g., UserId, CardId)
  - MUST specify required vs optional fields
  - MUST include min/max constraints where applicable
  - MUST document each parameter with description

### 3. Handler Function
- **handler** (async function, REQUIRED)
  - Signature: `(params: TParams, context: ToolContext) => Promise<ToolResult<TResult>>`
  - MUST be idempotent for query operations
  - MUST include error handling
  - MUST return ToolResult structure (see below)
  - MUST log execution for observability

### 4. Categorization (REQUIRED)
- **category** (enum, REQUIRED)
  - One of: 'query', 'mutation', 'analysis', 'generation'
  - Determines caching and retry behavior

### 5. Performance Metadata (REQUIRED)
- **responseTime** (enum, REQUIRED)
  - One of: 'fast' (<100ms), 'medium' (100ms-1s), 'slow' (>1s)
  - Used for timeout configuration

- **cacheable** (boolean, REQUIRED)
  - true: Results can be cached
  - false: Must execute every time

- **cacheTTL** (number, REQUIRED IF cacheable=true)
  - Time in seconds
  - Must be >0 if cacheable is true

- **idempotent** (boolean, REQUIRED)
  - true: Same input always produces same output
  - false: Results may vary

### 6. Documentation (REQUIRED)
- **examples** (array, REQUIRED)
  - Minimum 1 example
  - Each example MUST include:
    - description (what this example shows)
    - params (example input)
    - expectedResult (example output)

- **tags** (array of strings, REQUIRED)
  - Minimum 1 tag
  - Used for discovery and filtering
  - Common tags: 'learning', 'analytics', 'content', 'scheduling'

### 7. Rate Limiting (OPTIONAL but RECOMMENDED)
- **rateLimit** (object)
  - maxCalls (number): Maximum calls per window
  - windowMs (number): Time window in milliseconds

### 8. Deprecation (OPTIONAL)
- **deprecated** (object)
  - since (string): Version when deprecated
  - replacement (string): Name of replacement tool
  - removalDate (string): ISO 8601 date when will be removed

---

## REQUIRED: ToolResult Structure

Every tool handler MUST return this structure:

### 1. Data (REQUIRED)
- **data** (type TResult, REQUIRED)
  - The primary result of the tool execution
  - Type varies by tool
  - MUST NOT be null for successful operations

### 2. Agent Hints (REQUIRED - NEVER OMIT)
- **agentHints** (object, REQUIRED)
  
  **REQUIRED CORE FIELDS:**
  
  - **suggestedNextActions** (array, REQUIRED)
    - Can be empty array
    - Each action MUST have:
      - action (string): Action identifier (kebab-case)
      - priority (enum): 'critical' | 'high' | 'medium' | 'low'
      - data (object, optional): Action-specific data
      - description (string, optional): Human-readable
      - estimatedTime (number, optional): Milliseconds
      - estimatedCost (number, optional): Arbitrary units or dollars
      - category (enum, optional): 'exploration' | 'optimization' | 'correction' | 'learning'
      - prerequisites (array, optional): Actions that must complete first
      - expectedOutcome (string, optional): What will happen if executed
      - reversible (boolean, optional): Can this action be undone?
      - confidence (number, optional): Confidence in this specific action (0-1)
  
  - **relatedResources** (array, REQUIRED)
    - Can be empty array
    - Each resource MUST have:
      - type (string): Resource type
      - id (string): Resource identifier
      - label (string): Display name
      - relevance (number): 0.0 to 1.0
      - metadata (object, optional): category, lastAccessed, accessCount, quality, freshness
  
  - **confidence** (number, REQUIRED)
    - Range: 0.0 to 1.0
    - 1.0 = completely confident
    - 0.0 = no confidence
    - MUST be calculated, not hardcoded
  
  - **sourceQuality** (enum, REQUIRED)
    - One of: 'high' | 'medium' | 'low' | 'unknown'
    - Indicates reliability of data used to generate hints
    - high: From authoritative, verified sources
    - medium: From generally reliable sources
    - low: From uncertain or unverified sources
    - unknown: Source quality cannot be determined
  
  - **validityPeriod** (enum, REQUIRED)
    - One of: 'immediate' | 'short' | 'medium' | 'long' | 'indefinite'
    - How long these hints remain valid
    - immediate: Valid only for immediate next action
    - short: Valid for ~5 minutes
    - medium: Valid for ~1 hour
    - long: Valid for ~24 hours
    - indefinite: Valid until context changes
  
  - **contextNeeded** (array, REQUIRED)
    - Can be empty array
    - Additional information that would improve hint quality
    - Example: ["user's learning history", "current knowledge state"]
  
  - **assumptions** (array, REQUIRED)
    - Can be empty array
    - Assumptions made when generating hints
    - Makes reasoning transparent and debuggable
    - Example: ["User prefers visual learning", "User has basic math knowledge"]
  
  - **riskFactors** (array, REQUIRED)
    - Can be empty array
    - Each risk factor MUST have:
      - type (string): 'performance' | 'accuracy' | 'cost' | 'complexity' | 'user-experience'
      - severity (enum): 'critical' | 'high' | 'medium' | 'low'
      - description (string): What the risk is
      - probability (number): 0.0 to 1.0
      - impact (number): 0.0 to 1.0
      - mitigation (string, optional): How to mitigate the risk
  
  - **dependencies** (array, REQUIRED)
    - Can be empty array
    - Shows which actions must be done before others
    - Each dependency MUST have:
      - action (string): The dependent action
      - dependsOn (array): Actions it depends on
      - type (enum): 'required' | 'recommended' | 'optional'
      - reason (string, optional): Why this dependency exists
  
  - **estimatedImpact** (object, REQUIRED)
    - Expected impact if suggestions are followed
    - MUST have:
      - benefit (number): 0.0 to 1.0
      - effort (number): 0.0 to 1.0
      - roi (number): Benefit/effort ratio
      - affectedMetrics (array, optional): Specific metrics affected
  
  - **preferenceAlignment** (array, REQUIRED)
    - Can be empty array
    - Shows which suggestions align with user's preferences
    - Each alignment MUST have:
      - action (string): Which action this applies to
      - preference (string): Which preference it aligns with
      - alignment (enum): 'strong' | 'moderate' | 'weak' | 'neutral' | 'conflict'
      - score (number): -1.0 (conflict) to 1.0 (strong align)
      - explanation (string, optional)
  
  **OPTIONAL FIELDS (Strongly Recommended):**
  
  - **reasoning** (string, OPTIONAL but RECOMMENDED)
    - Plain English explanation of hints
    - Why these suggestions were made
  
  - **warnings** (array, OPTIONAL)
    - Each warning MUST have:
      - type (enum): 'validation' | 'duplicate' | 'conflict' | 'deprecation' | 'performance'
      - severity (enum): 'low' | 'medium' | 'high' | 'critical'
      - message (string): Human-readable
      - relatedIds (array of strings, optional)
      - suggestedFix (string, optional)
      - autoFixable (boolean, optional): Can this be fixed automatically?
  
  - **alternatives** (array, OPTIONAL)
    - Alternative approaches that were considered
    - Each alternative MUST have:
      - approach (string): Description of alternative
      - confidence (number): 0.0 to 1.0
      - reasoning (string): Why this alternative exists
      - pros (array, optional): Advantages
      - cons (array, optional): Disadvantages
      - estimatedImpact (number, optional): 0.0 to 1.0
  
  - **constraints** (array, OPTIONAL)
    - Limitations on the suggestions
    - Example: ["Must complete within current session", "Cannot exceed 30 minutes"]
  
  - **metadata** (object, OPTIONAL)
    - generatedAt (string): ISO 8601 timestamp
    - generatedBy (string): Service/agent that generated hints
    - modelVersion (string, optional): If AI-generated
    - processingTime (number, optional): Milliseconds

### 3. Metadata (REQUIRED)
- **metadata** (object, REQUIRED)
  - **toolVersion** (string, REQUIRED)
    - Semantic version of the tool
    - Format: "1.2.3"
  
  - **timestamp** (string, REQUIRED)
    - ISO 8601 format
    - UTC timezone
    - When the tool executed
  
  - **executionTime** (number, REQUIRED)
    - Milliseconds taken to execute
    - Includes all processing time
  
  - **serviceVersion** (string, REQUIRED)
    - Version of the service that executed the tool
    - Format: "1.2.3"
  
  - **traceId** (string, OPTIONAL but RECOMMENDED)
    - UUID for distributed tracing
    - Should propagate from request
  
  - **correlationId** (string, OPTIONAL but RECOMMENDED)
    - UUID for request correlation
    - Links related operations
  
  - **cached** (boolean, OPTIONAL)
    - true if result came from cache
    - false if freshly computed

---

## REQUIRED: ToolContext Structure

Every tool handler receives this context:

### Context Fields (ALL REQUIRED in context object)
- **userId** (string, optional in context)
  - User making the request
  - null for system requests

- **sessionId** (string, optional)
  - Current session identifier

- **correlationId** (string, REQUIRED)
  - Request correlation UUID

- **traceId** (string, REQUIRED)
  - Distributed tracing UUID

- **agentId** (string, REQUIRED)
  - Which agent is calling the tool

- **agentVersion** (string, REQUIRED)
  - Version of the calling agent

- **timestamp** (string, REQUIRED)
  - When the request was made (ISO 8601)

- **metadata** (object, optional)
  - Additional context data

---

## REQUIRED: Supporting Components

### Tool Registry
Every service MUST provide a ToolRegistry with these methods:

- **register(tool)** - Register a tool
- **get(name)** - Retrieve a tool by name
- **getAll()** - Get all registered tools
- **getByCategory(category)** - Get tools by category
- **getByTag(tag)** - Get tools by tag
- **validate(tool)** - Validate tool structure

### Common Schemas
Every service MUST provide reusable Zod schemas for:

- Branded ID types (UserId, CardId, DeckId, etc.)
- Pagination (limit, offset, cursor)
- Sorting (sortBy, sortOrder)
- Date ranges (from, to)
- Common metadata

---

## Validation Requirements

### Pre-execution Validation
Tools MUST validate:
1. All required parameters present
2. Parameters match Zod schema
3. User has required permissions
4. Rate limits not exceeded (if configured)

### Post-execution Validation
Tools MUST validate:
1. Result structure matches ToolResult
2. agentHints are present and complete
3. confidence is between 0.0 and 1.0
4. All required metadata fields present

---

## Error Handling Requirements

Tools MUST:
1. Catch all errors
2. Log errors with full context
3. Return structured error in ToolResult
4. Include helpful error messages
5. NOT leak sensitive information in errors
6. Distinguish between:
   - Validation errors (user input problem)
   - Business rule errors (domain constraint violation)
   - System errors (infrastructure problem)

---

## Observability Requirements

Tools MUST:
1. Log start of execution with input parameters
2. Log end of execution with result summary
3. Log errors with full stack traces
4. Emit metrics:
   - Execution count
   - Execution time
   - Error rate
   - Cache hit rate (if cacheable)
5. Include traceId in all logs

---

## Compliance

### MUST NEVER
- ❌ Return null or undefined as data for successful operations
- ❌ Omit agentHints from response
- ❌ Skip input validation
- ❌ Ignore permissions
- ❌ Throw unhandled errors
- ❌ Mutate input parameters
- ❌ Have side effects in query operations
- ❌ Cache mutation operations

### MUST ALWAYS
- ✅ Return ToolResult structure
- ✅ Include agentHints with all required fields
- ✅ Validate inputs with Zod
- ✅ Check permissions before execution
- ✅ Log execution
- ✅ Handle errors gracefully
- ✅ Calculate confidence score
- ✅ Provide at least one example

---

## Verification Checklist

Before deploying a tool, verify:

- [ ] Tool has unique name in kebab-case
- [ ] Description is clear and complete (>50 chars)
- [ ] All parameters validated with Zod
- [ ] Permissions array defined
- [ ] Category specified
- [ ] responseTime specified
- [ ] cacheable flag set correctly
- [ ] cacheTTL set if cacheable
- [ ] idempotent flag set correctly
- [ ] At least 1 example provided
- [ ] At least 1 tag provided
- [ ] Handler returns ToolResult structure
- [ ] agentHints ALWAYS included in response
- [ ] agentHints.confidence calculated (not hardcoded)
- [ ] agentHints.sourceQuality specified
- [ ] agentHints.validityPeriod specified
- [ ] agentHints.contextNeeded array present (can be empty)
- [ ] agentHints.assumptions array present (can be empty)
- [ ] agentHints.riskFactors array present (can be empty)
- [ ] agentHints.dependencies array present (can be empty)
- [ ] agentHints.estimatedImpact object present with benefit/effort/roi
- [ ] agentHints.preferenceAlignment array present (can be empty)
- [ ] agentHints.reasoning included (strongly recommended)
- [ ] All metadata fields populated
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Metrics emitted
- [ ] Tests written (unit + integration)
- [ ] Tool registered in ToolRegistry

---

## Migration & Versioning

### Adding New Fields
- New optional fields: Can be added anytime
- New required fields: Requires major version bump

### Deprecating Tools
1. Mark as deprecated with `deprecated` field
2. Specify replacement tool
3. Set removal date (minimum 90 days)
4. Log warnings when deprecated tool is used
5. Update documentation
6. Remove after removal date

### Breaking Changes
Breaking changes require:
1. New tool name (e.g., "create-card-v2")
2. Keep old tool until removal date
3. Update agent prompts to use new tool
4. Migration guide for consumers

---

## Examples

### Minimal Valid Tool
```
Name: "get-card"
Description: "Retrieves a card by ID. Use when you need to access card content."
Parameters: Zod schema validating { cardId: string }
Permissions: ["cards:read"]
Category: "query"
ResponseTime: "fast"
Cacheable: true
CacheTTL: 3600
Idempotent: true
Examples: [{ description: "Get card by ID", params: { cardId: "card_123" } }]
Tags: ["cards", "content"]
Handler: Returns ToolResult with:
  - data: Card object
  - agentHints with suggestedNextActions, relatedResources, confidence
  - metadata with all required fields
```

### Tool with Rich Hints
```
Name: "review-card"
Description: "Records a card review session. Use after user completes review."
[...all required fields...]
Handler returns agentHints:
  - suggestedNextActions: [
      { 
        action: "review-next-card", 
        priority: "high",
        category: "learning",
        expectedOutcome: "Continue learning momentum",
        confidence: 0.92
      },
      { 
        action: "adjust-difficulty", 
        priority: "medium",
        category: "optimization",
        expectedOutcome: "Better calibrated difficulty"
      }
    ]
  - relatedResources: [
      { 
        type: "deck", 
        id: "deck_456", 
        label: "Math Deck", 
        relevance: 1.0,
        metadata: { quality: "high", freshness: "current" }
      }
    ]
  - confidence: 0.95
  - sourceQuality: "high"
  - validityPeriod: "short"
  - contextNeeded: ["user's recent performance trend"]
  - assumptions: ["User completed review attentively", "FSRS algorithm accurate"]
  - riskFactors: [
      { 
        type: "user-experience", 
        severity: "low", 
        description: "User might feel fatigued",
        probability: 0.2,
        impact: 0.1
      }
    ]
  - dependencies: [
      {
        action: "adjust-difficulty",
        dependsOn: ["review-next-card"],
        type: "recommended",
        reason: "Need more data points before adjustment"
      }
    ]
  - estimatedImpact: {
      benefit: 0.85,
      effort: 0.2,
      roi: 4.25,
      affectedMetrics: ["retention_rate", "review_accuracy"]
    }
  - preferenceAlignment: [
      {
        action: "review-next-card",
        preference: "continuous_learning",
        alignment: "strong",
        score: 0.9
      }
    ]
  - reasoning: "High confidence based on FSRS algorithm and recent performance"
  - warnings: [
      { 
        type: "performance", 
        severity: "low", 
        message: "User slower than usual",
        autoFixable: false
      }
    ]
```

---

## Consequences

### Benefits
- ✅ Consistent tool interface across all services
- ✅ Agents always know what to expect
- ✅ agentHints enable intelligent agent behavior
- ✅ Easy to add new tools
- ✅ Clear validation and error handling
- ✅ Full observability

### Drawbacks
- ⚠️ More boilerplate than simple functions
- ⚠️ Requires calculating agentHints (not trivial)
- ⚠️ Strict schema enforcement may slow development

### Mitigation
- Provide helper functions for common patterns
- Create agentHints generators for standard cases
- Automate validation and testing

---

## References

- MCP Protocol Specification: [link]
- Zod Documentation: https://zod.dev
- **Enhanced AgentHints v2.0.0**: See ENHANCED_AGENT_HINTS.ts for complete structure
- Agent Architecture: See AGENT_CLASS_SPECIFICATION.md
- Event Schema: See EVENT_SCHEMA_SPECIFICATION.md
- Design Patterns: See DESIGN_PATTERNS_FOR_NOEMA.md

---

## Changelog

- 1.0.0 (2024-01-15): Initial specification
