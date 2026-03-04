/**
 * @noema/api-client - Session Service API
 *
 * API methods for Session Service endpoints.
 */

import type { SessionId } from '@noema/types';

import { http } from '../client.js';
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
// Sessions API
// ============================================================================

export const sessionsApi = {
  startSession: (data: IStartSessionInput): Promise<SessionResponse> =>
    http.post('/v1/sessions', data),

  listSessions: (filters?: ISessionFilters): Promise<SessionsListResponse> =>
    http.get('/v1/sessions', {
      params: filters as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getSession: (id: SessionId): Promise<SessionResponse> => http.get(`/v1/sessions/${id}`),

  pauseSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/pause`, {}),

  resumeSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/resume`, {}),

  completeSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/complete`, {}),

  expireSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/expire`, {}),

  abandonSession: (id: SessionId): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${id}/abandon`, {}),
};

// ============================================================================
// Attempts API
// ============================================================================

export const attemptsApi = {
  recordAttempt: (sessionId: SessionId, data: IAttemptInput): Promise<AttemptResponse> =>
    http.post(`/v1/sessions/${sessionId}/attempts`, data),

  listAttempts: (sessionId: SessionId): Promise<AttemptsListResponse> =>
    http.get(`/v1/sessions/${sessionId}/attempts`),

  requestHint: (sessionId: SessionId): Promise<HintResponse> =>
    http.post(`/v1/sessions/${sessionId}/attempts/hint`, {}),
};

// ============================================================================
// Queue API
// ============================================================================

export const queueApi = {
  getQueue: (sessionId: SessionId): Promise<SessionQueueResponse> =>
    http.get(`/v1/sessions/${sessionId}/queue`),

  injectCard: (sessionId: SessionId, cardId: string): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/inject`, { cardId }),

  removeCard: (sessionId: SessionId, cardId: string): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/remove`, { cardId }),
};

// ============================================================================
// Checkpoint API
// ============================================================================

export const checkpointApi = {
  evaluateCheckpoint: (sessionId: SessionId): Promise<CheckpointResponse> =>
    http.post(`/v1/sessions/${sessionId}/checkpoint`, {}),
};

// ============================================================================
// Cohort API
// ============================================================================

export const cohortApi = {
  propose: (sessionId: SessionId, data: Partial<ICohortHandshakeDto>): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/propose`, data),

  accept: (sessionId: SessionId): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/accept`, {}),

  revise: (sessionId: SessionId, data: Partial<ICohortHandshakeDto>): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/revise`, data),

  commit: (sessionId: SessionId): Promise<CohortResponse> =>
    http.post(`/v1/sessions/${sessionId}/cohort/commit`, {}),
};

// ============================================================================
// Mid-Session API
// ============================================================================

export const midSessionApi = {
  updateStrategy: (sessionId: SessionId, data: IUpdateStrategyInput): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${sessionId}/strategy`, data),

  updateTeaching: (sessionId: SessionId, data: IUpdateTeachingInput): Promise<SessionResponse> =>
    http.post(`/v1/sessions/${sessionId}/teaching`, data),
};

// ============================================================================
// Blueprint API
// ============================================================================

export const blueprintApi = {
  validateBlueprint: (blueprintId: string): Promise<BlueprintValidationResponse> =>
    http.post(`/v1/sessions/blueprints/${blueprintId}/validate`, {}),
};

// ============================================================================
// Offline API
// ============================================================================

export const offlineApi = {
  getToken: (cardIds: string[]): Promise<OfflineTokenResponse> =>
    http.post('/v1/sessions/offline-intents', { cardIds }),

  verifyAndSubmit: (data: IOfflineIntentVerifyInput): Promise<AttemptsListResponse> =>
    http.post('/v1/sessions/offline-intents/verify', data),
};
