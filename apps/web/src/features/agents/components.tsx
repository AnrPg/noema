'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { IAgentBatchJob } from '@noema/api-client/agents';
import { AlertTriangle, CheckCircle2, Info, Loader2, Play, ShieldCheck, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import type { IAgentRunRequest } from '@noema/api-client/agents';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { getAgentCapability } from './agent-capabilities';
import { proposalJobPhaseDescription, proposalJobPhaseLabel, reviewStateLabel } from './normalize';
import { useContextualAgent } from './use-contextual-agent';
import type { AgentReviewState, EmbeddedAgentName, IAgentProposal, ProposalJobPhase } from './types';

function contextLabel(field: string): string {
  switch (field) {
    case 'conceptIds':
      return 'selected concepts';
    case 'selectedNodeIds':
      return 'selected graph nodes';
    case 'sessionId':
      return 'an active session';
    case 'curriculumId':
      return 'a curriculum';
    case 'userId':
      return 'your account context';
    default:
      return field;
  }
}

function stateTone(state: AgentReviewState): string {
  if (state === 'blocked' || state === 'failed' || state === 'guardian_blocked') {
    return 'border-destructive/40 bg-destructive/5 text-destructive';
  }
  if (state === 'needs_review' || state === 'running' || state === 'checking') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  if (state === 'guardian_accepted' || state === 'completed') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  return 'border-border bg-muted/30 text-muted-foreground';
}

export function ReviewRoutingBadge(props: { state: AgentReviewState }): React.JSX.Element {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
        stateTone(props.state),
      ].join(' ')}
    >
      {reviewStateLabel(props.state)}
    </span>
  );
}

export function AgentErrorState(props: { error: unknown; action: string }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {formatApiErrorMessage(props.error, {
        action: props.action,
        fallback: 'The agent could not complete this request.',
      })}
    </div>
  );
}

