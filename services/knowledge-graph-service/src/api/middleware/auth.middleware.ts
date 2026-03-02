/**
 * @noema/knowledge-graph-service - Authentication Middleware
 *
 * JWT token verification for protected routes.
 * Ported from content-service's auth middleware pattern.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  ITokenPayload,
  JwtTokenVerifier,
} from '../../infrastructure/external-apis/token-verifier.js';
import { buildErrorMetadata } from '../shared/route-helpers.js';

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
      const metadata = buildErrorMetadata(request);
      return reply.status(401).send({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Missing or invalid authorization header',
        },
        metadata,
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = await tokenVerifier.verifyAccessToken(token);
      request.user = payload;
    } catch {
      const metadata = buildErrorMetadata(request);
      return reply.status(401).send({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid or expired token',
        },
        metadata,
      });
    }
  };
}
