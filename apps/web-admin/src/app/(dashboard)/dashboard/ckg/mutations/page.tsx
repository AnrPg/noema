'use client';
/**
 * CKG Mutation Queue Page
 */
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCKGMutations } from '@noema/api-client';
import type { ICkgMutationDto, MutationStatus } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { ArrowRight, GitMerge } from 'lucide-react';

const ALL_STATUSES: MutationStatus[] = ['pending', 'approved', 'rejected', 'cancelled', 'retrying'];

function mutationTypeBadgeClass(type: string): string {
  if (type.includes('delete')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (type.includes('create')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function mutationStatusClass(status: string): string {
  if (status === 'approved') return 'bg-green-500/20 text-green-400';
  if (status === 'rejected') return 'bg-red-500/20 text-red-400';
  if (status === 'pending') return 'bg-yellow-500/20 text-yellow-400';
  if (status === 'retrying') return 'bg-orange-500/20 text-orange-400';
  return 'bg-gray-500/20 text-gray-400';
}

function MutationRow({ mutation }: { mutation: ICkgMutationDto }): React.JSX.Element {
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
        className={`text-xs font-mono px-1.5 py-0.5 rounded ${mutationStatusClass(mutation.status)}`}
      >
        {mutation.status.toUpperCase()}
      </span>
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
  const [statusFilter, setStatusFilter] = React.useState<MutationStatus>('pending');
  const { data: mutations = [], isLoading } = useCKGMutations({ status: statusFilter });

  const searchParams = useSearchParams();
  const nodeIdFilter = searchParams.get('nodeId');

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
          Review and govern canonical knowledge graph changes.
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
                found
              </CardDescription>
            </div>
            <select
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setStatusFilter(e.target.value as MutationStatus);
              }}
              className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading mutations...</div>
          ) : displayedMutations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No mutations found with status &quot;{statusFilter}&quot;
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
