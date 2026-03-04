/**
 * @noema/content-service - Shared Route Helpers
 *
 * Common utilities shared across all REST route modules.
 * Eliminates duplication of buildContext, wrapResponse, handleError,
 * buildErrorMetadata, and attachStartTimeHook.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IExecutionContext } from '../../domain/content-service/content.service.js';
import {
  AuthenticationError,
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  DomainError,
  DuplicateCardError,
  ExternalServiceError,
  ValidationError,
  VersionConflictError,
} from '../../domain/content-service/errors/index.js';
import { MediaNotFoundError } from '../../domain/content-service/media.service.js';
import { TemplateNotFoundError } from '../../domain/content-service/template.service.js';

// ============================================================================
// Constants
// ============================================================================

const SERVICE_NAME = 'content-service';
const SERVICE_VERSION = '0.1.0';

// ============================================================================
// Route Options
// ============================================================================

/**
 * Shared options passed to route registrars from the bootstrap.
 * Contains rate-limit and body-size configuration.
 */
export interface IRouteOptions {
  rateLimit?: {
    writeMax: number;
    batchMax: number;
    timeWindow: number;
  };
  bodyLimits?: {
    defaultLimit: number;
    batchLimit: number;
  };
}

// ============================================================================
// Request Augmentation
// ============================================================================

/**
 * Extended request type that includes the start-time marker
 * set by {@link attachStartTimeHook}.
 */
interface ITimedRequest extends FastifyRequest {
  startTime?: number;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Minimal logger interface accepted by {@link handleError}.
 * Compatible with both pino.Logger and FastifyBaseLogger.
 */
interface IErrorLogger {
  error(obj: unknown, msg?: string): void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build execution context from an authenticated Fastify request.
 */
export function buildContext(request: FastifyRequest): IExecutionContext {
  const user = request.user as { sub?: string; roles?: string[] } | undefined;
  const userAgent = request.headers['user-agent'];
  const context: IExecutionContext = {
    userId: (user?.sub ?? null) as UserId | null,
    correlationId: request.id as CorrelationId,
    roles: user?.roles ?? [],
    clientIp: request.ip,
  };
  if (userAgent !== undefined) {
    context.userAgent = userAgent;
  }
  return context;
}

/**
 * Wrap a successful result in the standard {@link IApiResponse} envelope.
 */
export function wrapResponse<T>(
  data: T,
  agentHints: unknown,
  request: FastifyRequest,
): IApiResponse<T> {
  const startTime = (request as ITimedRequest).startTime ?? Date.now();
  return {
    data,
    agentHints: agentHints as IApiResponse<T>['agentHints'],
    metadata: {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: SERVICE_NAME,
      serviceVersion: SERVICE_VERSION,
      executionTime: Date.now() - startTime,
    },
  };
}

/**
 * Build the `metadata` block used in error responses.
 */
export function buildErrorMetadata(request: FastifyRequest): Record<string, unknown> {
  const startTime = (request as ITimedRequest).startTime ?? Date.now();
  return {
    requestId: request.id,
    timestamp: new Date().toISOString(),
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Unified error handler — maps domain errors to HTTP status codes.
 *
 * **Ordering contract:**
 * Specific not-found errors (`CardNotFoundError`, `TemplateNotFoundError`,
 * `MediaNotFoundError`) are checked *before* their parent classes
 * (`BusinessRuleError`, `DomainError`) to preserve error-code granularity.
 */
export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  logger: IErrorLogger,
): void {
  const metadata = buildErrorMetadata(request);

  // 400 — Validation
  if (error instanceof ValidationError) {
    reply.status(400).send({
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      },
      metadata,
    });
    return;
  }

  // 404 — Card not found
  if (error instanceof CardNotFoundError) {
    reply.status(404).send({
      error: {
        code: error.code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 404 — Template not found
  if (error instanceof TemplateNotFoundError) {
    reply.status(404).send({
      error: {
        code: 'TEMPLATE_NOT_FOUND',
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 404 — Media not found
  if (error instanceof MediaNotFoundError) {
    reply.status(404).send({
      error: {
        code: 'MEDIA_NOT_FOUND',
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 409 — Duplicate content
  if (error instanceof DuplicateCardError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          existingCardId: error.existingCardId,
          existingCard: error.existingCard ?? null,
        },
      },
      metadata,
    });
    return;
  }

  // 409 — Version conflict
  if (error instanceof VersionConflictError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        },
      },
      metadata,
    });
    return;
  }

  // 401 — Authentication
  if (error instanceof AuthenticationError) {
    reply.status(401).send({
      error: {
        code: (error as DomainError).code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 403 — Authorization
  if (error instanceof AuthorizationError) {
    reply.status(403).send({
      error: {
        code: error.code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 422 — Batch limit exceeded
  if (error instanceof BatchLimitExceededError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          limit: error.limit,
          requested: error.requested,
        },
      },
      metadata,
    });
    return;
  }

  // 422 — Business rule violation
  if (error instanceof BusinessRuleError) {
    reply.status(422).send({
      error: {
        code: (error as DomainError).code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 502 — External service failure
  if (error instanceof ExternalServiceError) {
    reply.status(502).send({
      error: {
        code: error.code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 400 — Generic domain error
  if (error instanceof DomainError) {
    reply.status(400).send({
      error: {
        code: error.code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 500 — Unknown / unhandled error
  logger.error(error);
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    metadata,
  });
}

/**
 * Register the `onRequest` hook that stamps each request with a
 * high-resolution start time (used by {@link wrapResponse} and
 * {@link buildErrorMetadata} for `executionTime` computation).
 */
export function attachStartTimeHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request) => {
    (request as ITimedRequest).startTime = Date.now();
  });
}
