# Phase 06c — Card Shared Components Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build three families of reusable card UI components — the DeckQuery filter panel, the card grid/list view with multi-select and bulk actions, and the media uploader — that the card pages (phase-06d) will compose.

**Architecture:** All components are `'use client'` React components living in `apps/web/src/components/cards/`. They consume `@noema/api-client` hooks and types introduced in phase-06a. No business logic leaks into these components; they accept state as props and call callbacks upward.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, `@noema/ui`, `@noema/api-client`, lucide-react

---

## Context for all tasks

- `IDeckQueryInput` lives in `packages/api-client/src/content/types.ts` (rewritten in phase-06a)
- `ICardSummaryDto` is the list-safe card shape (no full content blob)
- `CardType` constant object from `@noema/types` — values are lowercase strings (`'atomic'`, `'cloze'`, …)
- All 42 card types: 22 standard (ATOMIC … MULTIMODAL) + 20 remediation (CONTRASTIVE_PAIR … PARTIAL_KNOWLEDGE_DECOMPOSITION)
- Media upload flow: `POST /v1/media/upload-url` → direct PUT to presigned URL → `POST /v1/media/{id}/confirm`
- Standard/Remediation grouping is defined by whether the type string is a key in `RemediationCardType` object from `@noema/types`

---

## Task T13: DeckQuery Filter Panel

**Files:**
- Create: `apps/web/src/components/cards/deck-query-filter.tsx`
- Create: `apps/web/src/components/cards/deck-query-filter.test.tsx`

### What it does

A collapsible filter sidebar / sheet that lets the user build a `IDeckQueryInput` query. Contains:
1. Full-text search input (maps to `search` field)
2. Card type multi-select grouped into Standard / Remediation chips
3. Card state multi-select (DRAFT, ACTIVE, SUSPENDED, ARCHIVED)
4. Tag free-text input with chip display (maps to `tags` filter)
5. Sort selector (field + direction)
6. "Apply" / "Reset" buttons

The panel is **controlled** — all state lives in the parent. The component calls `onChange(query: IDeckQueryInput)` and `onReset()`.

### Step 1: Write the failing tests

```tsx
// apps/web/src/components/cards/deck-query-filter.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeckQueryFilter } from './deck-query-filter.js';

const noop = () => undefined;

test('renders search input', () => {
  render(<DeckQueryFilter query={{}} onChange={noop} onReset={noop} />);
  expect(screen.getByPlaceholderText(/search cards/i)).toBeInTheDocument();
});

test('calls onChange with search text', () => {
  const onChange = vi.fn();
  render(<DeckQueryFilter query={{}} onChange={onChange} onReset={noop} />);
  fireEvent.change(screen.getByPlaceholderText(/search cards/i), {
    target: { value: 'photosynthesis' },
  });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'photosynthesis' }));
});

test('calls onReset when Reset is clicked', () => {
  const onReset = vi.fn();
  render(<DeckQueryFilter query={{ search: 'foo' }} onChange={noop} onReset={onReset} />);
  fireEvent.click(screen.getByRole('button', { name: /reset/i }));
  expect(onReset).toHaveBeenCalled();
});

test('renders Standard and Remediation type groups', () => {
  render(<DeckQueryFilter query={{}} onChange={noop} onReset={noop} />);
  expect(screen.getByText('Standard')).toBeInTheDocument();
  expect(screen.getByText('Remediation')).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test deck-query-filter
```

Expected: FAIL — module not found.

### Step 3: Implement the component

