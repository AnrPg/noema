import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurriculumId, RevisionChangeId, RevisionProposalId } from '@noema/types';
import { curriculumApi } from './api.js';
import type {
  IApplyRevisionProposalInput,
  ICreateCurriculumInput,
  IFreezeNodeInput,
  IRecordCurriculumEvaluationInput,
  IRecordRealignmentEvidenceInput,
  ISessionSliceRequest,
} from './types.js';

export const curriculumKeys = {
  all: ['curriculum'] as const,
  list: () => [...curriculumKeys.all, 'list'] as const,
  detail: (id: CurriculumId) => [...curriculumKeys.all, 'detail', id] as const,
  activeVersion: (id: CurriculumId) => [...curriculumKeys.detail(id), 'active-version'] as const,
  frontier: (id: CurriculumId) => [...curriculumKeys.detail(id), 'frontier'] as const,
  progress: (id: CurriculumId) => [...curriculumKeys.detail(id), 'progress'] as const,
  proposals: (id: CurriculumId) => [...curriculumKeys.detail(id), 'revision-proposals'] as const,
  evidence: (id: CurriculumId) => [...curriculumKeys.detail(id), 'realignment-evidence'] as const,
};

export function useCurricula() {
  return useQuery({ queryKey: curriculumKeys.list(), queryFn: curriculumApi.listCurricula });
}

export function useCurriculum(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.detail(id),
    queryFn: () => curriculumApi.getCurriculum(id),
    enabled: id.length > 0,
  });
}

export function useCurriculumActiveVersion(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.activeVersion(id),
    queryFn: () => curriculumApi.getActiveVersion(id),
    enabled: id.length > 0,
  });
}

export function useCurriculumFrontier(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.frontier(id),
    queryFn: () => curriculumApi.getFrontier(id),
    enabled: id.length > 0,
  });
}

export function useCurriculumProgress(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.progress(id),
    queryFn: () => curriculumApi.getProgress(id),
    enabled: id.length > 0,
  });
}

export function useRevisionProposals(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.proposals(id),
    queryFn: () => curriculumApi.listRevisionProposals(id),
    enabled: id.length > 0,
  });
}

export function useRealignmentEvidence(id: CurriculumId) {
  return useQuery({
    queryKey: curriculumKeys.evidence(id),
    queryFn: () => curriculumApi.listRealignmentEvidence(id),
    enabled: id.length > 0,
  });
}

export function useCreateCurriculum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ICreateCurriculumInput) => curriculumApi.createCurriculum(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.list() });
    },
  });
}

export function useRequestSessionSlice(id: CurriculumId) {
  return useMutation({
    mutationFn: (input: ISessionSliceRequest) => curriculumApi.getSessionSlice(id, input),
  });
}

export function useRecordCurriculumEvaluation(id: CurriculumId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IRecordCurriculumEvaluationInput) => curriculumApi.recordEvaluation(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.progress(id) });
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.frontier(id) });
    },
  });
}

export function useRecordRealignmentEvidence(id: CurriculumId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IRecordRealignmentEvidenceInput) =>
      curriculumApi.recordRealignmentEvidence(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.evidence(id) });
    },
  });
}

export function useDecideRevisionChange(id: CurriculumId, proposalId: RevisionProposalId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { changeId: RevisionChangeId; state: 'approved' | 'rejected' }) =>
      curriculumApi.decideRevisionChange(id, proposalId, input.changeId, input.state),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.proposals(id) });
    },
  });
}

export function useApplyRevisionProposal(id: CurriculumId, proposalId: RevisionProposalId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IApplyRevisionProposalInput) =>
      curriculumApi.applyRevisionProposal(id, proposalId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.proposals(id) });
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.activeVersion(id) });
    },
  });
}

export function useSetNodeFreeze(id: CurriculumId, frozen: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IFreezeNodeInput) =>
      frozen ? curriculumApi.freezeNode(id, input) : curriculumApi.unfreezeNode(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: curriculumKeys.detail(id) });
    },
  });
}
