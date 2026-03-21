import type { ICkgMutationDto, MutationWorkflowState } from '@noema/api-client';

export interface IMutationWorkflowMeta {
  label: string;
  description: string;
  badgeClass: string;
  dotClass: string;
}

const WORKFLOW_META: Record<MutationWorkflowState, IMutationWorkflowMeta> = {
  proposed: {
    label: 'Proposed',
    description: 'Queued and waiting for automated validation to start.',
    badgeClass: 'bg-slate-500/20 text-slate-300',
    dotClass: 'bg-slate-400',
  },
  validating: {
    label: 'Validating',
    description: 'The service is checking the mutation against graph rules.',
    badgeClass: 'bg-blue-500/20 text-blue-300',
    dotClass: 'bg-blue-400',
  },
  validated: {
    label: 'Validated',
    description: 'Validation passed and the mutation can continue through the pipeline.',
    badgeClass: 'bg-cyan-500/20 text-cyan-300',
    dotClass: 'bg-cyan-400',
  },
  pending_review: {
    label: 'Pending review',
    description: 'A human reviewer needs to decide whether the mutation should proceed.',
    badgeClass: 'bg-amber-500/20 text-amber-300',
    dotClass: 'bg-amber-400',
  },
  revision_requested: {
    label: 'Revision requested',
    description: 'The reviewer asked for changes before the mutation can be resubmitted.',
    badgeClass: 'bg-orange-500/20 text-orange-300',
    dotClass: 'bg-orange-400',
  },
  proving: {
    label: 'Proving',
    description: 'The pipeline is running proof and consistency checks.',
    badgeClass: 'bg-violet-500/20 text-violet-300',
    dotClass: 'bg-violet-400',
  },
  proven: {
    label: 'Proven',
    description: 'Proof checks finished and the mutation is ready to commit.',
    badgeClass: 'bg-indigo-500/20 text-indigo-300',
    dotClass: 'bg-indigo-400',
  },
  committing: {
    label: 'Committing',
    description: 'The mutation is being written into the canonical graph.',
    badgeClass: 'bg-teal-500/20 text-teal-300',
    dotClass: 'bg-teal-400',
  },
  committed: {
    label: 'Committed',
    description: 'The mutation completed successfully and is now live in the graph.',
    badgeClass: 'bg-green-500/20 text-green-300',
    dotClass: 'bg-green-400',
  },
  rejected: {
    label: 'Rejected',
    description: 'The mutation was rejected and will not be applied.',
    badgeClass: 'bg-red-500/20 text-red-300',
    dotClass: 'bg-red-400',
  },
};

const FALLBACK_STATE_BY_STATUS: Record<ICkgMutationDto['status'], MutationWorkflowState> = {
  pending: 'pending_review',
  approved: 'committed',
  rejected: 'rejected',
  cancelled: 'rejected',
  retrying: 'revision_requested',
};

export const MUTATION_WORKFLOW_FILTERS: MutationWorkflowState[] = [
  'pending_review',
  'proposed',
  'validating',
  'validated',
  'revision_requested',
  'proving',
  'proven',
  'committing',
  'committed',
  'rejected',
];

export function getMutationWorkflowState(mutation: ICkgMutationDto): MutationWorkflowState {
  return mutation.state ?? FALLBACK_STATE_BY_STATUS[mutation.status];
}

export function getMutationWorkflowMeta(
  mutationOrState: ICkgMutationDto | MutationWorkflowState
): IMutationWorkflowMeta {
  const state =
    typeof mutationOrState === 'string'
      ? mutationOrState
      : getMutationWorkflowState(mutationOrState);

  return WORKFLOW_META[state];
}

export function isMutationReadyForReview(mutation: ICkgMutationDto): boolean {
  return getMutationWorkflowState(mutation) === 'pending_review';
}

export function isMutationCancellable(mutation: ICkgMutationDto): boolean {
  const state = getMutationWorkflowState(mutation);
  return (
    state === 'proposed' ||
    state === 'validating' ||
    state === 'pending_review' ||
    state === 'revision_requested'
  );
}

export function isMutationTerminal(mutation: ICkgMutationDto): boolean {
  const state = getMutationWorkflowState(mutation);
  return state === 'committed' || state === 'rejected';
}
