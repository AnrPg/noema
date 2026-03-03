# Noema Frontend Implementation Phases

> **Design Identity:** Minimalist Scholar × Neuroscience-Futuristic  
> **Platform:** Web-first (Next.js 14 / App Router)  
> **Target Services:** User, Content, Scheduler, Session, Knowledge Graph, HLR
> Sidecar

---

## Phase Map

| #   | Codename         | Phase                                                          | Tasks | Est. Days | Depends On     |
| --- | ---------------- | -------------------------------------------------------------- | :---: | :-------: | -------------- |
| 00  | **Synapse**      | [Design Tokens](PHASE-00-DESIGN-TOKENS.md)                     |   5   |    2–3    | —              |
| 01  | **Cortex**       | [UI Primitives](PHASE-01-UI-PRIMITIVES.md)                     |   7   |    3–4    | 00             |
| 02  | **Axon**         | [API Client](PHASE-02-API-CLIENT.md)                           |   5   |    2–3    | —              |
| 03  | **Hippocampus**  | [State & Infrastructure](PHASE-03-STATE-AND-INFRASTRUCTURE.md) |   7   |    3–4    | 00, 01, 02     |
| 04  | **Amygdala**     | [Auth & Onboarding](PHASE-04-AUTH-AND-ONBOARDING.md)           |   5   |    2–3    | 00, 01, 02, 03 |
| 05  | **Thalamus**     | [Dashboard](PHASE-05-DASHBOARD.md)                             |   5   |    3–4    | 03, 04         |
| 06  | **Neocortex**    | [Card System](PHASE-06-CARD-SYSTEM.md)                         |   5   |    4–5    | 03, 04         |
| 07  | **Prefrontal**   | [Session Engine](PHASE-07-SESSION-ENGINE.md)                   |   5   |    4–5    | 05, 06         |
| 08  | **Connectome**   | [Knowledge Graph](PHASE-08-KNOWLEDGE-GRAPH.md)                 |   5   |    5–6    | 03, 04         |
| 09  | **Cerebellum**   | [Schedule Intelligence](PHASE-09-SCHEDULE-INTELLIGENCE.md)     |   4   |    3–4    | 05, 06         |
| 10  | **Insula**       | [Cognitive Copilot](PHASE-10-COGNITIVE-COPILOT.md)             |   5   |    3–4    | 03             |
| 11  | **Hypothalamus** | [Admin App](PHASE-11-ADMIN-APP.md)                             |   6   |    4–5    | 00, 01, 02, 08 |

**Total estimated: 34–45 days**

---

## Dependency Graph

```
                        ┌──────────────────────────────────────────┐
                        │           PHASE 00 — Synapse             │
                        │           Design Tokens                  │
                        └──────────┬────────────┬──────────────────┘
                                   │            │
              ┌────────────────────┘            │
              ▼                                 │
  ┌───────────────────────┐                     │
  │  PHASE 01 — Cortex    │       ┌─────────────────────────────┐
  │  UI Primitives        │       │  PHASE 02 — Axon            │
  └──────────┬────────────┘       │  API Client (independent)   │
             │                    └──────────┬──────────────────┘
             │                               │
             └──────────┬───────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │  PHASE 03 — Hippocampus     │
          │  State & Infrastructure     │
          └──────────┬──────────────────┘
                     │
          ┌──────────┼───────────────────────────────────────┐
          ▼          ▼                                       ▼
  ┌──────────────┐ ┌────────────────────────┐  ┌──────────────────────┐
  │ PHASE 04     │ │ PHASE 10 — Insula      │  │ PHASE 08 —Connectome │
  │ Amygdala     │ │ Cognitive Copilot      │  │ Knowledge Graph      │
  │ Auth + Onb.  │ │ (parallel branch)      │  │ (parallel branch)    │
  └──────┬───────┘ └────────────────────────┘  └──────────┬───────────┘
         │                                                 │
    ┌────┴────────────────────────┐                        │
    │         │                   │                        │
    ▼         ▼                   ▼                        ▼
┌────────┐ ┌────────────┐  ┌───────────────┐  ┌──────────────────────┐
│Phase 05│ │ Phase 06   │  │ Phase 08      │  │ PHASE 11 —           │
│Thalamus│ │ Neocortex  │  │ Connectome    │  │ Hypothalamus         │
│Dashbrd │ │ Card Sys.  │  │ Know. Graph   │  │ Admin App            │
└───┬────┘ └──┬─────────┘  └───────────────┘  └──────────────────────┘
    │         │
    │    ┌────┴──────────┐
    ▼    ▼               ▼
┌────────────┐   ┌──────────────┐
│ Phase 07   │   │ Phase 09     │
│ Prefrontal │   │ Cerebellum   │
│ Sessions   │   │ Scheduling   │
└────────────┘   └──────────────┘
```

