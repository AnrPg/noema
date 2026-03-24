'use client';
/**
 * CKG Mutation Queue Page
 */
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCKGMutations } from '@noema/api-client';
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
import {
  getOntologyImportMutationContext,
  getMutationWorkflowMeta,
  getMutationWorkflowState,
  MUTATION_WORKFLOW_FILTERS,
} from '@/lib/mutation-workflow';

function mutationTypeBadgeClass(type: string): string {
  if (type.includes('delete')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (type.includes('create')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function MutationRow({ mutation }: { mutation: ICkgMutationDto }): React.JSX.Element {
  const workflow = getMutationWorkflowMeta(mutation);
  const workflowState = getMutationWorkflowState(mutation);
  const ontologyImportContext = getOntologyImportMutationContext(mutation);

  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
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

    return true;
  });
  const { groupedImports, directReviewMutations } =
    groupOntologyImportMutations(displayedMutations);
  const shouldGroupOntologyImports = importRunIdFilter === null && groupedImports.length > 0;

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mutations</CardTitle>
              <CardDescription>
                {displayedMutations.length} mutation{displayedMutations.length !== 1 ? 's' : ''} in{' '}
                {getMutationWorkflowMeta(stateFilter).label.toLowerCase()}
              </CardDescription>
            </div>
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
              <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-4">
                <p className="text-sm font-medium text-foreground">Ontology import proposals</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imported batches are grouped by run so reviewers can triage large submissions with
                  less scrolling.
                </p>
                <div className="mt-3 grid gap-3">
                  {groupedImports.map((group) => (
                    <div
                      key={group.key}
                      className="rounded-md border border-border bg-background/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {group.sourceId !== null
                              ? `${group.sourceId.toUpperCase()} import run`
                              : 'Ontology import run'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <code className="font-mono">{group.runId}</code> ·{' '}
                            {group.mutations.length} proposal
                            {group.mutations.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/dashboard/ckg/imports/runs/${encodeURIComponent(group.runId)}`}
                            >
                              Open run
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/dashboard/ckg/mutations?importRunId=${encodeURIComponent(group.runId)}`}
                            >
                              Focus group
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3">
                        {group.mutations.map((mutation) => (
                          <MutationRow key={String(mutation.id)} mutation={mutation} />
                        ))}
                      </div>
                    </div>
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
                      <MutationRow key={String(mutation.id)} mutation={mutation} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {displayedMutations.map((m) => (
                <MutationRow key={String(m.id)} mutation={m} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
