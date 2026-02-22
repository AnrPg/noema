/**
 * @noema/user-service - Session Orchestration Client
 *
 * Strict orchestration client used on logout flows.
 * It pauses an active learning session before logout succeeds.
 */

import type { UserId } from '@noema/types';
import type { Logger } from 'pino';
import { ExternalServiceError } from '../../domain/user-service/errors/index.js';

interface ISessionListResponse {
  data?: {
    sessions?: { id: string }[];
    total?: number;
  };
}

export interface ISessionOrchestrationConfig {
  sessionServiceUrl: string;
  requestTimeoutMs: number;
}

export interface ISessionOrchestrationService {
  pauseActiveSessionStrict(input: {
    userId: UserId;
    accessToken: string;
    correlationId: string;
    reason: string;
  }): Promise<{ paused: boolean; sessionId?: string }>;
}

export class SessionOrchestrationService implements ISessionOrchestrationService {
  private readonly logger: Logger;

  constructor(
    private readonly config: ISessionOrchestrationConfig,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'SessionOrchestrationService' });
  }

  async pauseActiveSessionStrict(input: {
    userId: UserId;
    accessToken: string;
    correlationId: string;
    reason: string;
  }): Promise<{ paused: boolean; sessionId?: string }> {
    const activeSessionId = await this.getActiveSessionId(input.accessToken, input.correlationId);

    if (activeSessionId === null) {
      this.logger.debug({ userId: input.userId }, 'No active session found during logout');
      return { paused: false };
    }

    const response = await this.callSessionApi(
      `/v1/sessions/${activeSessionId}/pause`,
      input.accessToken,
      input.correlationId,
      {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }
    );

    if (!response.ok) {
      const details = await this.safeReadBody(response);
      throw new ExternalServiceError(
        'session-service',
        `Failed to pause active session ${activeSessionId}: ${String(response.status)} ${details}`
      );
    }

    this.logger.info({ userId: input.userId, sessionId: activeSessionId }, 'Paused active session');
    return { paused: true, sessionId: activeSessionId };
  }

  private async getActiveSessionId(
    accessToken: string,
    correlationId: string
  ): Promise<string | null> {
    const response = await this.callSessionApi(
      '/v1/sessions?state=active&limit=1&offset=0',
      accessToken,
      correlationId,
      { method: 'GET' }
    );

    if (!response.ok) {
      const details = await this.safeReadBody(response);
      throw new ExternalServiceError(
        'session-service',
        `Failed to query active sessions: ${String(response.status)} ${details}`
      );
    }

    const payload = (await response.json()) as ISessionListResponse;
    const firstSession = payload.data?.sessions?.[0];
    return firstSession?.id ?? null;
  }

  private async callSessionApi(
    path: string,
    accessToken: string,
    correlationId: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const headers = new Headers(init.headers ?? undefined);
      headers.set('Authorization', `Bearer ${accessToken}`);
      headers.set('Content-Type', 'application/json');
      headers.set('X-Correlation-Id', correlationId);

      return await fetch(`${this.config.sessionServiceUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError(
          'session-service',
          `Request timed out after ${String(this.config.requestTimeoutMs)}ms`
        );
      }
      const message = error instanceof Error ? error.message : 'Unknown integration error';
      throw new ExternalServiceError('session-service', message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeReadBody(response: Response): Promise<string> {
    try {
      const body = await response.text();
      return body.length > 300 ? `${body.slice(0, 300)}...` : body;
    } catch {
      return 'unable to read response body';
    }
  }
}
