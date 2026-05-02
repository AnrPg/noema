import type { LessonPlanId, SessionId, StepId } from '@noema/types';

import { http } from '../client.js';
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

type QueryParams = Record<string, string | number | boolean | readonly string[] | undefined>;

function withParams(query: object | undefined): { params?: QueryParams } {
  return query === undefined ? {} : { params: query as QueryParams };
}

export const sessionsApi = {
  startSession: (data: StartSessionInput): Promise<SessionResponse> =>
    http.post('/v1/sessions', data),

  listSessions: (filters?: SessionFilters): Promise<SessionsListResponse> =>
    http.get('/v1/sessions', withParams(filters)),

  getSession: (id: SessionId): Promise<SessionResponse> => http.get(`/v1/sessions/${id}`),

  createLessonPlan: (
    sessionId: SessionId,
    data: CreateLessonPlanInput
  ): Promise<CreateLessonPlanResponse> =>
    http.post(`/v1/sessions/${sessionId}/lesson-plan`, data),

  createGoal: (lessonPlanId: LessonPlanId, data: CreateGoalInput): Promise<CreateGoalResponse> =>
    http.post(`/v1/lesson-plans/${lessonPlanId}/goals`, data),

  getNextStep: (sessionId: SessionId): Promise<StepLoopSnapshotResponse> =>
    http.get(`/v1/sessions/${sessionId}/next-step`),
};

export const stepsApi = {
  presentStep: (stepId: StepId): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/present`, {}),

  answerStep: (stepId: StepId, data: AnswerStepInput): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/answer`, data),

  skipStep: (stepId: StepId, data?: SkipStepInput): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/skip`, data ?? {}),
};

export const offlineApi = {
  issueToken: (data: OfflineIntentTokenInput): Promise<OfflineTokenResponse> =>
    http.post('/v1/offline-intents', data),

  verifyToken: (data: OfflineIntentVerifyInput): Promise<OfflineVerifyResponse> =>
    http.post('/v1/offline-intents/verify', data),
};
