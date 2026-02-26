# Phase 9: MCP Tool Surface

## Objective

Implement the 19 MCP (Model Context Protocol) tools that expose the
knowledge-graph-service's capabilities to AI agents. MCP tools are the bridge
between autonomous agents and service functionality — agents discover tools via
a registry, invoke them with structured inputs, and receive structured outputs
with agent hints. After this phase, every agent in the Noema ecosystem can
programmatically interact with the knowledge graph.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then, based on the files with respective
specifications, help me with the implementation. The design process should
follow the principles in PROJECT_CONTEXT.md (APIs and schema first, follow the
microservices pattern, expose agent tools and interfaces for agents etc). If
there is any design decision you must take, first show me options with pros and
cons and ask me to choose.

Generate new code strictly in the existing project style and architecture, fully
conforming to current schemas, APIs, types, models, and patterns; maximize reuse
of existing implementations, favor additive and minimally invasive changes over
redesign or refactoring, and if you detect that modifying or breaking existing
behavior is unavoidable, trigger the harness to stop and explicitly ask for my
approval before proceeding; after implementation, resolve all errors, warnings,
and inconsistencies (including pre-existing ones), request clarification for any
architectural decisions, produce an ADR documenting the changes, and commit with
clear, structured messages.

I want you to make sure that no errors, or warnings or uncommited changes remain
in the codebase after your implementation. If you detect any, please ask me to
approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details about
the design decisions you have taken, and ask for my approval before proceeding.
If there are any design decisions that you are not sure about, please present me
with options and their pros and cons, and ask me to choose before proceeding.
let's make sure we are on the same page about the design before you start
implementing. we can do some banter about the design to make sure we are
aligned. be analytical, detailed, and thorough in your design explanations and
discussions.

I generally prefer more complex solutions than simpler ones, given that they are
more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I value
well-designed, robust solutions that fit seamlessly into the existing codebase,
even if they take more time to implement.

Always reason about the full system architecture before implementing anything.
Every feature touches multiple services, agents, and graph layers. Design
decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Context

The MCP Tool Contract Standard
(`docs/architecture/MCP_TOOL_CONTRACT_STANDARD.md`) defines the mandatory
structure for all tools in Noema:

- `IToolDefinition`: name, description, version, inputSchema (Zod), category,
  permissions, rateLimit, examples, deprecation info
- `IToolResult`: success (boolean), data, error, agentHints, executionTime,
  toolVersion
- Tool Registry: a central registry where all tools self-register and can be
  discovered by agents

The Agent MCP Tool Registry (`docs/architecture/AGENT_MCP_TOOL_REGISTRY.md`)
lists 19 tools that the knowledge-graph-service must expose. Study the
content-service's tool implementations (17 tools) for the exact patterns.

### Why MCP tools in addition to REST?

REST routes serve external clients (web/mobile apps, other services calling via
HTTP). MCP tools serve AI agents. The distinction matters because:

- Agents discover tools dynamically (they query the registry)
- Agent inputs/outputs include richer metadata (agent hints, confidence scores)
- Tool descriptions are written for LLM consumption (natural language, examples)
- Tools may combine multiple REST operations into a single agent-friendly action
- Rate limiting and authorization may differ for agent vs. human callers

---

## Task 1: Implement PKG tools

### kg_get_concept_node

- **Purpose**: retrieve a single concept node from a user's PKG with full
  details and contextual agent hints
- **Input**: userId, nodeId
- **Output**: the node data plus hints about its neighborhood (connected nodes,
  edge count, centrality estimate)
- **Agent use case**: agents fetching current state of a concept before making
  decisions about it

### kg_get_subgraph

- **Purpose**: retrieve a subgraph centered on a node, within a depth limit
- **Input**: userId, rootNodeId, maxDepth (default 3), edgeTypeFilter
  (optional), direction (optional)
- **Output**: ISubgraph (nodes + edges) plus hints about the subgraph's
  structure (density, hub nodes, leaf nodes, disconnected components)
- **Agent use case**: the learning agent getting context about a concept's
  neighborhood to plan a study session

### kg_find_prerequisites

- **Purpose**: specialized traversal that follows only `prerequisite` edges to
  find all prerequisites of a concept, ordered by depth
- **Input**: userId, nodeId, maxDepth (default 5)
- **Output**: ordered list of prerequisite nodes, with the depth at which each
  was found, plus hints about prerequisite chain quality (are there gaps? are
  there extremely long chains?)
- **Agent use case**: the strategy agent verifying that a user has the
  prerequisites before scheduling a new topic

