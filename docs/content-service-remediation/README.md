# Content Service Remediation Plan

## Overview

This directory contains 8 sequential implementation phases to fix all 18
identified gaps and implement all 22 improvements in `services/content-service`.

**Execute phases in order.** Each phase depends on artifacts from previous
phases.

## Phase Summary

| Phase | Focus                        | Gaps Fixed            | Improvements            |
| ----- | ---------------------------- | --------------------- | ----------------------- |
| 1     | Foundation & DRY             | #1(partial), #13, #14 | #5, #15, #22            |
| 2     | Data Integrity & Correctness | #3, #6, #10, #16      | #2, #7, #11, #13        |
| 3     | Security & Resilience        | #4, #5, #9, #15       | #4, #9, #10, #12        |
| 4     | Performance & Search         | #2, #7, #8            | #1, #3, #8              |
| 5     | API Enhancements             | #12, #17              | #14, #17, #18, #19, #21 |
| 6     | Event System                 | #1(partial), #11      | #6                      |
| 7     | GraphQL Layer                | #1(partial), #18      | #16                     |
| 8     | Comprehensive Testing        | #1(partial)           | #20                     |

## Gap Tracker

| #   | Gap                                     | Phase   |
| --- | --------------------------------------- | ------- |
| 1   | Empty directories / unfinished features | 1,6,7,8 |
| 2   | Search is rudimentary                   | 4       |
| 3   | `exact` knowledgeNodeIdMode incomplete  | 2       |
| 4   | No rate limiting                        | 3       |
| 5   | No request body size limits             | 3       |
| 6   | Batch operations not transactional      | 2       |
| 7   | No caching layer                        | 4       |
| 8   | No pagination cursor support            | 4       |
| 9   | No content deduplication                | 3       |
| 10  | Optimistic locking race conditions      | 2       |
| 11  | Missing event consumers                 | 6       |
| 12  | No OpenAPI/Swagger documentation        | 5       |
| 13  | Auth middleware error format            | 1       |
| 14  | Repeated route helpers (DRY)            | 1       |
| 15  | No input sanitization / XSS             | 3       |
| 16  | batchChangeState uses single version    | 2       |
| 17  | No soft-delete restore endpoint         | 5       |
| 18  | GraphQL layer not implemented           | 7       |

## Improvement Tracker

| #   | Improvement                         | Phase |
| --- | ----------------------------------- | ----- |
| 1   | PostgreSQL full-text search         | 4     |
| 2   | Fix optimistic locking atomicity    | 2     |
| 3   | Redis read-through caching          | 4     |
| 4   | Rate limiting                       | 3     |
| 5   | Extract shared route helpers        | 1     |
| 6   | Implement event consumers           | 6     |
| 7   | Fix `exact` knowledgeNodeIdMode     | 2     |
| 8   | Cursor-based pagination             | 4     |
| 9   | Content deduplication               | 3     |
| 10  | Content sanitization                | 3     |
| 11  | Fix batchChangeState versioning     | 2     |
| 12  | Request body size configuration     | 3     |
| 13  | Batch createBatch with $transaction | 2     |
| 14  | @fastify/swagger                    | 5     |
| 15  | Fix auth middleware error format    | 1     |
| 16  | Implement GraphQL layer             | 7     |
| 17  | Soft-delete restore endpoint        | 5     |
| 18  | Content versioning / history        | 5     |
| 19  | Aggregate statistics endpoint       | 5     |
| 20  | Integration + contract tests        | 8     |
| 21  | MinIO health check                  | 5     |
| 22  | `updatedBy` tracking                | 1     |

## Validation

After each phase, run:

```bash
cd services/content-service
pnpm typecheck
pnpm test
pnpm lint
```
