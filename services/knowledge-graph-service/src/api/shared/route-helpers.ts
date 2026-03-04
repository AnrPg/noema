/**
 * @noema/knowledge-graph-service - Shared Route Helpers
 *
 * Common utilities shared across all REST route modules.
 * Eliminates duplication of buildContext, wrapResponse, handleError,
 * buildErrorMetadata, and attachStartTimeHook.
 *
 * Follows the content-service's route-helpers.ts pattern exactly,
 * mapping knowledge-graph-service domain errors to HTTP status codes.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import {
  DomainError,
  RateLimitExceededError,
  UnauthorizedError,
  ValidationError,
} from '../../domain/knowledge-graph-service/errors/base.errors.js';
import {
  CyclicEdgeError,
  DuplicateNodeError,
  EdgeNotFoundError,
  GraphConsistencyError,
  InvalidEdgeTypeError,
  MaxDepthExceededError,
  NodeNotFoundError,
  OrphanEdgeError,
} from '../../domain/knowledge-graph-service/errors/graph.errors.js';
import { InvalidMisconceptionStateTransitionError } from '../../domain/knowledge-graph-service/errors/misconception.errors.js';
import {
  InvalidStateTransitionError,
  MutationAlreadyCommittedError,
  MutationConflictError,
  MutationNotFoundError,
  ValidationFailedError,
} from '../../domain/knowledge-graph-service/errors/mutation.errors.js';
import type { IExecutionContext } from '../../domain/knowledge-graph-service/execution-context.js';

// ============================================================================
// Constants
// ============================================================================

export const SERVICE_NAME = 'knowledge-graph-service';
export const SERVICE_VERSION = '0.1.0';

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
// URL Parameter Schemas
// ============================================================================

/**
 * Reusable Zod schemas for URL path parameter validation.
 * Prevents raw `as` casts by enforcing non-empty string constraints
 * at runtime before domain logic is invoked.
 */
export const UserIdParamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

export const NodeIdParamSchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required'),
});

export const EdgeIdParamSchema = z.object({
  edgeId: z.string().min(1, 'edgeId is required'),
});

export const MutationIdParamSchema = z.object({
  mutationId: z.string().min(1, 'mutationId is required'),
});

