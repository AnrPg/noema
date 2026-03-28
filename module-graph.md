# Mode-Aware Module Graph

```mermaid
flowchart TD
  subgraph UI["UI / Frontend"]
    Shell["Authenticated Shell\n(global learning mode toggle)"]
    WebPages["Web Pages / Workspaces"]
    GraphLens["Knowledge Map Lenses"]
    CardFlows["Card + Batch Flows"]
  end

  subgraph App["Application Layer / Clients"]
    ApiClient["API Client Packages"]
    UseCases["Application Use-Cases\n(mode defaulting + orchestration)"]
  end

  subgraph Domain["Core Services"]
    KG["Knowledge Graph Service"]
    Content["Content Service"]
    Scheduler["Scheduler Service"]
    Session["Session Service"]
    Analytics["Analytics / Metacognition"]
  end

  subgraph Shared["Shared Packages"]
    Types["@noema/types\nLearningMode + shared contracts"]
    Contracts["@noema/contracts"]
    Validation["@noema/validation"]
    Events["@noema/events"]
  end

  subgraph Data["Persistence / State"]
    GraphStore["PKG / CKG"]
    CardStore["Card Archive"]
    ScheduleStore["Mode-Scoped Schedule State"]
    SessionStore["Mode-Scoped Sessions + Attempts"]
    InsightStore["Mode-Scoped Mastery / Analytics"]
    Prefs["User Preferences\n(active mode)"]
  end

  Shell --> WebPages
  Shell --> GraphLens
  Shell --> CardFlows
  Shell --> Prefs

  WebPages --> ApiClient
  GraphLens --> ApiClient
  CardFlows --> ApiClient
  ApiClient --> UseCases

  UseCases --> KG
  UseCases --> Content
  UseCases --> Scheduler
  UseCases --> Session
  UseCases --> Analytics

  KG --> GraphStore
  Content --> CardStore
  Scheduler --> ScheduleStore
  Session --> SessionStore
  Analytics --> InsightStore

  KG --> Events
  Content --> Events
  Scheduler --> Events
  Session --> Events
  Analytics --> Events

  Types --> ApiClient
  Types --> UseCases
  Types --> KG
  Types --> Content
  Types --> Scheduler
  Types --> Session
  Types --> Analytics

  Contracts --> ApiClient
  Validation --> ApiClient
  Validation --> KG
  Validation --> Content
  Validation --> Scheduler
  Validation --> Session

  classDef primary fill:#eef6ff,stroke:#4a78c2,stroke-width:1px;
  classDef state fill:#f7f7f7,stroke:#7a7a7a,stroke-width:1px;
  class Shell,UseCases,KG,Content,Scheduler,Session,Analytics,Types primary;
  class GraphStore,CardStore,ScheduleStore,SessionStore,InsightStore,Prefs state;
```

## Notes

- `LearningMode` must flow from the shell into all application use-cases.
- Nodes/cards may be shared across modes, but schedule/mastery/attempt state is
  explicitly mode-scoped.
- Graph lenses are UI projections over one shared PKG/CKG substrate, not
  separate graph systems.
- Scheduler read models now provide explicit mode-scoped summaries for:
  - queue/readiness
  - card focus
  - review analytics
- Agent tooling now consumes the same scheduler and graph read models rather
  than inferring progress from frontend-oriented views.
