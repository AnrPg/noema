# ADR-0053: Mode-Aware Dual-Use Learning Core

## Status

Accepted

## Date

2026-03-27

## Context

Noema must now support two equally important product uses:

- language learning
- sciences/facts/new knowledge acquisition

The current architecture already has strong, durable foundations:

- a PKG/CKG split for user-specific and canonical structure
- cards stored independently from graph structure and linked via node IDs
- shared scheduler/session infrastructure
- graph-centric structural and pedagogical features

However, the current system implicitly assumes one dominant interpretation of
learning structure. That creates two opposite failure modes:

1. Force language learning into the current concept-centric graph semantics.
   - This would flatten lexical, grammatical, and interference structure into a
     model optimized for conceptual prerequisite reasoning.
2. Redesign the app around language learning and treat sciences/facts as a
   secondary use case.
   - This would destabilize the current architecture and push the existing
     knowledge graph model into an awkward compatibility role.

Neither option is acceptable. Both uses must remain first-class, and the
architecture must scale beyond these two without repeatedly splitting the
platform.

The system therefore needs a new cross-cutting abstraction that:

- preserves one shared platform core
- allows different learning semantics
- keeps progress and scheduling context-specific
- avoids duplicate subsystems and duplicated data models

## Decision

Adopt a **mode-aware shared core**.

### 1) Introduce `LearningMode` as a first-class domain concept

Noema will introduce:

```ts
type LearningMode = 'language_learning' | 'knowledge_gaining';
```

This concept becomes first-class across:

- shared types
- validation
- API contracts
- events
- repositories
- analytics
- frontend application state

### 2) Keep one shared platform substrate

The following remain shared:

- PKG/CKG substrate
- card archive
- scheduler and session architecture
- authenticated app shell
- analytics and metacognition pipeline

We explicitly reject:

- separate apps
- separate graph systems
- separate scheduler stacks
- separate card archives

### 3) Allow shared item identity, but require mode-scoped memory state

Nodes and cards may participate in one or both modes. However:

- attempts are mode-scoped
- schedule state is mode-scoped
- mastery is mode-scoped
- remediation and misconception history are mode-scoped
- analytics default to mode-scoped views

Shared identity must never imply shared memory state.

### 4) Treat modes as operating contexts, not taxonomic silos

Modes do not define different databases or incompatible ontologies. They define:

- interpretation lens
- policy defaults
- generation strategy
- scheduling behavior
- analytics scope

This preserves architectural continuity while allowing differentiated behavior.

## Rationale

### Why a mode-aware shared core instead of separate platforms

- The current Noema architecture already has the right high-level separations:
  graph, content, scheduler, session.
- Duplicating those stacks per mode would create long-term drift and major
  maintenance burden.
- Shared substrate allows one identity model and one ecosystem of tools,
  services, and analytics.

### Why mode must be explicit rather than inferred from domain strings or tags

- Inference would be fragile and inconsistent.
- Scheduling and mastery semantics are too important to depend on heuristic
  classification.
- Explicit `LearningMode` creates stable contracts and testable invariants.

### Why multi-mode membership is allowed

- Some items naturally span both contexts.
- Preventing multi-mode membership would force unnecessary duplication and make
  cross-context authoring awkward.
- The real boundary is not identity; it is progress and interpretation.

## Alternatives Considered

| Option                                                    | Pros                                      | Cons                                                                    | Rejected because                                               |
| --------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Two separate apps or subsystems                           | Strong separation, easier local reasoning | Duplicate architecture, duplicate data, drift risk, weak shared tooling | It destroys platform coherence and makes future domains harder |
| Force language learning into current graph semantics only | Minimal change                            | Language becomes distorted and second-class                             | It fails the product requirement that both uses matter equally |
| Language-first redesign of the whole platform             | Rich language support                     | Destabilizes existing knowledge architecture and demotes sciences/facts | It overfits one use case                                       |
| Infer mode from domains/tags                              | Less explicit API churn                   | Unstable, ambiguous, dangerous for scheduling/mastery                   | Core state cannot depend on heuristics                         |

## Consequences

### Positive

- both learning uses remain first-class
- the platform keeps one architectural core
- future domain packs become easier to add
- scheduling and mastery semantics become explicit and testable
- graph, content, and session tooling stay unified

### Negative / trade-offs

- almost every cross-service contract will gain a mode field or mode-aware
  semantics
- repository and analytics logic become more careful
- frontend workflows need clearer context signaling
- rollout requires compatibility handling for existing data

### Follow-up tasks created

- add `LearningMode` to shared types and validation
- make scheduler/session/mastery state mode-scoped
- add global active mode to frontend and user preferences
- add mode-aware graph and batch-generation guides
- define migration strategy for legacy data

## References

- `architecture.md`
- `module-graph.md`
- `docs/architecture/decisions/ADR-0010-content-domain-and-knowledge-graph-integration.md`
- `docs/architecture/decisions/ADR-0029-scheduler-fsrs-hlr-runtime-integration-phase-3.md`
- `docs/PROJECT_CONTEXT.md`
