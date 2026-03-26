# ADR-008: API-First Card Import Pipeline

| Field       | Value                                 |
| ----------- | ------------------------------------- |
| **Status**  | Accepted                              |
| **Date**    | 2026-03-26                            |
| **Authors** | Codex (AI), approved by project owner |
| **Tags**    | cards, imports, api-first, agents     |

## Context

The original batch card flow lived mostly in the browser and behaved like a
slightly modified single-card form. That did not match the product need: imports
must support many source file families, communicate structure clearly, infer
mappings, preserve extra source fields, and remain usable by both human
operators and autonomous agents.

## Decision

- Introduce an API-first card import pipeline in `content-service` with two
  explicit operations:
  - `POST /v1/cards/import/preview`
  - `POST /v1/cards/import/execute`
- Move source parsing and mapping preparation into `content-service`, not the
  web client.
- Expose the same import surface to agents through the content MCP tools:
  - `preview-card-import`
  - `execute-card-import`
- Keep imported card creation grounded in the existing batch-create workflow so
  batch tracking and rollback continue to work through `metadata._batchId`.
- Preserve source fields that are not promoted into canonical card fields under
  `metadata.dump`.
- Add `xlsx` as a dependency to `content-service` so workbook parsing is handled
  in the service layer.

## Rationale

- API-first keeps parsing rules and import semantics consistent across the web
  app, future admin surfaces, and agent workflows.
- Agent-first requires import preview and execution to exist as service
  capabilities, not only as browser code.
- Centralizing parsing on the service side makes file-format support easier to
  evolve without forcing the browser to own every parser.
- Reusing batch creation preserves rollback, event publication, and operational
  history with minimal new infrastructure.

## Alternatives Considered

| Option                                          | Pros                              | Cons                                             | Rejected because                              |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Browser-only parsing with existing batch create | Fastest UI-only path              | Not agent-first, duplicates logic, weak contract | It leaves import capability outside the API   |
| Dedicated import-run persistence model          | Stronger long-term workflow model | More schema and orchestration scope              | Too large for this slice                      |
| Upload raw files to object storage first        | Better for very large payloads    | More infrastructure and async orchestration      | Current batch sizes fit direct request bodies |

## Consequences

- `content-service` now owns supported import formats and mapping inference.
- `@noema/api-client` exposes preview/execute import DTOs, API methods, and
  hooks for the web app.
- The web batch page becomes a wizard over the service contract instead of a
  parser-heavy client page.
- Imported extra source fields are preserved, but downstream handling of
  `metadata.dump` remains future work.

## References

- `services/content-service/src/domain/content-service/card-import.ts`
- `services/content-service/src/api/rest/content.routes.ts`
- `services/content-service/src/agents/tools/content.tools.ts`
- `apps/web/src/app/(authenticated)/cards/batch/page.tsx`
