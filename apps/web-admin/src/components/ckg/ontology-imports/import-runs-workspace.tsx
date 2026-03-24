'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useCancelOntologyImportRun,
  useOntologyImportRun,
  useOntologyImportRuns,
  useOntologyImportsSystemStatus,
  useOntologyImportSources,
  useRetryOntologyImportRun,
  useStartOntologyImportRun,
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
import {
  AlertCircle,
  CheckCircle2,
  DatabaseBackup,
  GitBranchPlus,
  Layers3,
  RefreshCw,
} from 'lucide-react';
import { OntologyImportCreateRunCard } from '@/components/ckg/ontology-imports/create-run-card';
import {
  ontologyImportRunsPlaceholder,
  ontologyImportSourcesPlaceholder,
} from '@/components/ckg/ontology-imports/placeholder-data';

type MessageState = { type: 'success'; text: string } | { type: 'error'; text: string } | null;

type BulkAction = 'start' | 'cancel' | 'retry';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'fetching', 'fetched', 'parsing', 'parsed']);

function isBulkActionEligible(action: BulkAction, run: IOntologyImportRunDto): boolean {
  switch (action) {
    case 'start':
      return run.status === 'queued' || run.status === 'failed';
    case 'cancel':
      return run.status === 'queued' || run.status === 'fetching';
    case 'retry':
      return run.status === 'failed' || run.status === 'cancelled';
  }
}

function formatStatus(status: OntologyImportStatus): string {
  return status.replaceAll('_', ' ');
}

