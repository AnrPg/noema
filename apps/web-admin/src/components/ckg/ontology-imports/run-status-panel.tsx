'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  ICkgMutationDto,
  IOntologyImportArtifactDto,
  IOntologyImportCheckpointDto,
  IOntologyImportRunDetailDto,
} from '@noema/api-client';
import { useCKGMutations, useOntologyImportArtifactContent } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  describeOntologyImportRunVersion,
  formatOntologyImportStatus,
  getOntologyImportRunTone,
} from '@/components/ckg/ontology-imports/run-state';

type CandidateFilter = 'all' | 'ready' | 'blocked' | 'conflicted';
type SectionKey =
  | 'run_overview'
  | 'pipeline_progress'
  | 'structured_outputs'
  | 'checkpoints'
  | 'artifacts'
  | 'preview_candidates'
  | 'submitted_mutations';

const CANDIDATES_PER_PAGE = 5;
const SUBMITTED_MUTATIONS_PER_PAGE = 5;
const INITIAL_SECTION_STATE: Record<SectionKey, boolean> = {
  run_overview: true,
  pipeline_progress: true,
  structured_outputs: true,
  checkpoints: true,
  artifacts: true,
  preview_candidates: true,
  submitted_mutations: true,
};

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

function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not recorded';
  }

  return new Date(value).toLocaleString();
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

function summarizePipelineState(detail: IOntologyImportRunDetailDto): string {
  switch (detail.run.status) {
    case 'queued':
      return 'Queued and waiting for an operator to start the automated import pipeline.';
    case 'fetching':
    case 'fetched':
    case 'parsing':
    case 'parsed':
      return 'The automated import pipeline is still running through fetch, parse, normalization, and mutation-preview generation.';
    case 'ready_for_review':
      return 'The automated pipeline finished. Review the mutation preview and submit the ready proposals into the CKG review queue when you are satisfied.';
    case 'review_submitted':
      return 'The automated pipeline finished and the ready proposals have already been submitted into the CKG review queue.';
    case 'failed':
      return 'The automated pipeline stopped because a stage failed. Inspect checkpoints and artifacts before retrying.';
    case 'cancelled':
      return 'The run was cancelled before the automated pipeline finished.';
    default:
      return 'Inspect the checkpoints and artifacts to understand the latest pipeline state.';
  }
}

