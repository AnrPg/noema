import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyRequest {
    user?: {
      sub: string;
      scopes: string[];
    };
  }
}

export function createAuthMiddleware(requiredScope: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.headers['x-user-id'];
    if (typeof userId === 'string' && userId.trim().length > 0) {
      request.user = { sub: userId, scopes: [requiredScope] };
      return;
    }

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ') !== true) {
      await reply.status(401).send({
        error: { code: 'AUTHENTICATION_ERROR', message: 'Missing bearer token' },
      });
      return;
    }

    const payload = decodeJwtPayload(header.slice(7));
    const scopes = typeof payload['scope'] === 'string' ? payload['scope'].split(' ') : [];
    if (!scopes.includes(requiredScope)) {
      await reply.status(403).send({
        error: { code: 'AUTHORIZATION_ERROR', message: `Missing scope ${requiredScope}` },
      });
      return;
    }
    request.user = { sub: typeof payload['sub'] === 'string' ? payload['sub'] : 'unknown', scopes };
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, body] = token.split('.');
  if (body === undefined) return {};
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
