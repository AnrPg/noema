/**
 * @noema/knowledge-graph-service — Integration Test App Builder
 *
 * Constructs a lightweight Fastify instance for route integration tests.
 * Registers only the route group under test with a mock auth middleware.
 * Skips CORS, rate-limit, and Swagger to keep tests fast and focused.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { IRouteOptions } from '../../src/api/shared/route-helpers.js';
import type { IKnowledgeGraphService } from '../../src/domain/knowledge-graph-service/knowledge-graph.service.js';
import type { ITokenPayload } from '../../src/infrastructure/external-apis/token-verifier.js';
import { TEST_USER_ID } from '../fixtures/index.js';

// ============================================================================
// Auth Middleware Factories
// ============================================================================

/**
 * Default token payload for authenticated test requests.
 * PKG routes expect `sub` to match the `:userId` param.
 */
function defaultPayload(overrides?: Partial<ITokenPayload>): ITokenPayload {
  return {
    sub: TEST_USER_ID,
    roles: [],
    type: 'access',
    iss: 'test',
    aud: 'test',
    ...overrides,
  };
}

/**
 * Create a test auth middleware that stamps `request.user` with the
 * given payload. No JWT verification occurs.
 */
export function createTestAuthMiddleware(payloadOverrides?: Partial<ITokenPayload>) {
  const payload = defaultPayload(payloadOverrides);
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    request.user = payload;
  };
}

/**
 * Create a "no auth" middleware that simulates missing Bearer token.
 * The middleware returns a 401 response, matching the real auth middleware.
 */
export function createNoAuthMiddleware() {
  return async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    return reply.status(401).send({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Missing or invalid authorization header',
      },
      metadata: {},
    });
  };
}

// ============================================================================
// App Builder
// ============================================================================

export interface IBuildTestAppOptions {
  /** The service mock to inject */
  service: IKnowledgeGraphService;

  /** Token payload overrides for the authenticated user */
  user?: Partial<ITokenPayload>;

  /**
   * Route registrar function(s) to register.
   * Passed the Fastify instance, service, and auth middleware.
   */
  registerRoutes: (
    fastify: FastifyInstance,
    service: IKnowledgeGraphService,
    authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
    options?: IRouteOptions
  ) => void;
}

/**
 * Build a lightweight Fastify app for integration testing.
 *
 * - No CORS, no rate-limit, no Swagger
 * - Test auth middleware (no JWT verification)
 * - Returns the Fastify instance ready for `.inject()`
 */
export function buildTestApp(opts: IBuildTestAppOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  const authMiddleware = createTestAuthMiddleware(opts.user);
  opts.registerRoutes(app, opts.service, authMiddleware);

  return app;
}

/**
 * Build a test app with the "no auth" middleware for 401 testing.
 */
export function buildUnauthenticatedTestApp(opts: {
  service: IKnowledgeGraphService;
  registerRoutes: (
    fastify: FastifyInstance,
    service: IKnowledgeGraphService,
    authMiddleware: ReturnType<typeof createNoAuthMiddleware>,
    options?: IRouteOptions
  ) => void;
}): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  const authMiddleware = createNoAuthMiddleware();
  opts.registerRoutes(app, opts.service, authMiddleware);

  return app;
}
