# Agent Class Specification

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Category:** LLM Agents / ReAct Pattern

---

## Purpose

This specification defines the REQUIRED structure for all LLM agent classes in
Noema. All agents MUST conform to this specification to ensure consistent ReAct
pattern implementation, complete reasoning traces, and proper observability.

---

## Context

Noema has 10 LLM agents that perform various tasks:

- Learning Agent (next card selection)
- Diagnostic Agent (learning pattern analysis)
- Strategy Agent (learning strategy adjustment)
- Content Generation Agent (card creation)
- Socratic Tutor Agent (guided questioning)
- Calibration Agent (self-assessment)
- Ingestion Agent (content processing)
- Knowledge Graph Agent (concept linking)
- Taxonomy Curator Agent (category organization)
- Governance Agent (quality control)

All agents must follow ReAct pattern (Reason → Act → Observe), produce complete
reasoning traces, and provide cost/performance metrics.

---

**Note:** This is the MINIMUM agent structure. Add domain-specific reasoning
strategies, multi-agent collaboration, memory systems, specialized tool
execution patterns, advanced prompt engineering, retrieval-augmented generation,
chain-of-thought variations, or any agentic behaviors your use case requires.

---

## Decision

All agent classes MUST implement the following structure.

---

## REQUIRED: Class Structure

### File Location

`src/agents/{agent-name}/{agent-name}.agent.ts`

### Class Declaration

```typescript
export class {Agent}Agent {
  // Implementation
}
```

---

## REQUIRED: Class Properties

### 1. Configuration (REQUIRED)

```typescript
private readonly config: {Agent}Config
```

**Requirements:**

- Holds LLM settings, behavior, tools, prompts
- Immutable after construction
- Type-safe configuration object

### 2. LLM Instance (REQUIRED)

```typescript
private readonly llm: ChatOpenAI | ChatAnthropic
```

**Requirements:**

- Configured LLM client
- Supports streaming (optional)
- Proper error handling

### 3. Tool Registry (REQUIRED)

```typescript
private readonly tools: ToolRegistry
```

**Requirements:**

- Access to all available tools
- Tool validation capabilities
- Tool execution methods

### 4. Prompt Store (REQUIRED)

```typescript
private readonly prompts: PromptStore
```

**Requirements:**

- Versioned prompts
- Template rendering
- Few-shot examples

### 5. Logger (REQUIRED)

```typescript
private readonly logger: Logger
```

**Requirements:**

- Child logger with agent name
- Structured logging
- Trace ID propagation

### 6. Version (REQUIRED)

```typescript
private readonly version: string = '1.0.0'
```

**Requirements:**

- Semantic versioning
- Included in all outputs
- Tracked in metadata

---

## REQUIRED: Constructor

### Signature

```typescript
constructor(
  config: {Agent}Config,
  tools: ToolRegistry,
  prompts: PromptStore,
  logger: Logger,
  // Additional dependencies as needed
)
```

**Requirements:**

- Accept all required dependencies
- Validate configuration
- Initialize LLM client
- Register tools
- Create child logger

---

## REQUIRED: Public Methods

### execute() - Main Entry Point

```typescript
async execute(
  input: {Agent}Input,
  context: {Agent}Context,
): Promise<{Agent}Output>
```

**Requirements:**

- ONLY public method exposed
- Validates input
- Executes agent loop
- Returns complete output with reasoning trace
- Handles all errors
- Calculates metrics

**Flow:**

1. Validate input with validateInput()
2. Build system prompt with buildSystemPrompt()
3. Execute agent loop with executeAgentLoop()
4. Calculate confidence with calculateConfidence()
5. Extract metrics (tools used, tokens, cost)
6. Build output with reasoning trace
7. Handle errors gracefully
8. Return AgentOutput

**MUST return AgentOutput structure** (see below)

---

## REQUIRED: Private Methods - ReAct Pattern

### executeAgentLoop()

```typescript
private async executeAgentLoop(
  systemPrompt: string,
  input: {Agent}Input,
  context: {Agent}Context,
  reasoning: ReasoningStep[],
): Promise<{ResultType}>
```

**Requirements:**

- Implements ReAct pattern: Reason → Act → Observe
- Maintains reasoning array
- Enforces max iterations
- Enforces timeout
- Handles tool execution
- Returns final result

**Algorithm:**

