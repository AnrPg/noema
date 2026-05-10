'use client';

import Link from 'next/link';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useApplyRevisionProposal,
  useCurriculum,
  useCurriculumFrontier,
  useCurriculumProgress,
  useDecideRevisionChange,
  useRevisionProposals,
  useSetNodeFreeze,
} from '@noema/api-client';
import type { ICurriculum, ICurriculumRevisionProposal } from '@noema/api-client';
import type { CurriculumId } from '@noema/types';
import { useAuth } from '@noema/auth';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@noema/ui';
import { AgentActionButton, ProposalJobStatusCard, useContextualAgent } from '@/features/agents';
import { CurriculumDag } from '@/features/curricula/curriculum-dag';
import {
  canApplyRevisionProposal,
  extractImportedRevisionResult,
  formatCurriculumLabel,
  revisionProposalStats,
} from '@/features/curricula/helpers';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

type CurriculumNode = NonNullable<ICurriculum['activeVersion']>['nodes'][number];
type CurriculumEdge = NonNullable<ICurriculum['activeVersion']>['edges'][number];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function readProposalId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return readProposalId(record['proposalId'] ?? record['response'] ?? record['result']);
}

function ChangeStateBadge({ state }: { state: string }): React.JSX.Element {
  const tone =
    state === 'approved' || state === 'applied'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : state === 'rejected'
        ? 'border-destructive/40 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/40 text-muted-foreground';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
        tone,
      ].join(' ')}
    >
      {formatCurriculumLabel(state)}
    </span>
  );
}

function NodeCard(props: {
  curriculumId: CurriculumId;
  frozen: boolean;
  node: CurriculumNode;
  progressLabel: string;
}): React.JSX.Element {
  const freezeNode = useSetNodeFreeze(props.curriculumId, true);
  const unfreezeNode = useSetNodeFreeze(props.curriculumId, false);
  const isPending = freezeNode.isPending || unfreezeNode.isPending;

  async function handleToggleFreeze(): Promise<void> {
    const payload = { stableNodeKey: props.node.stableNodeKey };
    if (props.frozen) {
      await unfreezeNode.mutateAsync(payload);
      return;
    }
    await freezeNode.mutateAsync(payload);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{props.node.label}</h3>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {props.progressLabel}
            </span>
            {props.frozen && (
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                Frozen
              </span>
            )}
          </div>
          {props.node.learningObjective !== undefined && props.node.learningObjective !== '' && (
            <p className="text-sm text-muted-foreground">{props.node.learningObjective}</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">
              Stability target {Math.round(props.node.stabilityThreshold * 100)}%
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">
              Est. {String(props.node.estimatedSessions)} sessions
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">
              Weight {String(props.node.traversalWeight)}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">{props.node.stableNodeKey}</span>
          </div>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            void handleToggleFreeze();
          }}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.frozen ? 'Unfreeze node' : 'Freeze node'}
        </button>
      </div>
    </div>
  );
}

