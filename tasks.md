# Ontology Imports Task Board

## Batch 1 - Contracts and admin workflow shell

### Task T-ONT-001

- batch: 1
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Define ontology import domain/application contracts inside
  `knowledge-graph-service` and expose typed client contracts for the admin app
- inputs:
  - `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0050-ontology-imports-pipeline-architecture.md`
  - `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\types.ts`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\api.ts`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/api-client lint && pnpm --filter @noema/api-client typecheck`
- acceptance:
  - ontology import source/run/artifact contracts exist as first-class types
  - application use-case surface is defined for source registration, run
    creation, retry, cancel, and run detail retrieval
  - api client exposes typed admin-facing contracts without leaking adapter
    details
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\types.ts`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\api.ts`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`

### Task T-ONT-002

- batch: 1
- owner: frontend-implementer
- status: in-progress
- claimed_by: codex
- description: Build the admin ontology-imports dashboard shell, source catalog,
  and run-detail placeholder pages with frontend-first states
- inputs:
  - `C:\Users\anr\Apps\noema\docs\frontend\admin-data-states.md`
  - `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\graph\page.tsx`
- outputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\sources\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\ontology-imports\`
- validation:
  `pnpm --filter @noema/web-admin lint && pnpm --filter @noema/web-admin typecheck`
- acceptance:
  - no ontology-imports route returns 404
  - admin can view source cards, a run list shell, and run detail status
    scaffolding
  - pages communicate that imports are staged, versioned, provenance-aware
    workflows
- touches:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\ontology-imports\`

### Task T-ONT-003

- batch: 1
- owner: docs-agent
- status: in-progress
- claimed_by: codex
- description: Document the ontology-imports architecture, admin workflow, and
  batch changelog
- inputs:
  - `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0050-ontology-imports-pipeline-architecture.md`
  - `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
- outputs:
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`
- validation: `pnpm format:check`
- acceptance:
  - docs explain the import stages, admin workflow, and why imports do not
    publish directly to canonical CKG
  - changelog summarizes Batch 1 deliverables
- touches:
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`

## Batch 2 - Persistence, artifacts, and run orchestration

### Task T-ONT-004