```
Initialize reasoning steps array
For iteration = 1 to maxIterations:
  1. REASON: Call LLM to think about what to do
  2. Parse response to extract thought and action
  3. Add reasoning step (thought)

  If action present:
    4. ACT: Execute tool via executeAction()
    5. OBSERVE: Format tool result via formatObservation()
    6. Add to reasoning (action + observation)

  If final answer in response:
    7. Extract result via extractFinalAnswer()
    8. Return result

  If timeout:
    9. Return partial result or error

Throw MaxIterationsError if loop completes
```

### buildSystemPrompt()

```typescript
private async buildSystemPrompt(
  input: {Agent}Input,
  context: {Agent}Context,
): Promise<string>
```

**Requirements:**

- Define agent role and capabilities
- Include available tools with descriptions
- Specify output format (thought/action/observation)
- Include few-shot examples (if configured)
- Include constraints (budget, timeout)
- Use prompt template from PromptStore

**Format:**

```
You are a {AgentRole}. Your capabilities: {capabilities}.

Available Tools:
- {tool1}: {description}
- {tool2}: {description}

Instructions:
1. Think step by step
2. Use tools when needed
3. Respond in this format:
   Thought: {your reasoning}
   Action: {tool_name}
   Action Input: {json_input}
   OR
   Final Answer: {result}

Examples:
{few_shot_examples}

Current Task: {input}
```

### executeAction()

```typescript
private async executeAction(
  action: { tool: string; input: unknown },
  context: {Agent}Context,
): Promise<unknown>
```

**Requirements:**

- Validate tool exists in registry
- Check tool is enabled
- Validate tool input
- Execute tool handler
- Measure execution time
- Log tool call
- Handle tool errors
- Return tool result
- **Extract and utilize AgentHints from tool response**
  - Tool responses include enhanced AgentHints (v2.0.0)
  - Use hints to guide next reasoning steps
  - Consider sourceQuality when evaluating results
  - Respect validityPeriod for caching decisions
  - Factor in riskFactors for decision making
  - Follow dependencies in action sequencing
  - Use estimatedImpact for prioritization

### parseResponse()

```typescript
private parseResponse(
  content: string,
): {
  thought: string;
  action?: { tool: string; input: unknown };
  done: boolean;
  result?: any;
}
```

**Requirements:**

- Extract thought from response
- Extract action if present (tool name + input)
- Determine if task is done (Final Answer present)
- Extract final result if done
- Handle malformed responses
- Return structured object

**Must parse formats like:**

```
Thought: I need to get the card details
Action: get-card
Action Input: { "cardId": "card_123" }

OR

Thought: I have all the information
Final Answer: { ... }
```

---

## REQUIRED: Private Methods - Validation & Error Handling

### validateInput()

```typescript
private validateInput(
  input: {Agent}Input,
): void
```

**Requirements:**

- Validate all required fields
- Check field types
- Verify constraints
- Throw ValidationError if invalid

### handleError()

```typescript
private handleError(
  error: unknown,
): AgentError
```

**Requirements:**

- Convert exceptions to AgentError
- Categorize error types
- Include stack trace for internal errors
- Mark as recoverable/non-recoverable
- MUST NOT leak sensitive information

### isTimeout()

```typescript
private isTimeout(
  context: {Agent}Context,
): boolean
```

**Requirements:**

- Check elapsed time against timeout
- Return true if exceeded
- Used in agent loop to break early

---

## REQUIRED: Private Methods - Metrics & Analysis

### calculateConfidence()

```typescript
private calculateConfidence(
  result: any,
  reasoning: ReasoningStep[],
): number
```

**Requirements:**

- Return 0.0 to 1.0
- Based on reasoning quality
- Consider number of iterations
- Consider tool results
- Consider LLM confidence (if available)

**Factors:**

- Few iterations = higher confidence
- Successful tool calls = higher confidence
- Consistent reasoning = higher confidence
- Contradictions = lower confidence

### extractToolsUsed()

```typescript
private extractToolsUsed(
  reasoning: ReasoningStep[],
): string[]
```

**Requirements:**

- Parse reasoning steps
- Extract tool names used
- Return unique list
- Maintain order of first use

### extractTokenUsage()

