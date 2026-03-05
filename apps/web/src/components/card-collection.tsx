'use client';

/**
 * @noema/web - CardCollection
 * Grid/list display of ICardSummaryDto cards with multi-select and bulk action bar.
 *
 * ICardSummaryDto is a list-safe shape (no content blob), so this component
 * renders its own summary card tile instead of delegating to CardRenderer,
 * which requires the full ICardDto (including content).
 */

import * as React from 'react';
import type { ICardSummaryDto } from '@noema/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface IBulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: (selectedIds: Set<string>) => void;
  variant?: 'default' | 'destructive';
}

export interface ICardCollectionProps {
  cards: ICardSummaryDto[];
  isLoading?: boolean;
  viewMode?: 'grid' | 'list';
  onCardClick?: (cardId: string) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  bulkActions?: IBulkAction[];
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SKELETON_COUNT = 6;

const STATE_BADGE: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SUSPENDED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  ARCHIVED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

const STATE_BADGE_DEFAULT =
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';

// ============================================================================
// Helpers
// ============================================================================

/** Convert a raw card type slug to a human-readable label. */
function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Render a difficulty bar (0.0–1.0). */
function DifficultyBar({ value }: { value: number }): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label="Difficulty"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-synapse-400 transition-all"
        style={{ width: String(pct) + '%' }}
      />
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function GridSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="h-1.5 w-full rounded-full bg-muted" />
      <div className="flex gap-1">
        <div className="h-4 w-12 rounded-full bg-muted" />
        <div className="h-4 w-10 rounded-full bg-muted" />
      </div>
    </div>
  );
}

function ListSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 animate-pulse">
      <div className="h-4 w-4 rounded bg-muted shrink-0" />
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="ml-auto h-3 w-16 rounded bg-muted" />
    </div>
  );
}

// ============================================================================
// Grid card tile
// ============================================================================

interface IGridCardTileProps {
  card: ICardSummaryDto;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onCardClick?: ((id: string) => void) | undefined;
}

function GridCardTile({
  card,
  isSelected,
  onToggleSelect,
  onCardClick,
}: IGridCardTileProps): React.JSX.Element {
  const stateCls = STATE_BADGE[card.state] ?? STATE_BADGE_DEFAULT;

  function handleCheckboxChange(e: React.ChangeEvent<HTMLInputElement>): void {
    e.stopPropagation();
    onToggleSelect(card.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick?.(card.id);
    }
  }

  return (
    <div
      className={[
        'relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors',
        'focus-within:ring-2 focus-within:ring-ring',
        isSelected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-foreground/30',
      ].join(' ')}
    >
      {/* Checkbox */}
      <label className="absolute right-3 top-3 z-10 flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label={['Select card', card.id].join(' ')}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      </label>

      {/* Clickable body */}
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer"
        onClick={() => {
          onCardClick?.(card.id);
        }}
        onKeyDown={handleKeyDown}
        aria-label={['Open card', formatTypeLabel(card.cardType)].join(' ')}
      >
        {/* Type badge */}
        <span className="inline-block rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground mb-2">
          {formatTypeLabel(card.cardType)}
        </span>

        {/* State + difficulty row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={[
              'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
              stateCls,
            ].join(' ')}
          >
            {card.state.toLowerCase()}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {String(Math.round(card.difficulty * 100))}% diff
          </span>
        </div>

        <DifficultyBar value={card.difficulty} />

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {card.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground">
                +{String(card.tags.length - 4)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// List row
// ============================================================================

interface IListCardRowProps {
  card: ICardSummaryDto;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onCardClick?: ((id: string) => void) | undefined;
}

function ListCardRow({
  card,
  isSelected,
  onToggleSelect,
  onCardClick,
}: IListCardRowProps): React.JSX.Element {
  const stateCls = STATE_BADGE[card.state] ?? STATE_BADGE_DEFAULT;

  function handleCheckboxChange(e: React.ChangeEvent<HTMLInputElement>): void {
    e.stopPropagation();
    onToggleSelect(card.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick?.(card.id);
    }
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors',
        isSelected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-foreground/30',
      ].join(' ')}
    >
      {/* Checkbox */}
      <label className="flex cursor-pointer items-center shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label={['Select card', card.id].join(' ')}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      </label>

      {/* Type badge */}
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
        {formatTypeLabel(card.cardType)}
      </span>

      {/* State badge */}
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
          stateCls,
        ].join(' ')}
      >
        {card.state.toLowerCase()}
      </span>

      {/* Tags */}
      <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
        {card.tags.slice(0, 5).map((tag) => (
          <span
            key={tag}
            className="inline-block rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        {card.tags.length > 5 && (
          <span className="text-[10px] text-muted-foreground">+{String(card.tags.length - 5)}</span>
        )}
      </div>

      {/* Difficulty + click target */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {String(Math.round(card.difficulty * 100))}%
        </span>
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onClick={() => {
            onCardClick?.(card.id);
          }}
          onKeyDown={handleKeyDown}
          aria-label={['Open card', formatTypeLabel(card.cardType)].join(' ')}
        >
          Open
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Bulk action bar
// ============================================================================

interface IBulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  bulkActions: IBulkAction[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

function BulkActionBar({
  selectedCount,
  totalCount,
  bulkActions,
  selectedIds,
  onSelectAll,
  onClearSelection,
}: IBulkActionBarProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
      <span className="font-medium text-primary">
        {String(selectedCount)} of {String(totalCount)} selected
      </span>

      <button
        type="button"
        onClick={selectedCount === totalCount ? onClearSelection : onSelectAll}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none"
      >
        {selectedCount === totalCount ? 'Deselect all' : 'Select all'}
      </button>

      <div className="ml-auto flex items-center gap-2">
        {bulkActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              action.onClick(selectedIds);
            }}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              action.variant === 'destructive'
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-muted text-foreground hover:bg-muted/70',
            ].join(' ')}
          >
            {action.icon !== undefined && (
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center"
                aria-hidden="true"
              >
                {action.icon}
              </span>
            )}
            {action.label}
          </button>
        ))}

        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Clear selection"
          className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CardCollection
