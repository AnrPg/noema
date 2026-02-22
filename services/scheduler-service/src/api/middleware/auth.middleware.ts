import type { FastifyReply, FastifyRequest } from 'fastify';
import * as jose from 'jose';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyRequest {
    user?: { sub: string; roles?: string[] };
  }
}

export interface IAuthConfig {
  jwtSecret: string;
  issuer?: string;
  audience?: string;
}

export function createAuthMiddleware(config: IAuthConfig) {
  const secret = new TextEncoder().encode(config.jwtSecret);

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (process.env['AUTH_DISABLED'] === 'true') {
      const userHeader = request.headers['x-user-id'];
      const headerUserId = typeof userHeader === 'string' ? userHeader : undefined;
      request.user = {
        sub: headerUserId ?? 'dev-user',
        roles: ['user'],
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ') !== true) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const verifyOptions: jose.JWTVerifyOptions = {};
      if (config.issuer !== undefined) verifyOptions.issuer = config.issuer;
      if (config.audience !== undefined) verifyOptions.audience = config.audience;

      const { payload } = await jose.jwtVerify(token, secret, verifyOptions);
      const rolesClaim = payload['roles'];
      const roles =
        Array.isArray(rolesClaim) && rolesClaim.every((role) => typeof role === 'string')
          ? rolesClaim
          : ['user'];

      request.user = {
        sub: typeof payload.sub === 'string' ? payload.sub : '',
        roles,
      };
    } catch {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}
