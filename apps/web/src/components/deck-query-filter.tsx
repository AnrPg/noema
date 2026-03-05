/**
 * DeckQueryFilter — Controlled filter panel for the card library.
 *
 * All state is owned by the parent. Every change fires onChange immediately.
 * Supports: search, cardTypes, states, tags, source, difficulty range, sort.
 */

'use client';

import { CardType } from '@noema/types';
import type { IDeckQueryInput, CardState } from '@noema/api-client';
import { RotateCcw } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const CARD_TYPE_VALUES = Object.values(CardType) as string[];

const CARD_STATES: CardState[] = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];

const SORT_BY_OPTIONS: { value: NonNullable<IDeckQueryInput['sortBy']>; label: string }[] = [
  { value: 'createdAt', label: 'Created' },
  { value: 'updatedAt', label: 'Updated' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'nextReviewAt', label: 'Next Review' },
];

const SORT_DIR_OPTIONS: { value: NonNullable<IDeckQueryInput['sortDir']>; label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
];

/** Human-readable label for a raw card type slug. */
function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Merge `updates` into `base`, omitting any key whose value is `undefined`.
 * Required by exactOptionalPropertyTypes: assigning `undefined` to an optional
 * key `foo?: T` is an error — the key must be absent instead.
 */
function mergeQuery(
  base: IDeckQueryInput,
  updates: { [K in keyof IDeckQueryInput]?: IDeckQueryInput[K] | undefined }
): IDeckQueryInput {
  const result: IDeckQueryInput = { ...base };
  for (const k of Object.keys(updates) as (keyof IDeckQueryInput)[]) {
    const val = updates[k];
    if (val === undefined) {
      // Remove the key entirely rather than setting it to undefined.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete result[k];
    } else {
      // Type-safe: val is IDeckQueryInput[K] (not undefined) here.
      (result as Record<string, unknown>)[k] = val;
    }
  }
  return result;
}

// ============================================================================
// Props
// ============================================================================

interface IDeckQueryFilterProps {
  query: IDeckQueryInput;
  onChange: (q: IDeckQueryInput) => void;
  className?: string;
}

// ============================================================================
// Sub-section wrapper
// ============================================================================

interface IFilterSectionProps {
  title: string;
  children: React.ReactNode;
}

