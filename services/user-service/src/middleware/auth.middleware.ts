/**
 * @noema/user-service - Authentication Middleware
 *
 * JWT token verification for protected routes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  ITokenPayload,
  JwtTokenService,
} from '../infrastructure/external-apis/token.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: ITokenPayload;
  }
}

export function createAuthMiddleware(tokenService: JwtTokenService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = await tokenService.verifyAccessToken(token);
      request.user = payload;
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}
