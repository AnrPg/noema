/**
 * @noema/api-client - Session Service API
 *
 * API methods for Session Service endpoints.
 */

import type { CardId, SessionId, UserId } from '@noema/types';

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
    http
      .post<SessionResponse | SessionEnvelopeResponse>('/v1/sessions', data)
      .then(normalizeSessionResponse),

  listSessions: (filters?: ISessionFilters): Promise<SessionsListResponse> => {
    if (!filters) {
      return http
        .get<
          SessionListEnvelopeResponse | SessionsListResponse
        >('/v1/sessions')
        .then(normalizeSessionsListResponse);
    }

    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters.state !== undefined) params['state'] = filters.state;
    if (filters.mode !== undefined) params['learningMode'] = filters.mode;
    if (filters.limit !== undefined) params['limit'] = filters.limit;
    if (filters.offset !== undefined) params['offset'] = filters.offset;
    return http
      .get<SessionListEnvelopeResponse | SessionsListResponse>('/v1/sessions', { params })
      .then(normalizeSessionsListResponse);
  },

  getSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .get<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}`)
      .then(normalizeSessionResponse),

  pauseSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .post<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}/pause`, {})
      .then(normalizeSessionResponse),

  resumeSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .post<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}/resume`, {})
      .then(normalizeSessionResponse),

  completeSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .post<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}/complete`, {})
      .then(normalizeSessionResponse),

  expireSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .post<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}/expire`, {})
      .then(normalizeSessionResponse),

  abandonSession: (id: SessionId): Promise<SessionResponse> =>
    http
      .post<SessionResponse | SessionEnvelopeResponse>(`/v1/sessions/${id}/abandon`, {})
      .then(normalizeSessionResponse),
};

type SessionListEnvelopeResponse = Omit<SessionsListResponse, 'data'> & {
  data: {
    sessions?: SessionsListResponse['data'];
    total?: number;
  };
};

type SessionEnvelopeResponse = Omit<SessionResponse, 'data'> & {
  data: Record<string, unknown>;
};

function normalizeSessionsListResponse(
  response: SessionListEnvelopeResponse | SessionsListResponse
): SessionsListResponse {
  if (Array.isArray(response.data)) {
    return response as SessionsListResponse;
  }

  const sessions = Array.isArray(response.data.sessions) ? response.data.sessions : [];
  const total = response.data.total ?? sessions.length;
  const limit = response.pagination?.limit ?? sessions.length;
  const offset = response.pagination?.offset ?? 0;

  return {
    ...response,
    data: sessions.map(normalizeSessionDto),
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  };
}

function normalizeSessionResponse(response: SessionResponse | SessionEnvelopeResponse): SessionResponse {
  if (isNormalizedSessionDto(response.data)) {
    return response as SessionResponse;
  }

  return {
    ...response,
    data: normalizeSessionDto(response.data),
  };
}

function isNormalizedSessionDto(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'mode' in value && 'cardIds' in value && 'currentCardIndex' in value;
}

function normalizeSessionDto(value: unknown): SessionResponse['data'] {
  if (typeof value !== 'object' || value === null) {
    return {
      id: '' as SessionId,
      userId: '' as UserId,
      state: 'ACTIVE',
      mode: 'standard',
      cardIds: [],
      currentCardIndex: 0,
      startedAt: new Date(0).toISOString(),
      pausedAt: null,
      completedAt: null,
      abandonedAt: null,
      expiresAt: new Date(0).toISOString(),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  }

  const session = value as Record<string, unknown>;
  const stats =
    typeof session['stats'] === 'object' && session['stats'] !== null
      ? (session['stats'] as Record<string, unknown>)
      : {};
  const queueSize =
    typeof session['initialQueueSize'] === 'number'
      ? Math.max(0, session['initialQueueSize'])
      : 0;
  const reviewedCount =
    typeof stats['uniqueCardsReviewed'] === 'number'
      ? Math.max(0, stats['uniqueCardsReviewed'])
      : 0;

  return {
    id: String(session['id'] ?? '') as SessionId,
    userId: String(session['userId'] ?? '') as UserId,
    state: normalizeSessionState(String(session['state'] ?? 'active')),
    mode: normalizeSessionMode(String(session['mode'] ?? session['learningMode'] ?? 'standard')),
    cardIds: Array.from({ length: queueSize }, () => '' as CardId),
    currentCardIndex: Math.min(reviewedCount, queueSize),
    startedAt: String(session['startedAt'] ?? session['createdAt'] ?? new Date(0).toISOString()),
    pausedAt:
      typeof session['pausedAt'] === 'string'
        ? session['pausedAt']
        : typeof session['lastPausedAt'] === 'string'
          ? session['lastPausedAt']
          : null,
    completedAt:
      typeof session['completedAt'] === 'string' ? session['completedAt'] : null,
    abandonedAt:
      session['terminationReason'] === 'abandoned'
        ? String(session['updatedAt'] ?? session['completedAt'] ?? new Date().toISOString())
        : null,
    expiresAt: String(
      session['expiresAt'] ??
        session['lastActivityAt'] ??
        session['updatedAt'] ??
        new Date(0).toISOString()
    ),
    createdAt: String(session['createdAt'] ?? session['startedAt'] ?? new Date(0).toISOString()),
    updatedAt: String(session['updatedAt'] ?? session['lastActivityAt'] ?? new Date(0).toISOString()),
  };
}

function normalizeSessionState(value: string): SessionResponse['data']['state'] {
  const upper = value.toUpperCase();
  if (
    upper === 'ACTIVE' ||
    upper === 'PAUSED' ||
    upper === 'COMPLETED' ||
    upper === 'ABANDONED' ||
    upper === 'EXPIRED'
  ) {
    return upper;
  }

  return 'ACTIVE';
}

function normalizeSessionMode(value: string): SessionResponse['data']['mode'] {
  if (value === 'cram' || value === 'preview' || value === 'test') {
    return value;
  }

  return 'standard';
}

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

  injectCard: (sessionId: SessionId, cardId: CardId): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/inject`, { cardId }),

  removeCard: (sessionId: SessionId, cardId: CardId): Promise<SessionQueueResponse> =>
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
  getToken: (cardIds: CardId[]): Promise<OfflineTokenResponse> =>
    http.post('/v1/sessions/offline-intents', { cardIds }),

  verifyAndSubmit: (data: IOfflineIntentVerifyInput): Promise<AttemptsListResponse> =>
    http.post('/v1/sessions/offline-intents/verify', data),
};