### kg_find_related_concepts

- **Purpose**: find concepts related to a given concept via any edge type,
  ranked by relevance (edge weight × edge type significance)
- **Input**: userId, nodeId, limit (default 10)
- **Output**: ranked list of related nodes with relationship type and strength,
  plus hints about cluster membership and potential missing connections
- **Agent use case**: the content-generation agent finding related concepts to
  create linking exercises

### kg_add_concept_node

- **Purpose**: add a new concept node to a user's PKG
- **Input**: userId, label, nodeType, domain, description (optional), properties
  (optional)
- **Output**: the created node, plus hints about duplicate risk (similar labels
  in the same domain), suggested edges to existing concepts
- **Agent use case**: the ingestion agent creating graph structure from newly
  ingested content

### kg_add_edge

- **Purpose**: add an edge between two nodes in a user's PKG, with full
  EDGE_TYPE_POLICIES validation
- **Input**: userId, sourceNodeId, targetNodeId, edgeType, weight (optional),
  skipAcyclicityCheck (optional, defaults false)
- **Output**: the created edge, plus hints about the structural impact (did this
  edge change the graph's connectivity? create a new cluster? extend a
  prerequisite chain?)
- **Agent use case**: the knowledge-graph agent building structure after
  analyzing user study patterns

### kg_update_mastery

- **Purpose**: update the mastery level of a specific node in the user's PKG
- **Input**: userId, nodeId, masteryLevel (number 0-1), source (what evidence
  this mastery update is based on — e.g., "session_performance", "quiz_result",
  "calibration_update")
- **Output**: updated node, plus hints about mastery progression trend, related
  nodes that might also need mastery updates
- **Agent use case**: the calibration agent updating mastery levels after spaced
  repetition review

### kg_remove_node

- **Purpose**: soft-delete a node from the user's PKG
- **Input**: userId, nodeId, reason (why the node is being removed)
- **Output**: confirmation plus hints about orphaned edges, connected nodes that
  may now be disconnected
- **Agent use case**: the governance agent cleaning up deprecated or merged
  concepts

### kg_remove_edge

- **Purpose**: remove an edge between two nodes
- **Input**: userId, edgeId, reason
- **Output**: confirmation plus hints about connectivity changes (did removing
  this edge disconnect a subgraph?)
- **Agent use case**: the knowledge-graph agent correcting structural errors

---

## Task 2: Implement CKG tools

### kg_get_canonical_structure

- **Purpose**: retrieve the canonical (CKG) structure for a domain or concept
  area
- **Input**: domain (optional), rootNodeId (optional), maxDepth (default 3)
- **Output**: CKG subgraph plus hints about how many users' PKGs align with this
  structure, areas of high divergence
- **Agent use case**: agents comparing a user's PKG against the canonical
  structure

### kg_propose_mutation

- **Purpose**: propose a structural change to the CKG via the mutation pipeline
- **Input**: operations (array of DSL operations), rationale (natural language
  explanation), evidence (optional aggregation references)
- **Output**: mutationId, initial state (PROPOSED), estimated validation time,
  hints about similar pending mutations and potential conflicts
- **Agent use case**: the knowledge-graph agent or aggregation pipeline
  proposing structural improvements to the canonical graph

### kg_get_mutation_status

- **Purpose**: check the current status of a CKG mutation
- **Input**: mutationId
- **Output**: full mutation state, validation results (if available), audit
  trail, hints about pipeline throughput and expected resolution time
- **Agent use case**: agents polling for mutation completion

---

## Task 3: Implement structural analysis tools

### kg_compute_structural_metrics

- **Purpose**: trigger computation of all 11 structural metrics for a user's PKG
  in a domain
- **Input**: userId, domain
- **Output**: full IStructuralMetrics snapshot, comparison with previous
  snapshot (delta), hints about which metrics need attention and what actions
  might improve them
- **Agent use case**: the diagnostic agent running a periodic structural health
  check

### kg_get_structural_health

- **Purpose**: get a high-level "structural health report" combining the latest
  metrics with interpretive analysis
- **Input**: userId, domain
- **Output**: overall health score (composite of metrics), per-metric status
  (healthy/warning/critical), trend direction (improving/stable/declining),
  hints with specific recommendations
- **Agent use case**: the strategy agent deciding whether to focus the user on
  structural remediation vs. new content

### kg_detect_misconceptions

- **Purpose**: run the misconception detection engine against a user's PKG
- **Input**: userId, domain (optional — all domains if omitted)
- **Output**: array of detected misconceptions with type, confidence, affected
  nodes, suggested interventions, hints about priority (which misconception to
  address first based on impact)
