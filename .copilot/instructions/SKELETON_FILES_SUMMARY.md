# ✅ Code Structure Skeleton Files - Complete Package

**Purpose:** Ensure 100% consistency across all services, agents, APIs, and events.

**IMPORTANT:** These skeletons define the **MINIMUM REQUIRED STRUCTURE**. You are encouraged and expected to add additional fields, methods, validation, and functionality as needed for your specific use case. The skeletons ensure consistency at the foundational level while allowing for rich, domain-specific extensions.

---

## 📦 What You Received

### 🎯 6 Complete Skeleton Files

2. **MCP_TOOL_SPECIFICATION.md** - Agent tool structure (9KB)
3. **EVENT_SCHEMA_SPECIFICATION.md** - Event structure (11KB)
4. **API_SPEC_SPECIFICATION.md** - OpenAPI spec structure (28KB)
5. **SERVICE_CLASS_SPECIFICATION.md** - Service class structure (15KB)
6. **AGENT_CLASS_SPECIFICATION.md** - Agent class structure (18KB)

---

## 🔗 How They Connect

```
API_SPEC_SPECIFICATION.md
  ↓ defines responses with agentHints
  ↓
MCP_TOOL_SPECIFICATION.md
  ↓ defines tools that return agentHints
  ↓ used by
AGENT_CLASS_SPECIFICATION.md
  ↓ agents execute tools and publish events
  ↓
EVENT_SCHEMA_SPECIFICATION.md
  ↓ events are handled by
SERVICE_CLASS_SPECIFICATION.md
  ↓ services validate, execute, publish events
```

**Everything is interconnected - maintain consistency!**

**Remember:** Each skeleton defines MINIMUM required structure. You should ADD domain-specific fields, methods, validation rules, and business logic as needed.

---

## 📋 How to Use

### Step 1: Copy Template
```bash
cp .copilot/templates/[TEMPLATE].ts \
   services/my-service/src/domain/my-entity/[file].ts
```

### Step 2: Replace Placeholders
- `[Entity]` → Your entity name (e.g., "Card")
- `[Agent]` → Your agent name (e.g., "Learning")
- `[Resource]` → Your resource name
- `[ResultType]` → Your result type

### Step 3: Fill in Specifics AND EXTEND
- Add your specific fields
- Add your specific methods
- Add your specific validation
- **Add domain-specific functionality**
- **Add additional error handling**
- **Add caching, retry logic, etc.**
- **Keep the MINIMUM structure intact!**

### Step 4: Validate
- ✅ All REQUIRED fields present?
- ✅ All REQUIRED interfaces implemented?
- ✅ Return types match minimum requirements?
- ✅ Error handling consistent?
- ✅ Did you ADD necessary domain logic?

**Important:** The skeletons provide the MINIMUM. Your actual implementation should be RICHER with additional methods, fields, and logic specific to your domain.

---

## ✅ Validation Checklists

### For Tools (Minimum + Your Additions)
- [ ] Implements `Tool<TParams, TResult>` with ALL required fields
- [ ] Returns `ToolResult` with agentHints, data, metadata
- [ ] Zod schema for parameters validation
- [ ] Permissions array defined (can be empty)
- [ ] Category specified
- [ ] Examples provided
- [ ] **Your additions:** Domain-specific fields, caching logic, etc.

### For Events (Minimum + Your Additions)
- [ ] Extends `BaseEvent` with ALL required fields
- [ ] Event type is past tense
- [ ] All required metadata present (serviceName, version, environment, userId, correlationId)
- [ ] Payload follows appropriate pattern (Created/Updated/Deleted/StateChanged)
- [ ] Zod schema defined and validated
- [ ] Uses EventBuilder for creation
- [ ] **Your additions:** Domain-specific payload fields, compliance metadata, etc.

### For APIs (Minimum + Your Additions)
- [ ] All responses include AgentHints (NEVER omit!)
- [ ] All CRUD endpoints implemented (POST, GET, PATCH, DELETE)
- [ ] Pagination implemented for list endpoints
- [ ] All required error responses defined (400, 401, 404, 409, 429)
- [ ] Examples provided for all endpoints
- [ ] Health and readiness checks present
- [ ] **Your additions:** Batch operations, webhooks, custom endpoints, etc.

### For Services (Minimum + Your Additions)
- [ ] All CRUD operations implemented (create, read, update, delete)
- [ ] Batch operations where appropriate
- [ ] Returns `ServiceResult<T>` for all operations
- [ ] All validation methods present and called
- [ ] All business rule checks implemented
- [ ] All authorization checks present
- [ ] Events published for all state changes
- [ ] Errors handled consistently
- [ ] **Your additions:** Domain methods, caching, transactions, sagas, etc.