function splitDetailParagraphs(detail: string | null | undefined): string[] {
  if (detail === null || detail === undefined) {
    return ['No additional detail recorded for this checkpoint.'];
  }

  return detail
    .split(/(?<=\.)\s+(?=[A-Z])/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function readFirstTextField(
  source: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  if (source === null || source === undefined) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

function getCandidateTitleFromMutation(mutation: ICkgMutationDto): string {
  const payloadTitle = readFirstTextField(mutation.payload, [
    'label',
    'title',
    'name',
    'nodeLabel',
  ]);
  if (payloadTitle !== null) {
    return payloadTitle;
  }

  const firstOperation = mutation.operations?.[0];
  if (firstOperation !== undefined) {
    const operationTitle = readFirstTextField(firstOperation, [
      'label',
      'title',
      'name',
      'nodeLabel',
    ]);
    if (operationTitle !== null) {
      return operationTitle;
    }

    const updates = firstOperation['updates'];
    if (typeof updates === 'object' && updates !== null && !Array.isArray(updates)) {
      const updateTitle = readFirstTextField(updates as Record<string, unknown>, [
        'label',
        'title',
        'name',
      ]);
      if (updateTitle !== null) {
        return updateTitle;
      }
    }
  }

  if (
    mutation.ontologyImportContext?.candidateId !== null &&
    mutation.ontologyImportContext?.candidateId !== undefined
  ) {
    return mutation.ontologyImportContext.candidateId;
  }

  return mutation.type.replaceAll('_', ' ');
}

function getMutationCardSummary(mutation: ICkgMutationDto): string {
  const workflowState = mutation.state ?? mutation.status;
  return `${mutation.type.replaceAll('_', ' ')} · ${workflowState.replaceAll('_', ' ')}`;
}

function formatRelationReviewState(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') {
    return 'not classified';
  }

  return value.replaceAll('_', ' ');
}

function formatEndpointStatusLabel(status: string | null | undefined): string {
  if (status === null || status === undefined || status.trim() === '') {
    return 'unknown';
  }

  return status.replaceAll('_', ' ');
}

function summarizeResolvedEndpoint(
  endpoint:
    | {
        externalId: string;
        status: string;
        canonicalLabel: string | null;
        canonicalNodeType: string | null;
        domain: string | null;
        strategy: string | null;
      }
    | null
    | undefined
): string {
  if (endpoint === null || endpoint === undefined) {
    return 'No endpoint resolution data recorded.';
  }

  if (endpoint.status !== 'resolved') {
    return `${endpoint.externalId} · ${formatEndpointStatusLabel(endpoint.status)}`;
  }

  const descriptorParts = [
    endpoint.canonicalLabel,
    endpoint.canonicalNodeType,
    endpoint.domain,
    endpoint.strategy !== null ? `via ${endpoint.strategy}` : null,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  return descriptorParts.join(' · ');
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (startedAt === null) {
    return 'Not started';
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt ?? Date.now()).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${String(seconds)}s`;
  }

  return `${String(minutes)}m ${String(seconds)}s`;
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}): React.JSX.Element {
  const [pageInput, setPageInput] = useState<string>(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  function commitPageInput(): void {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(currentPage));
      return;
    }

    onPageChange(Math.min(totalPages, Math.max(1, parsed)));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded-md border border-border bg-background/40 px-3 py-1 transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage === 1}
        onClick={() => {
          onPageChange(1);
        }}
      >
        First
      </button>
      <button
        type="button"
        className="rounded-md border border-border bg-background/40 px-3 py-1 transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage === 1}
        onClick={() => {
          onPageChange(Math.max(1, currentPage - 1));
        }}
      >
        Previous
      </button>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Jump to</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          value={pageInput}
          onChange={(event) => {
            setPageInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }

            commitPageInput();
          }}
        />
        <span>of {String(totalPages)}</span>
      </label>
      <button
        type="button"
        className="rounded-md border border-border bg-background/40 px-3 py-1 transition hover:bg-background/70"
        onClick={commitPageInput}
      >
        Go
      </button>
      <button
        type="button"
        className="rounded-md border border-border bg-background/40 px-3 py-1 transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage === totalPages}
        onClick={() => {
          onPageChange(Math.min(totalPages, currentPage + 1));
        }}
      >
        Next
      </button>
      <button
        type="button"
        className="rounded-md border border-border bg-background/40 px-3 py-1 transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage === totalPages}
        onClick={() => {
          onPageChange(totalPages);
        }}
      >
        Last
      </button>
    </div>
  );
}

function CollapsibleSection({
  title,
  description,
  badge,
  isCollapsed,
  onToggle,
  children,
}: {
  title: string;
  description?: string | undefined;
  badge?: string | undefined;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.JSX.Element;
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-muted/20">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition hover:bg-background/20"
        onClick={onToggle}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{title}</p>
            {badge !== undefined && badge !== '' && (
              <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-xs text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          {description !== undefined ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <span className="mt-0.5 text-muted-foreground">
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {!isCollapsed ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </div>
  );
}

export function OntologyImportRunStatusPanel({
  detail,
  canSubmitCandidates = false,
  isSubmittingCandidates = false,
  onSubmitCandidates,
}: {
  detail: IOntologyImportRunDetailDto;
  canSubmitCandidates?: boolean;
  isSubmittingCandidates?: boolean;
  onSubmitCandidates?: (candidateIds: string[]) => void;
}): React.JSX.Element {
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    detail.checkpoints[0]?.id ?? ''
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(
    detail.artifacts[0]?.id ?? ''
  );
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all');
  const [candidatePage, setCandidatePage] = useState(1);
  const [submittedMutationsPage, setSubmittedMutationsPage] = useState(1);
  const [selectedReadyCandidateIds, setSelectedReadyCandidateIds] = useState<Set<string>>(
    new Set()
  );
  const [collapsedSections, setCollapsedSections] =
    useState<Record<SectionKey, boolean>>(INITIAL_SECTION_STATE);
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
  const { data: importRunMutations = [] } = useCKGMutations(
    { importRunId: detail.run.id },
    {
      enabled: detail.run.submittedMutationIds.length > 0,
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
  const readyCandidateIds = useMemo(
    () =>
      new Set(
        (detail.mutationPreview?.candidates ?? [])
          .filter((candidate) => candidate.status === 'ready' && candidate.proposal !== null)
          .map((candidate) => candidate.candidateId)
      ),
    [detail.mutationPreview?.candidates]
  );
  const selectedReadyCount = useMemo(
    () =>
      [...selectedReadyCandidateIds].filter((candidateId) => readyCandidateIds.has(candidateId))
        .length,
    [readyCandidateIds, selectedReadyCandidateIds]
  );
  const totalCandidatePages = Math.max(
    1,
    Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)
  );
  const visibleCandidates = useMemo(() => {
    const pageStart = (candidatePage - 1) * CANDIDATES_PER_PAGE;
    return filteredCandidates.slice(pageStart, pageStart + CANDIDATES_PER_PAGE);
  }, [candidatePage, filteredCandidates]);
  const submittedMutations = useMemo(() => {
    const submittedIds = new Set(detail.run.submittedMutationIds);
    return importRunMutations.filter((mutation) => submittedIds.has(String(mutation.id)));
  }, [detail.run.submittedMutationIds, importRunMutations]);
  const unresolvedSubmittedMutationCount = Math.max(
    0,
    detail.run.submittedMutationIds.length - submittedMutations.length
  );
  const totalSubmittedMutationPages = Math.max(
    1,
    Math.ceil(submittedMutations.length / SUBMITTED_MUTATIONS_PER_PAGE)
  );
  const visibleSubmittedMutations = useMemo(() => {
    const pageStart = (submittedMutationsPage - 1) * SUBMITTED_MUTATIONS_PER_PAGE;
    return submittedMutations.slice(pageStart, pageStart + SUBMITTED_MUTATIONS_PER_PAGE);
  }, [submittedMutations, submittedMutationsPage]);

  useEffect(() => {
    setCandidatePage(1);
  }, [candidateFilter, detail.run.id]);

  useEffect(() => {
    setSelectedReadyCandidateIds((current) => {
      return new Set([...current].filter((candidateId) => readyCandidateIds.has(candidateId)));
    });
  }, [readyCandidateIds]);

  useEffect(() => {
    setSubmittedMutationsPage(1);
  }, [detail.run.id, detail.run.submittedMutationIds.length]);

  useEffect(() => {
    if (candidatePage > totalCandidatePages) {
      setCandidatePage(totalCandidatePages);
    }
  }, [candidatePage, totalCandidatePages]);

  useEffect(() => {
    if (submittedMutationsPage > totalSubmittedMutationPages) {
      setSubmittedMutationsPage(totalSubmittedMutationPages);
    }
  }, [submittedMutationsPage, totalSubmittedMutationPages]);

  function toggleSection(section: SectionKey): void {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{detail.run.sourceName} import run</CardTitle>
            <CardDescription>
              This run auto-processes fetch, parse, normalization, and mutation-preview generation.
              Admin review starts after the preview is ready.
            </CardDescription>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${getOntologyImportRunTone(detail.run.status).badgeClassName}`}
          >
            {formatOntologyImportStatus(detail.run.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{summarizePipelineState(detail)}</p>
        <CollapsibleSection
          title="Run overview"
          description="Core run metadata, source configuration, and top-level counts."
          badge={detail.run.id}
          isCollapsed={collapsedSections.run_overview}
          onToggle={() => {
            toggleSection('run_overview');
          }}
        >
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
              <p>Started at: {formatDateTime(detail.run.startedAt)}</p>
              <p>
                Completed at:{' '}
                {detail.run.completedAt === null
                  ? 'Still running'
                  : formatDateTime(detail.run.completedAt)}
              </p>
              <p>Duration: {formatDuration(detail.run.startedAt, detail.run.completedAt)}</p>
              <p>Artifacts: {detail.artifacts.length}</p>
              <p>Submitted mutations: {detail.run.submittedMutationIds.length}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
                <p className="font-medium text-foreground">Parsed batch</p>
                {detail.parsedBatch === null ? (
                  <p className="mt-1 text-muted-foreground">Not available</p>
                ) : (
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    <p>📦 {String(detail.parsedBatch.recordCount)} staged records</p>
                    <p>🪪 Artifact {detail.parsedBatch.artifactId}</p>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
                <p className="font-medium text-foreground">Normalized batch</p>
                {detail.normalizedBatch === null ? (
                  <p className="mt-1 text-muted-foreground">Not available</p>
                ) : (
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    <p>🧠 {String(detail.normalizedBatch.conceptCount)} concepts</p>
                    <p>🔗 {String(detail.normalizedBatch.relationCount)} relations</p>
                    <p>🗺 {String(detail.normalizedBatch.mappingCount)} mappings</p>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
                <p className="font-medium text-foreground">Mutation preview</p>
                {detail.mutationPreview === null ? (
                  <p className="mt-1 text-muted-foreground">Not available</p>
                ) : (
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    <p>✅ {String(detail.mutationPreview.readyProposalCount)} ready</p>
                    <p>⛔ {String(detail.mutationPreview.blockedCandidateCount)} blocked</p>
                    <p>📝 {String(detail.mutationPreview.proposalCount)} total proposals</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Pipeline progress"
          description="Automation status, latest checkpoint, and quick jumps to key artifacts."
          badge={`${String(completedSteps)} / ${String(totalSteps)} complete`}
          isCollapsed={collapsedSections.pipeline_progress}
          onToggle={() => {
            toggleSection('pipeline_progress');
          }}
        >
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Automation summary</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeCheckpoint === null
                      ? 'No active checkpoint is currently running.'
                      : `Latest checkpoint: ${activeCheckpoint.step} (${activeCheckpoint.status}).`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{String(progressPercent)}% complete</p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-background/60">
                <div
                  className="h-2 rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${String(progressPercent)}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {manifestArtifact !== null && (
                <button
                  type="button"
                  className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground transition hover:bg-background/80"
                  onClick={() => {
                    setSelectedArtifactId(manifestArtifact.id);
                    setCollapsedSections((current) => ({
                      ...current,
                      artifacts: false,
                    }));
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
                    setCollapsedSections((current) => ({
                      ...current,
                      artifacts: false,
                    }));
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
                    setCollapsedSections((current) => ({
                      ...current,
                      artifacts: false,
                    }));
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
                    setCollapsedSections((current) => ({
                      ...current,
                      artifacts: false,
                      preview_candidates: false,
                    }));
                  }}
                >
                  Open mutation preview
                </button>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Structured outputs"
          description="Parsed, normalized, and mutation-preview summaries from the automated pipeline."
          isCollapsed={collapsedSections.structured_outputs}
          onToggle={() => {
            toggleSection('structured_outputs');
          }}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-background/40 p-4 text-sm">
              <p className="font-medium text-foreground">Parsed batch</p>
              {detail.parsedBatch === null ? (
                <p className="mt-2 text-muted-foreground">Not available yet.</p>
              ) : (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>📦 Records: {detail.parsedBatch.recordCount}</p>
                  <p>🪪 Artifact id: {detail.parsedBatch.artifactId}</p>
                </div>
              )}
            </div>
            <div className="rounded-md border border-border bg-background/40 p-4 text-sm">
              <p className="font-medium text-foreground">Normalized batch</p>
              {detail.normalizedBatch === null ? (
                <p className="mt-2 text-muted-foreground">Not available yet.</p>
              ) : (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>🧠 Concepts: {detail.normalizedBatch.conceptCount}</p>
                  <p>🔗 Relations: {detail.normalizedBatch.relationCount}</p>
                  <p>🗺 Mappings: {detail.normalizedBatch.mappingCount}</p>
                  <p>📚 Raw records: {detail.normalizedBatch.rawRecordCount}</p>
                  <p>🪪 Artifact id: {detail.normalizedBatch.artifactId}</p>
                </div>
              )}
            </div>
            <div className="rounded-md border border-border bg-background/40 p-4 text-sm">
              <p className="font-medium text-foreground">Mutation preview</p>
              {detail.mutationPreview === null ? (
                <p className="mt-2 text-muted-foreground">
                  Mutation-ready payloads have not been generated yet.
                </p>
              ) : (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>✅ Ready proposals: {detail.mutationPreview.readyProposalCount}</p>
                  <p>⛔ Deferred candidates: {detail.mutationPreview.blockedCandidateCount}</p>
                  <p>📝 Proposal count: {detail.mutationPreview.proposalCount}</p>
                  <p>
                    🪪 Artifact id: {detail.mutationPreview.artifactId ?? 'Pending artifact link'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Checkpoint timeline"
          description="Open to inspect per-step timestamps and recorded checkpoint detail."
          badge={detail.checkpoints.length === 0 ? 'No checkpoints yet' : undefined}
          isCollapsed={collapsedSections.checkpoints}
          onToggle={() => {
            toggleSection('checkpoints');
          }}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-2">
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
                      {formatDateTime(checkpoint.completedAt ?? checkpoint.startedAt)}
                    </p>
                  </button>
                ))
              )}
            </div>
            <div className="rounded-md border border-border bg-background/40 p-4">
              <p className="font-medium text-foreground">Checkpoint viewer</p>
              {selectedCheckpoint === null ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a checkpoint from the timeline to inspect its detail and timestamps.
                </p>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>🪜 Step: {selectedCheckpoint.step}</p>
                  <p>📍 Status: {selectedCheckpoint.status}</p>
                  <p>▶ Started at: {formatDateTime(selectedCheckpoint.startedAt)}</p>
                  <p>
                    ✅ Completed at:{' '}
                    {selectedCheckpoint.completedAt === null
                      ? 'Not completed'
                      : formatDateTime(selectedCheckpoint.completedAt)}
                  </p>
                  <div className="rounded-md border border-border bg-background/60 p-3 text-foreground">
                    <div className="space-y-3">
                      {splitDetailParagraphs(selectedCheckpoint.detail).map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Artifacts"
          description="Browse stored artifacts and inspect metadata or raw payload content."
          badge={
            detail.artifacts.length === 0
              ? 'No artifacts yet'
              : `${String(detail.artifacts.length)} items`
          }
          isCollapsed={collapsedSections.artifacts}
          onToggle={() => {
            toggleSection('artifacts');
          }}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-2">
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
            <div className="rounded-md border border-border bg-background/40 p-4">
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
                  <div className="rounded-md border border-border bg-background/60 p-4">
                    {artifactSummary(selectedArtifact, detail)}
                  </div>
                  {prettyArtifactContent !== null ? (
                    <div className="rounded-md border border-border bg-background/60 p-4">
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
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Mutation preview candidates"
          description="Review candidate readiness, conflicts, and proposal details in pages of five."
          badge={
            detail.mutationPreview === null
              ? 'No preview yet'
              : `${String(filteredCandidates.length)} matching candidates`
          }
          isCollapsed={collapsedSections.preview_candidates}
          onToggle={() => {
            toggleSection('preview_candidates');
          }}
        >
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-muted-foreground">
                Filter candidates before sending ready proposals to the CKG review queue.
              </p>
              <div className="flex flex-wrap gap-2">
                {canSubmitCandidates && readyCandidateIds.size > 0 ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedReadyCandidateIds(new Set(readyCandidateIds));
                      }}
                    >
                      Select all ready
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedReadyCandidateIds(new Set());
                      }}
                    >
                      Clear selection
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        isSubmittingCandidates ||
                        selectedReadyCount === 0 ||
                        onSubmitCandidates === undefined
                      }
                      onClick={() => {
                        onSubmitCandidates?.([...selectedReadyCandidateIds]);
                      }}
                    >
                      {isSubmittingCandidates
                        ? 'Submitting…'
                        : `Submit selected ready (${String(selectedReadyCount)})`}
                    </Button>
                  </>
                ) : null}
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
              <p className="text-muted-foreground">No mutation preview candidates yet.</p>
            ) : filteredCandidates.length === 0 ? (
              <p className="text-muted-foreground">
                No candidates match the current `{candidateFilter}` filter.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>
                    Page {String(candidatePage)} of {String(totalCandidatePages)} · Showing{' '}
                    {String(visibleCandidates.length)} of {String(filteredCandidates.length)}{' '}
                    matching candidates
                  </p>
                  <PaginationControls
                    currentPage={candidatePage}
                    totalPages={totalCandidatePages}
                    onPageChange={setCandidatePage}
                  />
                </div>
                <div
                  className={`space-y-2 ${
                    filteredCandidates.length > CANDIDATES_PER_PAGE
                      ? 'max-h-[30rem] overflow-y-auto pr-2'
                      : ''
                  }`}
                >
                  {visibleCandidates.map((candidate) => (
                    <div
                      key={candidate.candidateId}
                      className="rounded-md border border-border bg-background/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {candidate.status === 'ready' && candidate.proposal !== null ? (
                            <input
                              type="checkbox"
                              checked={selectedReadyCandidateIds.has(candidate.candidateId)}
                              onChange={(event) => {
                                setSelectedReadyCandidateIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) {
                                    next.add(candidate.candidateId);
                                  } else {
                                    next.delete(candidate.candidateId);
                                  }
                                  return next;
                                });
                              }}
                              aria-label={`Select candidate ${candidate.title}`}
                              className="h-4 w-4 rounded border-border"
                            />
                          ) : null}
                          <p className="font-medium text-foreground">{candidate.title}</p>
                        </div>
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
                      {candidate.entityKind === 'relation' ? (
                        <div className="mt-3 space-y-3 text-xs">
                          <div className="flex flex-wrap gap-2 text-muted-foreground">
                            {candidate.sourceRelationType !== undefined &&
                            candidate.sourceRelationType !== null ? (
                              <span className="rounded-full border border-border bg-background/60 px-2 py-0.5">
                                Source relation: {candidate.sourceRelationType}
                              </span>
                            ) : null}
                            <span className="rounded-full border border-border bg-background/60 px-2 py-0.5">
                              Review state:{' '}
                              {formatRelationReviewState(candidate.review.reviewState)}
                            </span>
                            {candidate.selectedEdgeType !== undefined &&
                            candidate.selectedEdgeType !== null ? (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                                Selected edge: {candidate.selectedEdgeType}
                              </span>
                            ) : null}
                          </div>

                          {candidate.candidateEdgeTypes !== undefined &&
                          candidate.candidateEdgeTypes.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Candidate edges
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {candidate.candidateEdgeTypes.map((edgeType) => (
                                  <span
                                    key={`${candidate.candidateId}-${edgeType}`}
                                    className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-muted-foreground"
                                  >
                                    {edgeType}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {candidate.endpointResolution !== undefined &&
                          candidate.endpointResolution !== null ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              <div className="rounded-md border border-border bg-background/50 p-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Subject endpoint
                                </p>
                                <p className="mt-1 text-foreground">
                                  {summarizeResolvedEndpoint(candidate.endpointResolution.subject)}
                                </p>
                                {candidate.endpointResolution.subject.blockingReasons.length > 0 ? (
                                  <p className="mt-1 text-amber-300">
                                    {candidate.endpointResolution.subject.blockingReasons.join(' ')}
                                  </p>
                                ) : null}
                              </div>
                              <div className="rounded-md border border-border bg-background/50 p-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Object endpoint
                                </p>
                                <p className="mt-1 text-foreground">
                                  {summarizeResolvedEndpoint(candidate.endpointResolution.object)}
                                </p>
                                {candidate.endpointResolution.object.blockingReasons.length > 0 ? (
                                  <p className="mt-1 text-amber-300">
                                    {candidate.endpointResolution.object.blockingReasons.join(' ')}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {candidate.inferenceReasons !== undefined &&
                          candidate.inferenceReasons.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Inference reasons
                              </p>
                              <div className="space-y-1 text-muted-foreground">
                                {candidate.inferenceReasons.map((reason) => (
                                  <p key={`${candidate.candidateId}-${reason.code}`}>
                                    {reason.message}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {candidate.blockingReasons !== undefined &&
                          candidate.blockingReasons.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Blocking reasons
                              </p>
                              <div className="space-y-1 text-amber-300">
                                {candidate.blockingReasons.map((reason) => (
                                  <p key={`${candidate.candidateId}-${reason.code}`}>
                                    {reason.message}
                                    {reason.detail !== null ? ` ${reason.detail}` : ''}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {candidate.evidenceSummary !== undefined &&
                          candidate.evidenceSummary.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Evidence summary
                              </p>
                              <div className="space-y-1 text-muted-foreground">
                                {candidate.evidenceSummary.map((entry, index) => (
                                  <p key={`${candidate.candidateId}-evidence-${String(index)}`}>
                                    {entry}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {candidate.blockedReason !== null ? (
                        <p className="mt-2 text-amber-300">{candidate.blockedReason}</p>
                      ) : null}
                      {candidate.proposal !== null ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-muted-foreground">
                            Operations: {candidate.proposal.operations.length} · Priority:{' '}
                            {candidate.proposal.priority}
                          </p>
                          {candidate.status === 'ready' &&
                          canSubmitCandidates &&
                          onSubmitCandidates !== undefined ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSubmittingCandidates}
                              onClick={() => {
                                onSubmitCandidates([candidate.candidateId]);
                              }}
                            >
                              Submit this candidate
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Submitted review queue mutations"
          description="Submitted mutations from this import run, shown as review cards instead of bare ids."
          badge={
            submittedMutations.length > 0
              ? `${String(submittedMutations.length)} loaded`
              : detail.run.submittedMutationIds.length === 0
                ? 'None submitted'
                : `${String(detail.run.submittedMutationIds.length)} recorded`
          }
          isCollapsed={collapsedSections.submitted_mutations}
          onToggle={() => {
            toggleSection('submitted_mutations');
          }}
        >
          <div className="text-sm">
            {detail.run.submittedMutationIds.length === 0 ? (
              <p className="text-muted-foreground">
                No mutation ids have been persisted on this run yet.
              </p>
            ) : submittedMutations.length === 0 ? (
              <p className="text-muted-foreground">
                Submitted mutation ids exist on this run, but the detailed mutation cards have not
                loaded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {unresolvedSubmittedMutationCount > 0 ? (
                  <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    This run records {String(detail.run.submittedMutationIds.length)} submitted
                    mutation ids, but only {String(submittedMutations.length)} currently resolve in
                    the review queue. {String(unresolvedSubmittedMutationCount)} ids are still
                    missing from the loaded queue results.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>
                    Page {String(submittedMutationsPage)} of {String(totalSubmittedMutationPages)} ·
                    Showing {String(visibleSubmittedMutations.length)} of{' '}
                    {String(submittedMutations.length)} submitted mutations
                  </p>
                  <PaginationControls
                    currentPage={submittedMutationsPage}
                    totalPages={totalSubmittedMutationPages}
                    onPageChange={setSubmittedMutationsPage}
                  />
                </div>
                <div
                  className={`space-y-2 ${
                    submittedMutations.length > SUBMITTED_MUTATIONS_PER_PAGE
                      ? 'max-h-[30rem] overflow-y-auto pr-2'
                      : ''
                  }`}
                >
                  {visibleSubmittedMutations.map((mutation) => (
                    <div
                      key={String(mutation.id)}
                      className="rounded-md border border-border bg-background/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            {getCandidateTitleFromMutation(mutation)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {getMutationCardSummary(mutation)}
                          </p>
                        </div>
                        <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-xs text-muted-foreground">
                          {mutation.state ?? mutation.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <p>🪪 Mutation id: {String(mutation.id)}</p>
                        <p>🕒 Proposed at: {formatDateTime(mutation.proposedAt)}</p>
                        <p>👤 Proposed by: {String(mutation.proposedBy)}</p>
                        <p>
                          🔁 Source candidate:{' '}
                          {mutation.ontologyImportContext?.candidateId ?? 'Not recorded'}
                        </p>
                      </div>
                      {mutation.rationale !== undefined && mutation.rationale !== '' && (
                        <div className="mt-3 rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
                          <div className="space-y-2">
                            {splitDetailParagraphs(mutation.rationale).map((paragraph) => (
                              <p key={paragraph}>{paragraph}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/ckg/mutations/${String(mutation.id)}`}>
                            Open mutation
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}
