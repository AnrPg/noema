# Phase 06d — Card Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 4 authenticated app pages for the card system: Card Library, Card Creator wizard, Card Detail view/edit, and Batch Operations.

**Architecture:** All pages are Next.js App Router pages using `'use client'` directive. They compose shared components from phase-06b (renderers) and phase-06c (filter panel, collection, media uploader). State management follows the established pattern: TanStack Query for server state, local `useState` for UI state. No Zustand store is introduced — the copilot store already exists for hints.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@noema/api-client`, `@noema/ui`, components from `@/components/cards/`

---

## Prerequisites

- Phase-06a: api-client types, hooks, and `findRecentBatches` endpoint complete
- Phase-06b: all 42 renderers + `CardRenderer` factory
- Phase-06c: `DeckQueryFilter`, `CardCollection`, `MediaUploader`

---

## Task T16: Card Library Page (`/cards`)

**Files:**
- Create: `apps/web/src/app/(authenticated)/cards/page.tsx`
- Create: `apps/web/src/app/(authenticated)/cards/page.test.tsx`

### What it renders

A page with:
- Header with title "Card Library", card count badge, and "New Card" button
- A two-column layout on desktop: left = `DeckQueryFilter` (collapsible on mobile), right = `CardCollection`
- Uses `useCardsCursor` (infinite scroll) for progressive loading
- Bulk actions wire to `useBatchCardStateTransition` and `useDeleteCard` (per-card via Promise.all)

### Step 1: Write failing tests

```tsx
// apps/web/src/app/(authenticated)/cards/page.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import CardsPage from './page.js';

vi.mock('@noema/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', displayName: 'Test User' } }),
}));