- batch: 2
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Add persistent storage for ontology sources, runs, artifacts,
  checkpoints, and parsed staging manifests
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\prisma\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\repositories\`
  - `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0050-ontology-imports-pipeline-architecture.md`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\prisma\migrations\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\repositories\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\storage\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - source/run/artifact/checkpoint persistence exists with immutable raw
    artifact metadata per run
  - staging persistence is versioned by source and release
  - persistence sits behind repositories/ports, not inside controllers
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\prisma\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\repositories\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\storage\`

### Task T-ONT-005

- batch: 2
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Implement import-run orchestration endpoints and internal
  job-stage transitions without source-specific fetching yet
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\routes\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\orchestration\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - admin API can create, start, cancel, retry, and inspect runs
  - run stages support queued/fetching/fetched/parsing/parsed/failed/cancelled
    states
  - orchestration remains independent of concrete source adapters
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\routes\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\orchestration\`

### Task T-ONT-006

- batch: 2
- owner: frontend-implementer
- status: in-progress
- claimed_by: codex
- description: Wire the admin imports pages to real run/source data contracts
  and operational empty/loading/error states
- inputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`
- outputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\sources\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`
- validation:
  `pnpm --filter @noema/web-admin lint && pnpm --filter @noema/web-admin typecheck`
- acceptance:
  - source catalog and run detail pages render real API data
  - retry/cancel/start controls exist with disabled/loading states even if later
    stages are not wired yet
  - no page degrades to a generic 404
- touches:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\`

## Batch 3 - Pilot source adapters

### Task T-ONT-007

- batch: 3
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Implement the YAGO bulk-import fetch adapter and manifest
  emission
- inputs:
  - `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\yago\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - YAGO fetch runs are reproducible and store source release metadata plus
    checksums
  - adapter performs no normalization or canonical merge logic
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\yago\`

### Task T-ONT-008

- batch: 3
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Implement the ESCO linked-data fetch adapter and manifest
  emission
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\esco\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - ESCO imports can fetch source-native payloads and emit immutable artifact
    manifests
  - adapter stays behind the source fetcher port
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\esco\`

### Task T-ONT-009

- batch: 3
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Implement the ConceptNet import adapter with source-mode support
  for bulk and targeted fetches
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\conceptnet\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - ConceptNet imports support an explicit full-import vs targeted-import mode
  - fetched payloads are stored as raw source truth with manifest metadata
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\conceptnet\`

## Batch 4 - Parsing and staging

### Task T-ONT-010

- batch: 4
- owner: backend-implementer
- status: in-progress
- claimed_by: codex
- description: Build shared staging parsers and the common parsed-record schema
  for YAGO, ESCO, and ConceptNet
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\parsing\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - source-native formats are parsed into a shared staging schema
  - source ids, labels, alt labels, source-native relations, language,
    provenance, and raw artifact pointers are preserved
  - parsed output remains source-truthful, not canonicalized
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\parsing\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\`

## Batch 5 - Normalization handoff

### Task T-ONT-011

- batch: 5
- owner: backend-implementer
- status: done
- claimed_by: codex
- description: Design and implement the normalization handoff that converts
  parsed batches into mutation-ready candidate payloads
- inputs:
  - `C:\Users\anr\Apps\noema\docs\knowledge-graph-service-implementation\PHASE-6-CKG-MUTATION-PIPELINE.md`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\parsing\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\normalization\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\`
- validation:
  `pnpm --filter @noema/knowledge-graph-service lint && pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - normalized outputs become reviewable CKG mutations instead of direct
    canonical writes
  - provenance, source confidence, and source release metadata are preserved
    into mutation payloads
  - mutation previews can be submitted into the CKG review queue from an import
    run
  - canonical node resolution upgrades resolvable deferred relation candidates
    into `add_edge` proposals
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\normalization\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\`

### Task T-ONT-012

- batch: 5
- owner: frontend-implementer
- status: done
- claimed_by: codex
- description: Add create-run configuration controls and submit-preview actions
  to the admin ontology imports UI
- inputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`
- outputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\ontology-imports\create-run-card.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`
- validation:
  `pnpm --filter @noema/web-admin lint && pnpm --filter @noema/web-admin typecheck`
- acceptance:
  - admins can queue runs with source version and source-specific mode controls
  - ConceptNet targeted imports accept seed nodes
  - ready mutation previews can be submitted to the CKG review queue from run
    detail
  - submitted ontology-import proposals can be reviewed in the mutation queue
    with an import-run filter
- touches:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\ontology-imports\`

### Task T-ONT-013

- batch: 5
- owner: backend-implementer
- status: done
- claimed_by: codex
- description: Strengthen canonical node resolution and mapping-aware
  normalization so deferred ontology relations can resolve into real edge
  proposals more often
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\canonical-node-resolver.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\service.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\yago\yago-source.parser.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\helpers.ts`
- validation:
  `pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - canonical resolution goes beyond exact external-id/label matching
  - exact/close mappings can propagate canonical resolutions into deferred
    relation endpoints
  - YAGO equivalence predicates become staged mapping records for later
    normalization and review
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\yago\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\`

## Batch 6 - Reviewer throughput and cross-source merge quality

### Task T-ONT-014

- batch: 6
- owner: backend-implementer
- status: done
- claimed_by: codex
- description: Implement backend support for reviewer-side bulk actions and
  import-run scoped approval workflows for ontology-import mutation proposals
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ckg-mutation.routes.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\`
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\review-workflows\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ckg-mutation.routes.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\schemas\ckg-mutation.schemas.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\integration\ckg-mutation.routes.test.ts`
- validation:
  `pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - reviewers can approve or reject ontology-import mutation proposals in bulk
  - reviewers can scope approval workflows to a single import run
  - backend enforces provenance-aware bulk-action constraints instead of relying
    on UI-only grouping
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\review-workflows\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ckg-mutation.routes.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\schemas\ckg-mutation.schemas.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\integration\ckg-mutation.routes.test.ts`

### Task T-ONT-015

- batch: 6
- owner: backend-implementer
- status: done
- claimed_by: codex
- description: Deepen cross-source merge quality with confidence scoring,
  conflict policies, and richer mapping extraction for the next locked sources
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\canonical-node-resolver.ts`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\confidence\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\conflict-policies.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\application\ontology-import-normalization.service.test.ts`
- validation:
  `pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - additional locked sources contribute staged mapping records suitable for
    future import adapters
  - normalized merge candidates carry confidence scores and conflict markers
  - canonical resolution can distinguish high-confidence exact/close mappings
    from lower-trust candidates during mutation generation
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\confidence\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\conflict-policies.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\application\ontology-import-normalization.service.test.ts`

