# Noema Backend Implementation Phases

> **Focus:** Gap remediation — missing endpoints, event consumers, and data
> enrichments required by the frontend **Services:** User, Content, Scheduler,
> Session, Knowledge Graph, HLR Sidecar **Prerequisite:** All 6 services are
> deployed and their existing endpoints function correctly

---

## Phase Map

| #   | Codename                | Phase                                                                   | Tasks | Est. Days | Depends On |
| --- | ----------------------- | ----------------------------------------------------------------------- | :---: | :-------: | ---------- |
| 00  | **Spinal Cord**         | [API Gateway](PHASE-00-API-GATEWAY.md)                                  |   5   |    2–3    | —          |
| 01  | **Blood-Brain Barrier** | [Auth & JWT Scopes](PHASE-01-AUTH-AND-JWT.md)                           |   4   |    3–4    | —          |
| 02  | **Neurotransmission**   | [Event Consumers](PHASE-02-EVENT-CONSUMERS.md)                          |   5   |    4–5    | 00, 01     |
| 03  | **Circadian Rhythm**    | [Scheduler Read API & Forecast](PHASE-03-SCHEDULER-READ-API.md)         |   5   |    3–4    | 02         |
| 04  | **Immune System**       | [Admin User Management](PHASE-04-ADMIN-USER-MGMT.md)                    |   5   |    2–3    | 01         |
| 05  | **Basal Ganglia**       | [Session Enhancements & Study Streak](PHASE-05-SESSION-ENHANCEMENTS.md) |   5   |    2–3    | 02         |
| 06  | **Wernicke's Area**     | [Knowledge Graph & Schema Enhancements](PHASE-06-KG-ENHANCEMENTS.md)    |   4   |    2–3    | 00, 01     |

**Total estimated: 18–25 days**

---

## Dependency Graph

```
  ┌───────────────────────┐       ┌──────────────────────────────┐
  │  PHASE 00             │       │  PHASE 01                    │
  │  Spinal Cord          │       │  Blood-Brain Barrier         │
  │  API Gateway          │       │  Auth & JWT Scopes           │
  └──────────┬────────────┘       └──────┬───────────┬───────────┘
             │                           │           │
             │         ┌─────────────────┘           │
             │         │                             │
             ▼         ▼                             │
  ┌──────────────────────────┐                       │
  │  PHASE 02                │          ┌────────────┴────────────┐
  │  Neurotransmission       │          │                         │
  │  Event Consumers         │          ▼                         ▼
  └────────┬────────┬────────┘  ┌──────────────┐   ┌─────────────────────┐
           │        │           │  PHASE 04    │   │  PHASE 06           │
           │        │           │  Immune Sys. │   │  Wernicke's Area    │
           ▼        ▼           │  Admin Users │   │  KG & Schema Enh.   │
  ┌─────────────┐ ┌──────────┐ └──────────────┘   └─────────────────────┘
  │  PHASE 03   │ │ PHASE 05 │
  │  Circadian  │ │ Basal    │
  │  Rhythm     │ │ Ganglia  │
  │  Sched Read │ │ Streak   │
  └─────────────┘ └──────────┘
```

---

## Critical Path

```
Phase 00/01 (parallel) → Phase 02 → Phase 03
     (3–4d)               (4–5d)     (3–4d)
                                     ─────────
                           Total: 10–13 days
```

Phases 04, 05, and 06 can all be parallelized alongside the critical path once
their dependencies are met.

---

## Parallelization Opportunities

| Time Window    | Parallel Tracks                                |
| -------------- | ---------------------------------------------- |
| Immediately    | Phase 00 (Gateway) ∥ Phase 01 (Auth)           |
| After Phase 01 | Phase 04 (Admin) ∥ Phase 06 (KG) — independent |
| After Phase 02 | Phase 03 (Scheduler) ∥ Phase 05 (Streak)       |

With two developers, the entire backend gap remediation can be completed in ~13
days.

---