```tsx
// apps/web/src/components/cards/deck-query-filter.tsx
'use client';

import { CardType, RemediationCardType } from '@noema/types';
import type { IDeckQueryInput } from '@noema/api-client';
import { Badge, Button, Input, Label, Separator } from '@noema/ui';
import { Search, X } from 'lucide-react';
import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Type groupings
// ---------------------------------------------------------------------------

const REMEDIATION_VALUES = new Set(Object.values(RemediationCardType));

const STANDARD_TYPES = Object.values(CardType).filter((t) => !REMEDIATION_VALUES.has(t as never));
const REMEDIATION_TYPES = Object.values(RemediationCardType);

const CARD_STATES = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
type CardState = (typeof CARD_STATES)[number];

// Human-readable labels for types
function typeLabel(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface IDeckQueryFilterProps {
  query: IDeckQueryInput;
  onChange: (q: IDeckQueryInput) => void;
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypeChip({
  type,
  selected,
  onToggle,
}: {
  type: string;
  selected: boolean;
  onToggle: (t: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => { onToggle(type); }}
      className={[
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50',
      ].join(' ')}
    >
      {typeLabel(type)}
    </button>
  );
}

function StateChip({
  state,
  selected,
  onToggle,
}: {
  state: CardState;
  selected: boolean;
  onToggle: (s: CardState) => void;
}): React.JSX.Element {
  const COLOR: Record<CardState, string> = {
    DRAFT: 'border-axon-400/40 text-axon-400',
    ACTIVE: 'border-dendrite-400/40 text-dendrite-400',
    SUSPENDED: 'border-myelin-400/40 text-myelin-400',
    ARCHIVED: 'border-cortex-400/40 text-cortex-400',
  };
  return (
    <button
      type="button"
      onClick={() => { onToggle(state); }}
      className={[
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        selected ? COLOR[state] + ' bg-current/5' : 'border-border text-muted-foreground hover:border-primary/50',
      ].join(' ')}
    >
      {state.charAt(0) + state.slice(1).toLowerCase()}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DeckQueryFilter({ query, onChange, onReset }: IDeckQueryFilterProps): React.JSX.Element {
  const [tagInput, setTagInput] = useState('');

  // Derived state from query
  const selectedTypes = new Set(query.cardTypes ?? []);
  const selectedStates = new Set((query.states ?? []) as CardState[]);
  const activeTags = query.tags ?? [];

  function toggleType(t: string): void {
    const next = new Set(selectedTypes);
    if (next.has(t)) {
      next.delete(t);
    } else {
      next.add(t);
    }
    onChange({ ...query, cardTypes: next.size > 0 ? [...next] : undefined });
  }

  function toggleState(s: CardState): void {
    const next = new Set(selectedStates);
    if (next.has(s)) {
      next.delete(s);
    } else {
      next.add(s);
    }
    onChange({ ...query, states: next.size > 0 ? [...next] : undefined });
  }

  function addTag(tag: string): void {
    const trimmed = tag.trim();
    if (trimmed === '' || activeTags.includes(trimmed)) return;
    onChange({ ...query, tags: [...activeTags, trimmed] });
    setTagInput('');
  }

  function removeTag(tag: string): void {
    onChange({ ...query, tags: activeTags.filter((t) => t !== tag) });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search cards..."
          className="pl-8 text-sm"
          value={query.search ?? ''}
          onChange={(e) => { onChange({ ...query, search: e.target.value || undefined }); }}
        />
      </div>

      <Separator />

      {/* Standard card types */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Standard
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_TYPES.map((t) => (
            <TypeChip key={t} type={t} selected={selectedTypes.has(t)} onToggle={toggleType} />
          ))}
        </div>
      </div>

      {/* Remediation card types */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Remediation
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {REMEDIATION_TYPES.map((t) => (
            <TypeChip key={t} type={t} selected={selectedTypes.has(t)} onToggle={toggleType} />
          ))}
        </div>
      </div>

      <Separator />

      {/* State filter */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          State
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {CARD_STATES.map((s) => (
            <StateChip key={s} state={s} selected={selectedStates.has(s)} onToggle={toggleState} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Tags */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tags
        </Label>
        <div className="flex flex-wrap gap-1">
          {activeTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs">
              {tag}
              <button
                type="button"
                className="rounded-full hover:bg-muted"
                onClick={() => { removeTag(tag); }}
              >
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
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
        />
      </div>

      <Separator />

      {/* Sort */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Sort
        </Label>
        <div className="flex gap-2">
          <select
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            value={query.sortBy ?? 'createdAt'}
            onChange={(e) => { onChange({ ...query, sortBy: e.target.value as IDeckQueryInput['sortBy'] }); }}
          >
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="difficulty">Difficulty</option>
            <option value="nextReviewAt">Next Review</option>
          </select>
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            value={query.sortDir ?? 'desc'}
            onChange={(e) => { onChange({ ...query, sortDir: e.target.value as 'asc' | 'desc' }); }}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground"
        onClick={onReset}
      >
        Reset filters
      </Button>
    </div>
  );
}
```