vi.mock('@noema/api-client', () => ({
  useInfiniteQuery: vi.fn(),
  useCardsCursor: () => ({
    data: { pages: [{ data: { cards: [], nextCursor: null } }] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useCardStats: () => ({ data: { data: { total: 42 } }, isLoading: false }),
  useBatchCardStateTransition: () => ({ mutateAsync: vi.fn() }),
  useDeleteCard: () => ({ mutateAsync: vi.fn() }),
  contentKeys: { all: ['content'], cards: () => ['content', 'cards'] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cards',
}));

test('renders Card Library heading', () => {
  render(<CardsPage />);
  expect(screen.getByRole('heading', { name: /card library/i })).toBeInTheDocument();
});

test('renders New Card button', () => {
  render(<CardsPage />);
  expect(screen.getByRole('link', { name: /new card/i })).toBeInTheDocument();
});

test('renders card count from stats', () => {
  render(<CardsPage />);
  expect(screen.getByText('42')).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test 'cards/page'
```

Expected: FAIL — module not found.

### Step 3: Implement the page

```tsx
// apps/web/src/app/(authenticated)/cards/page.tsx
'use client';

import {
  useBatchCardStateTransition,
  useCardStats,
  useCardsCursor,
  useDeleteCard,
} from '@noema/api-client';
import { Badge, Button } from '@noema/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { CardCollection } from '@/components/cards/card-collection';
import { DeckQueryFilter } from '@/components/cards/deck-query-filter';
import type { IDeckQueryInput } from '@noema/api-client';
import { contentKeys } from '@noema/api-client';

const DEFAULT_QUERY: IDeckQueryInput = { sortBy: 'createdAt', sortDir: 'desc' };

export default function CardsPage(): React.JSX.Element {
  const [query, setQuery] = useState<IDeckQueryInput>(DEFAULT_QUERY);
  const [filterOpen, setFilterOpen] = useState(true);
  const qc = useQueryClient();

  const cursor = useCardsCursor(query);
  const stats = useCardStats();
  const batchState = useBatchCardStateTransition();
  const deleteCard = useDeleteCard();

  // Flatten infinite pages into one list
  const allCards = cursor.data?.pages.flatMap((p) => p.data.cards) ?? [];
  const total = stats.data?.data.total ?? 0;

  const handleBulkActivate = useCallback(
    async (ids: string[]): Promise<void> => {
      await batchState.mutateAsync({ cardIds: ids, state: 'ACTIVE' });
      void qc.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    [batchState, qc],
  );

  const handleBulkArchive = useCallback(
    async (ids: string[]): Promise<void> => {
      await batchState.mutateAsync({ cardIds: ids, state: 'ARCHIVED' });
      void qc.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    [batchState, qc],
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]): Promise<void> => {
      await Promise.all(ids.map((id) => deleteCard.mutateAsync({ id })));
      void qc.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    [deleteCard, qc],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Card Library</h1>
          <Badge variant="secondary" className="text-sm font-semibold">
            {String(total)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/cards/batch">Batches</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/cards/new">
              <Plus className="h-4 w-4 mr-1" />
              New Card
            </Link>
          </Button>
        </div>
      </div>

      {/* Body: filter + collection */}
      <div className="flex gap-6">
        {/* Filter panel (collapsible) */}
        <div
          className={[
            'flex-shrink-0 rounded-lg border border-border bg-card transition-all overflow-hidden',
            filterOpen ? 'w-64' : 'w-0 border-0',
          ].join(' ')}
        >
          {filterOpen && (
            <DeckQueryFilter
              query={query}
              onChange={setQuery}
              onReset={() => { setQuery(DEFAULT_QUERY); }}
            />
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="text-xs text-muted-foreground mb-3 hover:text-foreground transition-colors"
            onClick={() => { setFilterOpen((v) => !v); }}
          >
            {filterOpen ? '← Hide filters' : '→ Show filters'}
          </button>

          <CardCollection
            cards={allCards}
            isLoading={cursor.isLoading}
            onBulkActivate={(ids) => { void handleBulkActivate(ids); }}
            onBulkArchive={(ids) => { void handleBulkArchive(ids); }}
            onBulkDelete={(ids) => { void handleBulkDelete(ids); }}
          />

          {/* Load more */}
          {cursor.hasNextPage === true && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void cursor.fetchNextPage(); }}
                disabled={cursor.isFetchingNextPage}
              >
                {cursor.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test 'cards/page'
```

Expected: PASS (3 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/app/(authenticated)/cards/page.tsx \
        apps/web/src/app/(authenticated)/cards/page.test.tsx
git commit -m "feat(web): add Card Library page (/cards)"
```

---

## Task T17: Card Creator Wizard (`/cards/new`)

**Files:**
- Create: `apps/web/src/app/(authenticated)/cards/new/page.tsx`
- Create: `apps/web/src/app/(authenticated)/cards/new/page.test.tsx`
- Create: `apps/web/src/components/cards/card-creator/step-select-type.tsx`
- Create: `apps/web/src/components/cards/card-creator/step-fill-content.tsx`
- Create: `apps/web/src/components/cards/card-creator/step-review.tsx`

### What it renders

A 3-step wizard:
1. **Select Type** — type picker grouped by Standard / Remediation. Clicking a type advances to step 2.
2. **Fill Content** — dynamic form fields based on selected type. For IMAGE_OCCLUSION and AUDIO types, shows `MediaUploader`. For all others, textarea/input fields matching the schema.
3. **Review & Save** — shows the card preview using `CardRenderer` + "Create Card" submit button

State machine: `step: 1 | 2 | 3` + `selectedType: string | null` + `content: Record<string, unknown>` + `tags: string[]`

The wizard is intentionally simple for Phase 06. Phase 10 (AI Copilot) will add content generation.

### Step 1: Write failing tests for the page

```tsx
// apps/web/src/app/(authenticated)/cards/new/page.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NewCardPage from './page.js';

vi.mock('@noema/api-client', () => ({
  useCreateCard: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

test('renders step 1 type selector by default', () => {
  render(<NewCardPage />);
  expect(screen.getByText(/select a card type/i)).toBeInTheDocument();
});

test('shows Standard and Remediation sections in step 1', () => {
  render(<NewCardPage />);
  expect(screen.getByText('Standard')).toBeInTheDocument();
  expect(screen.getByText('Remediation')).toBeInTheDocument();
});

test('selecting a type advances to step 2', () => {
  render(<NewCardPage />);
  fireEvent.click(screen.getByText(/^Atomic$/i));
  expect(screen.getByText(/fill in the content/i)).toBeInTheDocument();
});

test('back button in step 2 returns to step 1', () => {
  render(<NewCardPage />);
  fireEvent.click(screen.getByText(/^Atomic$/i));
  fireEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(screen.getByText(/select a card type/i)).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test 'cards/new/page'
```

Expected: FAIL.

### Step 3a: Implement step-select-type.tsx

```tsx
// apps/web/src/components/cards/card-creator/step-select-type.tsx
'use client';

import { CardType, RemediationCardType } from '@noema/types';
import React from 'react';

const REMEDIATION_VALUES = new Set(Object.values(RemediationCardType));
const STANDARD_TYPES = Object.values(CardType).filter((t) => !REMEDIATION_VALUES.has(t as never));
const REMEDIATION_TYPES = Object.values(RemediationCardType);

function typeLabel(t: string): string {
  return t.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Brief descriptions to aid selection
const TYPE_DESC: Partial<Record<string, string>> = {
  atomic: 'Single fact, concept, or definition',
  cloze: 'Fill-in-the-blank with contextual clues',
  definition: 'Term → meaning card',
  multiple_choice: 'One correct option among distractors',
  true_false: 'Binary true/false statement',
  image_occlusion: 'Hide labels on an image to recall them',
  audio: 'Recall from an audio cue',
  matching: 'Match items in two columns',
  ordering: 'Arrange steps in correct sequence',
  contrastive_pair: 'Contrast two similar-seeming concepts',
  overwrite_drill: 'Overwrite a stubborn wrong belief',
};

interface IStepSelectTypeProps {
  onSelect: (type: string) => void;
}

function TypeButton({ type, onSelect }: { type: string; onSelect: (t: string) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => { onSelect(type); }}
      className="group flex flex-col gap-1 rounded-lg border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5"
    >
      <span className="text-sm font-medium group-hover:text-primary">{typeLabel(type)}</span>
      {TYPE_DESC[type] !== undefined && (
        <span className="text-xs text-muted-foreground">{TYPE_DESC[type]}</span>
      )}
    </button>
  );
}

export function StepSelectType({ onSelect }: IStepSelectTypeProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select a card type</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose the learning format that best suits your content.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Standard
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {STANDARD_TYPES.map((t) => (
              <TypeButton key={t} type={t} onSelect={onSelect} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Remediation
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {REMEDIATION_TYPES.map((t) => (
              <TypeButton key={t} type={t} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 3b: Implement step-fill-content.tsx

This step renders a generic form based on the card type. For Phase 06 it covers the most common fields; type-specific exotic fields (cloze template syntax, occlusion regions) get a raw JSON textarea as fallback — Phase 10 will replace these with richer editors.

```tsx
// apps/web/src/components/cards/card-creator/step-fill-content.tsx
'use client';

import { Label, Input, Textarea, Badge, Button } from '@noema/ui';
import { MediaUploader } from '@/components/cards/media-uploader';
import { X } from 'lucide-react';
import React, { useState } from 'react';

// Types that have an image URL as their primary media field
const IMAGE_TYPES = new Set(['image_occlusion', 'diagram', 'multimodal']);
// Types that have an audio URL as their primary media field
const AUDIO_TYPES = new Set(['audio']);
// Types where "front" + "back" are the primary content fields (simple flip cards)
const FLIP_TYPES = new Set(['atomic', 'definition', 'true_false', 'multiple_choice', 'confidence_rated']);

interface IStepFillContentProps {
  cardType: string;
  content: Record<string, unknown>;
  tags: string[];
  onChange: (content: Record<string, unknown>) => void;
  onTagsChange: (tags: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepFillContent({
  cardType,
  content,
  tags,
  onChange,
  onTagsChange,
  onBack,
  onNext,
}: IStepFillContentProps): React.JSX.Element {
  const [tagInput, setTagInput] = useState('');

  function set(key: string, value: unknown): void {
    onChange({ ...content, [key]: value });
  }

  function addTag(tag: string): void {
    const t = tag.trim();
    if (t === '' || tags.includes(t)) return;
    onTagsChange([...tags, t]);
    setTagInput('');
  }

  function removeTag(tag: string): void {
    onTagsChange(tags.filter((t) => t !== tag));
  }

  const hasRequiredContent = (): boolean => {
    if (FLIP_TYPES.has(cardType)) return Boolean(content['front']) && Boolean(content['back']);
    if (IMAGE_TYPES.has(cardType)) return Boolean(content['imageUrl']);
    if (AUDIO_TYPES.has(cardType)) return Boolean(content['audioUrl']);
    // For complex types: require at least the JSON content field to be non-empty
    return Boolean(content['_raw'] ?? content['front'] ?? content['template']);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Fill in the content</h2>
        <p className="text-sm text-muted-foreground mt-0.5 capitalize">
          {cardType.replace(/_/g, ' ')} card
        </p>
      </div>

      {/* Flip card fields */}
      {FLIP_TYPES.has(cardType) && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="front">Front</Label>
            <Textarea
              id="front"
              placeholder="Question or prompt…"
              rows={3}
              value={String(content['front'] ?? '')}
              onChange={(e) => { set('front', e.target.value); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="back">Back</Label>
            <Textarea
              id="back"
              placeholder="Answer…"
              rows={3}
              value={String(content['back'] ?? '')}
              onChange={(e) => { set('back', e.target.value); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hint">Hint (optional)</Label>
            <Input
              id="hint"
              placeholder="Optional memory hint…"
              value={String(content['hint'] ?? '')}
              onChange={(e) => { set('hint', e.target.value); }}
            />
          </div>
        </>
      )}

      {/* Cloze template */}
      {cardType === 'cloze' && (
        <div className="space-y-1.5">
          <Label htmlFor="template">Template</Label>
          <Textarea
            id="template"
            placeholder="The capital of {{France}} is {{Paris}}."
            rows={4}
            value={String(content['template'] ?? '')}
            onChange={(e) => { set('template', e.target.value); }}
          />
          <p className="text-xs text-muted-foreground">
            Wrap blanks in {'{{double braces}}'}. Each blank becomes a separate cloze deletion.
          </p>
        </div>
      )}

      {/* Image upload */}
      {IMAGE_TYPES.has(cardType) && (
        <div className="space-y-1.5">
          <Label>Image</Label>
          <MediaUploader
            accept="image"
            currentUrl={content['imageUrl'] as string | undefined}
            onUploadComplete={(url) => { set('imageUrl', url); }}
          />
          <p className="text-xs text-muted-foreground">
            {cardType === 'image_occlusion'
              ? 'After upload, occlusion regions can be defined in the card editor.'
              : 'This image will appear with label overlays.'}
          </p>
        </div>
      )}

      {/* Audio upload */}
      {AUDIO_TYPES.has(cardType) && (
        <div className="space-y-1.5">
          <Label>Audio</Label>
          <MediaUploader
            accept="audio"
            currentUrl={content['audioUrl'] as string | undefined}
            onUploadComplete={(url) => { set('audioUrl', url); }}
          />
          <div className="space-y-1.5 mt-2">
            <Label htmlFor="transcript">Transcript (optional)</Label>
            <Textarea
              id="transcript"
              placeholder="What should the learner recall from this audio?"
              rows={2}
              value={String(content['transcript'] ?? '')}
              onChange={(e) => { set('transcript', e.target.value); }}
            />
          </div>
        </div>
      )}

      {/* Generic fallback for complex types */}
      {!FLIP_TYPES.has(cardType) && cardType !== 'cloze' && !IMAGE_TYPES.has(cardType) && !AUDIO_TYPES.has(cardType) && (
        <div className="space-y-1.5">
          <Label htmlFor="raw-content">Content (JSON)</Label>
          <Textarea
            id="raw-content"
            placeholder="{}"
            rows={6}
            className="font-mono text-xs"
            value={String(content['_raw'] ?? '{}')}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value) as Record<string, unknown>;
                onChange({ ...parsed, _raw: e.target.value });
              } catch {
                onChange({ ...content, _raw: e.target.value });
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Advanced: enter content JSON directly. Richer editors coming in Phase 10.
          </p>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1 mb-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs">
              {tag}
              <button type="button" onClick={() => { removeTag(tag); }}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          placeholder="Add tag, press Enter"
          className="text-sm"
          value={tagInput}
          onChange={(e) => { setTagInput(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
          }}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onNext} disabled={!hasRequiredContent()}>
          Review
        </Button>
      </div>
    </div>
  );
}
```

### Step 3c: Implement step-review.tsx

```tsx
// apps/web/src/components/cards/card-creator/step-review.tsx
'use client';

import type { ICreateCardInput } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardRenderer } from '@/components/cards/renderers/card-renderer';
import React from 'react';

interface IStepReviewProps {
  draft: ICreateCardInput;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepReview({ draft, isPending, onBack, onSubmit }: IStepReviewProps): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Review your card</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preview how the card will appear during study.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4 bg-card">
        <CardRenderer card={draft as unknown as Parameters<typeof CardRenderer>[0]['card']} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isPending}>
          {isPending ? 'Creating…' : 'Create Card'}
        </Button>
      </div>
    </div>
  );
}
```

### Step 3d: Implement new/page.tsx

```tsx
// apps/web/src/app/(authenticated)/cards/new/page.tsx
'use client';

import { useCreateCard } from '@noema/api-client';
import type { ICreateCardInput } from '@noema/api-client';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { StepFillContent } from '@/components/cards/card-creator/step-fill-content';
import { StepReview } from '@/components/cards/card-creator/step-review';
import { StepSelectType } from '@/components/cards/card-creator/step-select-type';

type WizardStep = 1 | 2 | 3;

// Step indicator dots
function StepDots({ step }: { step: WizardStep }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {([1, 2, 3] as const).map((s) => (
        <div
          key={s}
          className={[
            'h-2 rounded-full transition-all',
            s === step ? 'w-6 bg-primary' : 'w-2 bg-border',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

export default function NewCardPage(): React.JSX.Element {
  const router = useRouter();
  const createCard = useCreateCard();

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [tags, setTags] = useState<string[]>([]);

  function handleTypeSelect(type: string): void {
    setSelectedType(type);
    setContent({});
    setStep(2);
  }

  async function handleSubmit(): Promise<void> {
    if (selectedType === null) return;

    // Strip the _raw helper key before sending
    const { _raw: _discard, ...cleanContent } = content;

    const input: ICreateCardInput = {
      cardType: selectedType,
      content: cleanContent,
      tags,
    };

    const result = await createCard.mutateAsync(input);
    router.push(`/cards/${result.data.id as string}`);
  }

  const draft: Partial<ICreateCardInput> = {
    cardType: selectedType ?? '',
    content,
    tags,
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { router.back(); }}
        >
          ← Back to Library
        </button>
        <h1 className="text-2xl font-bold">New Card</h1>
      </div>

      <StepDots step={step} />

      <div className="rounded-xl border border-border bg-card p-6">
        {step === 1 && <StepSelectType onSelect={handleTypeSelect} />}

        {step === 2 && selectedType !== null && (
          <StepFillContent
            cardType={selectedType}
            content={content}
            tags={tags}
            onChange={setContent}
            onTagsChange={setTags}
            onBack={() => { setStep(1); }}
            onNext={() => { setStep(3); }}
          />
        )}

        {step === 3 && (
          <StepReview
            draft={draft as ICreateCardInput}
            isPending={createCard.isPending}
            onBack={() => { setStep(2); }}
            onSubmit={() => { void handleSubmit(); }}
          />
        )}
      </div>
    </div>
  );
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test 'cards/new/page'
```

Expected: PASS (4 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/app/(authenticated)/cards/new/ \
        apps/web/src/components/cards/card-creator/
git commit -m "feat(web): add Card Creator wizard (/cards/new)"
```

---

## Task T18: Card Detail Page (`/cards/[id]`)

**Files:**
- Create: `apps/web/src/app/(authenticated)/cards/[id]/page.tsx`

### What it renders

A page with two modes toggled by an "Edit" button:

**View mode:**
- Card type badge + state chip + tags
- Full `CardRenderer` preview (uses the actual renderer for that type)
- Card stats: difficulty, review count, last reviewed
- Danger zone: Delete button (with confirmation)

**Edit mode:**
- Same form as step-fill-content from the wizard, pre-filled
- "Save changes" submits `useUpdateCard({ id, data: { content, version } })` with optimistic locking
- Version mismatch (409) shows conflict warning: "Someone else updated this card. Reload to see latest."

### Step 1: Write failing tests

```tsx
// apps/web/src/app/(authenticated)/cards/[id]/page.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardDetailPage from './page.js';

vi.mock('@noema/api-client', () => ({
  useCard: () => ({
    data: {
      data: {
        id: 'card-1',
        cardType: 'atomic',
        state: 'ACTIVE',
        tags: ['biology'],
        content: { front: 'What is ATP?', back: 'Adenosine triphosphate' },
        difficulty: 0.3,
        version: 1,
        knowledgeNodeIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    isLoading: false,
  }),
  useUpdateCard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCardHistory: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'card-1' }),
}));

test('renders card type and state', () => {
  render(<CardDetailPage />);
  expect(screen.getByText(/atomic/i)).toBeInTheDocument();
  expect(screen.getByText(/active/i)).toBeInTheDocument();
});

test('entering edit mode shows Save button', () => {
  render(<CardDetailPage />);
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
});

test('shows tags', () => {
  render(<CardDetailPage />);
  expect(screen.getByText('biology')).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test 'cards/\[id\]/page'
```

Expected: FAIL.

### Step 3: Implement card detail page

```tsx
// apps/web/src/app/(authenticated)/cards/[id]/page.tsx
'use client';

import { useCard, useDeleteCard, useUpdateCard } from '@noema/api-client';
import { Badge, Button, Separator } from '@noema/ui';
import { StateChip } from '@noema/ui';
import { ArrowLeft, Edit2, Save, Trash2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { CardRenderer } from '@/components/cards/renderers/card-renderer';
import { StepFillContent } from '@/components/cards/card-creator/step-fill-content';

function typeLabel(t: string): string {
  return t.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export default function CardDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useCard(id);
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();

  const card = data?.data;

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<Record<string, unknown>>({});
  const [editTags, setEditTags] = useState<string[]>([]);
  const [conflictError, setConflictError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Sync local edit state when card loads
  useEffect(() => {
    if (card !== undefined) {
      setEditContent(card.content as Record<string, unknown>);
      setEditTags(card.tags);
    }
  }, [card]);

  if (isLoading || card === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  async function handleSave(): Promise<void> {
    if (card === undefined) return;
    setConflictError(false);
    try {
      await updateCard.mutateAsync({
        id: card.id as string,
        data: { content: editContent, tags: editTags, version: card.version },
      });
      setEditMode(false);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setConflictError(true);
      }
    }
  }

  async function handleDelete(): Promise<void> {
    if (card === undefined) return;
    await deleteCard.mutateAsync({ id: card.id as string });
    router.push('/cards');
  }

  return (
    <div className="mx-auto max-w-2xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { router.back(); }}
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </button>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setEditMode(false); setConflictError(false); }}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => { void handleSave(); }} disabled={updateCard.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {updateCard.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setEditMode(true); }}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Conflict warning */}
      {conflictError && (
        <div className="rounded-lg border border-cortex-400/30 bg-cortex-400/5 px-4 py-3 text-sm text-cortex-400">
          Conflict detected: this card was modified elsewhere. Reload to see the latest version.
        </div>
      )}

      {/* Card metadata */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-medium">{typeLabel(card.cardType)}</Badge>
        <StateChip state={card.state} />
        {card.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
        ))}
      </div>

      <Separator />

      {/* Content — view or edit */}
      {editMode ? (
        <StepFillContent
          cardType={card.cardType}
          content={editContent}
          tags={editTags}
          onChange={setEditContent}
          onTagsChange={setEditTags}
          onBack={() => { setEditMode(false); }}
          onNext={() => { void handleSave(); }}
        />
      ) : (
        <div className="rounded-xl border border-border p-4 bg-card">
          <CardRenderer card={card as unknown as Parameters<typeof CardRenderer>[0]['card']} />
        </div>
      )}

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg font-semibold">{String(Math.round(card.difficulty * 100))}%</p>
          <p className="text-xs text-muted-foreground">Difficulty</p>
        </div>
        <div>
          <p className="text-lg font-semibold">v{String(card.version)}</p>
          <p className="text-xs text-muted-foreground">Version</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{String(card.knowledgeNodeIds.length)}</p>
          <p className="text-xs text-muted-foreground">Node Links</p>
        </div>
      </div>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Danger Zone</p>
        {deleteConfirm ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-cortex-400">Are you sure? This cannot be undone.</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-cortex-400 hover:text-cortex-300"
              onClick={() => { void handleDelete(); }}
              disabled={deleteCard.isPending}
            >
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDeleteConfirm(false); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-cortex-400 hover:text-cortex-300 gap-1.5"
            onClick={() => { setDeleteConfirm(true); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete card
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test 'cards/\[id\]/page'
```

Expected: PASS (3 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/app/(authenticated)/cards/\[id\]/
git commit -m "feat(web): add Card Detail page with view/edit mode and optimistic locking"
```

---

## Task T19: Batch Operations Page (`/cards/batch`)

**Files:**
- Create: `apps/web/src/app/(authenticated)/cards/batch/page.tsx`

### What it renders

A list of recent card creation batches with:
- Batch ID (truncated to 8 chars), card count, creation date
- "Rollback" button per batch with confirmation
- Uses `useRecentBatches()` hook from phase-06a
- Rollback uses `useRollbackBatch()` with query invalidation

### Step 1: Write failing tests

```tsx
// apps/web/src/app/(authenticated)/cards/batch/page.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import BatchPage from './page.js';

vi.mock('@noema/api-client', () => ({
  useRecentBatches: () => ({
    data: {
      data: [
        { batchId: 'batch-abc-123', count: 5, createdAt: '2026-03-01T10:00:00Z' },
        { batchId: 'batch-def-456', count: 12, createdAt: '2026-02-28T09:00:00Z' },
      ],
    },
    isLoading: false,
  }),
  useRollbackBatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  contentKeys: { cards: () => ['content', 'cards'] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

test('renders page heading', () => {
  render(<BatchPage />);
  expect(screen.getByRole('heading', { name: /batch operations/i })).toBeInTheDocument();
});

test('renders both batches', () => {
  render(<BatchPage />);
  expect(screen.getByText(/batch-abc/i)).toBeInTheDocument();
  expect(screen.getByText(/batch-def/i)).toBeInTheDocument();
});

test('renders card counts', () => {
  render(<BatchPage />);
  expect(screen.getByText('5 cards')).toBeInTheDocument();
  expect(screen.getByText('12 cards')).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test 'cards/batch/page'
```

Expected: FAIL.

### Step 3: Implement batch page

```tsx
// apps/web/src/app/(authenticated)/cards/batch/page.tsx
'use client';

import { contentKeys, useRecentBatches, useRollbackBatch } from '@noema/api-client';
import { Button } from '@noema/ui';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BatchPage(): React.JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useRecentBatches();
  const rollbackBatch = useRollbackBatch();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rolledBack, setRolledBack] = useState<Set<string>>(new Set());

  const batches = data?.data ?? [];

  async function handleRollback(batchId: string): Promise<void> {
    await rollbackBatch.mutateAsync({ batchId });
    setRolledBack((prev) => new Set([...prev, batchId]));
    setConfirmId(null);
    void qc.invalidateQueries({ queryKey: contentKeys.cards() });
  }

  return (
    <div className="mx-auto max-w-2xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { router.push('/cards'); }}
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </button>
        <h1 className="text-2xl font-bold">Batch Operations</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Recent card creation batches. Rolling back a batch soft-deletes all cards created in that batch.
      </p>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading && batches.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No recent batches found.</p>
      )}

      <div className="space-y-3">
        {batches.map((batch) => {
          const isRolledBack = rolledBack.has(batch.batchId);
          return (
            <div
              key={batch.batchId}
              className={[
                'flex items-center justify-between rounded-lg border px-4 py-3',
                isRolledBack ? 'border-border/50 opacity-50' : 'border-border bg-card',
              ].join(' ')}
            >
              <div className="space-y-0.5">
                <p className="font-mono text-sm font-medium">
                  {batch.batchId.slice(0, 8)}…
                </p>
                <p className="text-xs text-muted-foreground">
                  {String(batch.count)} cards · {formatDate(batch.createdAt)}
                </p>
              </div>

              {isRolledBack ? (
                <span className="text-xs text-muted-foreground italic">Rolled back</span>
              ) : confirmId === batch.batchId ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-cortex-400">Delete {String(batch.count)} cards?</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-cortex-400 hover:text-cortex-300 h-7 px-2 text-xs"
                    onClick={() => { void handleRollback(batch.batchId); }}
                    disabled={rollbackBatch.isPending}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => { setConfirmId(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => { setConfirmId(batch.batchId); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Rollback
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test 'cards/batch/page'
```

Expected: PASS (3 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/app/(authenticated)/cards/batch/
git commit -m "feat(web): add Batch Operations page with rollback confirmation"
```

---

## Summary

After this phase, all 4 card pages are live:

| Route | Page | Key feature |
|---|---|---|
| `/cards` | Card Library | Infinite scroll + filter panel + bulk actions |
| `/cards/new` | Card Creator | 3-step wizard: type → content → review |
| `/cards/[id]` | Card Detail | View/edit toggle + optimistic locking + delete |
| `/cards/batch` | Batch Operations | Recent batches + per-batch rollback |
