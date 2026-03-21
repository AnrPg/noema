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
      .post<
        SessionResponse | SessionEnvelopeResponse
      >('/v1/sessions', normalizeStartSessionInput(data))
      .then(normalizeSessionResponse),

  listSessions: (filters?: ISessionFilters): Promise<SessionsListResponse> => {
    if (!filters) {
      return http
        .get<SessionListEnvelopeResponse | SessionsListResponse>('/v1/sessions')
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

const LEGACY_MODE_TO_LEARNING_MODE = {
  standard: 'exploration',
  cram: 'goal_driven',
  test: 'exam_oriented',
  preview: 'synthesis',
} as const;

function normalizeStartSessionInput(data: IStartSessionInput): Record<string, unknown> {
  const initialCardIds = data.initialCardIds ?? data.cardIds;
  const learningMode =
    data.learningMode ??
    (data.mode !== undefined ? LEGACY_MODE_TO_LEARNING_MODE[data.mode] : 'exploration');

  return {
    deckQueryId: data.deckQueryId ?? createPrefixedId('deck_'),
    learningMode,
    ...(data.teachingApproach !== undefined ? { teachingApproach: data.teachingApproach } : {}),
    ...(data.schedulingAlgorithm !== undefined
      ? { schedulingAlgorithm: data.schedulingAlgorithm }
      : {}),
    ...(data.loadoutId !== undefined ? { loadoutId: data.loadoutId } : {}),
    ...(data.loadoutArchetype !== undefined ? { loadoutArchetype: data.loadoutArchetype } : {}),
    config: {
      sessionTimeoutHours: data.config?.sessionTimeoutHours ?? 24,
      ...(data.config?.maxCards !== undefined
        ? { maxCards: data.config.maxCards }
        : initialCardIds !== undefined
          ? { maxCards: initialCardIds.length }
          : {}),
      ...(data.config?.maxDurationMinutes !== undefined
        ? { maxDurationMinutes: data.config.maxDurationMinutes }
        : {}),
      ...(data.config?.categoryIds !== undefined ? { categoryIds: data.config.categoryIds } : {}),
      ...(data.config?.cardTypes !== undefined ? { cardTypes: data.config.cardTypes } : {}),
    },
    initialCardIds,
    ...(data.blueprint !== undefined ? { blueprint: data.blueprint } : {}),
    ...(data.offlineIntentToken !== undefined
      ? { offlineIntentToken: data.offlineIntentToken }
      : {}),
  };
}

function createPrefixedId(prefix: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const values = new Uint8Array(21);

  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  const suffix = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  return `${prefix}${suffix}`;
}

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

function normalizeSessionResponse(
  response: SessionResponse | SessionEnvelopeResponse
): SessionResponse {
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
    typeof session['initialQueueSize'] === 'number' ? Math.max(0, session['initialQueueSize']) : 0;
  const reviewedCount =
    typeof stats['uniqueCardsReviewed'] === 'number'
      ? Math.max(0, stats['uniqueCardsReviewed'])
      : 0;

  return {
    id: stringValue(session['id']) as SessionId,
    userId: stringValue(session['userId']) as UserId,
    state: normalizeSessionState(stringValue(session['state'], 'active')),
    mode: normalizeSessionMode(stringValue(session['mode'] ?? session['learningMode'], 'standard')),
    cardIds: Array.from({ length: queueSize }, () => '' as CardId),
    currentCardIndex: Math.min(reviewedCount, queueSize),
    startedAt: stringValue(session['startedAt'] ?? session['createdAt'], new Date(0).toISOString()),
    pausedAt:
      typeof session['pausedAt'] === 'string'
        ? session['pausedAt']
        : typeof session['lastPausedAt'] === 'string'
          ? session['lastPausedAt']
          : null,
    completedAt: typeof session['completedAt'] === 'string' ? session['completedAt'] : null,
    abandonedAt:
      session['terminationReason'] === 'abandoned'
        ? stringValue(session['updatedAt'] ?? session['completedAt'], new Date().toISOString())
        : null,
    expiresAt: stringValue(
      session['expiresAt'] ?? session['lastActivityAt'] ?? session['updatedAt'],
      new Date(0).toISOString()
    ),
    createdAt: stringValue(session['createdAt'] ?? session['startedAt'], new Date(0).toISOString()),
    updatedAt: stringValue(
      session['updatedAt'] ?? session['lastActivityAt'],
      new Date(0).toISOString()
    ),
  };
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
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
    http
      .get<AttemptsListResponse | AttemptsEnvelopeResponse>(`/v1/sessions/${sessionId}/attempts`)
      .then(normalizeAttemptsListResponse),

  requestHint: (sessionId: SessionId): Promise<HintResponse> =>
    http.post(`/v1/sessions/${sessionId}/attempts/hint`, {}),
};

type AttemptsEnvelopeResponse = Omit<AttemptsListResponse, 'data'> & {
  data: unknown;
};

function normalizeAttemptsListResponse(
  response: AttemptsListResponse | AttemptsEnvelopeResponse
): AttemptsListResponse {
  const rawData = response.data;

  if (Array.isArray(rawData)) {
    return response as AttemptsListResponse;
  }

  const attempts = extractAttempts(rawData).map(normalizeAttemptDto);

  return {
    ...response,
    data: attempts,
  };
}

function extractAttempts(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const candidate = value as Record<string, unknown>;

  if (Array.isArray(candidate['attempts'])) {
    return candidate['attempts'];
  }

  if (Array.isArray(candidate['items'])) {
    return candidate['items'];
  }

  return [];
}

function normalizeAttemptDto(value: unknown): AttemptsListResponse['data'][number] {
  if (typeof value !== 'object' || value === null) {
    return {
      id: '' as AttemptResponse['data']['id'],
      sessionId: '' as SessionId,
      cardId: '' as CardId,
      grade: 0,
      confidenceBefore: null,
      confidenceAfter: null,
      calibrationDelta: null,
      hintDepthUsed: 0,
      dwellTimeMs: 0,
      selfReportedGuess: false,
      reviewedAt: new Date(0).toISOString(),
      createdAt: new Date(0).toISOString(),
    };
  }

  const attempt = value as Record<string, unknown>;

  return {
    id: stringValue(attempt['id']) as AttemptResponse['data']['id'],
    sessionId: stringValue(attempt['sessionId']) as SessionId,
    cardId: stringValue(attempt['cardId']) as CardId,
    grade: typeof attempt['grade'] === 'number' ? attempt['grade'] : 0,
    confidenceBefore:
      typeof attempt['confidenceBefore'] === 'number' ? attempt['confidenceBefore'] : null,
    confidenceAfter:
      typeof attempt['confidenceAfter'] === 'number' ? attempt['confidenceAfter'] : null,
    calibrationDelta:
      typeof attempt['calibrationDelta'] === 'number' ? attempt['calibrationDelta'] : null,
    hintDepthUsed: typeof attempt['hintDepthUsed'] === 'number' ? attempt['hintDepthUsed'] : 0,
    dwellTimeMs: typeof attempt['dwellTimeMs'] === 'number' ? attempt['dwellTimeMs'] : 0,
    selfReportedGuess: attempt['selfReportedGuess'] === true,
    reviewedAt: stringValue(attempt['reviewedAt'], new Date(0).toISOString()),
    createdAt: stringValue(
      attempt['createdAt'],
      stringValue(attempt['reviewedAt'], new Date(0).toISOString())
    ),
  };
}

// ============================================================================
// Queue API
// ============================================================================

export const queueApi = {
  getQueue: (sessionId: SessionId): Promise<SessionQueueResponse> =>
    http
      .get<SessionQueueResponse | SessionQueueEnvelopeResponse>(`/v1/sessions/${sessionId}/queue`)
      .then(normalizeSessionQueueResponse),

  injectCard: (sessionId: SessionId, cardId: CardId): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/inject`, { cardId }),

  removeCard: (sessionId: SessionId, cardId: CardId): Promise<SessionQueueResponse> =>
    http.post(`/v1/sessions/${sessionId}/queue/remove`, { cardId }),
};

type SessionQueueEnvelopeResponse = Omit<SessionQueueResponse, 'data'> & {
  data: unknown;
};

function normalizeSessionQueueResponse(
  response: SessionQueueResponse | SessionQueueEnvelopeResponse
): SessionQueueResponse {
  const rawData = response.data;

  if (
    typeof rawData === 'object' &&
    rawData !== null &&
    'items' in rawData &&
    Array.isArray((rawData as { items?: unknown }).items)
  ) {
    return response as SessionQueueResponse;
  }

  const normalizedItems = Array.isArray(rawData)
    ? rawData.map((item, index) => normalizeSessionQueueItem(item, index))
    : [];
  const items = normalizedItems.map(({ sessionId: _sessionId, ...item }) => item);

  return {
    ...response,
    data: {
      sessionId: normalizedItems[0]?.sessionId ?? ('' as SessionId),
      items,
      remaining: items.filter((item) => !item.injected).length,
    },
  };
}

function normalizeSessionQueueItem(
  value: unknown,
  fallbackIndex: number
): SessionQueueResponse['data']['items'][number] & { sessionId: SessionId } {
  if (typeof value !== 'object' || value === null) {
    return {
      sessionId: '' as SessionId,
      cardId: '' as CardId,
      position: fallbackIndex,
      injected: false,
    };
  }

  const item = value as Record<string, unknown>;
  const status = stringValue(item['status']).toLowerCase();

  return {
    sessionId: stringValue(item['sessionId']) as SessionId,
    cardId: stringValue(item['cardId']) as CardId,
    position: typeof item['position'] === 'number' ? item['position'] : fallbackIndex,
    injected: status === 'injected' || item['injectedBy'] !== null,
  };
}

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
