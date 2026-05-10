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
  const authDisabled = process.env['AUTH_DISABLED'] === 'true';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isDevLikeEnvironment = nodeEnv === 'development' || nodeEnv === 'test';

  if (authDisabled && !isDevLikeEnvironment) {
    throw new Error('AUTH_DISABLED=true is only allowed in development or test environments');
  }

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (authDisabled) {
      const xUserId =
        typeof request.headers['x-user-id'] === 'string'
          ? request.headers['x-user-id']
          : 'user_devuser00000000000000';
      request.user = {
        sub: xUserId,
        roles: ['developer'],
        scopes: [],
        type: 'access',
      };
      return;
    }

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
      request.user = {
        ...payload,
        sub:
          typeof payload['userId'] === 'string'
            ? payload['userId']
            : payload.sub,
      };
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
