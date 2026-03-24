'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  IOntologyImportArtifactDto,
  IOntologyImportCheckpointDto,
  IOntologyImportRunDetailDto,
} from '@noema/api-client';
import { useOntologyImportArtifactContent } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import {
  describeOntologyImportRunVersion,
  formatOntologyImportStatus,
  getOntologyImportRunTone,
} from '@/components/ckg/ontology-imports/run-state';

type CandidateFilter = 'all' | 'ready' | 'blocked' | 'conflicted';

function checkpointTone(status: IOntologyImportCheckpointDto['status']): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10';
    case 'failed':
      return 'border-red-500/30 bg-red-500/10';
    case 'running':
      return 'border-blue-500/30 bg-blue-500/10';
    case 'cancelled':
      return 'border-zinc-500/30 bg-zinc-500/10';
    default:
      return 'border-border bg-muted/30';
  }
}

function artifactSummary(
  artifact: IOntologyImportArtifactDto,
  detail: IOntologyImportRunDetailDto
): React.JSX.Element {
  if (artifact.kind === 'parsed_batch' && detail.parsedBatch?.artifactId === artifact.id) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Records: {detail.parsedBatch.recordCount}</p>
        <p>Source version: {detail.parsedBatch.sourceVersion ?? 'pending'}</p>
      </div>
    );
  }

  if (artifact.kind === 'normalized_batch' && detail.normalizedBatch?.artifactId === artifact.id) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Concepts: {detail.normalizedBatch.conceptCount}</p>
        <p>Relations: {detail.normalizedBatch.relationCount}</p>
        <p>Mappings: {detail.normalizedBatch.mappingCount}</p>
      </div>
    );
  }

  if (artifact.kind === 'mutation_preview' && detail.mutationPreview?.artifactId === artifact.id) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Ready proposals: {detail.mutationPreview.readyProposalCount}</p>
        <p>Blocked candidates: {detail.mutationPreview.blockedCandidateCount}</p>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Metadata is available for this artifact, but this run does not have an expanded structured
      viewer for it yet.
    </p>
  );
}

function formatArtifactKind(kind: IOntologyImportArtifactDto['kind']): string {
  return kind.replaceAll('_', ' ');
}

function prettifyArtifactContent(content: string): string {
  const trimmed = content.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return content;
    }
  }

  return content;
}