## Naming Convention

Each phase is named after a bodily or neural system that metaphorically maps to
its function:

| Structure           | Function in Biology                  | Function in Noema Backend                                   |
| ------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Spinal Cord         | Central relay for all nerve signals  | API Gateway — single entry point routing to all services    |
| Blood-Brain Barrier | Selective access control             | Auth & JWT — protecting endpoints with scoped permissions   |
| Neurotransmission   | Chemical signaling between neurons   | Event consumers — reacting to cross-service domain events   |
| Circadian Rhythm    | Internal timing and sleep-wake cycle | Scheduler reads — exposing when and how cards are scheduled |
| Immune System       | Threat identification and response   | Admin user management — identifying and acting on threats   |
| Basal Ganglia       | Habit formation and motor routines   | Study streak — measuring and reinforcing learning habits    |
| Wernicke's Area     | Language comprehension               | KG enhancements — enriching data with semantic meaning      |

---

## Relationship to Frontend Phases

These backend phases are **prerequisites** for the frontend implementation. The
mapping:

| Backend Phase              | Unlocks Frontend Phases                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Phase 00 (Gateway)         | All frontend phases (single API URL)                                                  |
| Phase 01 (Auth)            | Phase 04 (Auth & Onboarding)                                                          |
| Phase 02 (Event Consumers) | Phase 07 (Session Engine — reviews actually persist)                                  |
| Phase 03 (Scheduler Read)  | Phase 05 (Dashboard — Cards Due), Phase 09 (Schedule Intelligence)                    |
| Phase 04 (Admin)           | Phase 11 (Admin App — User Management)                                                |
| Phase 05 (Streak)          | Phase 05 (Dashboard — Study Streak), Phase 07 (Session History filters)               |
| Phase 06 (KG)              | Phase 08 (Misconception Center), Phase 09 (algorithm labels), Phase 11 (CKG Pipeline) |

---

## Gap Analysis Source

These phases remediate the 18 gaps identified in the
[Backend Services Audit](../audits/backend-services-audit.md):

| Severity | Count | Addressed In                                                                                   |
| -------- | :---: | ---------------------------------------------------------------------------------------------- |
| Critical |   2   | Phase 00 (Gateway), Phase 01 (JWT scopes)                                                      |
| High     |   6   | Phase 02 (consumers), Phase 03 (scheduler reads), Phase 04 (admin), Phase 05 (streak)          |
| Medium   |   5   | Phase 03 (review windows), Phase 05 (session filters), Phase 06 (misconception, CKG, settings) |
| Low      |   5   | Phase 01 (forgot password, email change), Phase 06 (Leitner schema)                            |

---

## How to Use These Phases

1. **Read the target phase file** before beginning implementation.
2. **Verify all dependencies** are implemented — e.g., Phase 03 requires Phase
   02's event consumers to have populated the scheduler tables.
3. **Implement tasks in order** within each phase — they are sequenced by
   internal dependency.
4. **Check acceptance criteria** before considering a phase complete.
5. **Run quality gates** after each phase: `mix format`, tests, lint.
6. **Do not skip phases.** Phase 03 will return empty data without Phase 02.
   Phase 04 will 403 everything without Phase 01.

---

## Tech Stack Reference

| Layer          | Technology                                       |
| -------------- | ------------------------------------------------ |
| Runtime        | Node.js 20+ / TypeScript 5 (strict)              |
| HTTP Framework | Fastify 4                                        |
| ORM            | Prisma 5 (PostgreSQL)                            |
| Validation     | Zod                                              |
| Events         | Redis Streams (publish/consume)                  |
| Auth           | JWT (jose library) + bcrypt                      |
| Graph DB       | Neo4j (knowledge-graph-service only)             |
| Object Storage | MinIO (S3-compatible, content-service only)      |
| ML Sidecar     | Python / FastAPI (HLR sidecar, port 8020)        |
| API Gateway    | To be determined in Phase 00 (Caddy recommended) |
