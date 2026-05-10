import type { LessonPlanId, SessionId, StepId } from '@noema/types';

import { http } from '../client.js';
import type {
  AnswerStepInput,
  AgentSurfaceExposureResponse,
  ExposureBudgetStateResponse,
  CreateGoalInput,
  CreateGoalResponse,
  CreateLessonPlanInput,
  CreateLessonPlanResponse,
  LearnerFeedbackActionResponse,
  LearnerFeedbackHistoryQuery,
  LearnerFeedbackHistoryResponse,
  LearnerLoadStateResponse,
  OfflineIntentTokenInput,
  OfflineIntentVerifyInput,
  OfflineTokenResponse,
  OfflineVerifyResponse,
  RecordAgentSurfaceExposureInput,
  RecordLearnerFeedbackActionInput,
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

  getLearnerLoadState: (sessionId: SessionId): Promise<LearnerLoadStateResponse> =>
    http.get(`/v1/sessions/${sessionId}/learner-load-state`),

  getExposureBudgetState: (sessionId: SessionId): Promise<ExposureBudgetStateResponse> =>
    http.get(`/v1/sessions/${sessionId}/exposure-budget-state`),
};

export const stepsApi = {
  presentStep: (stepId: StepId): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/present`, {}),

  answerStep: (stepId: StepId, data: AnswerStepInput): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/answer`, data),

  skipStep: (stepId: StepId, data?: SkipStepInput): Promise<StepResponse> =>
    http.post(`/v1/steps/${stepId}/skip`, data ?? {}),
};

export const learnerFeedbackApi = {
  recordAction: (
    data: RecordLearnerFeedbackActionInput
  ): Promise<LearnerFeedbackActionResponse> =>
    http.post('/v1/learner-feedback-actions', data),

  getHistory: (query?: LearnerFeedbackHistoryQuery): Promise<LearnerFeedbackHistoryResponse> =>
    http.get('/v1/learner-feedback-history', withParams(query)),
};

export const agentSurfaceApi = {
  recordExposure: (
    data: RecordAgentSurfaceExposureInput
  ): Promise<AgentSurfaceExposureResponse> =>
    http.post('/v1/agent-surface-exposures', data),
};

export const offlineApi = {
  issueToken: (data: OfflineIntentTokenInput): Promise<OfflineTokenResponse> =>
    http.post('/v1/offline-intents', data),

  verifyToken: (data: OfflineIntentVerifyInput): Promise<OfflineVerifyResponse> =>
    http.post('/v1/offline-intents/verify', data),
};
