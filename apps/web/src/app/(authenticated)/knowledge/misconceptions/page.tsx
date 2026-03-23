'use client';
/**
 * @noema/web — /knowledge/misconceptions
 *
 * Misconception Center:
 *   1. Header with scan trigger
 *   2. Status and family summaries
 *   3. Filter + sort controls
 *   4. Rich misconception review list
 *   5. Expanded detail with subgraph and lifecycle actions
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import {
  useDetectMisconceptions,
  useMisconceptions,
  useUpdateMisconceptionStatus,
} from '@noema/api-client';
import type { IMisconceptionDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button, ConfidenceMeter } from '@noema/ui';
import { AlertTriangle, ArrowUpDown, Loader2, ScanSearch } from 'lucide-react';
import { MisconceptionPipeline } from '@/components/knowledge/misconception-pipeline';
import { MisconceptionSubgraph } from '@/components/knowledge/misconception-subgraph';

type MisconceptionStatus =
  | 'detected'
  | 'confirmed'
  | 'addressed'
  | 'resolved'
  | 'recurring'
  | 'dismissed';
type SortValue = 'newest' | 'severity' | 'confidence' | 'family';
type FilterValue = '' | MisconceptionStatus;

const STATUS_ORDER: MisconceptionStatus[] = [
  'detected',
  'confirmed',
  'addressed',
  'resolved',
  'recurring',
];

const STATUS_LABELS: Record<MisconceptionStatus, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  addressed: 'Addressed',
  resolved: 'Resolved',
  recurring: 'Recurring',
  dismissed: 'Dismissed',
};

const STATUS_CLASSES: Record<MisconceptionStatus, string> = {
  detected: 'bg-red-500/10 text-red-300 border-red-500/30',
  confirmed: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  addressed: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  resolved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  recurring: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30',
  dismissed: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
};

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-200 border-red-500/40',
  high: 'bg-orange-500/15 text-orange-200 border-orange-500/40',
  moderate: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  low: 'bg-slate-500/15 text-slate-200 border-slate-500/40',
};

const SORT_OPTIONS: { label: string; value: SortValue }[] = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Highest severity', value: 'severity' },
  { label: 'Highest confidence', value: 'confidence' },
  { label: 'Family', value: 'family' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ensureMisconceptions(value: unknown): IMisconceptionDto[] {
  return Array.isArray(value) ? (value as IMisconceptionDto[]) : [];
}

function familyDisplayName(misconception: IMisconceptionDto): string {
  if (misconception.familyLabel !== undefined && misconception.familyLabel !== '') {
    return misconception.familyLabel;
  }

  if (misconception.family !== undefined && misconception.family !== '') {
    return misconception.family
      .split(/[-_]/)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');
  }

  return 'Uncategorized';
}

function severityDisplayName(severity: string | undefined): string {
  if (severity === undefined || severity === '') {
    return 'Unrated';
  }

  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function sortMisconceptions(items: IMisconceptionDto[], sort: SortValue): IMisconceptionDto[] {
  const copy = [...items];

  copy.sort((a, b) => {
    if (sort === 'severity') {
      const severityDelta =
        (SEVERITY_ORDER[a.severity ?? 'low'] ?? 99) - (SEVERITY_ORDER[b.severity ?? 'low'] ?? 99);
      if (severityDelta !== 0) {
        return severityDelta;
      }
    }

    if (sort === 'confidence') {
      const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
    }

    if (sort === 'family') {
      const familyDelta = familyDisplayName(a).localeCompare(familyDisplayName(b));
      if (familyDelta !== 0) {
        return familyDelta;
      }
    }

    return (
      new Date(b.lastDetectedAt ?? b.detectedAt).getTime() -
      new Date(a.lastDetectedAt ?? a.detectedAt).getTime()
    );
  });

  return copy;
}

export default function MisconceptionsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<FilterValue>('');
  const [sortBy, setSortBy] = React.useState<SortValue>('newest');
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [updateError, setUpdateError] = React.useState<string | null>(null);

  const { data: misconceptionsResponse, isLoading } = useMisconceptions(userId);
  const detectMutation = useDetectMisconceptions(userId);
  const updateStatus = useUpdateMisconceptionStatus(userId);

  const allMisconceptions = ensureMisconceptions(misconceptionsResponse?.data);

  const statusCounts = React.useMemo(() => {
    const counts: Partial<Record<MisconceptionStatus, number>> = {};
    for (const misconception of allMisconceptions) {
      counts[misconception.status] = (counts[misconception.status] ?? 0) + 1;
    }
    return counts;
  }, [allMisconceptions]);

  const familyCounts = React.useMemo(() => {
    const entries = new Map<string, number>();
    for (const misconception of allMisconceptions) {
      const label = familyDisplayName(misconception);
      entries.set(label, (entries.get(label) ?? 0) + 1);
    }

    return [...entries.entries()].sort((a, b) => b[1] - a[1]);
  }, [allMisconceptions]);

  const filteredMisconceptions = React.useMemo(() => {
    const filtered =
      statusFilter === ''
        ? allMisconceptions
        : allMisconceptions.filter((misconception) => misconception.status === statusFilter);

    return sortMisconceptions(filtered, sortBy);
  }, [allMisconceptions, sortBy, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Misconception Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? 'Loading misconceptions…'
              : `${String(allMisconceptions.length)} misconception${allMisconceptions.length === 1 ? '' : 's'} tracked across your PKG`}
          </p>
        </div>
        <Button
          onClick={() => {
            setDetectError(null);
            detectMutation.mutate(undefined, {
              onError: (error) => {
                setDetectError(error.message);
              },
            });
          }}
          disabled={detectMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {detectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
          )}
          Scan for New Misconceptions
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Status Summary
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter((previous) => (previous === status ? '' : status));
                }}
                aria-pressed={statusFilter === status}
                className={[
                  'rounded-xl border px-4 py-3 text-left transition-colors',
                  statusFilter === status
                    ? 'border-blue-500/60 bg-blue-500/10'
                    : 'border-border bg-background/30 hover:bg-background/50',
                ].join(' ')}
              >
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {String(statusCounts[status] ?? 0)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[status]}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Family Breakdown
          </p>
          <div className="mt-4 space-y-3">
            {familyCounts.length > 0 ? (
              familyCounts.slice(0, 5).map(([family, count]) => {
                const width =
                  allMisconceptions.length === 0 ? 0 : (count / allMisconceptions.length) * 100;
                return (
                  <div key={family}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{family}</span>
                      <span className="text-muted-foreground">{String(count)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className="h-full rounded-full bg-pink-400/80"
                        style={{ width: `${String(width)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No family data available yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('');
            }}
            className={[
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              statusFilter === ''
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted',
            ].join(' ')}
          >
            All statuses
          </button>
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
              }}
              className={[
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="misconception-sort" className="text-sm text-muted-foreground">
            Sort
          </label>
          <select
            id="misconception-sort"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortValue);
            }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {detectError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive"
        >
          Scan failed: {detectError}
        </div>
      )}

      {updateError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive"
        >
          Update failed: {updateError}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading misconceptions…
        </div>
      )}

      {!isLoading && filteredMisconceptions.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12 text-sm text-muted-foreground">
          {statusFilter === ''
            ? 'No misconceptions detected yet. Run a scan to review current graph weaknesses.'
            : `No ${STATUS_LABELS[statusFilter]} misconceptions right now.`}
        </div>
      )}

      {!isLoading && filteredMisconceptions.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredMisconceptions.map((misconception) => {
            const isExpanded = expandedId === misconception.id;
            const family = familyDisplayName(misconception);
            const severity = severityDisplayName(misconception.severity);

            return (
              <div
                key={misconception.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpandedId((previous) =>
                      previous === misconception.id ? null : misconception.id
                    );
                  }}
                  className="flex w-full flex-col gap-4 px-4 py-4 text-left hover:bg-background/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className={[
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        STATUS_CLASSES[misconception.status],
                      ].join(' ')}
                    >
                      {STATUS_LABELS[misconception.status]}
                    </span>
                    <span
                      className={[
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        SEVERITY_CLASSES[misconception.severity ?? 'low'] ??
                          'border-border text-muted-foreground',
                      ].join(' ')}
                    >
                      {severity}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                      {family}
                    </span>
                    {misconception.misconceptionType !== undefined && (
                      <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                        {misconception.misconceptionType}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-foreground">
                        {misconception.pattern}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {(misconception.description ?? '').trim() !== ''
                          ? misconception.description
                          : 'No detailed description has been recorded for this misconception yet.'}
                      </p>
                    </div>

                    <div className="grid min-w-[240px] gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>
                        <p className="uppercase tracking-wide">Affected nodes</p>
                        <p className="mt-1 text-sm text-foreground">
                          {String(misconception.affectedNodeIds.length)}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Detected</p>
                        <p className="mt-1 text-sm text-foreground">
                          {formatDate(misconception.detectedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Detections</p>
                        <p className="mt-1 text-sm text-foreground">
                          {String(misconception.detectionCount ?? 1)}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Confidence</p>
                        <div className="mt-1">
                          {misconception.confidence !== undefined ? (
                            <ConfidenceMeter
                              value={misconception.confidence}
                              segments={4}
                              className="w-20"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">Not available</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MisconceptionPipeline status={misconception.status} />
                    <div className="text-xs text-muted-foreground">
                      Last seen{' '}
                      {formatDate(misconception.lastDetectedAt ?? misconception.detectedAt)}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4">
                    <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
                      <div className="space-y-4">
                        <MisconceptionSubgraph
                          nodeId={
                            (misconception.affectedNodeIds[0] ?? misconception.nodeId) as string
                          }
                        />

                        <div className="rounded-xl border border-border bg-background/30 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Affected Graph Nodes
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {misconception.affectedNodeIds.length > 0 ? (
                              misconception.affectedNodeIds.map((nodeId) => (
                                <span
                                  key={nodeId}
                                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground"
                                >
                                  {nodeId}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                No node identifiers recorded.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-background/30 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Detection Evidence
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-border/70 px-3 py-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Type
                              </p>
                              <p className="mt-1 text-sm text-foreground">
                                {misconception.misconceptionType ?? 'Unknown'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-border/70 px-3 py-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Family
                              </p>
                              <p className="mt-1 text-sm text-foreground">{family}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 px-3 py-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Severity Score
                              </p>
                              <p className="mt-1 text-sm text-foreground">
                                {misconception.severityScore !== undefined
                                  ? misconception.severityScore.toFixed(2)
                                  : 'Not available'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-border/70 px-3 py-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Resolved At
                              </p>
                              <p className="mt-1 text-sm text-foreground">
                                {misconception.resolvedAt !== null
                                  ? formatDate(misconception.resolvedAt)
                                  : 'Still active'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-background/30 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Review Actions
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {misconception.status === 'detected' && (
                              <button
                                type="button"
                                disabled={updateStatus.isPending}
                                onClick={() => {
                                  setUpdateError(null);
                                  updateStatus.mutate(
                                    { id: misconception.id, data: { status: 'confirmed' } },
                                    {
                                      onError: (error) => {
                                        setUpdateError(error.message);
                                      },
                                    }
                                  );
                                }}
                                className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            )}
                            {(misconception.status === 'detected' ||
                              misconception.status === 'confirmed' ||
                              misconception.status === 'recurring') && (
                              <button
                                type="button"
                                disabled={updateStatus.isPending}
                                onClick={() => {
                                  setUpdateError(null);
                                  updateStatus.mutate(
                                    { id: misconception.id, data: { status: 'addressed' } },
                                    {
                                      onError: (error) => {
                                        setUpdateError(error.message);
                                      },
                                    }
                                  );
                                }}
                                className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Mark Addressed
                              </button>
                            )}
                            {(misconception.status === 'confirmed' ||
                              misconception.status === 'addressed' ||
                              misconception.status === 'recurring') && (
                              <button
                                type="button"
                                disabled={updateStatus.isPending}
                                onClick={() => {
                                  setUpdateError(null);
                                  updateStatus.mutate(
                                    { id: misconception.id, data: { status: 'resolved' } },
                                    {
                                      onError: (error) => {
                                        setUpdateError(error.message);
                                      },
                                    }
                                  );
                                }}
                                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Mark Resolved
                              </button>
                            )}
                            {(misconception.status === 'addressed' ||
                              misconception.status === 'resolved') && (
                              <button
                                type="button"
                                disabled={updateStatus.isPending}
                                onClick={() => {
                                  setUpdateError(null);
                                  updateStatus.mutate(
                                    { id: misconception.id, data: { status: 'recurring' } },
                                    {
                                      onError: (error) => {
                                        setUpdateError(error.message);
                                      },
                                    }
                                  );
                                }}
                                className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Flag Recurring
                              </button>
                            )}
                          </div>
                        </div>

                        {misconception.status === 'recurring' && (
                          <div className="flex items-start gap-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            This misconception has re-emerged after prior remediation. Consider a
                            more targeted intervention before expanding the topic graph.
                          </div>
                        )}
                      </div>
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
