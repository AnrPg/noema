# Phase 6 — Card System: Library, Creator & Detail

> **Codename:** `Neocortex`  
> **Depends on:** Phase 0 (Tokens), Phase 1 (UI Primitives), Phase 2 (API Client
> — Content module)  
> **Unlocks:** Phase 7 (Session Engine — needs card renderers)  
> **Estimated effort:** 5–6 days

---

## Philosophy

Cards are Noema's atomic unit of knowledge. The card system must feel like a
powerful, searchable library — not a Rolodex. The content service supports 42
card types, DeckQuery-based dynamic filtering (replacing static decks), batch
operations, version history, and knowledge graph node linking. The UI must
expose all of this power without overwhelming the user.

The card system also introduces the **card type renderers** — 42 React
components that know how to visually present each card type. These renderers are
reused in the Session Engine (Phase 7), so they must be extracted into a shared
location.

---

## Tasks

### T6.1 — Card Library Page

The main card browsing experience at `/cards`.

**Route:** `apps/web/src/app/(authenticated)/cards/page.tsx`

**Functionality:**

- **DeckQuery filter panel** (left sidebar or top bar):
  - Card type multi-select (grouped by Standard / Remediation)
  - State filter chips (`DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`)
  - Tag search with autocomplete (powered by tag values from previous queries)
  - Full-text search input (uses the backend's `tsvector` search)
  - Knowledge graph node filter (type-ahead search → selects nodes → filters to
    linked cards)
  - Date range filter (created date, last reviewed date)
  - Sort control: relevance, created date, last reviewed, difficulty
- **Results area:**
  - Toggle between grid view (card preview tiles) and list view (compact rows)
  - Cursor-based infinite scroll via `useCardsCursor()` — not traditional
    pagination
  - Each card shows: card type icon, title/preview of front content, state chip,
    tag pills, last reviewed date
  - Multi-select mode: checkbox on each card for bulk actions
- **Stats header** at the top: card count by state (using `useCardStats()`) as
  small `MetricTile` row
- **Bulk action bar** (appears when cards are selected): "Change State",
  "Delete", "Export" buttons
  - "Change State" → dropdown with valid transitions →
    `useBatchCardStateTransition()`

### T6.2 — Card Type Renderers

The visual core — a React component for each of the 42 card types. These live in
a shared location because they're used in both the Card Library (preview mode)
and Session Engine (interactive mode).

**Location:** `apps/web/src/components/card-renderers/`

**Architecture:**

- A `CardRenderer` factory component: receives `card: CardDto` and
  `mode: 'preview' | 'interactive'` and delegates to the correct type-specific
  component
- Each renderer implements a `CardRendererProps` interface:
  ```
  card: CardDto
  mode: 'preview' | 'interactive'
  isRevealed: boolean
  onAnswer?: (answer: unknown) => void
  onHintRequest?: () => void
  ```
- In `preview` mode: shows a static, compact preview (for card library grid
  tiles)
- In `interactive` mode: shows the full learning interaction (for sessions)

**Standard type renderers (22):**

| Renderer                        | Interaction in `interactive` mode                      |
| ------------------------------- | ------------------------------------------------------ |
| `AtomicCardRenderer`            | Front/back flip on click or spacebar                   |
| `ClozeCardRenderer`             | Inline blank inputs — type to fill                     |
| `ImageOcclusionRenderer`        | SVG overlay on image — click regions to reveal         |
| `AudioCardRenderer`             | Audio waveform player + text response input            |
| `ProcessCardRenderer`           | Step sequencing — drag to reorder steps                |
| `ComparisonCardRenderer`        | Side-by-side panels with "which is correct?" selection |
| `ExceptionCardRenderer`         | Given a rule, identify the exception from options      |
| `ErrorSpottingRenderer`         | Highlighted text/code — click the error location       |
| `ConfidenceRatedRenderer`       | Standard Q&A with mandatory pre/post confidence slider |
| `ConceptGraphRenderer`          | Mini-graph with missing labels — fill in node names    |
| `CaseBasedRenderer`             | Scenario text → decision tree with branching options   |
| `MultimodalRenderer`            | Mixed media composition (image + text + audio)         |
| `TransferRenderer`              | Apply concept to a novel context — free-text response  |
| `ProgressiveDisclosureRenderer` | Layered reveal — click to show next hint layer         |
| `MultipleChoiceRenderer`        | Classic A/B/C/D radio selection                        |
| `TrueFalseRenderer`             | Binary True/False buttons                              |
| `MatchingRenderer`              | Drag items from column A to match column B             |
| `OrderingRenderer`              | Drag items into correct sequential order               |
| `DefinitionRenderer`            | Term → definition recall, flip to check                |
| `CauseEffectRenderer`           | Link causes to effects — drag connection               |
| `TimelineRenderer`              | Place events on a timeline — drag to position          |
| `DiagramRenderer`               | Label diagram parts — click regions + type labels      |

**Remediation type renderers (20):**

| Renderer                                | Interaction                                                          |
| --------------------------------------- | -------------------------------------------------------------------- |
| `ContrastivePairRenderer`               | Side-by-side: confused concept vs correct concept                    |
| `MinimalPairRenderer`                   | Spot the minimal difference between two near-identical items         |
| `FalseFriendRenderer`                   | Identify why two similar-looking concepts are different              |
| `OldVsNewDefinitionRenderer`            | Before/after definition comparison                                   |
| `BoundaryCaseRenderer`                  | "Is this inside or outside the concept's boundary?"                  |
| `RuleScopeRenderer`                     | Define the exact scope where a rule applies                          |
| `DiscriminantFeatureRenderer`           | Identify the key distinguishing feature                              |
| `AssumptionCheckRenderer`               | "What assumption are you making?" — reflect + respond                |
| `CounterexampleRenderer`                | Presented with a claim → provide or evaluate a counterexample        |
| `RepresentationSwitchRenderer`          | Same concept in different representations (verbal, visual, symbolic) |
| `RetrievalCueRenderer`                  | Strengthen retrieval cue associations                                |
| `EncodingRepairRenderer`                | Re-encode with better mnemonic/structure                             |
| `OverwriteDrillRenderer`                | Repetitive drill to overwrite a wrong association                    |
| `AvailabilityBiasRenderer`              | Counteracts availability bias with base-rate information             |
| `SelfCheckRitualRenderer`               | Guided self-check steps before committing an answer                  |
| `CalibrationTrainingRenderer`           | Calibrate confidence against actual accuracy                         |
| `AttributionReframingRenderer`          | Reframe failure attribution (ability → strategy)                     |
| `StrategyReminderRenderer`              | Remind of a previously learned strategy                              |
| `ConfusableSetDrillRenderer`            | Drill through a set of commonly confused items                       |
| `PartialKnowledgeDecompositionRenderer` | Decompose "I sort of know it" into specific sub-parts                |

**Fallback:** For any unrecognized type, show a generic renderer displaying raw
JSON content in a formatted code block.

### T6.3 — Card Creator Page

A multi-step card creation form at `/cards/new`.

**Route:** `apps/web/src/app/(authenticated)/cards/new/page.tsx`

**Flow:**

1. **Type Selection**: visual grid of 42 card types, grouped into "Standard" and
   "Remediation" sections. Each tile shows icon + name + one-line description.
   Selecting a type transitions to step 2.
2. **Content Form**: dynamic form fields that adapt to the selected card type.
   Validate against the type-specific schema via `useValidateCardContent()` on
   blur/change. Different types have different fields:
   - `ATOMIC`: front (rich text), back (rich text)
   - `CLOZE`: text with `{{cloze}}` delimiters, hint per cloze
   - `MULTIPLE_CHOICE`: question, options array (text + isCorrect), explanation
   - `IMAGE_OCCLUSION`: image upload + SVG region editor
   - etc. (specific fields per type)
3. **Metadata & Links**: tags input, difficulty level selector, knowledge graph
   node linker (search + select nodes → `PATCH /cards/:id/node-links` after
   creation)
4. **Preview**: live preview using the `CardRenderer` in `preview` mode
5. **Submit**: creates the card via `useCreateCard()`, shows success toast,
   offers "Create another" or "View card" options

**Template support**: a "Start from template" option in type selection that
loads a template via `useTemplate(id)` and pre-fills the form.

**Media upload**: for image/audio card types, integrate the media upload flow:
`useRequestUploadUrl()` → direct upload to presigned URL →
`useConfirmUpload(id)`.

### T6.4 — Card Detail Page

Full card view and history at `/cards/:id`.

**Route:** `apps/web/src/app/(authenticated)/cards/[id]/page.tsx`

**Layout:**

- **Header**: card type badge, state chip, card ID (monospace), created/updated
  dates
- **Content area**: full-size `CardRenderer` in `preview` mode
- **Side panel** (right):
  - **State transitions**: visual state machine diagram showing current state
    and available transitions as clickable buttons (`useCardStateTransition()`)
  - **Tags**: editable tag list (`useUpdateCardTags()`)
  - **Node Links**: linked knowledge graph nodes as clickable pills (navigate to
    `/knowledge?node=...`)
  - **Metadata**: difficulty, content hash, batch ID (if applicable)
- **History tab**: version timeline via `useCardHistory(id)` — each version
  entry shows date, author, change summary. Clicking a version loads the
  snapshot via card history endpoint and shows a diff view (before/after content
  comparison)
- **Edit button**: opens inline editing mode using the same dynamic form from
  Card Creator, pre-filled with current content

### T6.5 — Batch Operations Page

Bulk card management at `/cards/batch`.

**Route:** `apps/web/src/app/(authenticated)/cards/batch/page.tsx`

**Functionality:**

- **Batch importer**: upload a JSON file conforming to the batch creation schema
  → preview parsed cards in a table → submit via `useBatchCreateCards()` (up to
  100 cards)
- **Active batches**: list recent batch operations with batch ID, card count,
  creation date, success/failure status
- **Batch detail**: view all cards in a batch via `useCardsByBatchId(batchId)`
- **Batch rollback**: "Undo entire batch" button → `useRollbackBatch(batchId)`
  with confirmation dialog

---

## Acceptance Criteria

- [ ] Card Library renders cards from the API with DeckQuery filtering and
      infinite scroll
- [ ] All 42 card type renderers produce appropriate `preview` and `interactive`
      visuals
- [ ] Card Creator dynamically adapts its form based on selected card type
- [ ] Content validation fires on blur and shows inline errors
- [ ] Media upload flow works end-to-end (presigned URL → upload → confirm)
- [ ] Card Detail shows full content, state machine, tags, node links, and
      version history
- [ ] Version history shows diffs between versions
- [ ] Batch import accepts JSON, previews, and submits up to 100 cards
- [ ] Batch rollback deletes all cards in a batch with confirmation
- [ ] All pages handle empty states, loading states, and error states gracefully

---

## Files Created

| File                                                      | Description                         |
| --------------------------------------------------------- | ----------------------------------- |
| `apps/web/src/app/(authenticated)/cards/page.tsx`         | Card Library with DeckQuery         |
| `apps/web/src/app/(authenticated)/cards/new/page.tsx`     | Card Creator wizard                 |
| `apps/web/src/app/(authenticated)/cards/[id]/page.tsx`    | Card Detail + history               |
| `apps/web/src/app/(authenticated)/cards/batch/page.tsx`   | Batch operations                    |
| `apps/web/src/components/card-renderers/index.tsx`        | CardRenderer factory                |
| `apps/web/src/components/card-renderers/types.ts`         | Shared renderer props               |
| `apps/web/src/components/card-renderers/atomic.tsx`       | Atomic card renderer                |
| `apps/web/src/components/card-renderers/cloze.tsx`        | Cloze card renderer                 |
| `apps/web/src/components/card-renderers/...`              | (one file per card type — 42 total) |
| `apps/web/src/components/cards/deck-query-filter.tsx`     | DeckQuery filter panel              |
| `apps/web/src/components/cards/card-grid.tsx`             | Grid view for card library          |
| `apps/web/src/components/cards/card-list.tsx`             | List view for card library          |
| `apps/web/src/components/cards/card-type-selector.tsx`    | Type picker grid                    |
| `apps/web/src/components/cards/media-uploader.tsx`        | Presigned URL upload flow           |
| `apps/web/src/components/cards/version-history.tsx`       | Version timeline + diff             |
| `apps/web/src/components/cards/state-machine-diagram.tsx` | Visual state transitions            |