export const UserNodeParamSchema = UserIdParamSchema.merge(NodeIdParamSchema);
export const UserEdgeParamSchema = UserIdParamSchema.merge(EdgeIdParamSchema);
export const UserDetectionParamSchema = UserIdParamSchema.extend({
  detectionId: z.string().min(1, 'detectionId is required'),
});

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
  pagination?: { page: number; pageSize: number; total: number }
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
    ...(pagination && {
      pagination: {
        offset: (pagination.page - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        total: pagination.total,
        hasMore: pagination.page * pagination.pageSize < pagination.total,
      },
    }),
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
 * Assert that the authenticated user has access to the requested userId.
 *
 * PKG routes scope data to a specific user. This helper checks that the
 * JWT subject matches the URL's `:userId` param — or the requester has
 * an agent/admin role that bypasses user-scoping.
 */
export function assertUserAccess(request: FastifyRequest, userId: string): void {
  const user = request.user as { sub?: string; roles?: string[] } | undefined;
  if (user?.sub === undefined || user.sub === '') {
    throw new UnauthorizedError('Authentication required', undefined, `users/${userId}/pkg`);
  }
  const isOwner = user.sub === userId;
  const isPrivileged =
    user.roles?.some((r) => r === 'admin' || r === 'agent' || r === 'service') ?? false;

  if (!isOwner && !isPrivileged) {
    throw new UnauthorizedError(
      'You can only access your own personal knowledge graph',
      user.sub,
      `users/${userId}/pkg`
    );
  }
}

/**
 * Assert that the requester is an admin or agent (for CKG mutations).
 */
export function assertAdminOrAgent(request: FastifyRequest): void {
  const user = request.user as { sub?: string; roles?: string[] } | undefined;
  if (user?.sub === undefined || user.sub === '') {
    throw new UnauthorizedError('Authentication required');
  }
  const isPrivileged =
    user.roles?.some((r) => r === 'admin' || r === 'agent' || r === 'service') ?? false;

  if (!isPrivileged) {
    throw new UnauthorizedError(
      'CKG mutations require admin or agent role',
      user.sub,
      'ckg/mutations'
    );
  }
}

/**
 * Unified error handler — maps domain errors to HTTP status codes.
 *
 * **Ordering contract:**
 * Specific errors are checked *before* their parent class (`DomainError`)
 * to preserve error-code granularity and correct status codes.
 */
export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  logger: IErrorLogger
): void {
  const metadata = buildErrorMetadata(request);

  // 400 — Zod validation error (schema parsing failures)
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fieldErrors: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
      metadata,
    });
    return;
  }

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

  // 404 — Node not found
  if (error instanceof NodeNotFoundError) {
    reply.status(404).send({
      error: {
        code: error.code,
        message: error.message,
        details: { nodeId: error.nodeId, graphType: error.graphType },
      },
      metadata,
    });
    return;
  }

  // 404 — Edge not found
  if (error instanceof EdgeNotFoundError) {
    reply.status(404).send({
      error: {
        code: error.code,
        message: error.message,
        details: { edgeId: error.edgeId },
      },
      metadata,
    });
    return;
  }

  // 404 — Mutation not found
  if (error instanceof MutationNotFoundError) {
    reply.status(404).send({
      error: {
        code: error.code,
        message: error.message,
        details: { mutationId: error.mutationId },
      },
      metadata,
    });
    return;
  }

  // 403 — Unauthorized access
  if (error instanceof UnauthorizedError) {
    reply.status(403).send({
      error: {
        code: error.code,
        message: error.message,
      },
      metadata,
    });
    return;
  }

  // 409 — Duplicate node
  if (error instanceof DuplicateNodeError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          label: error.label,
          domain: error.domain,
          existingNodeId: error.existingNodeId,
        },
      },
      metadata,
    });
    return;
  }

  // 409 — Cyclic edge
  if (error instanceof CyclicEdgeError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          edgeType: error.edgeType,
          sourceNodeId: error.sourceNodeId,
          targetNodeId: error.targetNodeId,
          cyclePath: error.cyclePath,
        },
      },
      metadata,
    });
    return;
  }

  // 409 — Mutation conflict (optimistic locking)
  if (error instanceof MutationConflictError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          mutationId: error.mutationId,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        },
      },
      metadata,
    });
    return;
  }

  // 409 — Graph consistency violation
  if (error instanceof GraphConsistencyError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: { invariant: error.invariant, ...error.details },
      },
      metadata,
    });
    return;
  }

  // 422 — Invalid edge type (policy violation)
  if (error instanceof InvalidEdgeTypeError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          edgeType: error.edgeType,
          sourceNodeType: error.sourceNodeType,
          targetNodeType: error.targetNodeType,
          allowedSourceTypes: error.allowedSourceTypes,
          allowedTargetTypes: error.allowedTargetTypes,
        },
      },
      metadata,
    });
    return;
  }

  // 422 — Orphan edge (missing source/target)
  if (error instanceof OrphanEdgeError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          missingNodeId: error.missingNodeId,
          role: error.role,
        },
      },
      metadata,
    });
    return;
  }

  // 422 — Invalid state transition
  if (error instanceof InvalidStateTransitionError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          currentState: error.currentState,
          targetState: error.targetState,
          allowedTargets: error.allowedTargets,
        },
      },
      metadata,
    });
    return;
  }

  // 422 — Validation failed (mutation pipeline)
  if (error instanceof ValidationFailedError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      metadata,
    });
    return;
  }

  // 409 — Mutation already committed (conflict, not validation)
  if (error instanceof MutationAlreadyCommittedError) {
    reply.status(409).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      metadata,
    });
    return;
  }

  // 422 — Max depth exceeded
  if (error instanceof MaxDepthExceededError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: {
          requestedDepth: error.requestedDepth,
          maxAllowed: error.maxAllowed,
        },
      },
      metadata,
    });
    return;
  }

  // 422 — Invalid misconception state transition
  if (error instanceof InvalidMisconceptionStateTransitionError) {
    reply.status(422).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      metadata,
    });
    return;
  }

  // 429 — Rate limit exceeded
  if (error instanceof RateLimitExceededError) {
    reply.status(429).send({
      error: {
        code: error.code,
        message: error.message,
        details: { limit: error.limit, windowMs: error.windowMs },
      },
      metadata,
    });
    return;
  }

  // 400 — Generic domain error (catch-all for DomainError subclasses)
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
  fastify.addHook('onRequest', async (request) => {
    (request as ITimedRequest).startTime = Date.now();
  });
}
