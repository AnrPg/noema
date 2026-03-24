'use client';

import Link from 'next/link';
import type { IOntologyImportRunDetailDto, OntologyImportStatus } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

function statusClassName(status: OntologyImportStatus): string {
  switch (status) {
    case 'staging_validated':
      return 'bg-violet-500/15 text-violet-300 border-violet-400/30';
    case 'ready_for_normalization':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
    case 'failed':
      return 'bg-red-500/15 text-red-300 border-red-400/30';
    case 'cancelled':
      return 'bg-zinc-500/15 text-zinc-300 border-zinc-400/30';
    default:
      return 'bg-blue-500/15 text-blue-300 border-blue-400/30';
  }
}

export function OntologyImportRunStatusPanel({
  detail,
}: {
  detail: IOntologyImportRunDetailDto;
}): React.JSX.Element {
  const { normalizedBatch, mutationPreview } = detail;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{detail.run.sourceName} import run</CardTitle>
            <CardDescription>
              Raw artifacts, normalized batch summaries, and mutation-preview payloads stay visible
              before we wire direct submission into the CKG review pipeline. before and after we
              submit them into the CKG review pipeline.
            </CardDescription>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${statusClassName(detail.run.status)}`}
          >
            {detail.run.status.replaceAll('_', ' ')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Run id: {detail.run.id}</p>
          <p>Source version: {detail.run.sourceVersion ?? 'Pending discovery'}</p>
          <p>Source mode: {detail.run.configuration.mode ?? 'Default'}</p>
          <p>Language: {detail.run.configuration.language ?? 'Default'}</p>
          <p>
            Seed nodes:{' '}
            {detail.run.configuration.seedNodes.length > 0
              ? detail.run.configuration.seedNodes.join(', ')
              : 'Default'}
          </p>
          <p>Trigger: {detail.run.trigger}</p>
          <p>Initiated by: {detail.run.initiatedBy ?? 'System'}</p>
          <p>Started at: {detail.run.startedAt ?? 'Not started yet'}</p>
          <p>Completed at: {detail.run.completedAt ?? 'Still running'}</p>
          <p>Artifacts: {detail.artifacts.length}</p>
          <p>Submitted mutations: {detail.run.submittedMutationIds.length}</p>
        </div>
        <div className="space-y-3">
          {detail.checkpoints.map((checkpoint) => (
            <div
              key={checkpoint.id}
              className="rounded-md border border-border bg-muted/30 p-3 text-sm"
            >
              <p className="font-medium text-foreground">
                {checkpoint.step} - {checkpoint.status}
              </p>
              <p className="mt-1 text-muted-foreground">
                {checkpoint.detail ?? 'No extra detail yet.'}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">Parsed batch</p>
          {detail.parsedBatch === null ? (
            <p className="mt-2 text-muted-foreground">Not available yet.</p>
          ) : (
            <div className="mt-2 space-y-1 text-muted-foreground">
              <p>Records: {detail.parsedBatch.recordCount}</p>
              <p>Artifact id: {detail.parsedBatch.artifactId}</p>
            </div>
          )}
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">Normalized batch</p>
          {normalizedBatch === null ? (
            <p className="mt-2 text-muted-foreground">Not available yet.</p>
          ) : (
            <div className="mt-2 space-y-1 text-muted-foreground">
              <p>Concepts: {normalizedBatch.conceptCount}</p>
              <p>Relations: {normalizedBatch.relationCount}</p>
              <p>Mappings: {normalizedBatch.mappingCount}</p>
              <p>Raw records: {normalizedBatch.rawRecordCount}</p>
              <p>Artifact id: {normalizedBatch.artifactId}</p>
            </div>
          )}
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm lg:col-span-2">
          <p className="font-medium text-foreground">Mutation preview</p>
          {mutationPreview === null ? (
            <p className="mt-2 text-muted-foreground">
              Mutation-ready payloads have not been generated yet.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="grid gap-2 text-muted-foreground sm:grid-cols-3">
                <p>Ready proposals: {mutationPreview.readyProposalCount}</p>
                <p>Deferred candidates: {mutationPreview.blockedCandidateCount}</p>
                <p>Artifact id: {mutationPreview.artifactId ?? 'Pending artifact link'}</p>
              </div>
              <div className="space-y-2">
                {mutationPreview.candidates.slice(0, 5).map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="rounded-md border border-border bg-background/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{candidate.title}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          candidate.status === 'ready'
                            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {candidate.status}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{candidate.summary}</p>
                    {candidate.blockedReason !== null && (
                      <p className="mt-2 text-amber-300">{candidate.blockedReason}</p>
                    )}
                    {candidate.proposal !== null && (
                      <p className="mt-2 text-muted-foreground">
                        Operations: {candidate.proposal.operations.length} - Priority:{' '}
                        {candidate.proposal.priority}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm lg:col-span-2">
          <p className="font-medium text-foreground">Submitted review queue mutations</p>
          {detail.run.submittedMutationIds.length === 0 ? (
            <p className="mt-2 text-muted-foreground">
              No mutation ids have been persisted on this run yet.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.run.submittedMutationIds.map((mutationId: string) => (
                <Link
                  key={mutationId}
                  href={`/dashboard/ckg/mutations/${encodeURIComponent(mutationId)}?importRunId=${encodeURIComponent(detail.run.id)}`}
                  className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 font-mono text-xs text-violet-200 transition hover:bg-violet-500/20"
                >
                  {mutationId}
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
