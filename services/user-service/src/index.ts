/**
 * @noema/user-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { ID_PREFIXES, type UserId } from '@noema/types';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { registerAdminRoutes } from './api/rest/admin.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerUserRoutes } from './api/rest/user.routes.js';
import {
  getEventPublisherConfig,
  getSessionOrchestrationConfig,
  getTokenConfig,
  loadConfig,
} from './config/index.js';
import { AdminUserService } from './domain/admin/admin-user.service.js';
import { UserService } from './domain/user-service/user.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaUserRepository } from './infrastructure/database/prisma-user.repository.js';
import { SessionOrchestrationService } from './infrastructure/external-apis/session-orchestration.service.js';
import { JwtTokenService } from './infrastructure/external-apis/token.service.js';
import { PrismaSessionRepository } from './infrastructure/repositories/prisma-session.repository.js';
import { PrismaUserStatusChangeRepository } from './infrastructure/repositories/prisma-user-status-change.repository.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { AuthProvider, Language, Theme, UserRole, UserStatus } from './types/user.types.js';

async function ensureBootstrapAdmin(
  prisma: PrismaClient,
  config: ReturnType<typeof loadConfig>,
  logger: pino.Logger
): Promise<void> {
  if (!config.bootstrapAdmin.enabled) {
    return;
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: config.bootstrapAdmin.email.toLowerCase() },
        { username: config.bootstrapAdmin.username.toLowerCase() },
      ],
      deletedAt: null,
    },
  });

  if (existing) {
    logger.info(
      {
        email: existing.email,
        username: existing.username,
        roles: existing.roles,
      },
      'Bootstrap admin already exists'
    );
    return;
  }

  const passwordHash = await bcrypt.hash(config.bootstrapAdmin.password, config.auth.bcryptRounds);
  const userId = `${ID_PREFIXES.UserId}${nanoid(21)}` as UserId;
  const now = new Date();

  await prisma.user.create({
    data: {
      id: userId,
      username: config.bootstrapAdmin.username.toLowerCase(),
      email: config.bootstrapAdmin.email.toLowerCase(),
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      roles: [UserRole.USER, UserRole.LEARNER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
      authProviders: [AuthProvider.LOCAL],
      profile: {
        displayName: config.bootstrapAdmin.displayName,
        bio: null,
        avatarUrl: null,
        timezone: 'UTC',
        language: Language.EN,
        languages: [Language.EN],
        country: config.bootstrapAdmin.country,
      },
      settings: {
        theme: Theme.SYSTEM,
        dailyReminderEnabled: true,
        dailyReminderTime: '09:00',
        defaultNewCardsPerDay: 20,
        defaultReviewCardsPerDay: 100,
        soundEnabled: true,
        hapticEnabled: true,
        autoAdvanceEnabled: false,
        showTimerEnabled: true,
        emailStreakReminders: true,
        emailAchievements: true,
        pushNotificationsEnabled: true,
        analyticsEnabled: true,
        cognitivePolicy: {
          pacingPolicy: {
            targetSecondsPerCard: 45,
            hardCapSecondsPerCard: 120,
            slowdownOnError: true,
          },
          hintPolicy: {
            maxHintsPerCard: 2,
            progressiveHintsOnly: true,
            allowAnswerReveal: false,
          },
          commitPolicy: {
            requireConfidenceBeforeCommit: true,
            requireVerificationGate: false,
          },
          reflectionPolicy: {
            postAttemptReflection: false,
            postSessionReflection: true,
          },
        },
      },
      loginCount: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      loginHistory: [],
      failedLoginHistory: [],
      passwordChangeHistory: [
        {
          timestamp: now.toISOString(),
          changedBy: userId,
          method: 'bootstrap',
        },
      ],
      mfaEnabled: false,
      passwordChangedAt: now,
      createdBy: 'bootstrap',
      updatedBy: 'bootstrap',
      version: 1,
    },
  });

  logger.warn(
    {
      email: config.bootstrapAdmin.email,
      username: config.bootstrapAdmin.username,
    },
    'Created development bootstrap admin account'
  );
}

// ============================================================================
// Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  // Load configuration
  const config = loadConfig();

  // Create logger - use pino-pretty via stream for dev, standard for prod
  let logger: pino.Logger;
  if (config.logging.pretty) {
    // Dynamic import pino-pretty for development
    const pinoPretty = await import('pino-pretty');
    logger = pino({ level: config.logging.level }, pinoPretty.default({ colorize: true }));
  } else {
    logger = pino({ level: config.logging.level });
  }

  logger.info(
    { serviceName: config.service.name, version: config.service.version },
    'Starting service'
  );

  // Initialize Prisma
  const prisma = new PrismaClient({
    log:
      config.service.environment === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  await prisma.$connect();
  logger.info('Connected to database');

  // Initialize Redis
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Connected to Redis');

  await ensureBootstrapAdmin(prisma, config, logger);

  // Create infrastructure instances
  const userRepository = new PrismaUserRepository(prisma);
  const tokenService = new JwtTokenService(getTokenConfig(config), {
    prisma,
    redis,
  });
  const sessionOrchestration = new SessionOrchestrationService(
    getSessionOrchestrationConfig(config),
    logger
  );
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Create service
  const userService = new UserService(
    userRepository,
    eventPublisher,
    tokenService,
    sessionOrchestration,
    logger,
    {
      bcryptRounds: config.auth.bcryptRounds,
      maxLoginAttempts: config.auth.maxLoginAttempts,
      lockDurationMinutes: config.auth.lockoutDurationMinutes,
    }
  );

  // Create admin infrastructure + service (Phase 4)
  const statusChangeRepository = new PrismaUserStatusChangeRepository(prisma);
  const sessionRepository = new PrismaSessionRepository(prisma);
  const adminService = new AdminUserService({
    userRepository,
    statusChangeRepository,
    sessionRepository,
    eventPublisher,
    tokenService,
    logger,
  });

  // Create Fastify instance
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
  });

  // Register CORS (disabled by default — the API gateway handles CORS.
  // Set CORS_ENABLED=true only when running without the gateway.)
  if (config.cors.enabled) {
    await fastify.register(cors, {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    });
  } else {
    logger.info('CORS disabled at service level — handled by API gateway');
    // Traefik adds CORS response headers, but it still forwards the preflight
    // to the service. Without @fastify/cors, Fastify returns 404 for OPTIONS.
    // Return 204 so the browser sees a valid preflight; Traefik injects headers.
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.method === 'OPTIONS') {
        await reply.status(204).send();
      }
    });
  }

  // Register rate limiting (per-route only; global: false)
  await fastify.register(rateLimit, {
    global: false,
    redis,
  });

  // Create auth middleware
  const authMiddleware = createAuthMiddleware(tokenService);

  // Register routes
  await registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  registerUserRoutes(
    fastify as unknown as FastifyInstance,
    userService,
    authMiddleware,
    tokenService
  );
  registerAdminRoutes(fastify as unknown as FastifyInstance, adminService, authMiddleware);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    await fastify.close();
    await redis.quit();
    await prisma.$disconnect();

    logger.info('Service shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // Start server
  try {
    await fastify.listen({ host: config.server.host, port: config.server.port });
    logger.info({ host: config.server.host, port: config.server.port }, 'Service started');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start service');
    process.exit(1);
  }
}

// Run
bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
