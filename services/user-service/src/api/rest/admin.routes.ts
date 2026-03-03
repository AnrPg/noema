/**
 * @noema/user-service - Admin REST API Routes
 *
 * Fastify route definitions for admin user management (Phase 4).
 * All routes require the `admin:users` JWT scope.
 *
 * Routes:
 *   PATCH  /v1/users/:id/status         — Change user status (T4.1)
 *   PUT    /v1/users/:id/roles          — Set user roles (T4.2)
 *   POST   /v1/users/:id/reset-password — Admin-triggered password reset (T4.3)
 *   GET    /v1/users/:id/sessions       — Login history (T4.4)
 *   GET    /v1/users/:id/audit-log      — Audit log (T4.5)
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AdminUserService } from '../../domain/admin/admin-user.service.js';
import {
  AdminUserParamsSchema,
  AuditLogQuerySchema,
  ChangeUserStatusBodySchema,
  SessionQuerySchema,
  SetUserRolesBodySchema,
} from '../../domain/admin/admin.schemas.js';
import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  UserNotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../domain/user-service/errors/index.js';
import type { IExecutionContext } from '../../domain/user-service/user.service.js';
import type { UserRole } from '../../types/user.types.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register admin user management routes.
 *
 * @param fastify - Fastify instance
 * @param adminService - AdminUserService instance
 * @param authMiddleware - JWT authentication middleware (required for all admin routes)
 */
export function registerAdminRoutes(
  fastify: FastifyInstance,
  adminService: AdminUserService,
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
): void {
  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Build execution context from an authenticated request.
   */
  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string; roles?: string[]; scopes?: string[] } | undefined;
    const userAgent = request.headers['user-agent'];
    const context: IExecutionContext = {
      userId: (user?.sub as UserId | undefined) ?? null,
      correlationId: request.id as CorrelationId,
      roles: (user?.roles as UserRole[] | undefined) ?? [],
      scopes: user?.scopes ?? [],
      clientIp: request.ip,
    };
    if (userAgent !== undefined) {
      context.userAgent = userAgent;
    }
    return context;
  }

  /**
   * Standard response wrapper.
   */
  function wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T> {
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'user-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    };
  }

  /**
   * Error handler for admin routes.
   */
  function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
      });
    } else if (error instanceof UserNotFoundError) {
      reply.status(404).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof VersionConflictError) {
      reply.status(409).send({
        error: {
          code: error.code,
          message: error.message,
          details: {
            expectedVersion: error.expectedVersion,
            actualVersion: error.actualVersion,
          },
        },
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
      });
    } else if (error instanceof AuthenticationError) {
      reply.status(401).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else {
      fastify.log.error(error);
      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  }

  // ============================================================================
  // T4.1 — PATCH /v1/users/:id/status
  // ============================================================================

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/v1/users/:id/status',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Admin'],
        summary: 'Change user account status',
        description:
          'Suspend, ban, or reactivate a user account. Requires admin:users scope. ' +
          'Suspending or banning a user automatically revokes all sessions and refresh tokens.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        // Validate path params
        const params = AdminUserParamsSchema.parse(request.params);

        // Validate body
        const body = ChangeUserStatusBodySchema.parse(request.body);

        const context = buildContext(request);
        const result = await adminService.changeUserStatus(params.id as UserId, body, context);

        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // T4.2 — PUT /v1/users/:id/roles
  // ============================================================================

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/v1/users/:id/roles',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Admin'],
        summary: 'Set user roles',
        description:
          'Declaratively replace all roles for a user. USER role is always implicitly included. ' +
          'Requires admin:users scope.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const params = AdminUserParamsSchema.parse(request.params);
        const body = SetUserRolesBodySchema.parse(request.body);

        const context = buildContext(request);
        const result = await adminService.setUserRoles(params.id as UserId, body, context);

        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // T4.3 — POST /v1/users/:id/reset-password
  // ============================================================================

  fastify.post<{ Params: { id: string } }>(
    '/v1/users/:id/reset-password',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Admin'],
        summary: 'Trigger admin password reset',
        description:
          'Generate a password reset link on behalf of a user. Returns the reset URL ' +
          'for the admin to deliver via a secure channel. Requires admin:users scope.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const params = AdminUserParamsSchema.parse(request.params);

        const context = buildContext(request);
        const result = await adminService.adminResetPassword(params.id as UserId, context);

        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // T4.4 — GET /v1/users/:id/sessions
  // ============================================================================

  fastify.get<{ Params: { id: string }; Querystring: unknown }>(
    '/v1/users/:id/sessions',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Admin'],
        summary: 'Get user login history',
        description:
          'Retrieve paginated session/login history for a user. Supports filtering by ' +
          'session status (active, expired, revoked). Requires admin:users scope.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const params = AdminUserParamsSchema.parse(request.params);
        const query = SessionQuerySchema.parse(request.query);

        const context = buildContext(request);
        const result = await adminService.getLoginHistory(params.id as UserId, query, context);

        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // T4.5 — GET /v1/users/:id/audit-log
  // ============================================================================

  fastify.get<{ Params: { id: string }; Querystring: unknown }>(
    '/v1/users/:id/audit-log',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Admin'],
        summary: 'Get admin action audit log',
        description:
          'Retrieve paginated audit log of admin actions for a user. Supports filtering ' +
          'by action type. Requires admin:users scope.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const params = AdminUserParamsSchema.parse(request.params);
        const query = AuditLogQuerySchema.parse(request.query);

        const context = buildContext(request);
        const result = await adminService.getAuditLog(params.id as UserId, query, context);

        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
