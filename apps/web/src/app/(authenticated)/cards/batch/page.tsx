/**
 * Batch Operations Page — /cards/batch
 *
 * Lists recent batch creation jobs, supports per-batch rollback with inline
 * confirmation, and expands to show the cards inside a selected batch.
 */

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecentBatches, useRollbackBatch, useBatch, contentKeys } from '@noema/api-client';
import type { IBatchSummaryDto, IBatchCreateResult } from '@noema/api-client';
import type { JobId } from '@noema/types';
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateBatchId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
}

// ============================================================================
// BatchDetailsPanel — shows cards inside a selected batch
// ============================================================================

interface IBatchDetailsPanelProps {
  batchId: JobId;
}

function BatchDetailsPanel({ batchId }: IBatchDetailsPanelProps): React.JSX.Element {
  const { data, isLoading, isError } = useBatch(batchId);
  const result: IBatchCreateResult | undefined = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading batch cards…
      </div>
    );
  }

  if (isError || result === undefined) {
    return <div className="px-4 py-3 text-sm text-destructive">Failed to load batch details.</div>;
  }

  const cards = result.created;

  if (cards.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground italic">
        No cards found in this batch.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {cards.map((card) => (
        <div key={card.id} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {card.cardType}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {card.id}
          </span>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-xs font-medium',
              card.state === 'active'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : card.state === 'draft'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : card.state === 'suspended'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-muted text-muted-foreground',
            ].join(' ')}
          >
            {card.state}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// BatchRow — a single row in the history list
// ============================================================================

interface IBatchRowProps {
  batch: IBatchSummaryDto;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRollback: () => void;
  isRollingBack: boolean;
}

function BatchRow({
  batch,
  isExpanded,
  onToggleExpand,
  onRollback,
  isRollingBack,
}: IBatchRowProps): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);

  function handleRollbackClick(): void {
    setConfirming(true);
  }

  function handleConfirm(): void {
    setConfirming(false);
    onRollback();
  }

  function handleCancel(): void {
    setConfirming(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse batch' : 'Expand batch'}
          onClick={onToggleExpand}
          className={[
            'flex h-6 w-6 shrink-0 items-center justify-center rounded',
            'text-muted-foreground transition-colors hover:text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          ].join(' ')}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Batch ID */}
        <span
          title={batch.batchId}
          className="min-w-0 w-36 shrink-0 font-mono text-sm text-foreground"
        >
          {truncateBatchId(batch.batchId)}
        </span>

        {/* Card count */}
        <span className="shrink-0 text-sm text-muted-foreground">
          {String(batch.count)} {batch.count === 1 ? 'card' : 'cards'}
        </span>

        {/* Created at */}
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          {formatDate(batch.createdAt)}
        </span>

        {/* Rollback controls */}
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-destructive">
              Roll back all {String(batch.count)} cards?
            </span>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isRollingBack}
              className={[
                'inline-flex items-center rounded bg-destructive px-2 py-1',
                'text-xs font-medium text-destructive-foreground transition-colors',
                'hover:bg-destructive/90',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50',
              ].join(' ')}
            >
              {isRollingBack ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isRollingBack}
              className={[
                'inline-flex items-center rounded border border-border px-2 py-1',
                'text-xs font-medium text-muted-foreground transition-colors',
                'hover:text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50',
              ].join(' ')}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={'Rollback batch ' + batch.batchId}
            onClick={handleRollbackClick}
            disabled={isRollingBack}
            className={[
              'inline-flex items-center gap-1.5 rounded border border-border px-2 py-1',
              'text-xs font-medium text-muted-foreground transition-colors',
              'hover:border-destructive/50 hover:text-destructive',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            ].join(' ')}
          >
            <Trash2 className="h-3 w-3" />
            Rollback
          </button>
        )}
      </div>

      {/* Expanded batch cards */}
      {isExpanded && (
        <div className="border-t border-border/50">
          <BatchDetailsPanel batchId={batch.batchId as JobId} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function BatchOperationsPage(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  const [expandedBatchId, setExpandedBatchId] = React.useState<JobId | null>(null);
  const [rollingBackId, setRollingBackId] = React.useState<JobId | null>(null);
  const [rollbackError, setRollbackError] = React.useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const { data, isLoading, isError, error } = useRecentBatches();
  const batches: IBatchSummaryDto[] = data?.data ?? [];

  // --------------------------------------------------------------------------
  // Rollback mutation
  // --------------------------------------------------------------------------

  const rollbackMutation = useRollbackBatch({
    onSuccess: () => {
      setRollingBackId(null);
      setRollbackError(null);
      void queryClient.invalidateQueries({ queryKey: contentKeys.recentBatches() });
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    onError: (err) => {
      setRollingBackId(null);
      setRollbackError(err instanceof Error ? err.message : 'Rollback failed.');
    },
  });

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  function handleToggleExpand(batchId: JobId): void {
    setExpandedBatchId((prev) => (prev === batchId ? null : batchId));
  }

  function handleRollback(batchId: JobId): void {
    setRollingBackId(batchId);
    setRollbackError(null);
    rollbackMutation.mutate({ batchId });
  }

  function handleBackToLibrary(): void {
    router.push('/cards');
  }

  function handleCreateNewBatch(): void {
    router.push('/cards/new');
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToLibrary}
            aria-label="Back to library"
            className={[
              'inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5',
              'text-sm font-medium text-muted-foreground transition-colors',
              'hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring',
            ].join(' ')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>
          <div>
            <h1 className="text-3xl font-bold">Batch Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              View and manage recent batch card imports
            </p>
          </div>
        </div>

        {/* Create new batch */}
        <button
          type="button"
          onClick={handleCreateNewBatch}
          className={[
            'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
            'text-sm font-medium text-primary-foreground transition-colors',
            'hover:bg-primary/90',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          ].join(' ')}
        >
          <Plus className="h-4 w-4" />
          Create New Batch
        </button>
      </div>

      {/* Rollback error banner */}
      {rollbackError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {rollbackError}
        </div>
      )}

      {/* Fetch error banner */}
      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'Failed to load batch history.'}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading batch history">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-14 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && batches.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No batch history</p>
          <button
            type="button"
            onClick={handleCreateNewBatch}
            className={[
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
              'text-sm font-medium text-primary-foreground transition-colors',
              'hover:bg-primary/90',
              'focus:outline-none focus:ring-2 focus:ring-ring',
            ].join(' ')}
          >
            <Plus className="h-4 w-4" />
            Create New Batch
          </button>
        </div>
      )}

      {/* Batch history list */}
      {!isLoading && batches.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {String(batches.length)} {batches.length === 1 ? 'batch' : 'batches'}
          </p>
          {batches.map((batch) => (
          <BatchRow
            key={batch.batchId}
            batch={batch}
            isExpanded={expandedBatchId === (batch.batchId as JobId)}
            onToggleExpand={() => {
                handleToggleExpand(batch.batchId as JobId);
              }}
              onRollback={() => {
                handleRollback(batch.batchId as JobId);
              }}
              isRollingBack={rollingBackId === (batch.batchId as JobId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