- **Agent use case**: the diagnostic agent running misconception analysis

### kg_suggest_intervention

- **Purpose**: given a detected misconception, suggest the most appropriate
  intervention strategy
- **Input**: userId, misconceptionType, affectedNodeIds
- **Output**: ranked list of intervention templates with rationale for each,
  estimated effectiveness, hints about the user's metacognitive stage (which
  determines how interventions should be framed)
- **Agent use case**: the socratic-tutor agent or content-generation agent
  choosing how to address a misconception

---

## Task 4: Implement metacognitive tools

### kg_get_metacognitive_stage

- **Purpose**: determine the user's current metacognitive stage for a domain or
  specific graph region
- **Input**: userId, domain
- **Output**: current MetacognitiveStage, evidence supporting the assessment,
  proximity to next stage transition, hints about what the user needs to
  demonstrate for progression
- **Agent use case**: any agent that adapts its behavior based on the user's
  metacognitive maturity

### kg_get_learning_path_context

- **Purpose**: comprehensive context dump for agents planning learning
  activities — combines structural metrics, misconceptions, metacognitive stage,
  and graph topology into a single rich response
- **Input**: userId, domain, focusNodeId (optional — if the agent is planning
  around a specific concept)
- **Output**: combined context including: structural metrics, active
  misconceptions, metacognitive stage, relevant subgraph, mastery levels of
  related concepts, hints that synthesize all of this into actionable
  recommendations
- **Agent use case**: the strategy agent or learning agent getting full context
  before planning a session. This is the "one call to rule them all" tool that
  saves agents from making 5+ separate tool calls.

---

## Task 5: Create the tool registry

Create a tool registry module that:

- Registers all 19 tool definitions with their IToolDefinition metadata
- Exposes a `GET /api/v1/tools` endpoint that returns the registry (for agent
  discovery)
- Exposes a `POST /api/v1/tools/:toolName/execute` endpoint that dispatches tool
  invocations to the appropriate handler

Follow the content-service tool registry pattern exactly. Each tool must have:

- A unique name (the `kg_xxx` names listed above)
- A semver version (start at 1.0.0)
- A category (pkg, ckg, analysis, metacognitive)
- A description written for LLM consumption (clear, concise, explains when to
  use the tool and what it returns)
- An input schema (Zod) that validates parameters
- Permission requirements (which agent roles can call this tool)
- Rate limit configuration
- At least one example invocation with expected output shape

---

## Task 6: Implement tool route handlers

Create route handlers at `src/agents/tools/` that bridge between the tool
registry and the service layer. Each handler:

1. Validates the input against the tool's Zod schema
2. Authenticates the calling agent
3. Calls the appropriate KnowledgeGraphService method(s)
4. Computes tool-specific agent hints (may augment the service-level hints with
   tool-level context)
5. Returns IToolResult with success/error, data, and hints

### Why separate tool handlers from REST route handlers?

Despite calling the same service methods, tool handlers and REST handlers have
different concerns:

- Tool handlers include richer agent hints (because the consumer is an agent,
  not a UI)
- Tool handlers may compose multiple service calls (like
  `kg_get_learning_path_context` which calls metrics + misconceptions + graph +
  metacognitive stage)
- Tool handlers have tool-specific rate limits and permissions
- Tool handlers return `IToolResult` format, not the REST response envelope

---

## Checklist

- [ ] 9 PKG tools implemented (get_concept_node, get_subgraph,
      find_prerequisites, find_related_concepts, add_concept_node, add_edge,
      update_mastery, remove_node, remove_edge)
- [ ] 3 CKG tools implemented (get_canonical_structure, propose_mutation,
      get_mutation_status)
- [ ] 4 structural analysis tools implemented (compute_structural_metrics,
      get_structural_health, detect_misconceptions, suggest_intervention)
- [ ] 2 metacognitive tools implemented (get_metacognitive_stage,
      get_learning_path_context)
- [ ] All 19 tools registered in the tool registry with IToolDefinition
- [ ] GET /api/v1/tools endpoint for agent discovery
- [ ] POST /api/v1/tools/:toolName/execute endpoint for invocation
- [ ] Each tool has Zod input validation, permission checks, rate limits
- [ ] Each tool returns IToolResult with data and contextual agentHints
- [ ] Each tool has at least one example in its definition
- [ ] Tool descriptions are LLM-friendly (clear when-to-use guidance)
- [ ] `pnpm typecheck` passes