export function AgentStatusTimeline(props: { state: AgentReviewState }): React.JSX.Element {
  const steps: { id: AgentReviewState; label: string }[] = [
    { id: 'checking', label: 'Preparing context' },
    { id: 'running', label: 'Building proposal' },
    { id: 'needs_review', label: 'Review before applying' },
  ];
  const activeIndex =
    props.state === 'idle' ? -1 : Math.max(0, steps.findIndex((step) => step.id === props.state));

  return (
    <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={[
            'flex items-center gap-2 rounded-md border px-3 py-2',
            index <= activeIndex ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border',
          ].join(' ')}
        >
          {index <= activeIndex ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          ) : (
            <span className="h-3.5 w-3.5 rounded-full border border-border" />
          )}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function ProposalJobStatusCard(props: {
  job: IAgentBatchJob | null | undefined;
  phase: ProposalJobPhase;
  canCancel: boolean;
  isCancelling?: boolean | undefined;
  onCancel?: (() => void) | undefined;
  title?: string | undefined;
}): React.JSX.Element | null {
  if (props.job === null || props.job === undefined || props.phase === 'completed' || props.phase === 'idle') {
    return null;
  }

  const description = proposalJobPhaseDescription(props.phase);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {props.title ?? 'Proposal request'}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {proposalJobPhaseLabel(props.phase)}
          </p>
          {description !== null && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
          {props.canCancel && (
            <p className="mt-2 text-xs text-muted-foreground">
              This stops the proposal request before provider submission.
            </p>
          )}
        </div>
        {props.canCancel && props.onCancel !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.isCancelling === true}
            onClick={props.onCancel}
          >
            {props.isCancelling === true ? 'Cancelling…' : 'Cancel request'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProvenanceDrawer(props: { proposal: IAgentProposal }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-lg border border-border/70 bg-background/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
      >
        Technical details
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-border/70 p-3 text-xs text-muted-foreground">
          {JSON.stringify(props.proposal.technicalDetails, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ProposalReviewPanel(props: {
  proposal: IAgentProposal | null;
  capabilityTitle?: string | undefined;
  capabilityDescription?: string | undefined;
  capabilityPreparationDescription?: string | undefined;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
}): React.JSX.Element {
  if (props.proposal === null) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">{props.emptyTitle ?? 'No agent draft yet'}</p>
          <p className="mt-1">
            {props.emptyDescription ?? 'Run the contextual agent when this workflow needs help.'}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What this helps with
            </p>
            <p className="mt-2 text-sm text-foreground">
              {props.capabilityDescription ?? 'Contextual help for this workflow.'}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What the agent is preparing
            </p>
            <p className="mt-2 text-sm text-foreground">
              {props.capabilityPreparationDescription ??
                `${props.capabilityTitle ?? 'This agent'} will prepare a reviewable draft.`}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your next step
            </p>
            <p className="mt-2 text-sm text-foreground">
              Start the agent when you want a draft to review on this screen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const capability = getAgentCapability(props.proposal.agentName);
  const reviewHref =
    capability.reviewRoute !== undefined
      ? (() => {
          const [routePath, query = ''] = capability.reviewRoute.split('?');
          const params = new URLSearchParams(query);
          params.set('agent', props.proposal.agentName);
          if (props.proposal.provenance.jobId !== null && props.proposal.provenance.jobId !== undefined) {
            params.set('jobId', props.proposal.provenance.jobId);
          }
          if (props.proposal.provenance.runId !== null && props.proposal.provenance.runId !== undefined) {
            params.set('runId', props.proposal.provenance.runId);
          }
          return `${routePath ?? capability.reviewRoute}?${params.toString()}` as Route;
        })()
      : undefined;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{props.proposal.title}</h3>
            <ReviewRoutingBadge state={props.proposal.state} />
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{props.proposal.headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{props.proposal.summary}</p>
        </div>
        {reviewHref !== undefined && props.proposal.state === 'needs_review' && (
          <Button asChild variant="outline" size="sm">
            <Link href={reviewHref}>{props.proposal.nextStepLabel}</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What this helps with
          </p>
          <p className="mt-2 text-sm text-foreground">{capability.description}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What the agent is preparing
          </p>
          <p className="mt-2 text-sm text-foreground">
            {capability.preparationDescription ?? props.proposal.summary}
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your next step
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{props.proposal.nextStepLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{props.proposal.nextStepDescription}</p>
        </div>
      </div>

      {props.proposal.friendlyReasons.length > 0 && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why this is suggested
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {props.proposal.friendlyReasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-medium text-foreground">{props.proposal.recommendedAction}</p>
        {props.proposal.caution !== null && (
          <p className="mt-2 text-sm text-muted-foreground">{props.proposal.caution}</p>
        )}
      </div>
      <ProvenanceDrawer proposal={props.proposal} />
    </div>
  );
}

export function AgentActionButton(props: {
  agentName: EmbeddedAgentName;
  context?: Partial<IAgentRunRequest> | undefined;
  label?: string | undefined;
  description?: string | undefined;
  executionPreference?: 'auto' | 'realtime' | 'batch' | undefined;
  variant?: 'default' | 'outline' | 'ghost' | undefined;
  size?: 'default' | 'sm' | 'lg' | undefined;
}): React.JSX.Element {
  const capability = getAgentCapability(props.agentName);
  const [open, setOpen] = React.useState(false);
  const label = props.label ?? capability.actionLabel;

  return (
    <>
      <Button
        type="button"
        variant={props.variant ?? 'outline'}
        size={props.size}
        onClick={() => {
          setOpen(true);
        }}
      >
        <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Button>

      {open && (
        <AgentActionDialog
          agentName={props.agentName}
          context={props.context}
          description={props.description}
          executionPreference={props.executionPreference}
          label={label}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AgentActionDialog(props: {
  agentName: EmbeddedAgentName;
  context?: Partial<IAgentRunRequest> | undefined;
  description?: string | undefined;
  executionPreference?: 'auto' | 'realtime' | 'batch' | undefined;
  label: string;
  onClose: () => void;
}): React.JSX.Element {
  const capability = getAgentCapability(props.agentName);
  const agent = useContextualAgent({
    agentName: props.agentName,
    context: props.context,
    executionPreference: props.executionPreference,
  });

  async function handleRun(): Promise<void> {
    await agent.run();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={capability.title}
    >
      <Card className="max-h-[90dvh] w-full max-w-2xl overflow-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{capability.title}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {props.description ?? capability.whenToSurface}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={props.onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {agent.canCancelJob && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Proposal request queued locally</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cancel now to stop this request before provider submission.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void agent.cancelJob();
                }}
                disabled={agent.isCancelling}
              >
                {agent.isCancelling ? 'Cancelling…' : 'Cancel request'}
              </Button>
            </div>
          )}

          {agent.contextMissing.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                This agent needs a little more setup first: {agent.contextMissing.map(contextLabel).join(', ')}.
              </p>
            </div>
          )}

          <AgentStatusTimeline
            state={
              agent.isChecking
                ? 'checking'
                : agent.isRunning
                  ? 'running'
                  : agent.proposal?.state ?? 'idle'
            }
          />

          {agent.runError !== null && (
            <AgentErrorState error={agent.runError} action={props.label.toLowerCase()} />
          )}

          <ProposalReviewPanel
            proposal={agent.proposal}
            capabilityTitle={capability.title}
            capabilityDescription={capability.description}
            capabilityPreparationDescription={capability.preparationDescription}
            emptyTitle="Ready when useful"
            emptyDescription={capability.description}
          />

          <ProposalJobStatusCard
            job={agent.batchJob}
            phase={agent.proposalJobPhase}
            canCancel={agent.canCancelJob}
            isCancelling={agent.isCancelling}
            onCancel={() => {
              void agent.cancelJob();
            }}
          />

          <div className="flex flex-wrap justify-end gap-3">
            {agent.canCancelJob && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void agent.cancelJob();
                }}
                disabled={agent.isCancelling}
              >
                {agent.isCancelling ? 'Cancelling…' : 'Cancel request'}
              </Button>
            )}
            <Button
              type="button"
              disabled={!agent.canRun || agent.isRunning}
              onClick={() => {
                void handleRun();
              }}
            >
              {agent.isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {agent.isRunning ? 'Building proposal…' : props.label}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AgentSuggestionCard(props: {
  agentName: EmbeddedAgentName;
  context?: Partial<IAgentRunRequest> | undefined;
  title?: string | undefined;
  description?: string | undefined;
  actionLabel?: string | undefined;
}): React.JSX.Element {
  const capability = getAgentCapability(props.agentName);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{props.title ?? capability.shortLabel}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {props.description ?? capability.whenToSurface}
            </p>
          </div>
          <ReviewRoutingBadge state={capability.risk === 'high' ? 'needs_review' : 'draft'} />
        </div>
      </CardHeader>
      <CardContent>
        <AgentActionButton
          agentName={props.agentName}
          context={props.context}
          label={props.actionLabel ?? capability.actionLabel}
          variant="outline"
          size="sm"
        />
      </CardContent>
    </Card>
  );
}
