/**
 * Card Library Page — /cards
 *
 * Displays the full card library with DeckQueryFilter sidebar,
 * CardCollection main area, view-mode toggle, and bulk actions.
 */

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCards,
  useBatchCardStateTransition,
  useDeleteCard,
  contentKeys,
} from '@noema/api-client';
import type { IDeckQueryInput } from '@noema/api-client';
import type { CardId } from '@noema/types';
import { LayoutGrid, List, Plus, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { DeckQueryFilter } from '@/components/deck-query-filter';
import { CardCollection } from '@/components/card-collection';
import type { IBulkAction } from '@/components/card-collection';

// ============================================================================
// Default query
// ============================================================================

const DEFAULT_QUERY: IDeckQueryInput = {
  sortBy: 'updatedAt',
  sortDir: 'desc',
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

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const { data, isLoading, isError, error } = useCards(query);
  const cards = data?.data.cards ?? [];

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  const deleteCard = useDeleteCard();
  const batchStateTransition = useBatchCardStateTransition();

  const isMutating = deleteCard.isPending || batchStateTransition.isPending;

  // --------------------------------------------------------------------------
  // Bulk action handlers
  // --------------------------------------------------------------------------

  async function handleBulkDelete(ids: Set<string>): Promise<void> {
    setBulkError(null);
    const idArray = Array.from(ids);
    try {
      await Promise.all(idArray.map((id) => deleteCard.mutateAsync(id as CardId)));
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to delete one or more cards.');
    }
  }

  function handleSuspendSelected(ids: Set<string>): void {
    setBulkError(null);
    batchStateTransition.mutate(
      { cardIds: Array.from(ids), state: 'SUSPENDED' },
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
      { cardIds: Array.from(ids), state: 'ACTIVE' },
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
    router.push('/cards/' + cardId);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Card Library</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading
              ? 'Loading cards…'
              : isError
                ? 'Failed to load cards.'
                : [String(data?.data.total ?? 0), data?.data.total === 1 ? 'card' : 'cards'].join(
                    ' '
                  )}
          </p>
        </div>

        {/* Top-right controls */}
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            disabled={isMutating}
            onClick={handleBatchOperations}
            className={[
              'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5',
              'text-sm font-medium text-muted-foreground transition-colors',
              'hover:border-foreground/30 hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            ].join(' ')}
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Batch Operations</span>
          </button>

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
            New Card
          </button>
        </div>
      </div>

      {/* Error banner — load failure */}
      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'An error occurred while loading cards.'}
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
      <div className="flex gap-6 items-start">
        {/* Sidebar filter */}
        <DeckQueryFilter query={query} onChange={setQuery} className="w-64 shrink-0 sticky top-6" />

        {/* Card collection */}
        <div className="min-w-0 flex-1">
          <CardCollection
            cards={cards}
            isLoading={isLoading}
            viewMode={viewMode}
            onCardClick={handleCardClick}
            bulkActions={bulkActions}
          />
        </div>
      </div>
    </div>
  );
}