---

## Critical Path

The **longest dependency chain** determines minimum calendar time:

```
Phase 00 → Phase 01 → Phase 03 → Phase 04 → Phase 06 → Phase 07
 (2–3d)     (3–4d)     (3–4d)     (2–3d)     (4–5d)     (4–5d)
                                                         ─────────
                                               Total: 18–24 days
```

---

## Parallelization Opportunities

Several phases can be developed concurrently by different contributors or in
interleaved sprints:

| Time Window              | Parallel Tracks                                          |
| ------------------------ | -------------------------------------------------------- |
| After Phase 00 completes | Phase 01 (UI) + Phase 02 (API Client)                    |
| After Phase 03 completes | Phase 04 (Auth) ∥ Phase 08 (Graph) ∥ Phase 10 (Copilot)  |
| After Phase 04 completes | Phase 05 (Dashboard) ∥ Phase 06 (Cards)                  |
| After Phase 06 completes | Phase 07 (Sessions) ∥ Phase 09 (Scheduling)              |
| After Phase 08 completes | Phase 11 (Admin) — can start once graph components exist |

---

## Naming Convention

Each phase is named after a brain region or neural structure that metaphorically
maps to its function:

| Structure    | Function in Brain       | Function in Noema                                        |
| ------------ | ----------------------- | -------------------------------------------------------- |
| Synapse      | Signal junctions        | Design tokens — the smallest connective units            |
| Cortex       | Processing surface      | UI primitives — the surface layer of interaction         |
| Axon         | Signal transmission     | API client — data transport between frontend and backend |
| Hippocampus  | Memory formation        | State management — the app's working memory              |
| Amygdala     | Threat/trust processing | Auth — guardian of access, trust verification            |
| Thalamus     | Sensory relay hub       | Dashboard — the central relay of all learner data        |
| Neocortex    | Higher cognition        | Card system — the knowledge representation layer         |
| Prefrontal   | Executive function      | Session engine — orchestrating the learning act          |
| Connectome   | Neural wiring map       | Knowledge graph — the literal map of connections         |
| Cerebellum   | Motor coordination      | Schedule intelligence — coordinating timing              |
| Insula       | Self-awareness          | Cognitive copilot — metacognitive self-awareness         |
| Hypothalamus | Homeostasis             | Admin app — regulating system equilibrium                |

---

## How to Use These Phases

1. **Read the target phase file** before beginning implementation.
2. **Verify all dependencies** are implemented and working — run the app,
   confirm routes render, confirm API hooks return data.
3. **Implement tasks in order** within each phase — they are sequenced by
   internal dependency.
4. **Check acceptance criteria** before considering a phase complete.
5. **Do not skip phases.** The dependency graph is not a suggestion. Phase 07
   will not work without Phase 06's card renderers. Phase 09 will not work
   without Phase 05's dashboard shell.

---

## Tech Stack Reference

| Layer           | Technology                                          |
| --------------- | --------------------------------------------------- |
| Framework       | Next.js 14 (App Router)                             |
| Language        | TypeScript 5 (strict)                               |
| Styling         | Tailwind CSS 3 + CSS custom properties              |
| Component base  | Radix UI primitives                                 |
| State           | Zustand 5 (with persist middleware)                 |
| Data fetching   | React Query 5 (TanStack Query)                      |
| Forms           | React Hook Form + Zod                               |
| Icons           | lucide-react                                        |
| Graph rendering | WebGL (via force-graph, sigma.js, or similar)       |
| Charts          | Recharts or similar                                 |
| Animation       | Tailwind transitions + CSS keyframes (no heavy lib) |