export function OntologyImportRunsWorkspace(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>(searchParams.get('sourceId') ?? 'all');
  const [versionFilter, setVersionFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('');
  const [message, setMessage] = useState<MessageState>(null);

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

      return response.data.some((run: IOntologyImportRunDto) => ACTIVE_RUN_STATUSES.has(run.status))
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
    [modeFilter, runs, sourceFilter, statusFilter, versionFilter]
  );
  const comparedRunIds = selectedRunIds.slice(0, 2);
  const { data: comparedRunLeft } = useOntologyImportRun(comparedRunIds[0] ?? '', {
    enabled: canReadRegistry && comparedRunIds[0] !== undefined,
    retry: false,
  });
  const { data: comparedRunRight } = useOntologyImportRun(comparedRunIds[1] ?? '', {
    enabled: canReadRegistry && comparedRunIds[1] !== undefined,
    retry: false,
  });

  const startRun = useStartOntologyImportRun();
  const cancelRun = useCancelOntologyImportRun();
  const retryRun = useRetryOntologyImportRun();

  async function refresh(): Promise<void> {
    await refetchStatus();
    if (canReadRegistry) {
      await Promise.all([refetchSources(), refetchRuns()]);
    }
  }

  async function runBulkAction(action: BulkAction): Promise<void> {
    const selectedRuns = visibleRuns.filter((run) => selectedRunIds.includes(run.id));
    const actionableRuns = selectedRuns.filter((run) => isBulkActionEligible(action, run));
    if (actionableRuns.length === 0) {
      setMessage({
        type: 'error',
        text: `No selected runs can be ${action}ed from their current status.`,
      });
      return;
    }

    try {
      await Promise.all(
        actionableRuns.map((run) => {
          switch (action) {
            case 'start':
              return startRun.mutateAsync(run.id);
            case 'cancel':
              return cancelRun.mutateAsync({
                runId: run.id,
                reason: 'Bulk-cancelled from admin imports workspace',
              });
            case 'retry':
              return retryRun.mutateAsync(run.id);
          }
        })
      );
      setMessage({
        type: 'success',
        text: `${String(actionableRuns.length)} run${actionableRuns.length === 1 ? '' : 's'} ${action}ed successfully.`,
      });
      setSelectedRunIds([]);
      await refresh();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : `Bulk ${action} failed.`,
      });
    }
  }

  const pendingBulkAction =
    startRun.isPending || cancelRun.isPending || retryRun.isPending || healthLoading;
  const readyForNormalization = runs.filter(
    (run) => run.status === 'ready_for_normalization'
  ).length;
  const activeRunCount = runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length;

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

      {message !== null && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
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
          value={readyForNormalization}
          icon={<GitBranchPlus className="h-4 w-4" />}
          colorFamily={readyForNormalization > 0 ? 'axon' : 'cortex'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run filters</CardTitle>
          <CardDescription>
            Narrow the import registry by source, status, version, or source mode before taking bulk
            actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Source</span>
            <select
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
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Status</span>
            <select
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
                'ready_for_normalization',
                'staging_validated',
                'failed',
                'cancelled',
              ].map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status as OntologyImportStatus)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Source version</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Search release or checksum tag"
              value={versionFilter}
              disabled={runs.length === 0}
              onChange={(event) => {
                setVersionFilter(event.target.value);
              }}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Mode</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="snapshot, skills, targeted..."
              value={modeFilter}
              disabled={runs.length === 0}
              onChange={(event) => {
                setModeFilter(event.target.value);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {selectedRunIds.length === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Run comparison</CardTitle>
            <CardDescription>Side-by-side comparison for the two selected runs.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[comparedRunLeft, comparedRunRight].map((detail, index) => {
              const run =
                detail?.run ?? visibleRuns.find((entry) => entry.id === comparedRunIds[index]);
              return (
                <div
                  key={comparedRunIds[index]}
                  className="rounded-md border border-border bg-muted/20 p-4 text-sm"
                >
                  <p className="font-medium text-foreground">
                    {run?.sourceName ?? comparedRunIds[index]}
                  </p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <p>Run id: {run?.id ?? comparedRunIds[index]}</p>
                    <p>Status: {run?.status ?? 'unknown'}</p>
                    <p>Version: {run?.sourceVersion ?? 'pending'}</p>
                    <p>Mode: {run?.configuration.mode ?? 'default'}</p>
                    <p>
                      Parsed records:{' '}
                      {detail?.parsedBatch !== null && detail?.parsedBatch !== undefined
                        ? String(detail.parsedBatch.recordCount)
                        : 'n/a'}
                    </p>
                    <p>
                      Concepts:{' '}
                      {detail?.normalizedBatch !== null && detail?.normalizedBatch !== undefined
                        ? String(detail.normalizedBatch.conceptCount)
                        : 'n/a'}
                    </p>
                    <p>
                      Ready proposals:{' '}
                      {detail?.mutationPreview !== null && detail?.mutationPreview !== undefined
                        ? String(detail.mutationPreview.readyProposalCount)
                        : 'n/a'}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Bulk actions</CardTitle>
              <CardDescription>
                Select visible runs, then start, cancel, or retry the subset whose current status
                allows that action.
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedRunIds.length} selected of {visibleRuns.length} visible
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={usingDemoData || pendingBulkAction}
            onClick={() => {
              void runBulkAction('start');
            }}
          >
            Bulk start
          </Button>
          <Button
            variant="outline"
            disabled={usingDemoData || pendingBulkAction}
            onClick={() => {
              void runBulkAction('cancel');
            }}
          >
            Bulk cancel
          </Button>
          <Button
            variant="outline"
            disabled={usingDemoData || pendingBulkAction}
            onClick={() => {
              void runBulkAction('retry');
            }}
          >
            Bulk retry
          </Button>
          <Button
            variant="ghost"
            disabled={visibleRuns.length === 0}
            onClick={() => {
              setSelectedRunIds(
                selectedRunIds.length === visibleRuns.length ? [] : visibleRuns.map((run) => run.id)
              );
            }}
          >
            {visibleRuns.length > 0 && selectedRunIds.length === visibleRuns.length
              ? 'Clear selection'
              : 'Select visible'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import runs</CardTitle>
          <CardDescription>
            {usingDemoData
              ? 'Demo-only registry shown while the backend reports degraded ontology-import capabilities.'
              : healthLoading || sourcesLoading || runsLoading
                ? 'Loading live import runs...'
                : 'Live import-run registry from the knowledge graph service.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleRuns.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No import runs match the current filters.
            </div>
          ) : (
            visibleRuns.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-4"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border border-input bg-background"
                    checked={selectedRunIds.includes(run.id)}
                    onChange={() => {
                      setSelectedRunIds((current) =>
                        current.includes(run.id)
                          ? current.filter((entry) => entry !== run.id)
                          : [...current, run.id]
                      );
                    }}
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{run.sourceName}</p>
                    <p className="text-sm text-muted-foreground">
                      {run.id} · {formatStatus(run.status)} ·{' '}
                      {run.sourceVersion ?? 'release pending'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mode: {run.configuration.mode ?? 'default'} · Language:{' '}
                      {run.configuration.language ?? 'default'} · Submitted mutations:{' '}
                      {run.submittedMutationIds.length}
                    </p>
                    {ACTIVE_RUN_STATUSES.has(run.status) && (
                      <p className="text-xs text-emerald-300">
                        Live monitor: this run is still progressing through the pipeline.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