### Task T-ONT-016

- batch: 6
- owner: frontend-implementer
- status: done
- claimed_by: codex
- description: Add reviewer-facing bulk triage controls and import-run scoped
  review workflows to the admin mutation queue
- inputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\lib\mutation-workflow.ts`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`
- outputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\bulk-review-toolbar.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\import-run-review-group.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\[id]\page.tsx`
- validation:
  `pnpm --filter @noema/web-admin lint && pnpm --filter @noema/web-admin typecheck`
- acceptance:
  - reviewers can select and bulk-approve or bulk-reject grouped ontology-import
    proposals
  - reviewers can review a single import run as a scoped workflow from the
    mutation queue
  - the queue surfaces confidence/conflict hints once backend scoring is
    available
- touches:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\bulk-review-toolbar.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\import-run-review-group.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\[id]\page.tsx`

### Task T-ONT-017

- batch: 6
- owner: docs-agent
- status: done
- claimed_by: codex
- description: Document Batch 6 reviewer workflows, confidence scoring, and
  cross-source merge policy updates
- inputs:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\roadmap.md`
- outputs:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`
- validation:
  `pnpm exec prettier --check "docs/backend/ontology-imports.md" "docs/frontend/ontology-imports.md" "CHANGELOG.md" "roadmap.md" "tasks.md"`
- acceptance:
  - docs explain reviewer bulk workflows and import-run scoped approvals
  - docs explain confidence scoring and conflict policy semantics for
    cross-source merge candidates
  - changelog summarizes Batch 6 deliverables
- touches:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`

## Batch 7 - Source expansion and reviewer decision support

### Task T-ONT-018

- batch: 7
- owner: backend-implementer
- status: pending
- claimed_by: —
- description: Implement the first additional locked-source ingestion slice for
  OpenAlex and GeoNames, including fetch, parse, staged mapping extraction, and
  normalization handoff integration
- inputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\`
- outputs:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\openalex-source.fetcher.test.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\geonames-source.fetcher.test.ts`
- validation:
  `pnpm --filter @noema/knowledge-graph-service typecheck && pnpm --filter @noema/knowledge-graph-service test`
- acceptance:
  - OpenAlex and GeoNames can be imported programmatically through the existing
    hexagonal fetch/parse/normalize pipeline
  - both sources emit staged mapping records that improve downstream canonical
    resolution without bypassing review
  - connectors preserve release/provenance metadata and stay behind source
    fetcher/parser ports
- touches:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\geonames\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\openalex\`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\geonames\`

### Task T-ONT-019

- batch: 7
- owner: frontend-implementer
- status: pending
- claimed_by: —
- description: Add reviewer decision-support UI for ontology-import proposals,
  including conflict-focused filters, confidence summaries, and import-run
  review dashboards
- inputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\`
  - `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`
- outputs:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\review-insights-panel.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\conflict-filter-bar.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`
- validation: `pnpm --filter @noema/web-admin typecheck`
- acceptance:
  - reviewers can filter ontology-import proposals by confidence band and
    conflict type
  - reviewers can inspect import-run level review summaries before taking bulk
    actions
  - UI surfaces blocked vs ready proposal counts in a way that reduces manual
    triage effort
- touches:
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
  - `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`

### Task T-ONT-020

- batch: 7
- owner: docs-agent
- status: pending
- claimed_by: —
- description: Document Batch 7 source expansion and reviewer decision-support
  workflows, and record the release notes
- inputs:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\roadmap.md`
- outputs:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`
- validation:
  `pnpm exec prettier --check "docs/backend/ontology-imports.md" "docs/frontend/ontology-imports.md" "CHANGELOG.md" "roadmap.md" "tasks.md"`
- acceptance:
  - docs explain how OpenAlex and GeoNames fit into the staged import pipeline
  - docs explain the new reviewer decision-support surfaces and how confidence
    bands/conflicts should be interpreted
  - changelog summarizes Batch 7 deliverables
- touches:
  - `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\docs\frontend\ontology-imports.md`
  - `C:\Users\anr\Apps\noema\CHANGELOG.md`
