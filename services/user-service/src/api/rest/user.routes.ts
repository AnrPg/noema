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
  ExternalServiceError,
  TokenAlreadyUsedError,
  TokenExpiredError,
  TokenNotFoundError,
  TooManyLoginAttemptsError,
  UsernameAlreadyExistsError,
  UsernameChangeTooSoonError,
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
  IUser,
  IUserFilters,
} from '../../types/user.types.js';
import { type UserRole } from '../../types/user.types.js';

// Module augmentation to extend FastifySchema with OpenAPI properties
declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
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

interface IIdParams {
  id: string;
}

interface IUpdateBody<T> {
  data: T;
  version: number;
}

interface IListUsersQuery extends Omit<IUserFilters, 'roles'> {
  offset?: number;
  limit?: number;
  roles?: UserRole[] | string[] | string;
}

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register user routes.
 *
 * @param authMiddleware — REQUIRED. If not provided, the service fails fast
 *   at startup to prevent silently unprotected routes.
 */
export function registerUserRoutes(
  fastify: FastifyInstance,
  userService: UserService,
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
  tokenService?: {
    generateTokenPair(user: unknown): Promise<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: 'Bearer';
    }>;
  }
): void {
  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Build execution context from request.
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
        executionTime: 0, // Set by hook
      },
    };
  }

  function mapUserSettingsResponse(user: IUser): {
    userId: UserId;
    version: number;
    theme: 'light' | 'dark' | 'system';
    emailNotifications: boolean;
    pushNotifications: boolean;
    dailyGoal: number;
    studyReminders: boolean;
    reminderTime: string | null;
    soundEnabled: boolean;
    hapticEnabled: boolean;
    activeStudyMode?: string;
    pomodoro: IUser['settings']['pomodoro'];
  } {
    return {
      userId: user.id,
      theme: user.settings.theme,
      emailNotifications: user.settings.emailAchievements && user.settings.emailStreakReminders,
      pushNotifications: user.settings.pushNotificationsEnabled,
      dailyGoal: user.settings.defaultNewCardsPerDay,
      studyReminders: user.settings.dailyReminderEnabled,
      reminderTime: user.settings.dailyReminderTime,
      soundEnabled: user.settings.soundEnabled,
      hapticEnabled: user.settings.hapticEnabled,
      activeStudyMode: user.settings.activeStudyMode,
      pomodoro: user.settings.pomodoro,
      version: user.version,
    };
  }

  function mapUpdateSettingsInput(input: IUpdateSettingsInput): IUpdateSettingsInput {
    const rawInput = input as IUpdateSettingsInput & {
      emailNotifications?: boolean;
      pushNotifications?: boolean;
      dailyGoal?: number;
      studyReminders?: boolean;
      reminderTime?: string | null;
    };
    const mappedInput: IUpdateSettingsInput = {};

    if (rawInput.theme !== undefined) {
      mappedInput.theme = rawInput.theme;
    }
    if (rawInput.soundEnabled !== undefined) {
      mappedInput.soundEnabled = rawInput.soundEnabled;
    }
    if (rawInput.hapticEnabled !== undefined) {
      mappedInput.hapticEnabled = rawInput.hapticEnabled;
    }
    if (rawInput.activeStudyMode !== undefined) {
      mappedInput.activeStudyMode = rawInput.activeStudyMode;
    }
    if (rawInput.pomodoro !== undefined) {
      mappedInput.pomodoro = rawInput.pomodoro;
    }
    if (rawInput.emailNotifications !== undefined) {
      mappedInput.emailAchievements = rawInput.emailNotifications;
      mappedInput.emailStreakReminders = rawInput.emailNotifications;
    }
    if (rawInput.pushNotifications !== undefined) {
      mappedInput.pushNotificationsEnabled = rawInput.pushNotifications;
    }
    if (rawInput.dailyGoal !== undefined) {
      mappedInput.defaultNewCardsPerDay = rawInput.dailyGoal;
      mappedInput.defaultReviewCardsPerDay = rawInput.dailyGoal;
    }
    if (rawInput.studyReminders !== undefined) {
      mappedInput.dailyReminderEnabled = rawInput.studyReminders;
    }
    if (rawInput.reminderTime !== undefined) {
      mappedInput.dailyReminderTime = rawInput.reminderTime;
    }

    return mappedInput;
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
    } else if (error instanceof TokenExpiredError) {
      reply.status(410).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof TokenAlreadyUsedError) {
      reply.status(410).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof TokenNotFoundError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
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
      const status =
        error instanceof UsernameChangeTooSoonError
          ? 429
          : error instanceof TooManyLoginAttemptsError
            ? 429
            : 422;
      reply.status(status).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
          ...(error instanceof UsernameChangeTooSoonError
            ? { nextAllowedAt: error.nextAllowedAt }
            : {}),
          ...(error instanceof TooManyLoginAttemptsError
            ? { remainingAttempts: error.remainingAttempts }
            : {}),
        },
      });
    } else if (error instanceof ExternalServiceError) {
      reply.status(502).send({
        error: {
          code: error.code,
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

  function normalizeListUsersQuery(query: IListUsersQuery): IUserFilters & {
    offset: number;
    limit: number;
  } {
    const { offset = 0, limit = 20, roles, ...filters } = query;
    const normalizedRoles =
      roles === undefined
        ? undefined
        : Array.isArray(roles)
          ? (roles as UserRole[])
          : [roles as UserRole];

    return {
      ...filters,
      ...(normalizedRoles !== undefined ? { roles: normalizedRoles } : {}),
      offset,
      limit,
    };
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
          required: ['username', 'email', 'password', 'country', 'languages'],
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 30 },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            displayName: { type: 'string' },
            languages: {
              type: 'array',
              minItems: 1,
              items: { type: 'string' },
            },
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
        if (tokenService !== undefined) {
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

  /**
   * POST /auth/logout - Logout current session
   */
  fastify.post<{ Body: { refreshToken: string } }>(
    '/auth/logout',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Auth'],
        summary: 'Logout user and revoke current refresh token',
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
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ') !== true) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Missing bearer token',
            },
          });
          return;
        }

        const accessToken = authHeader.slice(7);
        const result = await userService.logout(request.body.refreshToken, context, accessToken);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /auth/logout-all - Logout all devices
   */
  fastify.post(
    '/auth/logout-all',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Auth'],
        summary: 'Logout all devices and revoke all refresh tokens',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ') !== true) {
          reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Missing bearer token',
            },
          });
          return;
        }

        const accessToken = authHeader.slice(7);
        const result = await userService.logoutAll(context, accessToken);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // Password Reset Routes (T1.2)
  // ============================================================================

  /**
   * POST /auth/forgot-password - Request password reset
   */
  fastify.post<{ Body: { email: string } }>(
    '/auth/forgot-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: (request: FastifyRequest) => {
            const body = request.body as { email?: string } | undefined;
            return `forgot-password:${body?.email ?? request.ip}`;
          },
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Request password reset email',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.forgotPassword(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /auth/reset-password - Reset password with token
   */
  fastify.post<{ Body: { token: string; newPassword: string } }>(
    '/auth/reset-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset password using a reset token',
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.resetPassword(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // Email Verification Routes (T1.3)
  // ============================================================================

  /**
   * POST /auth/verify-email - Verify email with token
   */
  fastify.post<{ Body: { token: string } }>(
    '/auth/verify-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify email address using a verification token',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.verifyEmail(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /auth/resend-verification - Resend verification email
   */
  fastify.post(
    '/auth/resend-verification',
    {
      preHandler: [authMiddleware],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Resend email verification link (requires authentication)',
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.resendVerification(context);
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
  fastify.get<{ Params: IIdParams }>(
    '/users/:id',
    {
      preHandler: [authMiddleware],
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
  fastify.get<{ Querystring: IListUsersQuery }>(
    '/users',
    {
      preHandler: [authMiddleware],
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
        const { offset, limit, ...filters } = normalizeListUsersQuery(request.query);
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
  fastify.patch<{ Params: IIdParams; Body: IUpdateBody<IUpdateProfileInput> }>(
    '/users/:id/profile',
    {
      preHandler: [authMiddleware],
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
                languages: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string' },
                },
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
  fastify.patch<{ Params: IIdParams; Body: IUpdateBody<IUpdateSettingsInput> }>(
    '/users/:id/settings',
    {
      preHandler: [authMiddleware],
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
          mapUpdateSettingsInput(request.body.data),
          request.body.version,
          context
        );
        reply.send(wrapResponse(mapUserSettingsResponse(result.data), result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /users/:id/password - Change password
   */
  fastify.post<{ Params: IIdParams; Body: IChangePasswordInput & { version: number } }>(
    '/users/:id/password',
    {
      preHandler: [authMiddleware],
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
  fastify.delete<{ Params: IIdParams; Querystring: { soft?: boolean } }>(
    '/users/:id',
    {
      preHandler: [authMiddleware],
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
  // Username & Email Change Routes (T1.4)
  // ============================================================================

  /**
   * PATCH /users/:id/username - Change username
   */
  fastify.patch<{ Params: IIdParams; Body: { username: string; version: number } }>(
    '/users/:id/username',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Users'],
        summary: 'Change username (owner or admin)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['username', 'version'],
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 30 },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.changeUsername(
          request.params.id as UserId,
          request.body,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /users/:id/email - Start email change flow
   */
  fastify.patch<{ Params: IIdParams; Body: { newEmail: string; password: string } }>(
    '/users/:id/email',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Users'],
        summary: 'Start email change process (owner or admin)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['newEmail', 'password'],
          properties: {
            newEmail: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await userService.changeEmail(
          request.params.id as UserId,
          request.body,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
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
      preHandler: [authMiddleware],
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
  fastify.patch<{ Body: IUpdateBody<IUpdateProfileInput> }>(
    '/me/profile',
    {
      preHandler: [authMiddleware],
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
      preHandler: [authMiddleware],
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
        reply.send(wrapResponse(mapUserSettingsResponse(result.data), result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /me/settings - Update current user settings
   */
  fastify.patch<{ Body: IUpdateBody<IUpdateSettingsInput> }>(
    '/me/settings',
    {
      preHandler: [authMiddleware],
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
          mapUpdateSettingsInput(request.body.data),
          request.body.version,
          context
        );
        reply.send(wrapResponse(mapUserSettingsResponse(result.data), result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