### For Agents (Minimum + Your Additions)
- [ ] execute() method as main entry point
- [ ] ReAct loop properly implemented (Reason → Act → Observe)
- [ ] Tools registered and validated before execution
- [ ] Full reasoning trace collected in steps array
- [ ] Confidence calculated (0.0 to 1.0)
- [ ] Cost and token usage tracked
- [ ] Factory provided for instantiation
- [ ] All error cases handled
- [ ] **Your additions:** Memory, multi-agent, RAG, specialized strategies, etc.

---

## 🚫 Critical Rules

### NEVER:
1. ❌ Skip ANY required fields from the minimum structure
2. ❌ Change the overall skeleton structure
3. ❌ Omit agentHints from tool/API responses
4. ❌ Skip validation steps
5. ❌ Skip event publishing on state changes
6. ❌ Use different error handling patterns than specified
7. ❌ Ignore the minimum requirements

### ALWAYS:
1. ✅ Include ALL required fields from skeleton (this is the MINIMUM)
2. ✅ ADD additional fields, methods, and logic as your domain requires
3. ✅ Follow the structure exactly for the minimum requirements
4. ✅ Extend beyond the minimum with domain-specific functionality
5. ✅ Validate inputs with Zod
6. ✅ Publish events on ALL state changes
7. ✅ Return agentHints in ALL tool/API responses
8. ✅ Handle errors consistently using the specified patterns
9. ✅ Document your additions to the skeleton

**Critical: These skeletons define MINIMUMS. Your implementations should be RICHER and MORE COMPLETE.**

---

## 📊 Summary Table

| Skeleton | Purpose | Size | Key Requirement | Extensibility |
|----------|---------|------|-----------------|---------------|
| MCP_TOOL_SPECIFICATION.md | Agent tools | 9KB | Always return agentHints | Add domain-specific tools, validation, caching |
| EVENT_SCHEMA_SPECIFICATION.md | Events | 11KB | Immutable, versioned, traceable | Add payload fields, compliance metadata |
| API_SPEC_SPECIFICATION.md | REST APIs | 28KB | Agent-friendly responses | Add endpoints, batch ops, webhooks |
| SERVICE_CLASS_SPECIFICATION.md | Services | 15KB | Consistent CRUD + events | Add domain methods, transactions, caching |
| AGENT_CLASS_SPECIFICATION.md | Agents | 18KB | ReAct pattern + traces | Add memory, multi-agent, RAG, strategies |

---

## 🎯 Benefits

1. **100% Consistency AT THE FOUNDATION**
   - Every service follows same MINIMUM patterns
   - Every agent follows same MINIMUM structure
   - Every API returns same MINIMUM format
   - But each can be EXTENDED with rich domain logic

2. **Easy Onboarding**
   - New developers see familiar MINIMUM structure
   - Clear separation between required and optional
   - "Start with minimum, add what you need"

3. **Quality Assurance**
   - All REQUIRED fields enforced
   - All REQUIRED methods present
   - All REQUIRED error handling in place
   - Additional validation and logic expected

4. **Agent-First Architecture**
   - Every API returns agentHints (REQUIRED)
   - Every tool guides next action (REQUIRED)
   - Agents can effectively orchestrate
   - Easy to add agent-specific enhancements

5. **Maintainability**
   - Easy to update MINIMUM patterns
   - Easy to find REQUIRED components
   - Easy to add features BEYOND minimum
   - Clear contract between services

---

## 💡 Pro Tips

1. **Understand minimum vs. complete**
   - Skeletons show MINIMUM REQUIRED structure
   - Your code should be RICHER with domain logic
   - Don't just meet minimum - exceed it thoughtfully

2. **Read TEMPLATES_README.md first**
   - Complete guide to all templates
   - Usage instructions
   - Validation checklists

3. **Don't copy-paste blindly**
   - Understand WHY each required field exists
   - Know WHAT you can add beyond minimum
   - Adapt and EXTEND for your specific needs

4. **Validate against minimums early**
   - Check required skeleton fields as you build
   - Don't wait until the end
   - Then add your domain-specific additions

5. **Look at examples**
   - See how existing code EXTENDS these skeletons
   - Learn from working implementations
   - Understand what was ADDED beyond minimum

6. **Keep templates updated**
   - If you find better MINIMUM patterns, update
   - If you add common EXTENSIONS, document
   - Share improvements with team

---

## 📞 Next Steps

1. **Read TEMPLATES_README.md** completely
2. **Study each skeleton** to understand MINIMUM structure
3. **Copy skeleton** when starting new work
4. **Replace placeholders** with your specifics
5. **ADD domain-specific logic** beyond the minimum
6. **Validate** against checklist (minimum requirements)
7. **Document** what you added beyond the skeleton
8. **Commit** when all checks pass

---

**CRITICAL REMINDER: These skeletons define the MINIMUM REQUIRED STRUCTURE for consistency. Your actual implementations should be RICHER, MORE COMPLETE, and DOMAIN-SPECIFIC while maintaining this foundational structure. Always add the additional fields, methods, validation, and business logic that your specific use case requires.**

**These skeletons are the foundation of consistency across Noema. Meet the minimums, then build up! 🚀**