### Step 4: Run tests to verify they pass

```bash
cd apps/web && pnpm test deck-query-filter
```

Expected: PASS (4 tests)

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

### Step 6: Commit

```bash
git add apps/web/src/components/cards/deck-query-filter.tsx \
        apps/web/src/components/cards/deck-query-filter.test.tsx
git commit -m "feat(web): add DeckQueryFilter panel component"
```

---

## Task T14: Card Grid, Card List, Multi-select, and Bulk Action Bar

**Files:**
- Create: `apps/web/src/components/cards/card-summary-card.tsx` — single card tile (grid mode)
- Create: `apps/web/src/components/cards/card-summary-row.tsx` — single card row (list mode)
- Create: `apps/web/src/components/cards/bulk-action-bar.tsx` — floating selection bar
- Create: `apps/web/src/components/cards/card-collection.tsx` — orchestrator: view toggle + selection + renders grid or list

### Step 1: Write failing tests

```tsx
// apps/web/src/components/cards/card-collection.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardCollection } from './card-collection.js';
import type { ICardSummaryDto } from '@noema/api-client';

const makeCard = (id: string): ICardSummaryDto => ({
  id: id as unknown as import('@noema/types').CardId,
  cardType: 'atomic',
  state: 'ACTIVE',
  tags: ['test'],
  knowledgeNodeIds: [],
  difficulty: 0.3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

test('renders cards in grid mode by default', () => {
  const cards = [makeCard('1'), makeCard('2')];
  render(<CardCollection cards={cards} isLoading={false} />);
  expect(screen.getAllByRole('article')).toHaveLength(2);
});

test('shows loading skeletons when isLoading=true', () => {
  render(<CardCollection cards={[]} isLoading={true} />);
  expect(screen.getAllByTestId('card-skeleton')).toHaveLength(8);
});

test('shows empty state when no cards', () => {
  render(<CardCollection cards={[]} isLoading={false} />);
  expect(screen.getByText(/no cards/i)).toBeInTheDocument();
});

test('bulk action bar appears after selection', () => {
  const cards = [makeCard('1'), makeCard('2')];
  render(<CardCollection cards={cards} isLoading={false} />);
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
});

test('select-all checkbox selects all cards', () => {
  const cards = [makeCard('1'), makeCard('2'), makeCard('3')];
  render(<CardCollection cards={cards} isLoading={false} />);
  fireEvent.click(screen.getByLabelText(/select all/i));
  expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test card-collection
```

Expected: FAIL — module not found.

### Step 3a: Implement card-summary-card.tsx (grid tile)

```tsx
// apps/web/src/components/cards/card-summary-card.tsx
'use client';

import type { ICardSummaryDto } from '@noema/api-client';
import { Badge, Card, CardContent, CardHeader, Checkbox } from '@noema/ui';
import { StateChip } from '@noema/ui';
import React from 'react';

function typeLabel(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

interface ICardSummaryCardProps {
  card: ICardSummaryDto;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: (id: string) => void;
}

export function CardSummaryCard({
  card,
  selected,
  onSelect,
  onClick,
}: ICardSummaryCardProps): React.JSX.Element {
  return (
    <Card
      role="article"
      className={[
        'relative cursor-pointer transition-shadow hover:shadow-md',
        selected ? 'ring-2 ring-primary' : '',
      ].join(' ')}
      onClick={() => { onClick(card.id as string); }}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {typeLabel(card.cardType)}
          </span>
          <Checkbox
            checked={selected}
            aria-label={`Select card ${card.id as string}`}
            onClick={(e) => { e.stopPropagation(); }}
            onCheckedChange={(v) => { onSelect(card.id as string, v === true); }}
            className="mt-0.5 flex-shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <StateChip state={card.state} />
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
            {card.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{String(card.tags.length - 3)}</span>
            )}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Difficulty: {String(Math.round(card.difficulty * 100))}%
        </p>
      </CardContent>
    </Card>
  );
}
```

### Step 3b: Implement card-summary-row.tsx (list row)

