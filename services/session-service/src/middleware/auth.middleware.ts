/**
 * @noema/session-service - Authentication Middleware
 *
 * JWT token verification for protected routes.
 * Simplified auth middleware — session-service does not own auth,
 * it validates incoming JWT tokens from user-service.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import * as jose from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { sub: string; roles?: string[]; scopes?: string[] };
  }
}

export interface IAuthConfig {
  jwtSecret: string;
  issuer?: string;
  audience?: string;
}

const DEV_USER_ID_FALLBACK = 'usr_devuser00000000000000';

function normalizeDevUserId(value: unknown): string {
  return typeof value === 'string' && /^usr_[A-Za-z0-9_-]{21}$/.test(value)
    ? value
    : DEV_USER_ID_FALLBACK;
}

/**
 * Create auth middleware that verifies JWT tokens.
 *
 * In production, this would verify tokens issued by user-service.
 * For development, tokens can be skipped with AUTH_DISABLED=true.
 */
export function createAuthMiddleware(config: IAuthConfig) {
  const authDisabled = process.env['AUTH_DISABLED'] === 'true';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isDevLikeEnvironment = nodeEnv === 'development' || nodeEnv === 'test';

  if (authDisabled && !isDevLikeEnvironment) {
    throw new Error('AUTH_DISABLED=true is only allowed in development or test environments');
  }

  if (!authDisabled && config.jwtSecret.trim().length === 0) {
    throw new Error('JWT secret is required when authentication is enabled');
  }

  if (!authDisabled && config.jwtSecret.trim().length < 32) {
    throw new Error(
      'JWT secret must be at least 32 characters for adequate cryptographic strength'
    );
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Skip auth if disabled (development only)
    if (authDisabled) {
      const headerUserId = request.headers['x-user-id'];
      request.user = {
        sub: normalizeDevUserId(typeof headerUserId === 'string' ? headerUserId : undefined),
        roles: ['user'],
        scopes: ['session:tools:execute'],
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.slice(7);

    try {
      const verifyOptions: jose.JWTVerifyOptions = {};
      if (config.issuer) verifyOptions.issuer = config.issuer;
      if (config.audience) verifyOptions.audience = config.audience;

      const { payload } = await jose.jwtVerify(token, secret, verifyOptions);

      request.user = {
        sub: payload.sub ?? '',
        roles: (payload['roles'] as string[]) ?? ['user'],
        scopes: (payload['scopes'] as string[]) ?? [],
      };
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}
