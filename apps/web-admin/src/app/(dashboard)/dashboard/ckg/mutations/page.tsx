'use client';
/**
 * CKG Mutation Queue Page
 */
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useBulkReviewMutations, useCKGMutations } from '@noema/api-client';
import type { ICkgMutationDto, MutationWorkflowState } from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@noema/ui';
import { AlertCircle, ArrowRight, GitMerge, RefreshCw } from 'lucide-react';
import { getRequestErrorDetails } from '@/lib/api-error';
import { BulkReviewToolbar } from '@/components/ckg/mutation-review/bulk-review-toolbar';
import { ImportRunReviewGroup } from '@/components/ckg/mutation-review/import-run-review-group';
import {
  getOntologyImportMutationContext,
  getMutationReviewHints,
  getMutationWorkflowMeta,
  getMutationWorkflowState,
  MUTATION_WORKFLOW_FILTERS,
} from '@/lib/mutation-workflow';

function mutationTypeBadgeClass(type: string): string {
  if (type.includes('delete')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (type.includes('create')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function confidenceBadgeClass(band: 'low' | 'medium' | 'high' | null): string {
  switch (band) {
    case 'high':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'medium':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'low':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

function MutationRow({
  mutation,
  checked,
  selectable,
  onToggle,
}: {
  mutation: ICkgMutationDto;
  checked: boolean;
  selectable: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const workflow = getMutationWorkflowMeta(mutation);
  const workflowState = getMutationWorkflowState(mutation);
  const ontologyImportContext = getOntologyImportMutationContext(mutation);
  const reviewHints = getMutationReviewHints(mutation);

  return (
    <div className="border-b py-3 last:border-0">
      <div className="flex items-center gap-4">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border border-input bg-background"
          checked={checked}
          disabled={!selectable}
          onChange={onToggle}
          aria-label={`Select mutation ${String(mutation.id)}`}
        />
        <code className="text-xs font-mono text-muted-foreground w-24 truncate flex-shrink-0">
          {String(mutation.id).slice(0, 8)}…
        </code>
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded border ${mutationTypeBadgeClass(mutation.type)}`}
        >
          {mutation.type}
        </span>
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded ${workflow.badgeClass}`}
          title={workflow.description}
        >
          {workflow.label.toUpperCase()}
        </span>
        <span className="hidden text-xs text-muted-foreground lg:block">{workflowState}</span>
        {ontologyImportContext.runId !== null && (
          <Link
            href={`/dashboard/ckg/mutations?importRunId=${encodeURIComponent(ontologyImportContext.runId)}`}
            className="hidden text-xs text-primary underline-offset-2 hover:underline lg:block"
          >
            {ontologyImportContext.sourceId !== null
              ? `${ontologyImportContext.sourceId.toUpperCase()} import`
              : 'Ontology import'}
          </Link>
        )}
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {String(mutation.proposedBy)}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {new Date(mutation.proposedAt).toLocaleDateString()}
        </span>
        <Link href={`/dashboard/ckg/mutations/${String(mutation.id)}`}>
          <Button size="sm" variant="ghost" className="gap-1">
            Review <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      {(reviewHints.confidenceBand !== null || reviewHints.conflicts.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
          {reviewHints.confidenceBand !== null && (
            <span
              className={`rounded border px-2 py-0.5 text-[11px] font-medium ${confidenceBadgeClass(reviewHints.confidenceBand)}`}
            >
              Confidence{' '}
              {reviewHints.confidenceScore !== null
                ? `${String(Math.round(reviewHints.confidenceScore * 100))}%`
                : 'set'}{' '}
              · {reviewHints.confidenceBand}
            </span>
          )}
          {reviewHints.conflicts.map((conflict) => (
            <span
              key={conflict}
              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300"
            >
              Conflict: {conflict.replaceAll('_', ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface IOntologyImportGroup {
  key: string;
  runId: string;
  sourceId: string | null;
  mutations: ICkgMutationDto[];
}

function groupOntologyImportMutations(mutations: ICkgMutationDto[]): {
  groupedImports: IOntologyImportGroup[];
  directReviewMutations: ICkgMutationDto[];
} {
  const groups = new Map<string, IOntologyImportGroup>();
  const directReviewMutations: ICkgMutationDto[] = [];

  for (const mutation of mutations) {
    const ontologyImportContext = getOntologyImportMutationContext(mutation);
    if (ontologyImportContext.runId === null) {
      directReviewMutations.push(mutation);
      continue;
    }

    const key = `${ontologyImportContext.runId}:${ontologyImportContext.sourceId ?? 'unknown'}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.mutations.push(mutation);
      continue;
    }

    groups.set(key, {
      key,
      runId: ontologyImportContext.runId,
      sourceId: ontologyImportContext.sourceId,
      mutations: [mutation],
    });
  }

  return {
    groupedImports: [...groups.values()].sort((left, right) =>
      left.runId.localeCompare(right.runId)
    ),
    directReviewMutations,
  };
}

export default function CKGMutationsPage(): React.JSX.Element {
  const [stateFilter, setStateFilter] = React.useState<MutationWorkflowState>('pending_review');
  const [confidenceFilter, setConfidenceFilter] = React.useState<'all' | 'high' | 'medium' | 'low'>(
    'all'
  );
  const [conflictFilter, setConflictFilter] = React.useState<'all' | 'conflicted' | 'clean'>('all');
  const [selectedMutationIds, setSelectedMutationIds] = React.useState<string[]>([]);
  const searchParams = useSearchParams();
  const nodeIdFilter = searchParams.get('nodeId');
  const importRunIdFilter = searchParams.get('importRunId');
  const {
    data: mutations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCKGMutations(
    {
      state: stateFilter,
      ...(importRunIdFilter !== null ? { importRunId: importRunIdFilter } : {}),
      includeImportRunAggregation: importRunIdFilter === null,
    },
    {
      retry: false,
    }
  );
  const errorDetails = isError
    ? getRequestErrorDetails(error, 'the mutation queue', 'the knowledge graph service')
    : null;
  const bulkReview = useBulkReviewMutations();

  const displayedMutations = mutations.filter((mutation) => {
    if (nodeIdFilter !== null) {
      const payload = mutation.payload;
      const matchesNode =
        (typeof payload['nodeId'] === 'string' && payload['nodeId'] === nodeIdFilter) ||
        (typeof payload['sourceId'] === 'string' && payload['sourceId'] === nodeIdFilter) ||
        (typeof payload['targetId'] === 'string' && payload['targetId'] === nodeIdFilter);

      if (!matchesNode) {
        return false;
      }
    }

    const reviewHints = getMutationReviewHints(mutation);
    if (confidenceFilter !== 'all' && reviewHints.confidenceBand !== confidenceFilter) {
      return false;
    }
    if (conflictFilter === 'conflicted' && reviewHints.conflicts.length === 0) {
      return false;
    }
    if (conflictFilter === 'clean' && reviewHints.conflicts.length > 0) {
      return false;
    }

    return true;
  });
  const { groupedImports, directReviewMutations } =
    groupOntologyImportMutations(displayedMutations);
  const shouldGroupOntologyImports = importRunIdFilter === null && groupedImports.length > 0;
  const ontologyImportMutations = displayedMutations.filter(
    (mutation) => getOntologyImportMutationContext(mutation).runId !== null
  );

  React.useEffect(() => {
    const visibleIds = new Set(ontologyImportMutations.map((mutation) => String(mutation.id)));
    setSelectedMutationIds((current) => current.filter((mutationId) => visibleIds.has(mutationId)));
  }, [ontologyImportMutations]);

  function toggleSelection(mutationId: string): void {
    setSelectedMutationIds((current) =>
      current.includes(mutationId)
        ? current.filter((currentId) => currentId !== mutationId)
        : [...current, mutationId]
    );
  }

  function selectAllVisible(): void {
    setSelectedMutationIds(ontologyImportMutations.map((mutation) => String(mutation.id)));
  }

  function clearSelection(): void {
    setSelectedMutationIds([]);
  }

  function selectReadyOnly(): void {
    setSelectedMutationIds(
      ontologyImportMutations
        .filter((mutation) => {
          const reviewHints = getMutationReviewHints(mutation);
          return reviewHints.conflicts.length === 0 && reviewHints.confidenceBand !== 'low';
        })
        .map((mutation) => String(mutation.id))
    );
  }

  function selectConflictedOnly(): void {
    setSelectedMutationIds(
      ontologyImportMutations
        .filter((mutation) => getMutationReviewHints(mutation).conflicts.length > 0)
        .map((mutation) => String(mutation.id))
    );
  }

  function toggleGroupSelection(group: IOntologyImportGroup): void {
    const groupIds = group.mutations.map((mutation) => String(mutation.id));
    setSelectedMutationIds((current) => {
      const hasAllSelected = groupIds.every((groupId) => current.includes(groupId));
      return hasAllSelected
        ? current.filter((mutationId) => !groupIds.includes(mutationId))
        : [...new Set([...current, ...groupIds])];
    });
  }

  function submitBulkReview(action: 'approve' | 'reject' | 'request_revision', note: string): void {
    bulkReview.mutate(
      {
        action,
        mutationIds: selectedMutationIds as ICkgMutationDto['id'][],
        ...(importRunIdFilter !== null ? { importRunId: importRunIdFilter } : {}),
        note,
      },
      {
        onSuccess: () => {
          clearSelection();
          void refetch();
        },
      }
    );
  }

  function submitScopedReview(
    action: 'approve' | 'reject',
    selector: (mutation: ICkgMutationDto) => boolean,
    note: string
  ): void {
    const mutationIds = ontologyImportMutations.filter(selector).map((mutation) => mutation.id);
    if (mutationIds.length === 0) {
      return;
    }

    bulkReview.mutate(
      {
        action,
        mutationIds,
        ...(importRunIdFilter !== null ? { importRunId: importRunIdFilter } : {}),
        note,
      },
      {
        onSuccess: () => {
          clearSelection();
          void refetch();
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <GitMerge className="h-8 w-8" />
          CKG Mutation Queue
        </h1>
        <p className="text-muted-foreground mt-1">
          Review canonical graph changes by their real workflow stage, not a flattened legacy
          status.
        </p>
      </div>

      {nodeIdFilter !== null && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>
            Filtered by node: <code className="font-mono">{nodeIdFilter}</code>
          </span>
          <Link
            href="/dashboard/ckg/mutations"
            className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        </div>
      )}

      {importRunIdFilter !== null && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>
            Filtered by ontology import run: <code className="font-mono">{importRunIdFilter}</code>
          </span>
          <Link
            href="/dashboard/ckg/mutations"
            className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        </div>
      )}

      {ontologyImportMutations.length > 0 && (
        <BulkReviewToolbar
          selectedCount={selectedMutationIds.length}
          visibleCount={ontologyImportMutations.length}
          importRunId={importRunIdFilter}
          isPending={bulkReview.isPending}
          onSelectAllVisible={selectAllVisible}
          onSelectReadyOnly={selectReadyOnly}
          onSelectConflictedOnly={selectConflictedOnly}
          onClearSelection={clearSelection}
          onSubmit={submitBulkReview}
          onApproveReadyOnly={(note) => {
            submitScopedReview(
              'approve',
              (mutation) => {
                const hints = getMutationReviewHints(mutation);
                return hints.conflicts.length === 0 && hints.confidenceBand !== 'low';
              },
              note
            );
          }}
          onRejectConflictedOnly={(note) => {
            submitScopedReview(
              'reject',
              (mutation) => getMutationReviewHints(mutation).conflicts.length > 0,
              note
            );
          }}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Mutations</CardTitle>
              <CardDescription>
                {displayedMutations.length} mutation{displayedMutations.length !== 1 ? 's' : ''} in{' '}
                {getMutationWorkflowMeta(stateFilter).label.toLowerCase()}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={stateFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setStateFilter(e.target.value as MutationWorkflowState);
                }}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MUTATION_WORKFLOW_FILTERS.map((state) => (
                  <option key={state} value={state}>
                    {getMutationWorkflowMeta(state).label}
                  </option>
                ))}
              </select>
              <select
                value={confidenceFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setConfidenceFilter(event.target.value as 'all' | 'high' | 'medium' | 'low');
                }}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All confidence</option>
                <option value="high">High confidence</option>
                <option value="medium">Medium confidence</option>
                <option value="low">Low confidence</option>
              </select>
              <select
                value={conflictFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setConflictFilter(event.target.value as 'all' | 'conflicted' | 'clean');
                }}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All conflict states</option>
                <option value="conflicted">Conflicted only</option>
                <option value="clean">Conflict-free only</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading mutations...</div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{errorDetails?.title}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{errorDetails?.description}</p>
                {errorDetails?.hint !== undefined && (
                  <p className="text-xs text-muted-foreground">{errorDetails.hint}</p>
                )}
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void refetch();
                    }}
                    disabled={isFetching}
                    className="gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {isFetching ? 'Retrying…' : 'Retry'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : displayedMutations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No mutations found in the &quot;{getMutationWorkflowMeta(stateFilter).label}&quot;{' '}
              workflow stage
              {nodeIdFilter !== null ? ` for node ${nodeIdFilter}` : ''}
              {importRunIdFilter !== null ? ` for import run ${importRunIdFilter}` : ''}.
            </div>
          ) : shouldGroupOntologyImports ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-background/20 p-3 text-sm">
                  <p className="text-muted-foreground">Ready proposals</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {
                      ontologyImportMutations.filter((mutation) => {
                        const hints = getMutationReviewHints(mutation);
                        return hints.conflicts.length === 0 && hints.confidenceBand !== 'low';
                      }).length
                    }
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background/20 p-3 text-sm">
                  <p className="text-muted-foreground">Conflicted proposals</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {
                      ontologyImportMutations.filter(
                        (mutation) => getMutationReviewHints(mutation).conflicts.length > 0
                      ).length
                    }
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background/20 p-3 text-sm">
                  <p className="text-muted-foreground">Import-run groups</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {groupedImports.length}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-4">
                <p className="text-sm font-medium text-foreground">Ontology import proposals</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imported batches are grouped by run so reviewers can triage large submissions with
                  less scrolling.
                </p>
                <div className="mt-3 grid gap-3">
                  {groupedImports.map((group) => (
                    <ImportRunReviewGroup
                      key={group.key}
                      runId={group.runId}
                      sourceId={group.sourceId}
                      mutationCount={group.mutations.length}
                      selectedCount={
                        group.mutations.filter((mutation) =>
                          selectedMutationIds.includes(String(mutation.id))
                        ).length
                      }
                      readyCount={
                        group.mutations.filter((mutation) => {
                          const hints = getMutationReviewHints(mutation);
                          return hints.conflicts.length === 0 && hints.confidenceBand !== 'low';
                        }).length
                      }
                      conflictCount={
                        group.mutations.filter(
                          (mutation) => getMutationReviewHints(mutation).conflicts.length > 0
                        ).length
                      }
                      onToggleAll={() => {
                        toggleGroupSelection(group);
                      }}
                    >
                      {group.mutations.map((mutation) => (
                        <MutationRow
                          key={String(mutation.id)}
                          mutation={mutation}
                          checked={selectedMutationIds.includes(String(mutation.id))}
                          selectable
                          onToggle={() => {
                            toggleSelection(String(mutation.id));
                          }}
                        />
                      ))}
                    </ImportRunReviewGroup>
                  ))}
                </div>
              </div>
              {directReviewMutations.length > 0 && (
                <div className="rounded-md border border-border bg-background/20 p-4">
                  <p className="text-sm font-medium text-foreground">Direct review proposals</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These mutations were proposed outside the ontology import pipeline.
                  </p>
                  <div className="mt-3">
                    {directReviewMutations.map((mutation) => (
                      <MutationRow
                        key={String(mutation.id)}
                        mutation={mutation}
                        checked={false}
                        selectable={false}
                        onToggle={() => {
                          return;
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {displayedMutations.map((m) => (
                <MutationRow
                  key={String(m.id)}
                  mutation={m}
                  checked={selectedMutationIds.includes(String(m.id))}
                  selectable={getOntologyImportMutationContext(m).runId !== null}
                  onToggle={() => {
                    if (getOntologyImportMutationContext(m).runId === null) {
                      return;
                    }
                    toggleSelection(String(m.id));
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