```typescript
private extractTokenUsage(
  reasoning: ReasoningStep[],
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

**Requirements:**

- Sum tokens from all LLM calls
- Include prompt and completion separately
- Return total

### calculateCost()

```typescript
private calculateCost(
  reasoning: ReasoningStep[],
): number
```

**Requirements:**

- Calculate based on model pricing
- Use token usage from extractTokenUsage()
- Return cost in dollars
- Account for different models

**Pricing (example):**

- GPT-4: $0.03 per 1K prompt tokens, $0.06 per 1K completion
- Claude: $0.008 per 1K prompt tokens, $0.024 per 1K completion

### extractDecision()

```typescript
private extractDecision(
  reasoning: ReasoningStep[],
): string
```

**Requirements:**

- Summarize the reasoning process
- Extract key decision points
- Return human-readable string

---

## REQUIRED: Private Methods - Helpers

### formatInput()

```typescript
private formatInput(
  input: {Agent}Input,
): string
```

**Requirements:**

- Convert input to string for prompt
- Include all relevant fields
- Format for readability
- Handle complex objects

### formatObservation()

```typescript
private formatObservation(
  result: unknown,
): string
```

**Requirements:**

- Convert tool result to string
- Format for LLM consumption
- Truncate if too long
- Handle errors in results

### formatToolDescription()

```typescript
private formatToolDescription(
  tool: Tool,
): string
```

**Requirements:**

- Extract tool name and description
- Include parameters
- Include examples
- Format for system prompt

### extractThought()

```typescript
private extractThought(
  content: string,
): string
```

**Requirements:**

- Extract text after "Thought:"
- Stop at "Action:" or "Final Answer:"
- Trim whitespace
- Handle missing thought

### extractAction()

```typescript
private extractAction(
  content: string,
): { tool: string; input: unknown } | undefined
```

**Requirements:**

- Extract tool name after "Action:"
- Extract JSON after "Action Input:"
- Parse JSON safely
- Return undefined if no action

### extractFinalAnswer()

```typescript
private extractFinalAnswer(
  content: string,
): any
```

**Requirements:**

- Extract content after "Final Answer:"
- Parse as JSON if possible
- Return raw string if not JSON
- Handle missing final answer

---

## REQUIRED: Configuration Interface

### {Agent}Config

```typescript
interface {Agent}Config {
  llm: {
    model: string;           // REQUIRED: "gpt-4-turbo-preview"
    temperature: number;     // REQUIRED: 0.0 to 1.0
    maxTokens: number;       // REQUIRED: Max completion tokens
    topP?: number;           // OPTIONAL: 0.0 to 1.0
  };

  behavior: {
    maxIterations: number;   // REQUIRED: e.g., 10
    timeoutMs: number;       // REQUIRED: e.g., 30000
    retryAttempts: number;   // REQUIRED: e.g., 3
  };

  enabledTools: string[];    // REQUIRED: Array of tool names

  prompts: {
    systemPromptVersion: string;  // REQUIRED: "1.0.0"
    fewShotExamples: boolean;     // REQUIRED: Include examples?
  };

  tracing: {
    enabled: boolean;        // REQUIRED: Enable tracing?
    sampleRate: number;      // REQUIRED: 0.0 to 1.0
  };
}
```

---

## REQUIRED: Input Interface

### {Agent}Input

```typescript
interface {Agent}Input {
  // Agent-specific input fields
  // Examples:

  // For Learning Agent
  userId: string;
  deckId: string;
  sessionMode: 'exploration' | 'goal-driven' | 'exam' | 'synthesis';

  // For Content Generation Agent
  topic: string;
  cardType: 'atomic' | 'cloze' | 'image_occlusion';
  count: number;

  // Common fields
  constraints?: {
    maxTime?: number;
    maxCost?: number;
    requiredQuality?: number;
  };

  context?: Record<string, unknown>;
}
```

**Requirements:**

- Define all required inputs
- Include optional constraints
- Extensible context field
- Validated in validateInput()

---

## REQUIRED: Context Interface

### {Agent}Context

```typescript
interface {Agent}Context {
  userId: string;            // REQUIRED
  sessionId?: string;        // OPTIONAL
  correlationId: string;     // REQUIRED
  traceId: string;           // REQUIRED
  timestamp: Date;           // REQUIRED

  budget?: {
    maxCost: number;         // Dollars
    maxTime: number;         // Milliseconds
  };

