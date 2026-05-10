import type {
  IAgentBatchJob,
  IAgentRunResult,
  IReviewRoutingDecision,
} from '@noema/api-client/agents';
import { getAgentCapability } from './agent-capabilities';
import type {
  AgentReviewState,
  EmbeddedAgentName,
  IAgentJobView,
  IAgentProposal,
  ProposalJobPhase,
} from './types';

const INTERNAL_REASON_PATTERNS = [
  /tool belt/i,
  /wrapper authority/i,
  /review queue/i,
  /proposal-like output/i,
];

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function reasonsFrom(decision: IReviewRoutingDecision | undefined): string[] {
  if (decision === undefined) {
    return [];
  }

  if (!decision.allowed) {
    return decision.blockedReasons.length > 0 ? decision.blockedReasons : decision.reasons;
  }

  return decision.reasons;
}

function toSentence(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    return trimmed;
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function isInternalReason(reason: string): boolean {
  return INTERNAL_REASON_PATTERNS.some((pattern) => pattern.test(reason));
}

function friendlyReason(reason: string): string | null {
  if (isInternalReason(reason)) {
    return null;
  }

  if (/^No target concepts were provided/i.test(reason)) {
    return 'Select one or more concepts first.';
  }
  if (/unresolved graph node ID/i.test(reason)) {
    return 'At least one selected concept could not be matched to the graph yet.';
  }
  if (/Duplicate target ambiguity/i.test(reason)) {
    return 'Some selected concepts look duplicated or ambiguous and need clarification first.';
  }
  if (/Required source evidence is unavailable/i.test(reason)) {
    return 'This request needs supporting source material before it can continue.';
  }
  if (/must route through review/i.test(reason)) {
    return 'This agent prepares suggestions for you to review before anything changes.';
  }

  return toSentence(reason);
}

function friendlyReasonsFrom(decision: IReviewRoutingDecision | undefined): string[] {
  const rawReasons = reasonsFrom(decision);
  const mapped = rawReasons
    .map((reason) => friendlyReason(reason))
    .filter((reason): reason is string => reason !== null);

  if (mapped.length > 0) {
    return mapped;
  }

  if (decision?.requiresReview === true) {
    return ['This agent prepares suggestions for you to review before anything changes.'];
  }

  return [];
}

function headlineForState(agentName: EmbeddedAgentName, state: AgentReviewState): string {
  if (agentName === 'knowledge-graph-agent') {
    switch (state) {
      case 'blocked':
        return 'This graph request needs a little more setup before the agent can help.';
      case 'running':
      case 'checking':
        return 'The graph agent is preparing suggestions from your selected concepts.';
      case 'needs_review':
        return 'A graph proposal is ready for your review.';
      case 'cancelled':
        return 'This graph proposal request was cancelled before provider submission.';
      case 'failed':
        return 'The graph agent could not finish this request.';
      case 'completed':
      case 'draft':
        return 'Your graph suggestions are ready.';
      case 'idle':
      default:
        return 'Use the graph agent when you want help linking or structuring concepts.';
    }
  }

  switch (state) {
    case 'blocked':
      return 'This request needs a little more setup before the agent can help.';
    case 'running':
    case 'checking':
      return 'The agent is preparing a draft for you.';
    case 'needs_review':
      return 'A draft is ready for your review.';
    case 'cancelled':
      return 'This draft request was cancelled before provider submission.';
    case 'failed':
      return 'The agent could not finish this request.';
    case 'completed':
    case 'draft':
      return 'Your draft is ready.';
    case 'idle':
    default:
      return 'Use this agent when you want contextual help on this screen.';
  }
}

function nextStepForState(
  agentName: EmbeddedAgentName,
  state: AgentReviewState
): { label: string; description: string } {
  if (agentName === 'knowledge-graph-agent') {
    switch (state) {
      case 'blocked':
        return {
          label: 'Fix the setup first',
          description: 'Choose concepts the graph can recognize, then try again.',
        };
      case 'running':
      case 'checking':
        return {
          label: 'Wait for the proposal',
          description: 'The agent is assembling context and building a reviewable graph suggestion.',
        };
      case 'needs_review':
        return {
          label: 'Review graph suggestions',
          description: 'Open the review workspace to inspect proposed links and apply only the ones you want.',
        };
      case 'cancelled':
        return {
          label: 'Start a fresh request',
          description: 'This request stopped before provider submission, so no review draft was created.',
        };
      case 'failed':
        return {
          label: 'Try again',
          description: 'Run the graph agent again after checking the selected concepts and context.',
        };
      case 'completed':
      case 'draft':
        return {
          label: 'Review graph suggestions',
          description: 'Inspect the draft and decide which suggested graph changes fit your PKG.',
        };
      case 'idle':
      default:
        return {
          label: 'Draft graph suggestions',
          description: 'The agent will gather graph context and prepare reviewable concept links and structure suggestions.',
        };
    }
  }

  switch (state) {
    case 'blocked':
      return {
        label: 'Fix the setup first',
        description: 'Add the missing context, then try again.',
      };
    case 'running':
    case 'checking':
      return {
        label: 'Wait for the draft',
        description: 'The agent is assembling context and preparing a response.',
      };
    case 'needs_review':
      return {
        label: 'Open review',
        description: 'Review the draft before applying it.',
      };
    case 'cancelled':
      return {
        label: 'Start a fresh request',
        description: 'This request stopped before provider submission, so no review draft was created.',
      };
    case 'failed':
      return {
        label: 'Try again',
        description: 'Run the agent again after checking the current context.',
      };
    case 'completed':
    case 'draft':
      return {
        label: 'Review the draft',
        description: 'Inspect the prepared draft and apply it only if it fits.',
      };
    case 'idle':
    default:
      return {
        label: 'Start the agent',
        description: 'The agent will gather context and prepare a helpful draft.',
      };
  }
}

function cautionForState(
  state: AgentReviewState,
  decision: IReviewRoutingDecision | undefined
): string | null {
  if (state === 'blocked') {
    return friendlyReasonsFrom(decision)[0] ?? 'This request is blocked until the missing setup is resolved.';
  }
  if (state === 'needs_review') {
    return 'Nothing changes automatically. Review the draft before applying anything.';
  }
  if (state === 'cancelled') {
    return 'Cancellation only works before provider submission, and this request stopped in that window.';
  }
  return null;
}

export function extractBatchJobResultPayload(job: IAgentBatchJob): Record<string, unknown> | null {
  if (job.result === undefined || job.result === null || typeof job.result !== 'object') {
    return null;
  }

  const result = job.result as Record<string, unknown>;
  const nestedResult = result['result'];
  if (
    nestedResult !== undefined &&
    nestedResult !== null &&
    typeof nestedResult === 'object' &&
    !Array.isArray(nestedResult)
  ) {
    return nestedResult as Record<string, unknown>;
  }

  return result;
}

export function reviewStateFromRun(result: IAgentRunResult | undefined): AgentReviewState {
  if (result === undefined) {
    return 'idle';
  }

  if (!result.preflight.allowed) {
    return 'blocked';
  }

  const status = result.status?.toLowerCase();
  if (status === 'queued' || status === 'submitted' || status === 'running') {
    return 'running';
  }

  if (status === 'cancelled') {
    return 'cancelled';
  }

  if (status === 'failed' || status === 'finalization_failed') {
    return 'failed';
  }

  if (result.preflight.requiresReview) {
    return 'needs_review';
  }

  return 'draft';
}

export function jobState(job: IAgentBatchJob): AgentReviewState {
  const phase = proposalJobPhase(job);
  if (phase === 'queued_local' || phase === 'submitted_provider' || phase === 'running_provider') {
    return 'running';
  }
  if (phase === 'cancelled') {
    return 'cancelled';
  }
  if (phase === 'failed') {
    return 'failed';
  }
  return 'completed';
}

export function proposalJobPhase(job: IAgentBatchJob | null | undefined): ProposalJobPhase {
  if (job === null || job === undefined) {
    return 'idle';
  }

  const status = job.status.toLowerCase();
  if (status === 'queued') {
    return job.isCancellable ? 'queued_local' : 'submitted_provider';
  }
  if (status === 'submitted') {
    return 'submitted_provider';
  }
  if (status === 'running') {
    return 'running_provider';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  if (status === 'failed' || status === 'finalization_failed') {
    return 'failed';
  }
  return 'completed';
}

export function proposalJobPhaseLabel(phase: ProposalJobPhase): string {
  switch (phase) {
    case 'queued_local':
      return 'Queued locally';
    case 'submitted_provider':
      return 'Submitted to provider';
    case 'running_provider':
      return 'Running with provider';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'idle':
    default:
      return 'Idle';
  }
}

export function proposalJobPhaseDescription(phase: ProposalJobPhase): string | null {
  switch (phase) {
    case 'queued_local':
      return 'This request can still be cancelled before provider submission.';
    case 'submitted_provider':
      return 'Provider processing has started, so this request is no longer cancellable as a cost-saving stop.';
    case 'running_provider':
      return 'The provider is actively building the proposal now.';
    case 'cancelled':
      return 'This request was stopped before provider submission, so no review draft will open from it.';
    case 'failed':
      return 'This request stopped before producing a reviewable proposal.';
    case 'completed':
    case 'idle':
    default:
      return null;
  }
}

export function normalizeAgentProposal(
  agentName: EmbeddedAgentName,
  result: IAgentRunResult | undefined
): IAgentProposal | null {
  if (result === undefined) {
    return null;
  }

  const capability = getAgentCapability(agentName);
  const execution = toRecord(result.execution);
  const executionResult = toRecord(execution['result']);
  const contextPack = toRecord(result.contextPack);
  const title =
    stringFrom(executionResult['title']) ??
    stringFrom(executionResult['heading']) ??
    stringFrom(contextPack['title']) ??
    capability.title;
  const summary =
    stringFrom(executionResult['summary']) ??
    stringFrom(executionResult['explanation']) ??
    stringFrom(contextPack['summary']) ??
    capability.description;
  const recommendedAction =
    stringFrom(executionResult['recommendedAction']) ??
    (result.preflight.requiresReview
      ? agentName === 'knowledge-graph-agent'
        ? 'A graph proposal is ready. Review the suggested concept links and apply only the ones you want.'
        : 'A draft is ready. Review it before applying anything.'
      : capability.actionLabel);
  const state = reviewStateFromRun(result);
  const nextStep = nextStepForState(agentName, state);
  const technicalDetails = {
    runId: result.runId,
    jobId: result.jobId ?? null,
    agentName,
    provider: result.provider ?? null,
    model: result.model ?? null,
    promptTemplateId: result.prompt?.templateId ?? null,
    reviewQueue: result.preflight.reviewQueue,
    serviceRefs: {
      request: result.request,
      contextPack: result.contextPack,
    },
    reviewRequired: result.preflight.requiresReview,
    rawReasons: result.preflight.reasons,
    blockedReasons: result.preflight.blockedReasons,
  };

  return {
    id: result.runId,
    agentName,
    title,
    summary,
    state,
    headline: headlineForState(agentName, state),
    recommendedAction,
    nextStepLabel: nextStep.label,
    nextStepDescription: nextStep.description,
    reasons: reasonsFrom(result.preflight),
    friendlyReasons: friendlyReasonsFrom(result.preflight),
    caution: cautionForState(state, result.preflight),
    review: result.preflight,
    rawResult: result,
    technicalDetails,
    provenance: {
      runId: result.runId,
      jobId: result.jobId ?? null,
      agentName,
      provider: result.provider ?? null,
      model: result.model ?? null,
      promptTemplateId: result.prompt?.templateId ?? null,
      reviewQueue: result.preflight.reviewQueue,
      serviceRefs: {
        request: result.request,
        contextPack: result.contextPack,
      },
    },
  };
}

export function normalizeAgentBatchProposal(
  agentName: EmbeddedAgentName,
  job: IAgentBatchJob | undefined
): IAgentProposal | null {
  if (job === undefined) {
    return null;
  }

  const capability = getAgentCapability(agentName);
  const payload = extractBatchJobResultPayload(job);
  const status = job.status.toLowerCase();
  const proposalCountValue =
    payload?.['proposalCount'] ??
    (Array.isArray(payload?.['proposals']) ? payload['proposals'].length : null);
  const proposalCount =
    typeof proposalCountValue === 'number' && Number.isFinite(proposalCountValue)
      ? proposalCountValue
      : null;

  let state: AgentReviewState;
  if (status === 'queued' || status === 'submitted' || status === 'running') {
    state = 'running';
  } else if (status === 'failed' || status === 'finalization_failed' || status === 'cancelled') {
    state = 'failed';
  } else if (agentName === 'knowledge-graph-agent') {
    state = 'needs_review';
  } else {
    state = 'completed';
  }

  const summary =
    stringFrom(payload?.['notes']) ??
    stringFrom(payload?.['summary']) ??
    (state === 'running'
      ? 'The graph agent is preparing reviewable suggestions from your selected concepts.'
      : proposalCount !== null
        ? `${String(proposalCount)} graph suggestion${proposalCount === 1 ? '' : 's'} ready for review.`
        : capability.preparationDescription ?? capability.description);

  const nextStep = nextStepForState(agentName, state);
  const errorReason = stringFrom(job.errorMessage);
  const reasons = errorReason !== null ? [errorReason] : [];
  const friendlyReasons =
    state === 'needs_review'
      ? ['This agent prepares suggestions for you to review before anything changes.']
      : reasons;

  return {
    id: job.runId,
    agentName,
    title: stringFrom(payload?.['title']) ?? capability.title,
    summary,
    state,
    headline: headlineForState(agentName, state),
    recommendedAction:
      state === 'running'
        ? 'The graph agent is still preparing a draft. Keep this panel open while it finishes.'
        : state === 'failed'
          ? 'The graph agent could not finish this request. Try again after checking the selected concepts.'
          : 'A graph proposal is ready. Review the suggested concept links and apply only the ones you want.',
    nextStepLabel: nextStep.label,
    nextStepDescription: nextStep.description,
    reasons,
    friendlyReasons,
    caution:
      state === 'needs_review'
        ? 'Nothing changes automatically. Review the draft before applying anything.'
        : errorReason,
    technicalDetails: {
      runId: job.runId,
      jobId: job.jobId,
      agentName,
      provider: job.provider,
      model: job.model,
      promptTemplateId: null,
      reviewQueue: null,
      serviceRefs: {
        request: job.request,
        result: payload ?? job.result ?? null,
      },
      reviewRequired: state === 'needs_review',
      rawReasons: [],
      blockedReasons: errorReason !== null ? [errorReason] : [],
    },
    provenance: {
      runId: job.runId,
      jobId: job.jobId,
      agentName,
      provider: job.provider,
      model: job.model,
      promptTemplateId: null,
      reviewQueue: null,
      serviceRefs: {
        request: job.request,
        result: payload ?? job.result ?? null,
      },
    },
  };
}

export function normalizeAgentJob(job: IAgentBatchJob): IAgentJobView {
  return {
    id: job.jobId,
    agentName: job.agentName as EmbeddedAgentName,
    status: jobState(job),
    label: `${job.agentName.replaceAll('-', ' ')}: ${job.status}`,
    updatedAt: job.updatedAt,
    rawJob: job,
  };
}

export function reviewStateLabel(state: AgentReviewState): string {
  switch (state) {
    case 'checking':
      return 'Preparing';
    case 'blocked':
      return 'Needs setup';
    case 'draft':
      return 'Draft';
    case 'needs_review':
      return 'Ready for your review';
    case 'guardian_accepted':
      return 'Guardian accepted';
    case 'guardian_blocked':
      return 'Guardian blocked';
    case 'running':
      return 'Building proposal';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'completed':
      return 'Completed';
    case 'idle':
    default:
      return 'Ready';
  }
}