function RevisionProposalCard(props: {
  curriculumId: CurriculumId;
  proposal: ICurriculumRevisionProposal;
}): React.JSX.Element {
  const decide = useDecideRevisionChange(props.curriculumId, props.proposal.id);
  const apply = useApplyRevisionProposal(props.curriculumId, props.proposal.id);
  const stats = revisionProposalStats(props.proposal);
  const canApply = canApplyRevisionProposal(props.proposal);
  const actionError = decide.error ?? apply.error;

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {formatCurriculumLabel(props.proposal.reason)}
            </p>
            {props.proposal.appliedVersionId !== undefined && <ChangeStateBadge state="applied" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Proposed {formatDate(props.proposal.createdAt)} · Expires{' '}
            {formatDate(props.proposal.expiresAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">{String(stats.total)} changes</span>
          <span className="rounded-full bg-muted px-2.5 py-1">{String(stats.pending)} pending</span>
          <span className="rounded-full bg-muted px-2.5 py-1">
            {String(stats.approved)} approved
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{props.proposal.rationale}</p>

      <div className="mt-4 space-y-3">
        {props.proposal.changes.map((change) => (
          <div
            key={change.id}
            className="rounded-lg border border-border/70 bg-card px-3 py-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    {formatCurriculumLabel(change.kind)}
                  </p>
                  <ChangeStateBadge state={change.state} />
                </div>
                {change.rationale !== undefined && change.rationale !== '' && (
                  <p className="mt-1 text-muted-foreground">{change.rationale}</p>
                )}
              </div>
              {props.proposal.appliedVersionId === undefined && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={change.state === 'approved' ? 'default' : 'outline'}
                    disabled={decide.isPending || apply.isPending}
                    onClick={() => {
                      void decide.mutateAsync({ changeId: change.id, state: 'approved' });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={change.state === 'rejected' ? 'default' : 'outline'}
                    disabled={decide.isPending || apply.isPending}
                    onClick={() => {
                      void decide.mutateAsync({ changeId: change.id, state: 'rejected' });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
            {Object.keys(change.payload).length > 0 && (
              <pre className="mt-3 overflow-auto rounded-md border border-border/70 bg-background/80 p-2 text-xs text-muted-foreground">
                {JSON.stringify(change.payload, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {actionError !== null && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formatApiErrorMessage(actionError, {
            action: 'update the revision proposal',
            fallback: 'The revision proposal could not be updated.',
          })}
        </p>
      )}

      {props.proposal.appliedVersionId === undefined && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={!canApply || decide.isPending || apply.isPending}
            onClick={() => {
              void apply.mutateAsync({});
            }}
          >
            {(decide.isPending || apply.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {stats.pending > 0 ? 'Apply approved changes' : 'Apply proposal'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CurriculumDetailPage({
  params,
}: {
  params: { id: string };
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const activeStudyMode = useActiveStudyMode();
  const queryClient = useQueryClient();
  const curriculumId = params.id as CurriculumId;
  const curriculum = useCurriculum(curriculumId);
  const frontier = useCurriculumFrontier(curriculumId);
  const progress = useCurriculumProgress(curriculumId);
  const proposals = useRevisionProposals(curriculumId);
  const handledRevisionRunIdRef = React.useRef<string | null>(null);
  const [revisionMessage, setRevisionMessage] = React.useState<string | null>(null);

  const data = curriculum.data?.data;
  const nodes: CurriculumNode[] = data?.activeVersion?.nodes ?? [];
  const edges: CurriculumEdge[] = data?.activeVersion?.edges ?? [];
  const frozenNodeKeys = new Set(data?.metadata.frozenStableNodeKeys ?? []);
  const frontierNodes: CurriculumNode[] = (frontier.data?.data ?? []) as CurriculumNode[];
  const frontierKeys = new Set(frontierNodes.map((node) => node.stableNodeKey));
  const progressByKey = new Map(
    (progress.data?.data ?? []).map((entry) => [entry.stableNodeKey, entry.runtimeState])
  );
  const conceptIds = nodes
    .map((node) => node.ckgConceptId ?? node.stableNodeKey)
    .filter((value): value is string => typeof value === 'string' && value !== '');
  const firstTargetNode = frontierNodes[0] ?? nodes[0];
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  const revisionAgent = useContextualAgent({
    agentName: 'curriculum-revision-agent',
    context: {
      userId: user?.id ?? '',
      curriculumId,
      conceptIds,
      studyMode: activeStudyMode,
      payload: {
        surface: 'curriculum-detail',
        title: data?.title ?? null,
        frontierNodeCount: frontierNodes.length,
        curriculumVersionId: data?.activeVersion?.id ?? null,
        currentNodes: nodes,
        currentEdges: data?.activeVersion?.edges ?? [],
        progress: Object.fromEntries(progressByKey),
        revisionReason: 'user_edit',
        evidence:
          firstTargetNode === undefined
            ? {}
            : {
                stableNodeKey: firstTargetNode.stableNodeKey,
                triggerType: 'user_edit',
              },
      },
    },
    executionPreference: 'batch',
  });

  React.useEffect(() => {
    const latestRun = revisionAgent.latestRun;
    if (latestRun === undefined) return;
    const importedRevision = extractImportedRevisionResult(latestRun);
    const proposalId = readProposalId(latestRun.execution) ?? importedRevision?.proposalId ?? null;
    const importStatus = importedRevision?.status ?? null;
    if (handledRevisionRunIdRef.current === latestRun.runId) return;
    if (proposalId === null && importStatus === null) return;

    handledRevisionRunIdRef.current = latestRun.runId;
    if (proposalId !== null) {
      setRevisionMessage('Revision draft imported. Refreshing proposal inbox…');
      void queryClient.invalidateQueries({ queryKey: ['curriculum', 'detail', curriculumId] });
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', 'detail', curriculumId, 'revision-proposals'],
      });
      return;
    }

    if (importStatus === 'ignored_no_changes') {
      setRevisionMessage(
        'Revision run finished, but it did not find a concrete structural change worth proposing.'
      );
    }
  }, [curriculumId, queryClient, revisionAgent.latestRun]);

  React.useEffect(() => {
    if (revisionAgent.proposalJobPhase === 'cancelled') {
      setRevisionMessage('Revision request cancelled before provider submission.');
    }
  }, [revisionAgent.proposalJobPhase]);

  React.useEffect(() => {
    if (nodes.length === 0) {
      setSelectedNodeId(null);
      return;
    }

    const requestedNodeId = searchParams.get('nodeId');
    if (
      requestedNodeId !== null &&
      requestedNodeId !== '' &&
      nodes.some((node) => String(node.id) === requestedNodeId)
    ) {
      setSelectedNodeId(requestedNodeId);
      return;
    }

    const preferredNode = frontierNodes[0] ?? nodes[0];
    if (preferredNode === undefined) {
      setSelectedNodeId(null);
      return;
    }

    const preferredNodeId = String(preferredNode.id);
    const stillPresent =
      selectedNodeId !== null && nodes.some((node) => String(node.id) === selectedNodeId);
    if (!stillPresent) {
      setSelectedNodeId(preferredNodeId);
    }
  }, [frontierNodes, nodes, searchParams, selectedNodeId]);

  function progressLabelForNode(node: CurriculumNode): string {
    if (frontierKeys.has(node.stableNodeKey)) return 'Frontier';
    const runtimeState = progressByKey.get(node.stableNodeKey);
    return runtimeState !== undefined ? formatCurriculumLabel(runtimeState) : 'Not started';
  }

  const selectedNode =
    selectedNodeId === null ? undefined : nodes.find((node) => String(node.id) === selectedNodeId);
  const selectedSessionNodeId =
    selectedNode !== undefined && frontierKeys.has(selectedNode.stableNodeKey)
      ? String(selectedNode.id)
      : frontierNodes[0] !== undefined
        ? String(frontierNodes[0].id)
        : null;
  const nodeBadgesById = React.useMemo(
    () =>
      Object.fromEntries(
        nodes.map((node) => {
          const badges: { label: string; tone?: 'frontier' | 'complete' | 'frozen' }[] = [];
          if (frontierKeys.has(node.stableNodeKey)) {
            badges.push({ label: 'Frontier', tone: 'frontier' });
          }
          const runtimeState = progressByKey.get(node.stableNodeKey);
          if (runtimeState !== undefined && runtimeState !== 'locked') {
            badges.push({ label: formatCurriculumLabel(runtimeState) });
          }
          if (frozenNodeKeys.has(node.stableNodeKey)) {
            badges.push({ label: 'Frozen', tone: 'frozen' });
          }
          return [String(node.id), badges];
        })
      ),
    [frozenNodeKeys, frontierKeys, nodes, progressByKey]
  );

  const revisionError =
    revisionAgent.runError !== null
      ? formatApiErrorMessage(revisionAgent.runError, {
          action: 'draft the curriculum revision',
          fallback: 'The revision agent could not produce a reviewable proposal.',
        })
      : null;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="grid gap-4">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/curricula"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to vault
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">{curriculumId}</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{data?.title ?? 'Curriculum'}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {data?.goal ??
                'Inspect the active curriculum graph, review the current frontier, and freeze nodes that should stay stable.'}
            </p>
          </div>
        </header>

        {curriculum.isError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {curriculum.error instanceof Error
              ? curriculum.error.message
              : 'Failed to load the curriculum.'}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Version</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {data?.activeVersion?.versionNumber ?? '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nodes</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{String(nodes.length)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Frontier</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {String(frontier.data?.data.length ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Frozen</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{String(frozenNodeKeys.size)}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Curriculum graph</h2>
            <Link
              href={`/session/new?curriculumId=${encodeURIComponent(curriculumId)}${
                selectedSessionNodeId !== null
                  ? `&nodeId=${encodeURIComponent(selectedSessionNodeId)}`
                  : ''
              }`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Use this curriculum for a session
            </Link>
          </div>

          {curriculum.isLoading ? (
            <>
              <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
              <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
            </>
          ) : nodes.length === 0 ? (
            <CurriculumDag nodes={[]} edges={[]} />
          ) : (
            <div className="grid gap-4">
              <CurriculumDag
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                nodeBadgesById={nodeBadgesById}
                onNodeClick={(node) => {
                  const nodeId = String(node.id);
                  setSelectedNodeId(nodeId);
                  router.replace(
                    `/curricula/${encodeURIComponent(curriculumId)}?nodeId=${encodeURIComponent(nodeId)}`,
                    { scroll: false }
                  );
                }}
              />
              {selectedNode !== undefined && (
                <NodeCard
                  curriculumId={curriculumId}
                  frozen={frozenNodeKeys.has(selectedNode.stableNodeKey)}
                  node={selectedNode}
                  progressLabel={progressLabelForNode(selectedNode)}
                />
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="grid h-fit gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Agent support</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Draft structural revisions here, and generate lesson plans once a real session is
            created from this curriculum.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  !revisionAgent.canRun ||
                  revisionAgent.isRunning ||
                  data?.activeVersion === undefined
                }
                onClick={() => {
                  setRevisionMessage('Revision agent is preparing a reviewable proposal.');
                  void revisionAgent.run();
                }}
              >
                {revisionAgent.isRunning && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {revisionAgent.isRunning ? 'Drafting revision…' : 'Draft revision'}
              </Button>
              {revisionAgent.canCancelJob && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={revisionAgent.isCancelling}
                  onClick={() => {
                    void revisionAgent.cancelJob();
                  }}
                >
                  {revisionAgent.isCancelling ? 'Cancelling…' : 'Cancel request'}
                </Button>
              )}
            </div>
            <Link
              href={`/session/new?curriculumId=${encodeURIComponent(curriculumId)}${
                selectedSessionNodeId !== null
                  ? `&nodeId=${encodeURIComponent(selectedSessionNodeId)}`
                  : ''
              }`}
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Generate lesson plan from session setup
            </Link>
            <AgentActionButton
              agentName="content-creation-orchestrator"
              context={{
                userId: user?.id ?? '',
                curriculumId,
                conceptIds:
                  selectedNode?.ckgConceptId !== undefined
                    ? [selectedNode.ckgConceptId]
                    : conceptIds,
                selectedNodeIds:
                  selectedNodeId !== null
                    ? [selectedNodeId]
                    : frontierNodes.map((node) => String(node.id)),
                studyMode: activeStudyMode,
                payload: {
                  surface: 'curriculum-detail',
                  title: data?.title ?? null,
                  frontierNodeCount: frontierNodes.length,
                },
              }}
              label="Find missing practice"
              size="sm"
            />
          </div>
          {(revisionMessage !== null || revisionError !== null) && (
            <div className="mt-3 space-y-2 text-sm">
              {revisionMessage !== null && (
                <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-muted-foreground">
                  {revisionMessage}
                </p>
              )}
              {revisionAgent.proposal !== null && (
                <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="font-medium text-foreground">{revisionAgent.proposal.title}</p>
                  <p className="mt-1 text-muted-foreground">{revisionAgent.proposal.summary}</p>
                </div>
              )}
              <ProposalJobStatusCard
                job={revisionAgent.batchJob}
                phase={revisionAgent.proposalJobPhase}
                canCancel={revisionAgent.canCancelJob}
                isCancelling={revisionAgent.isCancelling}
                onCancel={() => {
                  void revisionAgent.cancelJob();
                }}
                title="Revision request"
              />
              {revisionError !== null && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                  {revisionError}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Overview</h2>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>State: {data !== undefined ? formatCurriculumLabel(data.state) : 'Loading…'}</p>
            <p>
              Origin:{' '}
              {data?.originMode !== undefined ? formatCurriculumLabel(data.originMode) : '—'}
            </p>
            <p>Domain: {data?.domain ?? '—'}</p>
            <p>
              Updated:{' '}
              {data?.updatedAt !== undefined && data.updatedAt !== ''
                ? formatDate(data.updatedAt)
                : '—'}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Frontier</h2>
          <div className="mt-3 space-y-2">
            {frontier.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading frontier…</p>
            ) : frontierNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No frontier nodes are open right now.</p>
            ) : (
              frontierNodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                >
                  <p className="text-sm font-medium text-foreground">{node.label}</p>
                  <p className="text-xs text-muted-foreground">{node.stableNodeKey}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Revision proposals</h2>
          <div className="mt-3 space-y-3">
            {proposals.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading revision proposals…</p>
            ) : (proposals.data?.data.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending structural revisions. Draft one from the agent support panel if this path
                needs a review.
              </p>
            ) : (
              proposals.data?.data.map((proposal) => (
                <RevisionProposalCard
                  key={proposal.id}
                  curriculumId={curriculumId}
                  proposal={proposal}
                />
              ))
            )}
          </div>
        </section>
      </aside>
    </main>
  );
}
