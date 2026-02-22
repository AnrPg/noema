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
    user?: { sub: string; roles?: string[] };
  }
}

export interface IAuthConfig {
  jwtSecret: string;
  issuer?: string;
  audience?: string;
}

/**
 * Create auth middleware that verifies JWT tokens.
 *
 * In production, this would verify tokens issued by user-service.
 * For development, tokens can be skipped with AUTH_DISABLED=true.
 */
export function createAuthMiddleware(config: IAuthConfig) {
  const secret = new TextEncoder().encode(config.jwtSecret);

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Skip auth if disabled (development only)
    if (process.env['AUTH_DISABLED'] === 'true') {
      request.user = {
        sub: (request.headers['x-user-id'] as string) || 'dev-user',
        roles: ['user'],
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
      };
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}
