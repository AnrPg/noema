/**
 * @noema/user-service — Integration Test App Builder
 *
 * Constructs a lightweight Fastify instance for route integration tests.
 * Registers only the route group under test with a mock auth middleware.
 * Follows the same pattern as knowledge-graph-service tests.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

// ============================================================================
// Auth Middleware Factories
// ============================================================================

export interface ITestTokenPayload {
  sub: string;
  roles: string[];
  type: string;
  iss: string;
  aud: string;
  scopes?: string[];
}

export const TEST_USER_ID = 'usr_testuser123456789ab';
export const OTHER_USER_ID = 'usr_otheruser098765432zy';

/**
 * Default token payload for authenticated test requests.
 */
function defaultPayload(overrides?: Partial<ITestTokenPayload>): ITestTokenPayload {
  return {
    sub: TEST_USER_ID,
    roles: ['user'],
    type: 'access',
    iss: 'test',
    aud: 'test',
    scopes: [],
    ...overrides,
  };
}

/**
 * Create a test auth middleware that stamps `request.user` with the
 * given payload. No JWT verification occurs.
 */
export function createTestAuthMiddleware(payloadOverrides?: Partial<ITestTokenPayload>) {
  const payload = defaultPayload(payloadOverrides);
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as Record<string, unknown>).user = payload;
  };
}

/**
 * Create a "no auth" middleware that simulates missing Bearer token.
 * Returns 401 to match the real auth middleware behavior.
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
// Service Mock
// ============================================================================

/**
 * Create a mock UserService with all methods stubbed.
 * Tests that hit 401 will never reach the service, so stubs can be empty.
 */
export function createMockUserService(): Record<string, ReturnType<typeof vi.fn>> {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === 'string') {
          return vi.fn().mockRejectedValue(new Error(`Unexpected call to ${prop}`));
        }
        return undefined;
      },
    }
  ) as Record<string, ReturnType<typeof vi.fn>>;
}

// ============================================================================
// App Builder
// ============================================================================

interface IBuildTestAppOptions {
  registerRoutes: (
    fastify: FastifyInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: any,
    authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenService?: any
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service?: any;
  user?: Partial<ITestTokenPayload>;
}

/**
 * Build a lightweight Fastify app with a test auth middleware.
 */
export function buildTestApp(opts: IBuildTestAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const authMiddleware = createTestAuthMiddleware(opts.user);
  const service = opts.service ?? createMockUserService();
  opts.registerRoutes(app, service, authMiddleware);
  return app;
}

/**
 * Build a test app with the "no auth" middleware for 401 testing.
 * All protected routes will return 401.
 */
export function buildUnauthenticatedTestApp(opts: IBuildTestAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const authMiddleware = createNoAuthMiddleware();
  const service = opts.service ?? createMockUserService();
  opts.registerRoutes(app, service, authMiddleware);
  return app;
}

import { vi } from 'vitest';
