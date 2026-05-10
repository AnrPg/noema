import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';

export interface IAuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
}

export function createAuthMiddleware(config: IAuthConfig) {
  const authDisabled = process.env['AUTH_DISABLED'] === 'true';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isDevLikeEnvironment = nodeEnv === 'development' || nodeEnv === 'test';

  if (authDisabled && !isDevLikeEnvironment) {
    throw new Error('AUTH_DISABLED=true is only allowed in development or test environments');
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (authDisabled) {
      request.user = { sub: request.headers['x-user-id'] ?? 'anonymous' };
      return;
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
      return;
    }

    try {
      const token = authHeader.slice('Bearer '.length);
      const { payload } = await jwtVerify(token, secret, {
        issuer: config.issuer,
        audience: config.audience,
      });
      request.user = {
        ...(payload as Record<string, unknown>),
        sub:
          typeof payload['userId'] === 'string'
            ? payload['userId']
            : typeof payload.sub === 'string'
              ? payload.sub
              : 'anonymous',
      };
    } catch {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } });
    }
  };
}

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyRequest {
    user?: unknown;
  }
}