```tsx
// apps/web/src/components/cards/card-summary-row.tsx
'use client';

import type { ICardSummaryDto } from '@noema/api-client';
import { Badge, Checkbox } from '@noema/ui';
import { StateChip } from '@noema/ui';
import React from 'react';

function typeLabel(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

interface ICardSummaryRowProps {
  card: ICardSummaryDto;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: (id: string) => void;
}

export function CardSummaryRow({
  card,
  selected,
  onSelect,
  onClick,
}: ICardSummaryRowProps): React.JSX.Element {
  return (
    <div
      role="article"
      className={[
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50',
        selected ? 'border-primary bg-primary/5' : 'border-border',
      ].join(' ')}
      onClick={() => { onClick(card.id as string); }}
    >
      <Checkbox
        checked={selected}
        aria-label={`Select card ${card.id as string}`}
        onClick={(e) => { e.stopPropagation(); }}
        onCheckedChange={(v) => { onSelect(card.id as string, v === true); }}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{typeLabel(card.cardType)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {card.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <StateChip state={card.state} />
        <span className="text-xs text-muted-foreground hidden sm:block">
          {String(Math.round(card.difficulty * 100))}%
        </span>
      </div>
    </div>
  );
}
```

### Step 3c: Implement bulk-action-bar.tsx

```tsx
// apps/web/src/components/cards/bulk-action-bar.tsx
'use client';

import { Button } from '@noema/ui';
import { Archive, Play, Trash2, X } from 'lucide-react';
import React from 'react';

interface IBulkActionBarProps {
  count: number;
  onActivate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  onActivate,
  onArchive,
  onDelete,
  onClear,
}: IBulkActionBarProps): React.JSX.Element {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xl">
      <span className="text-sm font-medium pr-2 border-r border-border mr-1">
        {String(count)} selected
      </span>
      <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={onActivate}>
        <Play className="h-3.5 w-3.5" />
        Activate
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={onArchive}>
        <Archive className="h-3.5 w-3.5" />
        Archive
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 text-xs text-cortex-400 hover:text-cortex-300"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <button
        type="button"
        className="ml-1 rounded-md p-1 hover:bg-muted text-muted-foreground"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

### Step 3d: Implement card-collection.tsx (orchestrator)

```tsx
// apps/web/src/components/cards/card-collection.tsx
'use client';

import type { ICardSummaryDto } from '@noema/api-client';
import { Button, Checkbox, Skeleton } from '@noema/ui';
import { LayoutGrid, List } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useState } from 'react';
import { BulkActionBar } from './bulk-action-bar.js';
import { CardSummaryCard } from './card-summary-card.js';
import { CardSummaryRow } from './card-summary-row.js';

type ViewMode = 'grid' | 'list';

interface ICardCollectionProps {
  cards: ICardSummaryDto[];
  isLoading: boolean;
  onBulkActivate?: (ids: string[]) => void;
  onBulkArchive?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
}

