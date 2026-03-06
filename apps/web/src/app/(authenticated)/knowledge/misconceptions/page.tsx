/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
'use client';
/**
 * @noema/web — /knowledge/misconceptions
 *
 * Misconception Center:
 *   1. Header with scan trigger button
 *   2. Status summary: count tiles by status
 *   3. Filter bar (All / Detected / Confirmed / Resolved / Dismissed)
 *   4. Sortable misconception list with pipeline indicator + expandable detail
 *   5. Expanded detail: subgraph, action buttons (confirm/resolve/dismiss)
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import {
  useMisconceptions,
  useDetectMisconceptions,
  useUpdateMisconceptionStatus,
} from '@noema/api-client';
import type { UserId } from '@noema/types';
import { ConfidenceMeter, Button } from '@noema/ui';
import { Loader2, ScanSearch } from 'lucide-react';
import { MisconceptionPipeline } from '@/components/knowledge/misconception-pipeline';
import { MisconceptionSubgraph } from '@/components/knowledge/misconception-subgraph';

type MisconceptionStatus = 'detected' | 'confirmed' | 'resolved' | 'dismissed';

const STATUS_LABELS: Record<string, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_CLASSES: Record<string, string> = {
  detected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  confirmed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  dismissed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type FilterValue = '' | MisconceptionStatus;

const FILTER_OPTIONS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: '' },
  { label: 'Detected', value: 'detected' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Dismissed', value: 'dismissed' },
];

export default function MisconceptionsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<FilterValue>('');

  const { data: misconceptionsResponse, isLoading } = useMisconceptions(userId);
  const detectMutation = useDetectMisconceptions(userId);
  const updateStatus = useUpdateMisconceptionStatus(userId);

  const allMisconceptions: any[] = (misconceptionsResponse as any)?.data ?? [];

  // Count per status
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allMisconceptions) {
      const s = String(m.status);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [allMisconceptions]);

  // Filtered list
  const filtered = React.useMemo(
    () =>
      statusFilter !== ''
        ? allMisconceptions.filter((m) => String(m.status) === statusFilter)
        : allMisconceptions,
    [allMisconceptions, statusFilter]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Misconception Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading === true
              ? 'Loading\u2026'
              : `${String(allMisconceptions.length)} misconception${allMisconceptions.length !== 1 ? 's' : ''} detected`}
          </p>
        </div>
        <Button
          onClick={() => {
            void detectMutation.mutateAsync();
          }}
          disabled={detectMutation.isPending === true}
          variant="outline"
          className="gap-2"
        >
          {detectMutation.isPending === true ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
          )}
          Scan for Misconceptions
        </Button>
      </div>

      {/* Status summary tiles */}
      <div className="flex flex-wrap gap-3">
        {(['detected', 'confirmed', 'resolved', 'dismissed'] as MisconceptionStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === s ? '' : s));
            }}
            aria-pressed={statusFilter === s}
            className={[
              'flex flex-col items-center rounded-lg border px-4 py-2 transition-colors',
              statusFilter === s ? 'border-primary bg-primary/10' : 'border-border bg-card',
            ].join(' ')}
          >
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {String(statusCounts[s] ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[s] ?? s}</span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatusFilter(f.value);
            }}
            aria-pressed={statusFilter === f.value}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading === true && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading misconceptions\u2026
        </div>
      )}

      {/* Empty state */}
      {isLoading !== true && filtered.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12 text-sm text-muted-foreground">
          {statusFilter !== ''
            ? `No ${STATUS_LABELS[statusFilter] ?? statusFilter.toLowerCase()} misconceptions.`
            : 'No misconceptions detected. Use the scan button to check for new ones.'}
        </div>
      )}

      {/* Misconception list */}
      {isLoading !== true && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => {
            const mc = m;
            const id = String(mc.id);
            const status = String(mc.status) as MisconceptionStatus;
            const isExpanded = expandedId === id;

            return (
              <div key={id} className="overflow-hidden rounded-lg border border-border bg-card">
                {/* Summary row */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpandedId((prev) => (prev === id ? null : id));
                  }}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                >
                  {/* Status badge */}
                  <span
                    className={[
                      'inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      STATUS_CLASSES[status] ?? '',
                    ].join(' ')}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>

                  {/* Pattern */}
                  <span className="flex-1 truncate text-sm text-foreground">
                    {String(mc.pattern)}
                  </span>

                  {/* Confidence meter (approximated — API doesn't expose confidence directly) */}
                  <div className="flex-shrink-0">
                    <ConfidenceMeter value={0.75} className="w-16" />
                  </div>

                  {/* Date */}
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatDate(String(mc.detectedAt))}
                  </span>

                  {/* Pipeline */}
                  <div className="hidden flex-shrink-0 sm:block">
                    <MisconceptionPipeline status={status} />
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border p-4">
                    {/* Mini subgraph */}
                    <MisconceptionSubgraph nodeId={String(mc.nodeId)} />

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {status !== 'confirmed' &&
                        status !== 'resolved' &&
                        status !== 'dismissed' && (
                          <button
                            type="button"
                            onClick={() => {
                              void updateStatus.mutateAsync({ id, data: { status: 'confirmed' } });
                            }}
                            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Confirm
                          </button>
                        )}
                      {status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => {
                            void updateStatus.mutateAsync({ id, data: { status: 'resolved' } });
                          }}
                          className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Mark Resolved
                        </button>
                      )}
                      {status !== 'dismissed' && (
                        <button
                          type="button"
                          onClick={() => {
                            void updateStatus.mutateAsync({ id, data: { status: 'dismissed' } });
                          }}
                          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
