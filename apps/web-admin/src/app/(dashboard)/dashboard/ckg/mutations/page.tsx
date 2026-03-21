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

export default function CKGMutationsPage(): React.JSX.Element {
  const [stateFilter, setStateFilter] = React.useState<MutationWorkflowState>('pending_review');
  const {
    data: mutations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCKGMutations(
    { state: stateFilter },
    {
      retry: false,
    }
  );

  const searchParams = useSearchParams();
  const nodeIdFilter = searchParams.get('nodeId');
  const errorDetails = isError
    ? getRequestErrorDetails(error, 'the mutation queue', 'the knowledge graph service')
    : null;

  const displayedMutations =
    nodeIdFilter !== null
      ? mutations.filter((m) => {
          const p = m.payload;
          return (
            (typeof p['nodeId'] === 'string' && p['nodeId'] === nodeIdFilter) ||
            (typeof p['sourceId'] === 'string' && p['sourceId'] === nodeIdFilter) ||
            (typeof p['targetId'] === 'string' && p['targetId'] === nodeIdFilter)
          );
        })
      : mutations;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <GitMerge className="h-8 w-8" />
          CKG Mutation Queue
        </h1>
        <p className="text-muted-foreground mt-1">
          Review canonical graph changes by their real workflow stage, not a flattened legacy status.
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mutations</CardTitle>
              <CardDescription>
                {displayedMutations.length} mutation{displayedMutations.length !== 1 ? 's' : ''}{' '}
                in {getMutationWorkflowMeta(stateFilter).label.toLowerCase()}
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
              No mutations found in the &quot;{getMutationWorkflowMeta(stateFilter).label}&quot;
              {' '}workflow stage
              {nodeIdFilter !== null ? ` for node ${nodeIdFilter}` : ''}.
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