  metadata?: Record<string, unknown>;
}
```

**Requirements:**

- Contains execution context
- Used for authorization
- Used for tracing
- Used for budget enforcement
- Passed to all tool executions

---

## REQUIRED: Output Interface

### {Agent}Output

```typescript
interface {Agent}Output {
  success: boolean;                     // REQUIRED

  result?: {ResultType};                // REQUIRED if success

  error?: AgentError;                   // REQUIRED if !success

  reasoning: AgentReasoning;            // REQUIRED (never omit)

  metadata: AgentExecutionMetadata;     // REQUIRED
}
```

### AgentReasoning (REQUIRED)

```typescript
interface AgentReasoning {
  steps: ReasoningStep[]; // REQUIRED: Full trace
  decision: string; // REQUIRED: Summary
  confidence: number; // REQUIRED: 0.0 to 1.0

  // Enhanced fields (v2.0.0) - included in reasoning output
  sourceQuality?: 'high' | 'medium' | 'low' | 'unknown';
  contextUsed?: string[]; // What context was available
  assumptionsMade?: string[]; // Assumptions during reasoning
  alternatives?: Alternative[]; // Alternative approaches considered
}
```

### ReasoningStep (REQUIRED)

```typescript
interface ReasoningStep {
  step: number; // REQUIRED: Step index
  thought: string; // REQUIRED: What agent thought
  action?: {
    // OPTIONAL: If tool called
    tool: string;
    input: unknown;
    output: unknown;
  };
  observation?: string; // OPTIONAL: Tool result
  timestamp: string; // REQUIRED: ISO 8601
}
```

### AgentExecutionMetadata (REQUIRED)

```typescript
interface AgentExecutionMetadata {
  executionTime: number; // REQUIRED: Milliseconds
  iterations: number; // REQUIRED: Loop iterations
  toolsUsed: string[]; // REQUIRED: Tools called
  tokenUsage: {
    // REQUIRED
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number; // REQUIRED: Dollars
  model: string; // REQUIRED: LLM model used
  agentVersion: string; // REQUIRED: Agent version
}
```

### AgentError (REQUIRED for failures)

```typescript
interface AgentError {
  code: string; // REQUIRED: Error code
  message: string; // REQUIRED: Human-readable
  details?: unknown; // OPTIONAL: Additional context
  recoverable: boolean; // REQUIRED: Can retry?
}
```

### Alternative (OPTIONAL)

```typescript
interface Alternative {
  approach: string; // Alternative approach description
  confidence: number; // 0.0 to 1.0
  reasoning: string; // Why this alternative exists
  pros?: string[]; // Advantages
  cons?: string[]; // Disadvantages
  estimatedImpact?: number; // 0.0 to 1.0 - expected impact if chosen
}
```

**Note:** This structure aligns with the Alternative schema in enhanced
AgentHints (v2.0.0)

---

## ReAct Pattern Requirements

### MUST Implement

The agent loop MUST follow this pattern:

```
1. REASON
   - LLM generates thought about what to do
   - Thought added to reasoning trace

2. ACT (if needed)
   - LLM specifies tool to call
   - Tool executed with validated input
   - Action added to reasoning trace

3. OBSERVE
   - Tool result formatted as observation
   - Observation added to reasoning trace

4. REPEAT
   - Loop continues until:
     a) Final answer reached
     b) Max iterations exceeded
     c) Timeout exceeded
     d) Error occurred