function FilterSection({ title, children }: IFilterSectionProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function DeckQueryFilter({
  query,
  onChange,
  className,
}: IDeckQueryFilterProps): React.JSX.Element {
  // --------------------------------------------------------------------------
  // Card types toggle
  // --------------------------------------------------------------------------

  function toggleCardType(type: string): void {
    const current = query.cardTypes ?? [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    onChange(mergeQuery(query, { cardTypes: next.length > 0 ? next : undefined }));
  }

  // --------------------------------------------------------------------------
  // States toggle
  // --------------------------------------------------------------------------

  function toggleState(state: CardState): void {
    const current = query.states ?? [];
    const next = current.includes(state) ? current.filter((s) => s !== state) : [...current, state];
    onChange(mergeQuery(query, { states: next.length > 0 ? next : undefined }));
  }

  // --------------------------------------------------------------------------
  // Tags — comma-delimited text input
  // --------------------------------------------------------------------------

  function handleTagsChange(raw: string): void {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onChange(mergeQuery(query, { tags: tags.length > 0 ? tags : undefined }));
  }

  const tagsValue = (query.tags ?? []).join(', ');

  // --------------------------------------------------------------------------
  // Difficulty
  // --------------------------------------------------------------------------

  function handleDifficultyMin(raw: string): void {
    const min = raw !== '' ? Number(raw) : undefined;
    const prevMax = query.difficulty?.max;
    if (min === undefined && prevMax === undefined) {
      onChange(mergeQuery(query, { difficulty: undefined }));
    } else if (min !== undefined && prevMax !== undefined) {
      onChange(mergeQuery(query, { difficulty: { min, max: prevMax } }));
    } else if (min !== undefined) {
      onChange(mergeQuery(query, { difficulty: { min } }));
    } else if (prevMax !== undefined) {
      onChange(mergeQuery(query, { difficulty: { max: prevMax } }));
    } else {
      onChange(mergeQuery(query, { difficulty: undefined }));
    }
  }

  function handleDifficultyMax(raw: string): void {
    const max = raw !== '' ? Number(raw) : undefined;
    const prevMin = query.difficulty?.min;
    if (max === undefined && prevMin === undefined) {
      onChange(mergeQuery(query, { difficulty: undefined }));
    } else if (max !== undefined && prevMin !== undefined) {
      onChange(mergeQuery(query, { difficulty: { min: prevMin, max } }));
    } else if (max !== undefined) {
      onChange(mergeQuery(query, { difficulty: { max } }));
    } else if (prevMin !== undefined) {
      onChange(mergeQuery(query, { difficulty: { min: prevMin } }));
    } else {
      onChange(mergeQuery(query, { difficulty: undefined }));
    }
  }

  const diffMin = query.difficulty?.min !== undefined ? String(query.difficulty.min) : '';
  const diffMax = query.difficulty?.max !== undefined ? String(query.difficulty.max) : '';

  // --------------------------------------------------------------------------
  // Sort field
  // --------------------------------------------------------------------------

  function handleSortByChange(raw: string): void {
    if (raw === '') {
      onChange(mergeQuery(query, { sortBy: undefined }));
    } else {
      onChange(mergeQuery(query, { sortBy: raw as NonNullable<IDeckQueryInput['sortBy']> }));
    }
  }

  function handleSortDirChange(raw: string): void {
    if (raw === '') {
      onChange(mergeQuery(query, { sortDir: undefined }));
    } else {
      onChange(mergeQuery(query, { sortDir: raw as NonNullable<IDeckQueryInput['sortDir']> }));
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <aside
      className={[
        'flex flex-col gap-6 rounded-xl border border-border bg-card p-4 text-sm',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Search                                                               */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Search">
        <input
          type="search"
          aria-label="Search cards"
          placeholder="Full-text search…"
          value={query.search ?? ''}
          onChange={(e) => {
            onChange(
              mergeQuery(query, { search: e.target.value !== '' ? e.target.value : undefined })
            );
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Card Types                                                           */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Card Types">
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {CARD_TYPE_VALUES.map((type) => {
            const checked = (query.cardTypes ?? []).includes(type);
            return (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggleCardType(type);
                  }}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs text-foreground">{formatTypeLabel(type)}</span>
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* State                                                                */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="State">
        <div className="space-y-1">
          {CARD_STATES.map((state) => {
            const checked = (query.states ?? []).includes(state);
            return (
              <label
                key={state}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggleState(state);
                  }}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs text-foreground capitalize">{state.toLowerCase()}</span>
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Tags                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Tags">
        <input
          type="text"
          aria-label="Filter by tags (comma-separated)"
          placeholder="tag1, tag2, tag3"
          value={tagsValue}
          onChange={(e) => {
            handleTagsChange(e.target.value);
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">Comma-separated list of tags.</p>
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Source                                                               */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Source">
        <input
          type="text"
          aria-label="Filter by source"
          placeholder="e.g. import, manual, ai-generated"
          value={query.source ?? ''}
          onChange={(e) => {
            onChange(
              mergeQuery(query, { source: e.target.value !== '' ? e.target.value : undefined })
            );
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Difficulty                                                           */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Difficulty">
        <div className="flex items-center gap-2">
          <input
            type="number"
            aria-label="Minimum difficulty (0 to 1)"
            min={0}
            max={1}
            step={0.01}
            placeholder="Min"
            value={diffMin}
            onChange={(e) => {
              handleDifficultyMin(e.target.value);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <input
            type="number"
            aria-label="Maximum difficulty (0 to 1)"
            min={0}
            max={1}
            step={0.01}
            placeholder="Max"
            value={diffMax}
            onChange={(e) => {
              handleDifficultyMax(e.target.value);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Range 0.0 – 1.0</p>
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Sort                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Sort">
        <div className="flex flex-col gap-2">
          <select
            value={query.sortBy ?? ''}
            onChange={(e) => {
              handleSortByChange(e.target.value);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sort by…</option>
            {SORT_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={query.sortDir ?? ''}
            onChange={(e) => {
              handleSortDirChange(e.target.value);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Direction…</option>
            {SORT_DIR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Reset                                                                */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        onClick={() => {
          onChange({});
        }}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset filters
      </button>
    </aside>
  );
}