// ============================================================================

export function CardCollection({
  cards,
  isLoading = false,
  viewMode = 'grid',
  onCardClick,
  onSelectionChange,
  bulkActions = [],
  className,
}: ICardCollectionProps): React.JSX.Element {
  // --------------------------------------------------------------------------
  // Selection state — reset when `cards` identity changes
  // --------------------------------------------------------------------------

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setSelectedIds(new Set());
    onSelectionChange?.(new Set());
    // Intentionally depend only on `cards` reference (identity change resets selection).
    // `onSelectionChange` is excluded to avoid infinite loops from unstable callbacks.
  }, [cards]);

  // --------------------------------------------------------------------------
  // Selection handlers
  // --------------------------------------------------------------------------

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange?.(next);
      return next;
    });
  }

  function selectAll(): void {
    const next = new Set(cards.map((c) => c.id));
    setSelectedIds(next);
    onSelectionChange?.(next);
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
    onSelectionChange?.(new Set());
  }

  // --------------------------------------------------------------------------
  // Header checkbox: indeterminate when partial selection
  // --------------------------------------------------------------------------

  const allSelected = cards.length > 0 && selectedIds.size === cards.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < cards.length;

  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (headerCheckboxRef.current !== null) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function handleHeaderCheckboxChange(): void {
    if (allSelected || someSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  }

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  if (isLoading) {
    if (viewMode === 'list') {
      return (
        <div className={['flex flex-col gap-2', className ?? ''].join(' ').trim()}>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <ListSkeleton key={i} />
          ))}
        </div>
      );
    }
    return (
      <div
        className={['grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className ?? '']
          .join(' ')
          .trim()}
      >
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <GridSkeleton key={i} />
        ))}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Empty state
  // --------------------------------------------------------------------------

  if (cards.length === 0) {
    return (
      <div
        className={[
          'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center',
          className ?? '',
        ]
          .join(' ')
          .trim()}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">No cards</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No cards match the current filter criteria.
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Main render
  // --------------------------------------------------------------------------

  return (
    <div className={['flex flex-col gap-3', className ?? ''].join(' ').trim()}>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={cards.length}
          bulkActions={bulkActions}
          selectedIds={selectedIds}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
        />
      )}

      {/* Header row: select-all checkbox + count */}
      <div className="flex items-center gap-3 px-1">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            ref={headerCheckboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={handleHeaderCheckboxChange}
            aria-label={allSelected ? 'Deselect all cards' : 'Select all cards'}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? [String(selectedIds.size), 'selected'].join(' ')
              : [String(cards.length), cards.length === 1 ? 'card' : 'cards'].join(' ')}
          </span>
        </label>
      </div>

      {/* Card grid or list */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <GridCardTile
              key={card.id}
              card={card}
              isSelected={selectedIds.has(card.id)}
              onToggleSelect={toggleSelect}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <ListCardRow
              key={card.id}
              card={card}
              isSelected={selectedIds.has(card.id)}
              onToggleSelect={toggleSelect}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
