# Noema Architecture Specifications

**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Status:** Active

---

## Overview

This directory contains **5 architectural specifications** that define the REQUIRED structure for all code components in Noema. These are **specifications, not code templates** - they describe what MUST be included, not how to implement it.

**Purpose:** Ensure consistency across 15 microservices, 10 agents, and all APIs by defining clear structural requirements.

**Note:** All specifications use **Enhanced AgentHints v2.0.0** which includes 8 additional required fields for richer agent guidance. See [AGENTHINTS_V2_CHANGELOG.md](./AGENTHINTS_V2_CHANGELOG.md) for details.

---

## Specifications

### 1. [MCP Tool Specification](./MCP_TOOL_SPECIFICATION.md)
**What:** Agent tool structure (Model Context Protocol format)  
**Applies to:** All agent tools across all services  
**Key Requirements:**
- Tool definition structure (name, description, parameters, handler)
- ToolResult structure (data, agentHints, metadata)
- ToolContext structure
- AgentHints (suggestedNextActions, relatedResources, confidence)
- Tool registry interface
- Validation, permissions, examples, documentation

**Must Have Checklist:**
- [ ] Tool has unique kebab-case name
- [ ] Description >50 characters
- [ ] Zod schema for parameters
- [ ] Handler returns ToolResult with agentHints
- [ ] Category, responseTime, cacheable flags
- [ ] At least 1 example
- [ ] Permissions array (can be empty)

---

### 2. [Event Schema Specification](./EVENT_SCHEMA_SPECIFICATION.md)
**What:** Domain event structure  
**Applies to:** All events published by all services  
**Key Requirements:**
- Base event structure (eventId, eventType, aggregateType, aggregateId, version, timestamp)
- Metadata structure (serviceName, serviceVersion, environment, userId, correlationId, causationId)
- Payload patterns (Created, Updated, Deleted, StateChanged, Telemetry)
- Event naming conventions (past tense, lowercase.dots)
- Stream naming conventions
- Outbox pattern for consistency
- Event sourcing support

**Must Have Checklist:**
- [ ] eventType is past tense
- [ ] All required base fields present
- [ ] Metadata includes serviceName, environment
- [ ] correlationId for multi-service flows
- [ ] Payload follows appropriate pattern
- [ ] Zod schema for validation
- [ ] Outbox pattern implemented

---

### 3. [API Specification](./API_SPECIFICATION.md)
**What:** REST API structure (OpenAPI 3.1)  
**Applies to:** All service REST APIs  
**Key Requirements:**
- OpenAPI document structure (info, servers, security, tags, components, paths)
- Response wrappers (data, agentHints, metadata, pagination)
- CRUD endpoint pattern (POST, GET, PATCH, DELETE)
- AgentHints schema (in every 2xx response)
- Error schema
- Health check endpoints
- Pagination, rate limiting, versioning

**Must Have Checklist:**
- [ ] OpenAPI 3.1 spec file created
- [ ] All CRUD endpoints implemented
- [ ] All responses include agentHints
- [ ] Pagination for list endpoints
- [ ] Health and readiness checks
- [ ] All schemas in components
- [ ] Examples for all endpoints

---

### 4. [Service Class Specification](./SERVICE_CLASS_SPECIFICATION.md)
**What:** Domain service class structure  
**Applies to:** All domain services (CardService, DeckService, etc.)  
**Key Requirements:**
- Constructor with dependency injection
- Public CRUD methods (create, findById, find, update, delete)
- Private validation methods
- Private business rule methods
- Private authorization methods
- Private event publishing methods
- ServiceResult return type
- ExecutionContext parameter
- Optimistic locking for updates

**Must Have Checklist:**
- [ ] @injectable decorator
- [ ] Required dependencies (repository, eventPublisher, logger)
- [ ] All CRUD methods present
- [ ] Validation methods
- [ ] Business rule checks
- [ ] Authorization checks
- [ ] Event publishing for state changes
- [ ] ServiceResult return type

---

### 5. [Agent Class Specification](./AGENT_CLASS_SPECIFICATION.md)
**What:** LLM agent class structure  
**Applies to:** All 10 LLM agents  
**Key Requirements:**
- Class properties (config, llm, tools, prompts, logger, version)
- execute() public method
- executeAgentLoop() - ReAct pattern (Reason → Act → Observe)
- buildSystemPrompt() with tool descriptions
- parseResponse() to extract thought/action
- executeAction() for tool execution
- Reasoning trace collection
- Metrics calculation (tokens, cost, confidence)
- AgentOutput with reasoning and metadata

**Must Have Checklist:**
- [ ] execute() method (only public method)
- [ ] executeAgentLoop() implements ReAct
- [ ] Reasoning trace collected completely
- [ ] Confidence calculated
- [ ] Cost and token usage tracked
- [ ] All validation methods
- [ ] All helper methods
- [ ] Factory class provided

