/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { LessonPlanId, SessionId, StepId } from '@noema/types';

import { offlineApi, sessionsApi, stepsApi } from './api.js';
import type {
  AnswerStepInput,
  CreateGoalInput,
  CreateGoalResponse,
  CreateLessonPlanInput,
  CreateLessonPlanResponse,
  OfflineIntentTokenInput,
  OfflineIntentVerifyInput,
  OfflineTokenResponse,
  OfflineVerifyResponse,
  SessionFilters,
  SessionResponse,
  SessionsListResponse,
  SkipStepInput,
  StartSessionInput,
  StepLoopSnapshotResponse,
  StepResponse,
} from './types.js';

export const sessionKeys = {
  all: ['sessions'] as const,
  list: (filters?: SessionFilters) => [...sessionKeys.all, 'list', filters] as const,
  detail: (id: SessionId) => [...sessionKeys.all, 'detail', id] as const,
  nextStep: (id: SessionId) => [...sessionKeys.detail(id), 'next-step'] as const,
};

export function useSessions(
  filters?: SessionFilters,
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

export function useNextStep(
  sessionId: SessionId,
  options?: Omit<UseQueryOptions<StepLoopSnapshotResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.nextStep(sessionId),
    queryFn: () => sessionsApi.getNextStep(sessionId),
    enabled: sessionId !== '',
    staleTime: 5 * 1000,
    ...options,
  });
}

export function useStartSession(
  options?: UseMutationOptions<SessionResponse, Error, StartSessionInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.startSession,
    onSuccess: (data) => {
      queryClient.setQueryData(sessionKeys.detail(data.data.id), data);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    ...options,
  });
}

export function useCreateLessonPlan(
  sessionId: SessionId,
  options?: UseMutationOptions<CreateLessonPlanResponse, Error, CreateLessonPlanInput>
) {
  return useMutation({
    mutationFn: (data) => sessionsApi.createLessonPlan(sessionId, data),
    ...options,
  });
}

export function useCreateGoal(
  lessonPlanId: LessonPlanId,
  options?: UseMutationOptions<CreateGoalResponse, Error, CreateGoalInput>
) {
  return useMutation({
    mutationFn: (data) => sessionsApi.createGoal(lessonPlanId, data),
    ...options,
  });
}

export function usePresentStep(options?: UseMutationOptions<StepResponse, Error, StepId>) {
  return useMutation({
    mutationFn: stepsApi.presentStep,
    ...options,
  });
}

export function useAnswerStep(
  stepId: StepId,
  options?: UseMutationOptions<StepResponse, Error, AnswerStepInput>
) {
  return useMutation({
    mutationFn: (data) => stepsApi.answerStep(stepId, data),
    ...options,
  });
}

export function useSkipStep(
  stepId: StepId,
  options?: UseMutationOptions<StepResponse, Error, SkipStepInput | undefined>
) {
  return useMutation({
    mutationFn: (data) => stepsApi.skipStep(stepId, data),
    ...options,
  });
}

export function useOfflineIntentToken(
  options?: UseMutationOptions<OfflineTokenResponse, Error, OfflineIntentTokenInput>
) {
  return useMutation({
    mutationFn: offlineApi.issueToken,
    ...options,
  });
}

export function useVerifyOfflineIntent(
  options?: UseMutationOptions<OfflineVerifyResponse, Error, OfflineIntentVerifyInput>
) {
  return useMutation({
    mutationFn: offlineApi.verifyToken,
    ...options,
  });
}
