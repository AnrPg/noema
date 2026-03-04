/**
 * @noema/api-client - Session Service Hooks
 *
 * TanStack Query hooks for Session Service (all endpoints).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { SessionId } from '@noema/types';

import {
  attemptsApi,
  blueprintApi,
  checkpointApi,
  cohortApi,
  midSessionApi,
  offlineApi,
  queueApi,
  sessionsApi,
} from './api.js';
import type {
  AttemptResponse,
  AttemptsListResponse,
  BlueprintValidationResponse,
  CheckpointResponse,
  CohortResponse,
  HintResponse,
  IAttemptInput,
  ICohortHandshakeDto,
  IOfflineIntentVerifyInput,
  ISessionFilters,
  IStartSessionInput,
  IUpdateStrategyInput,
  IUpdateTeachingInput,
  OfflineTokenResponse,
  SessionQueueResponse,
  SessionResponse,
  SessionsListResponse,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const sessionKeys = {
  all: ['sessions'] as const,
  list: (filters?: ISessionFilters) => [...sessionKeys.all, 'list', filters] as const,
  detail: (id: SessionId) => [...sessionKeys.all, 'detail', id] as const,
  queue: (id: SessionId) => [...sessionKeys.all, 'queue', id] as const,
  attempts: (id: SessionId) => [...sessionKeys.all, 'attempts', id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useSessions(
  filters?: ISessionFilters,
  options?: Omit<UseQueryOptions<SessionsListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.list(filters),
    queryFn: () => sessionsApi.listSessions(filters),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useSession(
  id: SessionId,
  options?: Omit<UseQueryOptions<SessionResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: () => sessionsApi.getSession(id),
    enabled: id !== '',
    staleTime: 10 * 1000,
    ...options,
  });
}

export function useSessionQueue(
  sessionId: SessionId,
  options?: Omit<UseQueryOptions<SessionQueueResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.queue(sessionId),
    queryFn: () => queueApi.getQueue(sessionId),
    enabled: sessionId !== '',
    staleTime: 5 * 1000,
    ...options,
  });
}

export function useSessionAttempts(
  sessionId: SessionId,
  options?: Omit<UseQueryOptions<AttemptsListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.attempts(sessionId),
    queryFn: () => attemptsApi.listAttempts(sessionId),
    enabled: sessionId !== '',
    staleTime: 10 * 1000,
    ...options,
  });
}

// ============================================================================
// Session Lifecycle Mutations
// ============================================================================

export function useStartSession(
  options?: UseMutationOptions<SessionResponse, Error, IStartSessionInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.startSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

export function usePauseSession(options?: UseMutationOptions<SessionResponse, Error, SessionId>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.pauseSession,
    onSuccess: (data, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), data);
    },
    ...options,
  });
}

export function useResumeSession(options?: UseMutationOptions<SessionResponse, Error, SessionId>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.resumeSession,
    onSuccess: (data, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), data);
    },
    ...options,
  });
}

export function useCompleteSession(
  options?: UseMutationOptions<SessionResponse, Error, SessionId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.completeSession,
    onSuccess: (data, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

export function useAbandonSession(options?: UseMutationOptions<SessionResponse, Error, SessionId>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.abandonSession,
    onSuccess: (data, id) => {
      queryClient.setQueryData(sessionKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// Attempt Mutations
// ============================================================================

export function useRecordAttempt(
  sessionId: SessionId,
  options?: UseMutationOptions<AttemptResponse, Error, IAttemptInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => attemptsApi.recordAttempt(sessionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.attempts(sessionId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.queue(sessionId) });
    },
    ...options,
  });
}

export function useRequestHint(sessionId: SessionId, options?: UseMutationOptions<HintResponse>) {
  return useMutation({
    mutationFn: () => attemptsApi.requestHint(sessionId),
    ...options,
  });
}

// ============================================================================
// Checkpoint Mutation
// ============================================================================

export function useEvaluateCheckpoint(
  sessionId: SessionId,
  options?: UseMutationOptions<CheckpointResponse>
) {
  return useMutation({
    mutationFn: () => checkpointApi.evaluateCheckpoint(sessionId),
    ...options,
  });
}

// ============================================================================
// Cohort Mutations
// ============================================================================

export function useProposeCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse, Error, Partial<ICohortHandshakeDto>>
) {
  return useMutation({
    mutationFn: (data) => cohortApi.propose(sessionId, data),
    ...options,
  });
}

export function useAcceptCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse>
) {
  return useMutation({
    mutationFn: () => cohortApi.accept(sessionId),
    ...options,
  });
}

export function useReviseCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse, Error, Partial<ICohortHandshakeDto>>
) {
  return useMutation({
    mutationFn: (data) => cohortApi.revise(sessionId, data),
    ...options,
  });
}

export function useCommitCohort(
  sessionId: SessionId,
  options?: UseMutationOptions<CohortResponse>
) {
  return useMutation({
    mutationFn: () => cohortApi.commit(sessionId),
    ...options,
  });
}

// ============================================================================
// Mid-Session Mutations
// ============================================================================

export function useUpdateSessionStrategy(
  sessionId: SessionId,
  options?: UseMutationOptions<SessionResponse, Error, IUpdateStrategyInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => midSessionApi.updateStrategy(sessionId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionKeys.detail(sessionId), data);
    },
    ...options,
  });
}

export function useUpdateTeachingApproach(
  sessionId: SessionId,
  options?: UseMutationOptions<SessionResponse, Error, IUpdateTeachingInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => midSessionApi.updateTeaching(sessionId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionKeys.detail(sessionId), data);
    },
    ...options,
  });
}

// ============================================================================
// Blueprint Mutation
// ============================================================================

export function useValidateBlueprint(
  options?: UseMutationOptions<BlueprintValidationResponse, Error, string>
) {
  return useMutation({
    mutationFn: blueprintApi.validateBlueprint,
    ...options,
  });
}

// ============================================================================
// Offline Intent Mutations
// ============================================================================

export function useOfflineIntentToken(
  options?: UseMutationOptions<OfflineTokenResponse, Error, string[]>
) {
  return useMutation({
    mutationFn: offlineApi.getToken,
    ...options,
  });
}

export function useVerifyOfflineIntents(
  options?: UseMutationOptions<AttemptsListResponse, Error, IOfflineIntentVerifyInput>
) {
  return useMutation({
    mutationFn: offlineApi.verifyAndSubmit,
    ...options,
  });
}