export function OntologyImportRunStatusPanel({
  detail,
}: {
  detail: IOntologyImportRunDetailDto;
}): React.JSX.Element {
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    detail.checkpoints[0]?.id ?? ''
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(
    detail.artifacts[0]?.id ?? ''
  );
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all');
  const selectedCheckpoint = useMemo(
    () => detail.checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null,
    [detail.checkpoints, selectedCheckpointId]
  );
  const selectedArtifact = useMemo(
    () => detail.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
    [detail.artifacts, selectedArtifactId]
  );
  const { data: artifactContent } = useOntologyImportArtifactContent(
    detail.run.id,
    selectedArtifactId,
    {
      enabled: selectedArtifactId !== '',
      retry: false,
    }
  );
  const manifestArtifact = useMemo(
    () => detail.artifacts.find((artifact) => artifact.kind === 'manifest') ?? null,
    [detail.artifacts]
  );
  const activeCheckpoint = useMemo(
    () =>
      detail.checkpoints.find((checkpoint) => checkpoint.status === 'running') ??
      [...detail.checkpoints].reverse().find((checkpoint) => checkpoint.status === 'completed') ??
      null,
    [detail.checkpoints]
  );
  const totalSteps = Math.max(detail.checkpoints.length, 1);
  const completedSteps = detail.checkpoints.filter(
    (checkpoint) => checkpoint.status === 'completed'
  ).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const prettyArtifactContent = useMemo(
    () => (artifactContent !== undefined ? prettifyArtifactContent(artifactContent.content) : null),
    [artifactContent]
  );
  const parsedBatchArtifactId = detail.parsedBatch?.artifactId ?? null;
  const normalizedBatchArtifactId = detail.normalizedBatch?.artifactId ?? null;
  const mutationPreviewArtifactId = detail.mutationPreview?.artifactId ?? null;
  const filteredCandidates = useMemo(() => {
    const candidates = detail.mutationPreview?.candidates ?? [];
    switch (candidateFilter) {
      case 'ready':
        return candidates.filter((candidate) => candidate.status === 'ready');
      case 'blocked':
        return candidates.filter((candidate) => candidate.status !== 'ready');
      case 'conflicted':
        return candidates.filter((candidate) => candidate.review.conflictFlags.length > 0);
      default:
        return candidates;
    }
  }, [candidateFilter, detail.mutationPreview?.candidates]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{detail.run.sourceName} import run</CardTitle>
            <CardDescription>
              Checkpoints, artifacts, parsed output, normalized output, and mutation-preview data
              stay inspectable from one place.
            </CardDescription>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${getOntologyImportRunTone(detail.run.status).badgeClassName}`}
          >
            {formatOntologyImportStatus(detail.run.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Pipeline progress</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeCheckpoint === null
                  ? 'No active checkpoint is currently running.'
                  : `Current step: ${activeCheckpoint.step} (${activeCheckpoint.status}).`}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {String(completedSteps)} of {String(totalSteps)} checkpoints completed
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-background/60">
            <div
              className="h-2 rounded-full bg-emerald-400 transition-all"
              style={{ width: `${String(progressPercent)}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {manifestArtifact !== null && (
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground transition hover:bg-background/80"
                onClick={() => {
                  setSelectedArtifactId(manifestArtifact.id);
                }}
              >
                Open manifest
              </button>
            )}
            {parsedBatchArtifactId !== null && (
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground transition hover:bg-background/80"
                onClick={() => {
                  setSelectedArtifactId(parsedBatchArtifactId);
                }}
              >
                Open parsed batch
              </button>
            )}
            {normalizedBatchArtifactId !== null && (
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground transition hover:bg-background/80"
                onClick={() => {
                  setSelectedArtifactId(normalizedBatchArtifactId);
                }}
              >
                Open normalized batch
              </button>
            )}
            {mutationPreviewArtifactId !== null && (
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground transition hover:bg-background/80"
                onClick={() => {
                  setSelectedArtifactId(mutationPreviewArtifactId);
                }}
              >
                Open mutation preview
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Run id: {detail.run.id}</p>
            <p>Source version: {describeOntologyImportRunVersion(detail.run)}</p>
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
          <div className="rounded-md border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium text-foreground">Structured batch viewers</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-background/40 p-3">
                <p className="font-medium text-foreground">Parsed batch</p>
                <p className="mt-1 text-muted-foreground">
                  {detail.parsedBatch === null
                    ? 'Not available'
                    : `${String(detail.parsedBatch.recordCount)} staged records`}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background/40 p-3">
                <p className="font-medium text-foreground">Normalized batch</p>
                <p className="mt-1 text-muted-foreground">
                  {detail.normalizedBatch === null
                    ? 'Not available'
                    : `${String(detail.normalizedBatch.conceptCount)} concepts, ${String(detail.normalizedBatch.relationCount)} relations`}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background/40 p-3">
                <p className="font-medium text-foreground">Mutation preview</p>
                <p className="mt-1 text-muted-foreground">
                  {detail.mutationPreview === null
                    ? 'Not available'
                    : `${String(detail.mutationPreview.readyProposalCount)} ready, ${String(detail.mutationPreview.blockedCandidateCount)} blocked`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="font-medium text-foreground">Checkpoint timeline</p>
            <div className="mt-3 space-y-2">
              {detail.checkpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checkpoints recorded yet.</p>
              ) : (
                detail.checkpoints.map((checkpoint) => (
                  <button
                    key={checkpoint.id}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left text-sm transition ${
                      selectedCheckpointId === checkpoint.id
                        ? 'border-primary bg-primary/5'
                        : checkpointTone(checkpoint.status)
                    }`}
                    onClick={() => {
                      setSelectedCheckpointId(checkpoint.id);
                    }}
                  >
                    <p className="font-medium text-foreground">
                      {checkpoint.step} · {checkpoint.status}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {checkpoint.completedAt ?? checkpoint.startedAt ?? 'Pending timestamps'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="font-medium text-foreground">Checkpoint viewer</p>
            {selectedCheckpoint === null ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Select a checkpoint from the timeline to inspect its detail and timestamps.
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>Step: {selectedCheckpoint.step}</p>
                <p>Status: {selectedCheckpoint.status}</p>
                <p>Started at: {selectedCheckpoint.startedAt ?? 'Not started'}</p>
                <p>Completed at: {selectedCheckpoint.completedAt ?? 'Not completed'}</p>
                <p className="rounded-md border border-border bg-background/40 p-3 text-foreground">
                  {selectedCheckpoint.detail ??
                    'No additional detail recorded for this checkpoint.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="font-medium text-foreground">Artifacts</p>
            <div className="mt-3 space-y-2">
              {detail.artifacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No artifacts stored yet.</p>
              ) : (
                detail.artifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left text-sm transition ${
                      selectedArtifactId === artifact.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background/40'
                    }`}
                    onClick={() => {
                      setSelectedArtifactId(artifact.id);
                    }}
                  >
                    <p className="font-medium text-foreground">
                      {formatArtifactKind(artifact.kind)}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground">{artifact.storageKey}</p>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <p className="font-medium text-foreground">Artifact viewer</p>
            {selectedArtifact === null ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Select an artifact to inspect its metadata and any structured viewer that applies.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Artifact id: {selectedArtifact.id}</p>
                  <p>Kind: {formatArtifactKind(selectedArtifact.kind)}</p>
                  <p>Storage key: {selectedArtifact.storageKey}</p>
                  <p>Content type: {selectedArtifact.contentType ?? 'Unknown'}</p>
                  <p>Checksum: {selectedArtifact.checksum ?? 'Not recorded'}</p>
                  <p>Size: {selectedArtifact.sizeBytes ?? 'Unknown'} bytes</p>
                </div>
                <div className="rounded-md border border-border bg-background/40 p-4">
                  {artifactSummary(selectedArtifact, detail)}
                </div>
                {prettyArtifactContent !== null && (
                  <div className="rounded-md border border-border bg-background/40 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">Raw artifact viewer</p>
                      <a
                        download={`${selectedArtifact.kind}-${selectedArtifact.id}.txt`}
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(prettyArtifactContent)}`}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Download artifact
                      </a>
                    </div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {prettyArtifactContent}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
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
            {detail.normalizedBatch === null ? (
              <p className="mt-2 text-muted-foreground">Not available yet.</p>
            ) : (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Concepts: {detail.normalizedBatch.conceptCount}</p>
                <p>Relations: {detail.normalizedBatch.relationCount}</p>
                <p>Mappings: {detail.normalizedBatch.mappingCount}</p>
                <p>Raw records: {detail.normalizedBatch.rawRecordCount}</p>
                <p>Artifact id: {detail.normalizedBatch.artifactId}</p>
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="font-medium text-foreground">Mutation preview</p>
            {detail.mutationPreview === null ? (
              <p className="mt-2 text-muted-foreground">
                Mutation-ready payloads have not been generated yet.
              </p>
            ) : (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Ready proposals: {detail.mutationPreview.readyProposalCount}</p>
                <p>Deferred candidates: {detail.mutationPreview.blockedCandidateCount}</p>
                <p>Artifact id: {detail.mutationPreview.artifactId ?? 'Pending artifact link'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Mutation preview candidates</p>
              <p className="mt-1 text-muted-foreground">
                Filter candidates by readiness or conflict state before submitting the batch.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'ready', 'blocked', 'conflicted'] as CandidateFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`rounded-md border px-3 py-1 text-xs transition ${
                    candidateFilter === filter
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background/40 text-muted-foreground'
                  }`}
                  onClick={() => {
                    setCandidateFilter(filter);
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          {detail.mutationPreview === null ? (
            <p className="mt-2 text-muted-foreground">No mutation preview candidates yet.</p>
          ) : filteredCandidates.length === 0 ? (
            <p className="mt-3 text-muted-foreground">
              No candidates match the current `{candidateFilter}` filter.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {filteredCandidates.map((candidate) => (
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confidence {Math.round(candidate.review.confidenceScore * 100)}% ·{' '}
                    {candidate.review.confidenceBand}
                    {candidate.review.conflictFlags.length > 0
                      ? ` · conflicts: ${candidate.review.conflictFlags.join(', ')}`
                      : ''}
                  </p>
                  {candidate.blockedReason !== null && (
                    <p className="mt-2 text-amber-300">{candidate.blockedReason}</p>
                  )}
                  {candidate.proposal !== null && (
                    <p className="mt-2 text-muted-foreground">
                      Operations: {candidate.proposal.operations.length} · Priority:{' '}
                      {candidate.proposal.priority}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
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
