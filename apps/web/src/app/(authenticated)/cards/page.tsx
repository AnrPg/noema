/**
 * Concept Payloads Page — /cards
 *
 * Displays content payloads with DeckQueryFilter sidebar, CardCollection main
 * area, view-mode toggle, and bulk actions.
 */

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCards,
  useBatchCardStateTransition,
  useBatchDeleteCards,
  contentKeys,
} from '@noema/api-client';
import type { IDeckQueryInput } from '@noema/api-client';
import type { CardId } from '@noema/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@noema/ui';
import { ChevronDown, LayoutGrid, List, Plus, Layers, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { DeckQueryFilter } from '@/components/deck-query-filter';
import { CardCollection } from '@/components/card-collection';
import type { IBulkAction } from '@/components/card-collection';

// ============================================================================
// Default query
// ============================================================================

const DEFAULT_QUERY: IDeckQueryInput = {
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  limit: 50,
};

// ============================================================================
// Page
// ============================================================================

export default function CardLibraryPage(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  const [query, setQuery] = React.useState<IDeckQueryInput>(DEFAULT_QUERY);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = React.useState<Set<string>>(new Set());
  const [isFiltersOpen, setIsFiltersOpen] = React.useState(false);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const { data, isLoading, isError, error } = useCards(query);
  const cards = data?.data.items ?? [];
  const totalCards = data?.data.total ?? cards.length;
  const versionsById = React.useMemo(
    () => new Map(cards.map((card) => [card.id, card.version])),
    [cards]
  );

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  const batchDeleteCards = useBatchDeleteCards();
  const batchStateTransition = useBatchCardStateTransition();

  const isMutating = batchDeleteCards.isPending || batchStateTransition.isPending;

  // --------------------------------------------------------------------------
  // Bulk action handlers
  // --------------------------------------------------------------------------

  async function handleBulkDelete(ids: Set<string>): Promise<void> {
    setBulkError(null);
    const idArray = Array.from(ids);
    try {
      const result = await batchDeleteCards.mutateAsync({
        cardIds: idArray.map((id) => id as CardId),
      });
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
      setSelectedCardIds((current) => {
        const next = new Set(current);
        for (const id of result.data.succeeded) {
          next.delete(id);
        }
        return next;
      });
      if (result.data.failed.length > 0) {
        setBulkError(
          `Deleted ${String(result.data.succeeded.length)} payload(s), but ${String(
            result.data.failed.length
          )} failed. ${result.data.failed[0]?.error ?? 'Please retry the failed payloads.'}`
        );
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to delete one or more payloads.');
    }
  }

  function handleSuspendSelected(ids: Set<string>): void {
    setBulkError(null);
    batchStateTransition.mutate(
      {
        items: Array.from(ids)
          .map((id) => {
            const version = versionsById.get(id as CardId);
            return version !== undefined ? { id, version } : null;
          })
          .filter((item): item is { id: string; version: number } => item !== null),
        state: 'suspended',
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
        },
        onError: (err) => {
          setBulkError(err.message);
        },
      }
    );
  }

  function handleActivateSelected(ids: Set<string>): void {
    setBulkError(null);
    batchStateTransition.mutate(
      {
        items: Array.from(ids)
          .map((id) => {
            const version = versionsById.get(id as CardId);
            return version !== undefined ? { id, version } : null;
          })
          .filter((item): item is { id: string; version: number } => item !== null),
        state: 'active',
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
        },
        onError: (err) => {
          setBulkError(err.message);
        },
      }
    );
  }

  // --------------------------------------------------------------------------
  // Bulk actions config
  // --------------------------------------------------------------------------

  const bulkActions: IBulkAction[] = React.useMemo(
    () => [
      {
        label: 'Activate Selected',
        onClick: (ids) => {
          if (!isMutating) handleActivateSelected(ids);
        },
      },
      {
        label: 'Suspend Selected',
        onClick: (ids) => {
          if (!isMutating) handleSuspendSelected(ids);
        },
      },
      {
        label: 'Delete Selected',
        variant: 'destructive' as const,
        onClick: (ids) => {
          if (!isMutating) void handleBulkDelete(ids);
        },
      },
    ],
    [isMutating, handleBulkDelete, handleSuspendSelected, handleActivateSelected]
  );

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  function handleCardClick(cardId: string): void {
    router.push((`/cards/${cardId}` as Route));
  }

  function handleNewCard(): void {
    router.push('/cards/new');
  }

  function handleBatchOperations(): void {
    router.push('/cards/batch');
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Concept Payloads</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading
              ? 'Loading payloads…'
              : isError
                ? 'Failed to load payloads.'
                : [String(totalCards), totalCards === 1 ? 'payload' : 'payloads'].join(' ')}
          </p>
        </div>

        {/* Top-right controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsFiltersOpen((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {isFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              onClick={() => {
                setViewMode('grid');
              }}
              className={[
                'flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-sm transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              onClick={() => {
                setViewMode('list');
              }}
              className={[
                'flex items-center gap-1.5 rounded-r-md px-3 py-1.5 text-sm transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* Batch Operations */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isMutating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                <Layers className="h-4 w-4" />
                <span>Batch Operations</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  handleBatchOperations();
                }}
              >
                Open batch workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedCardIds.size === 0 || isMutating}
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (!isMutating && selectedCardIds.size > 0) {
                    void handleBulkDelete(selectedCardIds);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {selectedCardIds.size > 0
                  ? `Delete ${String(selectedCardIds.size)} selected`
                  : 'Delete selected'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New Card */}
          <button
            type="button"
            disabled={isMutating}
            onClick={handleNewCard}
            className={[
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
              'text-sm font-medium text-primary-foreground transition-colors',
              'hover:bg-primary/90',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            ].join(' ')}
          >
            <Plus className="h-4 w-4" />
            New Payload
          </button>
        </div>
      </div>

      {/* Error banner — load failure */}
      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'An error occurred while loading payloads.'}
        </div>
      )}

      {/* Error banner — bulk action failure */}
      {bulkError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {bulkError}
        </div>
      )}

      {/* Main layout: filter sidebar + collection */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* Sidebar filter */}
        <div className={[isFiltersOpen ? 'block' : 'hidden', 'w-full lg:block lg:w-72 lg:flex-shrink-0'].join(' ')}>
          <DeckQueryFilter
            query={query}
            onChange={setQuery}
            className="w-full lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
          />
        </div>

        {/* Payload collection */}
        <div className="min-w-0 flex-1">
          <CardCollection
            cards={cards}
            isLoading={isLoading}
            viewMode={viewMode}
            onCardClick={handleCardClick}
            onSelectionChange={setSelectedCardIds}
            bulkActions={bulkActions}
          />
        </div>
      </div>
    </div>
  );
}
