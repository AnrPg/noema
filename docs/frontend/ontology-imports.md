# Ontology Imports Frontend

## Purpose

The admin ontology-imports workflow gives canonical graph operators a dedicated
surface for:

- browsing pilot ontology sources
- inspecting import runs and staged checkpoints
- understanding provenance before normalization is introduced

Batch 1 is intentionally frontend-first. The pages remove 404 dead ends and make
the future workflow visible before orchestration and persistence are fully
wired.

## Routes

- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\sources\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`

## Components

- `imports-hero.tsx` - explains the staged import model
- `source-card.tsx` - renders pilot source metadata
- `run-status-panel.tsx` - displays checkpoints and artifact visibility
- `placeholder-data.ts` - typed placeholder content used until Batch 2 wiring

## UX principles

- never return a generic 404 for known ontology-import routes
- show what is real now versus what is still coming in the next batch
- keep review and provenance visible from the start
- reinforce that normalization does not publish directly to canonical CKG

## Batch 2 status

The admin pages now try the real ontology-import API first and only fall back to
placeholder pilot data when the backend is empty or unavailable.

- imports dashboard reads live source/run counts
- source catalog reads the real source registry
- run detail supports start / cancel / retry actions with loading and message
  states
- fallback data is still preserved so the UI never collapses into a generic 404

## Current limitations

- canonical relation resolution still depends on the backend continuing to grow
  richer node-matching heuristics over time
- source-specific validation is still lightweight and should become more
  opinionated as more connectors are added

## Current run-detail visibility

The run-detail page now surfaces the full import progression that exists today:

- orchestration checkpoints
- parsed batch summary
- normalized batch summary
- mutation-preview counts and sample candidates

## Current admin controls

The imports workspace now supports real operator actions instead of only
placeholder exploration:

- create a run from the imports dashboard
- choose source version before queueing a run
- choose source mode when the source supports it
- set ESCO language
- provide ConceptNet seed nodes for targeted runs
- submit ready mutation previews from run detail into the CKG review queue
- jump straight from an import run into the CKG mutation review screen filtered
  to that run

## Current source-specific controls

- `YAGO`
  - source version
- `ESCO`
  - source version
  - mode: `full`, `skills`, `occupations`, `qualifications`
  - language
- `ConceptNet`
  - source version
  - mode: `full`, `targeted`
  - seed nodes for targeted imports

## Review queue linkage

The CKG mutation queue now understands ontology-import provenance well enough
for admin review workflows:

- the queue can be opened with an `importRunId` filter from import-run detail
- mutation rows show when a proposal came from an ontology import
- mutation detail links back to the originating ontology import run when that
  metadata is available

## Reviewer triage improvements

The reviewer workflow is now easier to scan when import batches get large.

- ontology-import proposals are grouped by import run in the mutation queue when
  no run filter is active
- each group surfaces quick actions to open the originating import run or focus
  the queue on that import batch alone
- run detail now shows the exact submitted mutation ids, not just a generic
  "review this run" button

Key frontend files:

- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\imports\runs\[id]\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\ontology-imports\run-status-panel.tsx`

## Current queue behavior

The admin mutation queue now leans on the backend for ontology-import filtering:

- opening the queue with `?importRunId=...` now pushes that filter into the
  `knowledge-graph-service` request instead of filtering only in the browser
- the UI still groups ontology-import proposals locally for presentation, but
  the returned mutation set is already narrowed server-side

This keeps the review screen responsive as import volumes grow without forcing
the frontend to fetch the entire queue first.

## Batch 6 reviewer bulk triage

The admin mutation queue now has the first reviewer-throughput tools for
ontology-import proposals.

### Bulk selection workflow

- ontology-import proposals can be selected from the queue directly
- direct-review mutations remain non-selectable so the queue does not blur two
  different review workflows
- reviewers can:
  - select visible ontology-import mutations
  - clear the current selection
  - select all mutations in an import-run group
  - submit bulk `approve`, `reject`, or `request revision` actions with one
    shared review note

### Import-run grouping

When the queue is not already filtered to a single import run, ontology-import
proposals are grouped into import-run review cards. Each group provides:

- proposal count
- selected count
- quick open to the import run
- quick focus of the queue to that import batch
- one-click group selection for bulk review

### Key frontend files

- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\bulk-review-toolbar.tsx`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\components\ckg\mutation-review\import-run-review-group.tsx`

### Current Batch 6 scope

The queue now supports reviewer bulk actions for ontology-import proposals and
shows the first merge-quality hints from the backend.

## Batch 6 confidence and conflict hints

The mutation queue now surfaces merge-quality hints coming from the ontology
import backend.

- ontology-import mutation rationales now carry structured review metadata
- the admin queue parses that metadata and shows:
  - confidence band
  - confidence percentage
  - conflict badges for merge-risk signals such as ambiguous matches or mapping
    conflicts
- these hints sit alongside the existing import-run grouping so reviewers can
  triage both by batch and by trust level

Key frontend files:

- `C:\Users\anr\Apps\noema\apps\web-admin\src\lib\mutation-workflow.ts`
- `C:\Users\anr\Apps\noema\apps\web-admin\src\app\(dashboard)\dashboard\ckg\mutations\page.tsx`