export function CardCollection({
  cards,
  isLoading,
  onBulkActivate,
  onBulkArchive,
  onBulkDelete,
}: ICardCollectionProps): React.JSX.Element {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelect = useCallback((id: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean): void => {
      if (checked) {
        setSelected(new Set(cards.map((c) => c.id as string)));
      } else {
        setSelected(new Set());
      }
    },
    [cards],
  );

  const handleClick = useCallback(
    (id: string): void => {
      router.push(`/cards/${id}`);
    },
    [router],
  );

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} data-testid="card-skeleton" className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No cards match your filters.</p>
        <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const selectedList = [...selected];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            aria-label="Select all"
            checked={selected.size === cards.length && cards.length > 0}
            onCheckedChange={(v) => { handleSelectAll(v === true); }}
          />
          <span className="text-xs text-muted-foreground">{String(cards.length)} cards</span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            className="h-6 w-6 p-0"
            onClick={() => { setViewMode('grid'); }}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            className="h-6 w-6 p-0"
            onClick={() => { setViewMode('list'); }}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Cards */}
      {viewMode === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <CardSummaryCard
              key={card.id as string}
              card={card}
              selected={selected.has(card.id as string)}
              onSelect={handleSelect}
              onClick={handleClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <CardSummaryRow
              key={card.id as string}
              card={card}
              selected={selected.has(card.id as string)}
              onSelect={handleSelect}
              onClick={handleClick}
            />
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onActivate={() => { onBulkActivate?.(selectedList); setSelected(new Set()); }}
          onArchive={() => { onBulkArchive?.(selectedList); setSelected(new Set()); }}
          onDelete={() => { onBulkDelete?.(selectedList); setSelected(new Set()); }}
          onClear={() => { setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test card-collection
```

Expected: PASS (5 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/components/cards/card-summary-card.tsx \
        apps/web/src/components/cards/card-summary-row.tsx \
        apps/web/src/components/cards/bulk-action-bar.tsx \
        apps/web/src/components/cards/card-collection.tsx \
        apps/web/src/components/cards/card-collection.test.tsx
git commit -m "feat(web): add CardCollection with grid/list views, multi-select, and bulk action bar"
```

---

## Task T15: Media Uploader

**Files:**
- Create: `apps/web/src/components/cards/media-uploader.tsx`
- Create: `apps/web/src/components/cards/media-uploader.test.tsx`

### What it does

A self-contained file upload component that:
1. Renders a dropzone / file input styled as a dashed box
2. On file select: calls `POST /v1/media/upload-url` → gets `{ uploadUrl, id }` back
3. Does a direct `fetch PUT` to `uploadUrl` with the file as body (presigned URL, no auth header)
4. On success: calls `POST /v1/media/{id}/confirm` → gets `{ url }` back
5. Calls `onUploadComplete(url, id)` on success
6. Shows progress bar during upload and error state on failure

**Props:**
```ts
interface IMediaUploaderProps {
  accept: 'image' | 'audio';
  onUploadComplete: (publicUrl: string, mediaId: string) => void;
  currentUrl?: string;         // show existing if any
  className?: string;
}
```

The presigned PUT upload is done with a raw `fetch` — NOT through the API client (which would add auth headers that would break presigned URLs).

### Step 1: Write failing tests

```tsx
// apps/web/src/components/cards/media-uploader.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaUploader } from './media-uploader.js';

// Mock the api-client hooks
vi.mock('@noema/api-client', () => ({
  useRequestUploadUrl: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ data: { uploadUrl: 'https://storage.example.com/presigned', id: 'media-123' } }),
  }),
  useConfirmUpload: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ data: { url: 'https://cdn.example.com/media/media-123.jpg' } }),
  }),
}));

// Mock fetch for presigned PUT
global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

test('renders dropzone for image upload', () => {
  render(<MediaUploader accept="image" onUploadComplete={vi.fn()} />);
  expect(screen.getByText(/click or drag/i)).toBeInTheDocument();
});

test('calls onUploadComplete after successful upload', async () => {
  const onComplete = vi.fn();
  render(<MediaUploader accept="image" onUploadComplete={onComplete} />);

  const input = screen.getByTestId('media-file-input');
  const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith(
      'https://cdn.example.com/media/media-123.jpg',
      'media-123',
    );
  });
});

test('shows current image preview when currentUrl provided', () => {
  render(
    <MediaUploader
      accept="image"
      onUploadComplete={vi.fn()}
      currentUrl="https://cdn.example.com/test.jpg"
    />,
  );
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example.com/test.jpg');
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test media-uploader
```

Expected: FAIL.

### Step 3: Implement the component

```tsx
// apps/web/src/components/cards/media-uploader.tsx
'use client';

import { useConfirmUpload, useRequestUploadUrl } from '@noema/api-client';
import { cn } from '@noema/ui/lib/utils';
import { AlertCircle, CheckCircle, ImageIcon, Music, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';

interface IMediaUploaderProps {
  accept: 'image' | 'audio';
  onUploadComplete: (publicUrl: string, mediaId: string) => void;
  currentUrl?: string;
  className?: string;
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

const ACCEPT_MAP = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  audio: 'audio/mpeg,audio/ogg,audio/wav,audio/mp4',
};

export function MediaUploader({
  accept,
  onUploadComplete,
  currentUrl,
  className,
}: IMediaUploaderProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentUrl);

  const requestUploadUrl = useRequestUploadUrl();
  const confirmUpload = useConfirmUpload();

  async function handleFile(file: File): Promise<void> {
    setStatus('uploading');
    setProgress(10);
    setErrorMsg('');

    try {
      // Step 1: Request presigned URL
      const urlRes = await requestUploadUrl.mutateAsync({ filename: file.name, mimeType: file.type });
      const { uploadUrl, id } = urlRes.data;
      setProgress(30);

      // Step 2: Direct PUT to presigned URL (no auth headers — presigned URL is self-authorizing)
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!putRes.ok) {
        throw new Error(`Storage upload failed: ${String(putRes.status)}`);
      }
      setProgress(70);

      // Step 3: Confirm upload
      const confirmRes = await confirmUpload.mutateAsync({ id });
      const publicUrl = confirmRes.data.url;
      setProgress(100);

      // Step 4: Update local preview + notify parent
      if (accept === 'image') {
        setPreviewUrl(publicUrl);
      }
      setStatus('done');
      onUploadComplete(publicUrl, id);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file !== undefined) {
      void handleFile(file);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file !== undefined) {
      void handleFile(file);
    }
  }

  const Icon = accept === 'image' ? ImageIcon : Music;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Preview for images */}
      {accept === 'image' && previewUrl !== undefined && (
        <div className="relative rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Uploaded media" className="w-full h-40 object-cover" />
        </div>
      )}

      {/* Dropzone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
          status === 'uploading' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30',
          status === 'error' ? 'border-cortex-400/50 bg-cortex-400/5' : '',
          status === 'done' ? 'border-dendrite-400/50 bg-dendrite-400/5' : '',
        )}
        onClick={() => { inputRef.current?.click(); }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); }}
      >
        <input
          ref={inputRef}
          data-testid="media-file-input"
          type="file"
          accept={ACCEPT_MAP[accept]}
          className="hidden"
          onChange={handleInputChange}
        />

        {status === 'idle' && (
          <>
            <div className="rounded-full bg-muted p-3">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Click or drag {accept === 'image' ? 'an image' : 'an audio file'} here to upload
            </p>
          </>
        )}

        {status === 'uploading' && (
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2 justify-center">
              <Upload className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm text-primary">Uploading…</span>
            </div>
            <div className="w-full rounded-full bg-muted h-1.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${String(progress)}%` }}
              />
            </div>
          </div>
        )}

        {status === 'done' && (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-dendrite-400" />
            <span className="text-sm text-dendrite-400 font-medium">Uploaded</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-cortex-400" />
              <span className="text-sm text-cortex-400 font-medium">Upload failed</span>
            </div>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <button
              type="button"
              className="text-xs text-primary underline mt-1"
              onClick={(e) => { e.stopPropagation(); setStatus('idle'); setErrorMsg(''); }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Note:** `useRequestUploadUrl` and `useConfirmUpload` hooks need to be added to `packages/api-client/src/content/hooks.ts` in phase-06a if not already present. Add:

```ts
// In hooks.ts — add these two mutations

export function useRequestUploadUrl(
  options?: UseMutationOptions<UploadUrlResponse, Error, { filename: string; mimeType: string }>,
) {
  return useMutation({
    mutationFn: ({ filename, mimeType }) => mediaApi.requestUploadUrl(filename, mimeType),
    ...options,
  });
}

export function useConfirmUpload(
  options?: UseMutationOptions<MediaResponse, Error, { id: MediaId }>,
) {
  return useMutation({
    mutationFn: ({ id }) => mediaApi.confirmUpload(id),
    ...options,
  });
}
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test media-uploader
```

Expected: PASS (3 tests).

### Step 5: Type-check

```bash
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/components/cards/media-uploader.tsx \
        apps/web/src/components/cards/media-uploader.test.tsx
git commit -m "feat(web): add MediaUploader with presigned PUT + confirm flow"
```

---

## Summary

After this phase:
- `DeckQueryFilter` — controlled filter panel with all 42 type chips, state filters, tags, sort
- `CardCollection` — grid/list view toggler, multi-select, bulk action bar
- `MediaUploader` — full presigned upload flow (request → PUT → confirm)

These three components are the building blocks consumed by pages in phase-06d.
