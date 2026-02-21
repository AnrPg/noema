/**
 * @noema/content-service - Authentication Middleware
 *
 * JWT token verification for protected routes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  ITokenPayload,
  JwtTokenVerifier,
} from '../infrastructure/external-apis/token-verifier.js';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyRequest {
    user?: ITokenPayload;
  }
}

export function createAuthMiddleware(tokenVerifier: JwtTokenVerifier) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ') !== true) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = await tokenVerifier.verifyAccessToken(token);
      request.user = payload;
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}
