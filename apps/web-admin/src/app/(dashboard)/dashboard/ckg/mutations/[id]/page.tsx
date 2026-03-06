'use client';
/**
 * CKG Mutation Detail Page
 */
import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCKGMutation } from '@noema/api-client';
import type { ICkgMutationDto } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

type MutationId = ICkgMutationDto['id'];
import { ArrowLeft } from 'lucide-react';
import { MutationGraphDiff } from '@/components/mutations/mutation-graph-diff';
import { MutationAuditTrail } from '@/components/mutations/mutation-audit-trail';
import { MutationActions } from '@/components/mutations/mutation-actions';

export default function MutationDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const mutationId = params.id as unknown as MutationId;
  const { data: mutation, isLoading, error } = useCKGMutation(mutationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Loading mutation...</p>
      </div>
    );
  }

  if (error !== null || mutation === undefined) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/ckg/mutations">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to mutations
          </Button>
        </Link>
        <p className="text-muted-foreground text-center py-16">Mutation not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/ckg/mutations">
        <Button variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to mutations
        </Button>
      </Link>

      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-mono text-lg">{String(mutation.id)}</CardTitle>
              <CardDescription>
                {mutation.type} — submitted by {String(mutation.proposedBy)}
              </CardDescription>
            </div>
            <span
              className={`text-sm font-mono px-2 py-1 rounded ${
                mutation.status === 'approved'
                  ? 'bg-green-500/20 text-green-400'
                  : mutation.status === 'rejected'
                    ? 'bg-red-500/20 text-red-400'
                    : mutation.status === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              {mutation.status.toUpperCase()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proposed</span>
            <span>{new Date(mutation.proposedAt).toLocaleString()}</span>
          </div>
          {mutation.reviewedAt !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reviewed</span>
              <span>{new Date(mutation.reviewedAt).toLocaleString()}</span>
            </div>
          )}
          {mutation.reviewedBy !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reviewed by</span>
              <span className="font-mono">{String(mutation.reviewedBy)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Visualization</CardTitle>
          <CardDescription>Affected CKG subgraph (highlighted nodes)</CardDescription>
        </CardHeader>
        <CardContent>
          <MutationGraphDiff mutation={mutation} className="h-80" />
        </CardContent>
      </Card>

      {/* Payload diff */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proposed Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted/30 rounded p-4 overflow-auto max-h-64">
            {JSON.stringify(mutation.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Audit trail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Trail</CardTitle>
          <CardDescription>State transition history</CardDescription>
        </CardHeader>
        <CardContent>
          <MutationAuditTrail mutationId={mutationId} />
        </CardContent>
      </Card>

      {/* Admin actions */}
      <MutationActions mutation={mutation} />
    </div>
  );
}
