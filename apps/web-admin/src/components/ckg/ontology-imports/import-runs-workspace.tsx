'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useOntologyImportRuns,
  useOntologyImportsSystemStatus,
  useOntologyImportSources,
  type IOntologyImportRunDto,
  type OntologyImportStatus,
} from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricTile,
} from '@noema/ui';
import { AlertCircle, DatabaseBackup, GitBranchPlus, Layers3, RefreshCw } from 'lucide-react';
import { OntologyImportCreateRunCard } from '@/components/ckg/ontology-imports/create-run-card';
import {
  ontologyImportRunsPlaceholder,
  ontologyImportSourcesPlaceholder,
} from '@/components/ckg/ontology-imports/placeholder-data';
import {
  describeOntologyImportSourceVersion,
  formatOntologyImportStatus,
  getOntologyImportRunTone,
  isOntologyImportRunActive,
} from '@/components/ckg/ontology-imports/run-state';

function formatDateTime(value: string | null): string {
  if (value === null) {
    return 'Not started';
  }

  return new Date(value).toLocaleString();
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (startedAt === null) {
    return 'Not started';
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt ?? Date.now()).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours)}h ${String(minutes)}m`;
  }

  if (minutes > 0) {
    return `${String(minutes)}m ${String(seconds)}s`;
  }

  return `${String(seconds)}s`;
}

function describeNextAction(run: IOntologyImportRunDto): string {
  switch (run.status) {
    case 'queued':
      return 'Start run';
    case 'fetching':
    case 'fetched':
    case 'parsing':
    case 'parsed':
      return 'Monitor pipeline';
    case 'ready_for_review':
      return 'Submit to review queue';
    case 'review_submitted':
      return 'Review submitted mutations';
    case 'failed':
      return 'Retry run';
    case 'cancelled':
      return 'Restart or hide';
    default:
      return 'Inspect run';
  }
}

export function OntologyImportRunsWorkspace(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>(searchParams.get('sourceId') ?? 'all');
  const [versionFilter, setVersionFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('');
  const [hiddenRunIds, setHiddenRunIds] = useState<string[]>([]);

  const {
    data: systemStatus,
    isLoading: healthLoading,
    refetch: refetchStatus,
  } = useOntologyImportsSystemStatus({
    retry: false,
  });
  const canReadRegistry = systemStatus?.canReadRegistry === true;
  const {
    data: liveSources = [],
    isLoading: sourcesLoading,
    refetch: refetchSources,
  } = useOntologyImportSources({
    enabled: canReadRegistry,
    retry: false,
  });
  const {
    data: liveRuns = [],
    isLoading: runsLoading,
    isFetching: runsFetching,
    refetch: refetchRuns,
  } = useOntologyImportRuns(undefined, {
    enabled: canReadRegistry,
    refetchInterval: (query) => {
      const response = query.state.data;
      if (response === undefined) {
        return false;
      }

      return response.data.some((run: IOntologyImportRunDto) =>
        isOntologyImportRunActive(run.status)
      )
        ? 10000
        : false;
    },
    refetchIntervalInBackground: true,
    retry: false,
  });

  const usingDemoData = systemStatus !== undefined && !canReadRegistry;
  const sources = canReadRegistry
    ? liveSources
    : usingDemoData
      ? ontologyImportSourcesPlaceholder
      : [];
  const runs = canReadRegistry ? liveRuns : usingDemoData ? ontologyImportRunsPlaceholder : [];
  const visibleRuns = useMemo(
    () =>
      runs.filter((run) => {
        if (hiddenRunIds.includes(run.id)) {
          return false;
        }
        if (sourceFilter !== 'all' && run.sourceId !== sourceFilter) {
          return false;
        }
        if (statusFilter !== 'all' && run.status !== statusFilter) {
          return false;
        }
        if (
          versionFilter.trim() !== '' &&
          !(run.sourceVersion ?? '').toLowerCase().includes(versionFilter.trim().toLowerCase())
        ) {
          return false;
        }
        if (
          modeFilter.trim() !== '' &&
          !(run.configuration.mode ?? '').toLowerCase().includes(modeFilter.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [hiddenRunIds, modeFilter, runs, sourceFilter, statusFilter, versionFilter]
  );

  async function refresh(): Promise<void> {
    await refetchStatus();
    if (canReadRegistry) {
      await Promise.all([refetchSources(), refetchRuns()]);
    }
  }
  const readyForReview = runs.filter((run) => run.status === 'ready_for_review').length;
  const activeRunCount = runs.filter((run) => isOntologyImportRunActive(run.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ontology Imports</h1>
          <p className="mt-1 text-muted-foreground">
            Import-run registry with source filters, bulk operations, and explicit live versus
            degraded-mode status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/imports/sources">Source registry</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/mutations">Mutation queue</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void refresh();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {systemStatus?.status !== 'healthy' && (
        <Alert variant={systemStatus?.status === 'unavailable' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {systemStatus?.issues[0] ??
              'Ontology imports are running in degraded mode, so the admin app is showing demo-only data.'}
          </AlertDescription>
        </Alert>
      )}

      {canReadRegistry && activeRunCount > 0 && (
        <Alert>
          <RefreshCw className={`h-4 w-4 ${runsFetching ? 'animate-spin' : ''}`} />
          <AlertDescription>
            Live run monitoring is on for {String(activeRunCount)} active import
            {activeRunCount === 1 ? '' : 's'}. The registry refreshes every 10 seconds while jobs
            are in flight.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Visible sources"
          value={sources.length}
          icon={<Layers3 className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Visible runs"
          value={visibleRuns.length}
          icon={<DatabaseBackup className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Ready for review"
          value={readyForReview}
          icon={<GitBranchPlus className="h-4 w-4" />}
          colorFamily={readyForReview > 0 ? 'axon' : 'cortex'}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Import runs</CardTitle>
              <CardDescription>
                {usingDemoData
                  ? 'Demo-only registry shown while the backend reports degraded ontology-import capabilities.'
                  : healthLoading || sourcesLoading || runsLoading
                    ? 'Loading live import runs...'
                    : 'Live import-run registry from the knowledge graph service.'}
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              {String(visibleRuns.length)} visible
              {hiddenRunIds.length > 0 ? ` · ${String(hiddenRunIds.length)} hidden` : ''}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 rounded-md border border-border bg-background/30 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="space-y-1 text-xs">
              <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Source
              </span>
              <select
                id="ontology-import-filter-source"
                name="sourceFilter"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={sourceFilter}
                disabled={sources.length === 0}
                onChange={(event) => {
                  setSourceFilter(event.target.value);
                }}
              >
                <option value="all">All sources</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </span>
              <select
                id="ontology-import-filter-status"
                name="statusFilter"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                }}
              >
                <option value="all">All statuses</option>
                {[
                  'queued',
                  'fetching',
                  'fetched',
                  'parsing',
                  'parsed',
                  'ready_for_review',
                  'review_submitted',
                  'failed',
                  'cancelled',
                ].map((status) => (
                  <option key={status} value={status}>
                    {formatOntologyImportStatus(status as OntologyImportStatus)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Version
              </span>
              <input
                id="ontology-import-filter-version"
                name="versionFilter"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Search release or checksum tag"
                value={versionFilter}
                disabled={runs.length === 0}
                onChange={(event) => {
                  setVersionFilter(event.target.value);
                }}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Mode
              </span>
              <input
                id="ontology-import-filter-mode"
                name="modeFilter"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="snapshot, skills, targeted..."
                value={modeFilter}
                disabled={runs.length === 0}
                onChange={(event) => {
                  setModeFilter(event.target.value);
                }}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                disabled={
                  sourceFilter === 'all' &&
                  statusFilter === 'all' &&
                  versionFilter === '' &&
                  modeFilter === '' &&
                  hiddenRunIds.length === 0
                }
                onClick={() => {
                  setSourceFilter('all');
                  setStatusFilter('all');
                  setVersionFilter('');
                  setModeFilter('');
                  setHiddenRunIds([]);
                }}
              >
                Reset
              </Button>
            </div>
          </div>

          {visibleRuns.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No import runs match the current filters.
            </div>
          ) : (
            visibleRuns.map((run) => (
              <div
                key={run.id}
                className={`flex flex-wrap items-start justify-between gap-4 rounded-md border p-4 ${getOntologyImportRunTone(run.status).cardClassName}`}
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{run.sourceName}</p>
                      <p className="break-all text-sm text-muted-foreground">{run.id}</p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] ${getOntologyImportRunTone(run.status).badgeClassName}`}
                    >
                      {formatOntologyImportStatus(run.status)}
                    </span>
                  </div>
                  <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Status
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {formatOntologyImportStatus(run.status)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Source version
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {describeOntologyImportSourceVersion(run)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Next action
                      </p>
                      <p className="mt-1 text-sm text-foreground">{describeNextAction(run)}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Started
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {formatDateTime(run.startedAt)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Finished
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {run.completedAt === null
                          ? 'Still running'
                          : formatDateTime(run.completedAt)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/40 p-3">
                      <p className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Duration
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {formatDuration(run.startedAt, run.completedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                    <p>Mode: {run.configuration.mode ?? 'default'}</p>
                    <p>Language: {run.configuration.language ?? 'default'}</p>
                    <p>Submitted mutations: {run.submittedMutationIds.length}</p>
                    <p>Created: {formatDateTime(run.createdAt)}</p>
                  </div>
                  {isOntologyImportRunActive(run.status) && (
                    <p className="text-xs text-emerald-300">
                      Live monitor: this run is still progressing through the pipeline.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setHiddenRunIds((current) =>
                        current.includes(run.id) ? current : [...current, run.id]
                      );
                    }}
                  >
                    Hide
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/ckg/imports/runs/${run.id}`}>Inspect run</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <OntologyImportCreateRunCard
        sources={sources}
        {...(sourceFilter !== 'all' ? { initialSourceId: sourceFilter } : {})}
        disabled={usingDemoData || systemStatus?.canManageRuns === false}
        {...(usingDemoData
          ? {
              disabledReason:
                'Run creation is disabled while ontology imports are in degraded demo mode.',
            }
          : {})}
      />
    </div>
  );
}
