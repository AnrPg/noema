'use client';
/**
 * @noema/web-admin - MutationAuditTrail
 *
 * Vertical timeline for CKG mutation typestate transitions.
 */
import * as React from 'react';
import { useCKGMutationAuditLog } from '@noema/api-client';
import type { ICkgMutationDto } from '@noema/api-client';
import { ArrowRight, Bot, User } from 'lucide-react';
import { getMutationWorkflowMeta } from '@/lib/mutation-workflow';

type MutationId = ICkgMutationDto['id'];

function statusDotColor(status: string): string {
  return getMutationWorkflowMeta(status as Parameters<typeof getMutationWorkflowMeta>[0]).dotClass;
}

export function MutationAuditTrail({ mutationId }: { mutationId: MutationId }): React.JSX.Element {
  const { data: log, isLoading } = useCKGMutationAuditLog(mutationId, {
    refetchInterval: 1500,
  });

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-muted/20 rounded-lg" />;
  }

  if (log === undefined || log.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit trail entries.</p>;
  }

  return (
    <div className="space-y-0">
      {log.entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={`h-3 w-3 rounded-full mt-1.5 flex-shrink-0 ${statusDotColor(entry.toStatus)}`}
            />
            {i < log.entries.length - 1 && <div className="w-px flex-1 bg-border mt-1 min-h-8" />}
          </div>
          <div className="pb-6 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.fromStatus !== null && (
                <>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
                    {getMutationWorkflowMeta(
                      entry.fromStatus as Parameters<typeof getMutationWorkflowMeta>[0]
                    ).label.toUpperCase()}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              <span
                className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  getMutationWorkflowMeta(
                    entry.toStatus as Parameters<typeof getMutationWorkflowMeta>[0]
                  ).badgeClass
                }`}
              >
                {getMutationWorkflowMeta(
                  entry.toStatus as Parameters<typeof getMutationWorkflowMeta>[0]
                ).label.toUpperCase()}
              </span>
              <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
                {entry.actorType === 'system' ? (
                  <Bot className="h-3 w-3" />
                ) : (
                  <User className="h-3 w-3" />
                )}
                <span>{entry.actorType === 'system' ? 'System' : entry.actorId}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(entry.transitionedAt).toLocaleString()}
            </p>
            {entry.reason !== null && (
              <p className="text-sm mt-1 bg-muted/30 rounded px-2 py-1">{entry.reason}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