---

## How to Use These Specifications

### 1. When Starting New Work
**Before writing code:**
- Read the relevant specification
- Understand ALL required components
- Check the compliance checklist
- Plan your implementation

### 2. During Development
**As you write code:**
- Reference the specification frequently
- Ensure all required fields/methods present
- Follow the patterns exactly
- Add your domain-specific logic

### 3. Before Deploying
**Quality check:**
- Go through the compliance checklist
- Verify all required components
- Test thoroughly
- Document any additions

### 4. During Code Review
**Reviewers should:**
- Verify compliance with specification
- Check all required components present
- Ensure consistency with other implementations
- Approve only if compliant

---

## Key Principles

### 1. Specifications Define Minimums
- These are the **minimum required** structure
- You MUST include everything specified
- You CAN add more (domain-specific logic)
- You CANNOT omit required components

### 2. Consistency Over Flexibility
- Same pattern everywhere
- Easier to understand
- Easier to maintain
- Easier to onboard

### 3. Agent-First Design
- All tools return agentHints
- All APIs return agentHints
- Agents get complete context
- Enables intelligent orchestration

### 4. Complete Observability
- All operations logged
- All metrics emitted
- All traces connected
- Full reasoning transparency

### 5. Event-Driven Architecture
- State changes publish events
- Services communicate via events
- Event sourcing for audit trail
- Replay capability

---

## Compliance vs Innovation

### ✅ MUST Comply With
- Required fields/methods
- Return types
- Naming conventions
- Error handling patterns
- Logging requirements
- Metric emission

### ✅ CAN Innovate In
- Domain-specific business rules
- Additional helper methods
- Performance optimizations
- Caching strategies
- Domain-specific validation
- Additional fields in payloads

### ❌ CANNOT Change
- Core structure
- Required return types
- agentHints presence
- Event naming format
- API endpoint patterns

---

## Verification Tools

### Manual Verification
Use the compliance checklists in each specification.

### Automated Verification (Future)
- Linter rules
- CI/CD checks
- Schema validation
- Contract tests

---

## Common Patterns Across Specifications

### 1. Everything Returns Structured Results
- Tools: `ToolResult<T>`
- Services: `ServiceResult<T>`
- Agents: `AgentOutput`
- APIs: `{ data, agentHints, metadata }`

### 2. Everything Includes Tracing
- correlationId
- traceId
- timestamp
- userId/agentId

### 3. Everything Has Metadata
- version
- executionTime
- serviceVersion
- Additional context

### 4. Everything Uses Validation
- Zod schemas for runtime validation
- Type checking at compile time
- Business rule validation
- Authorization checks

### 5. Everything Is Observable
- Structured logging
- Metrics emission
- Error tracking
- Performance monitoring

---

## Relationship Between Specifications

```
API Specification
  ↓ defines responses with agentHints
  ↓
MCP Tool Specification
  ↓ defines tools that return agentHints
  ↓ tools used by
Agent Class Specification
  ↓ agents execute tools and publish
Event Schema Specification
  ↓ events handled by
Service Class Specification
  ↓ services validate, execute, publish events
```

**Everything is connected. Maintain consistency!**

---

## Getting Help

### Questions About Specifications
1. Read the full specification document
2. Check the examples section
3. Look at the compliance checklist
4. Review existing implementations
5. Ask team for clarification

### Proposing Changes
1. Document the issue with current spec
2. Propose specific change
3. Consider impact on existing code
4. Update specification version
5. Create migration plan
6. Get team approval

---

## Changelog

### 1.0.0 (2024-01-15)
- Initial release
- 5 specifications created
- MCP Tool Specification
- Event Schema Specification
- API Specification
- Service Class Specification
- Agent Class Specification
- **AgentHints v2.0.0** integrated across all specifications

---

## Reference Files

In addition to the 5 core specifications, this directory includes:

- **ENHANCED_AGENT_HINTS.ts** - Complete TypeScript definitions for AgentHints v2.0.0
- **AGENTHINTS_V2_CHANGELOG.md** - Detailed changelog and migration guide for AgentHints v2.0.0
- **DESIGN_PATTERNS_FOR_NOEMA.md** - Design patterns reference (in parent directory)

---

## Quick Reference

| Specification | For | Key Requirement | Non-Negotiable |
|---------------|-----|-----------------|----------------|
| MCP Tool | Agent tools | Return agentHints | Always include hints |
| Event Schema | Events | Past tense naming | Immutable, versioned |
| API | REST APIs | agentHints in 2xx | Every response has hints |
| Service Class | Domain services | Publish events | State changes = events |
| Agent Class | LLM agents | ReAct pattern | Full reasoning trace |

---

**These specifications ensure Noema is built consistently, enabling seamless integration between 15 services and 10 agents.** 🚀
