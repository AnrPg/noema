/**
 * @noema/user-service - REST API Routes
 *
 * Fastify route definitions for user endpoints.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  EmailAlreadyExistsError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../domain/user-service/errors/index.js';
import type { IExecutionContext, UserService } from '../../domain/user-service/user.service.js';
import type {
  IChangePasswordInput,
  ICreateUserInput,
  ILoginInput,
  IUpdateProfileInput,
  IUpdateSettingsInput,
  IUserFilters,
} from '../../types/user.types.js';
import { type UserRole } from '../../types/user.types.js';

// Module augmentation to extend FastifySchema with OpenAPI properties
declare module 'fastify' {
  interface FastifySchema {
    tags?: string[];
    summary?: string;
    description?: string;
    deprecated?: boolean;
    operationId?: string;
    security?: unknown[];
    consumes?: string[];
    produces?: string[];
    externalDocs?: { description?: string; url: string };
  }
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface IdParams {
  id: string;
}

interface UpdateBody<T> {
  data: T;
  version: number;
}

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register user routes.
 */
export async function registerUserRoutes(
  fastify: FastifyInstance,
  userService: UserService,
  authMiddleware?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
  tokenService?: {
    generateTokenPair(user: unknown): Promise<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: 'Bearer';
    }>;
  }
): Promise<void> {
  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Build execution context from request.
   */
  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string; roles?: string[] } | undefined;
    const userAgent = request.headers['user-agent'];
    const context: IExecutionContext = {
      userId: (user?.sub as UserId) || null,
      correlationId:
        (request.id as CorrelationId) || (`correlation_${Date.now()}` as CorrelationId),
      roles: (user?.roles as UserRole[]) || [],
      clientIp: request.ip,
    };
    if (userAgent) {
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
        executionTime: 0, // Set by hook
      },
    };
  }

  /**
   * Error handler.
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
    } else if (
      error instanceof EmailAlreadyExistsError ||
      error instanceof UsernameAlreadyExistsError
    ) {
      reply.status(409).send({
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
  // Auth Routes
  // ============================================================================

  /**
   * POST /auth/register - Register new user
   */
  fastify.post<{ Body: ICreateUserInput }>(
    '/auth/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user',
        body: {
          type: 'object',
          required: ['username', 'email', 'password', 'country'],
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 30 },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            displayName: { type: 'string' },
            language: { type: 'string' },
            timezone: { type: 'string' },
            country: { type: 'string', minLength: 2, maxLength: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.create(request.body, context);

        // Generate tokens for immediate login after registration
        if (tokenService) {
          const tokens = await tokenService.generateTokenPair(result.data);
          reply
            .status(201)
            .send(wrapResponse({ user: result.data, tokens }, result.agentHints, request));
        } else {
          reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
        }
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /auth/login - User login
   */
  fastify.post<{ Body: ILoginInput }>(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Authenticate user',
        body: {
          type: 'object',
          required: ['identifier', 'password'],
          properties: {
            identifier: { type: 'string' },
            password: { type: 'string' },
            mfaCode: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.login(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /auth/refresh - Refresh access token
   */
  fastify.post<{ Body: { refreshToken: string } }>(
    '/auth/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.refreshToken(request.body.refreshToken, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // User Routes
  // ============================================================================

  /**
   * GET /users/:id - Get user by ID
   */
  fastify.get<{ Params: IdParams }>(
    '/users/:id',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'Get user by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.findById(request.params.id as UserId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * GET /users - List users (admin only)
   */
  fastify.get<{ Querystring: IUserFilters & { offset?: number; limit?: number } }>(
    '/users',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'List users (admin only)',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            emailVerified: { type: 'boolean' },
            search: { type: 'string' },
            offset: { type: 'number', default: 0 },
            limit: { type: 'number', default: 20, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const { offset = 0, limit = 20, ...filters } = request.query;
        const result = await userService.find(filters, { offset, limit }, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /users/:id/profile - Update user profile
   */
  fastify.patch<{ Params: IdParams; Body: UpdateBody<IUpdateProfileInput> }>(
    '/users/:id/profile',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'Update user profile',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['data', 'version'],
          properties: {
            data: {
              type: 'object',
              properties: {
                displayName: { type: 'string' },
                bio: { type: 'string', nullable: true },
                avatarUrl: { type: 'string', nullable: true },
                timezone: { type: 'string' },
                language: { type: 'string' },
                country: { type: 'string', nullable: true },
              },
            },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.updateProfile(
          request.params.id as UserId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /users/:id/settings - Update user settings
   */
  fastify.patch<{ Params: IdParams; Body: UpdateBody<IUpdateSettingsInput> }>(
    '/users/:id/settings',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'Update user settings',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['data', 'version'],
          properties: {
            data: { type: 'object' },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.updateSettings(
          request.params.id as UserId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /users/:id/password - Change password
   */
  fastify.post<{ Params: IdParams; Body: IChangePasswordInput & { version: number } }>(
    '/users/:id/password',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'Change user password',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword', 'version'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const { version, ...passwordInput } = request.body;
        const result = await userService.changePassword(
          request.params.id as UserId,
          passwordInput,
          version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * DELETE /users/:id - Delete user
   */
  fastify.delete<{ Params: IdParams; Querystring: { soft?: boolean } }>(
    '/users/:id',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Users'],
        summary: 'Delete user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            soft: { type: 'boolean', default: true },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        await userService.delete(
          request.params.id as UserId,
          request.query.soft !== false,
          context
        );
        reply.status(204).send();
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // Me Routes (Current User Shortcuts)
  // ============================================================================

  /**
   * GET /me - Get current user
   */
  fastify.get(
    '/me',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Me'],
        summary: 'Get current user profile',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        if (!context.userId) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
          return;
        }
        const result = await userService.findById(context.userId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /me/profile - Update current user profile
   */
  fastify.patch<{ Body: UpdateBody<IUpdateProfileInput> }>(
    '/me/profile',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Me'],
        summary: 'Update current user profile',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        if (!context.userId) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
          return;
        }
        const result = await userService.updateProfile(
          context.userId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * GET /me/settings - Get current user settings
   */
  fastify.get(
    '/me/settings',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Me'],
        summary: 'Get current user settings',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        if (!context.userId) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
          return;
        }
        const result = await userService.findById(context.userId, context);
        reply.send(wrapResponse(result.data.settings, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /me/settings - Update current user settings
   */
  fastify.patch<{ Body: UpdateBody<IUpdateSettingsInput> }>(
    '/me/settings',
    {
      ...(authMiddleware && { preHandler: [authMiddleware] }),
      schema: {
        tags: ['Me'],
        summary: 'Update current user settings',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        if (!context.userId) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
          return;
        }
        const result = await userService.updateSettings(
          context.userId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