```

### Reasoning Trace

MUST capture:

- Every thought
- Every action (tool + input + output)
- Every observation
- Timestamp for each step
- Step number

**Purpose:**

- Debugging agent behavior
- Understanding decision-making
- Improving prompts
- Analyzing performance

---

## Factory Pattern (REQUIRED)

### {Agent}AgentFactory

```typescript
class {Agent}AgentFactory {
  static create(
    config?: Partial<{Agent}Config>,
  ): {Agent}Agent {
    const defaultConfig = {
      llm: {
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
      },
      behavior: {
        maxIterations: 10,
        timeoutMs: 30000,
        retryAttempts: 3,
      },
      enabledTools: [...],
      prompts: {
        systemPromptVersion: '1.0.0',
        fewShotExamples: true,
      },
      tracing: {
        enabled: true,
        sampleRate: 1.0,
      },
    };

    const mergedConfig = { ...defaultConfig, ...config };

    return new {Agent}Agent(
      mergedConfig,
      toolRegistry,
      promptStore,
      logger,
    );
  }
}
```

**Requirements:**

- Provide sensible defaults
- Allow partial overrides
- Inject dependencies
- Return configured agent

---

## Error Handling Requirements

### Exception Types

Agents MUST handle:

- **ValidationError**: Invalid input
- **TimeoutError**: Execution timeout
- **MaxIterationsError**: Too many loops
- **ToolExecutionError**: Tool failed
- **LLMError**: LLM API failed
- **ParseError**: Response malformed

### Error Recovery

Agents MUST:

- Retry LLM calls (with backoff)
- Retry tool calls (if idempotent)
- Degrade gracefully
- Return partial results when possible
- Include error in AgentError structure

---

## Logging Requirements

### MUST Log

- Agent execution started
- Each reasoning step (thought/action/observation)
- Tool executions
- Errors
- Agent execution completed
- Metrics (tokens, cost, time)

### Log Format

Include:

- Agent name
- Agent version
- User ID
- Correlation ID
- Trace ID
- Step number

---

## Observability Requirements

### Metrics (REQUIRED)

Emit:

- Execution count
- Success rate
- Average execution time
- Average iterations
- Average cost
- Tool usage distribution
- Error rate by type

### Tracing (REQUIRED)

- Propagate traceId through all operations
- Link LLM calls to trace
- Link tool calls to trace
- Enable distributed tracing

---

## Testing Requirements

### Unit Tests (REQUIRED)

Test:

- Input validation
- System prompt building
- Response parsing
- Tool execution
- Error handling
- Confidence calculation
- Metrics extraction

Mock:

- LLM (return predefined responses)
- Tools (return test data)
- Prompt store

### Integration Tests (REQUIRED)

Test:

- Full ReAct loop with real LLM
- Real tool execution
- Reasoning trace completeness
- Timeout handling
- Max iterations handling

---

## Budget Enforcement Requirements

### Time Budget

If context.budget.maxTime provided:

- Check elapsed time each iteration
- Break loop if exceeded
- Return partial result with TimeoutError

### Cost Budget

If context.budget.maxCost provided:

- Track cumulative cost
- Check before each LLM call
- Stop if budget exceeded
- Return partial result with BudgetExceededError

---

## Compliance Checklist

Before deploying an agent:

- [ ] Class follows naming convention
- [ ] All required properties defined
- [ ] execute() method implemented
- [ ] executeAgentLoop() implements ReAct
- [ ] buildSystemPrompt() creates proper prompt
- [ ] parseResponse() handles all formats
- [ ] executeAction() validates and executes tools
- [ ] All validation methods present
- [ ] All error handling methods present
- [ ] All metrics methods present
- [ ] All helper methods present
- [ ] Reasoning trace collected completely
- [ ] Confidence calculated
- [ ] Cost calculated
- [ ] Token usage tracked
- [ ] Factory class provided
- [ ] Logging implemented
- [ ] Metrics emitted
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests written
- [ ] Timeout handling works
- [ ] Max iterations handling works
- [ ] Budget enforcement works (if applicable)

---

## Performance Considerations

### Optimization Opportunities

- Cache system prompts
- Reuse tool descriptions
- Batch tool calls when possible
- Stream LLM responses
- Parallel tool execution (when independent)

### Avoid

- Synchronous external calls in tools
- Large context windows unnecessarily
- Redundant tool calls
- Excessive iterations

---

## Consequences

### Benefits

- ✅ Consistent agent behavior
- ✅ Complete reasoning transparency
- ✅ Easy debugging
- ✅ Accurate cost tracking
- ✅ Reproducible results
- ✅ Observable and traceable

### Drawbacks

- ⚠️ More complex than direct LLM calls
- ⚠️ Reasoning trace storage overhead
- ⚠️ Performance overhead from loop

### Mitigation

- Optimize system prompts
- Limit max iterations appropriately
- Use caching for repeated queries
- Compress reasoning traces for storage

---

## References

- ReAct Pattern: https://arxiv.org/abs/2210.03629
- **Enhanced AgentHints v2.0.0**: See ENHANCED_AGENT_HINTS.ts for complete
  structure
- Tool Specification: See MCP_TOOL_SPECIFICATION.md
- Event Schema: See EVENT_SCHEMA_SPECIFICATION.md
- Design Patterns: See DESIGN_PATTERNS_FOR_NOEMA.md

---

## Changelog

- 1.0.0 (2024-01-15): Initial specification
