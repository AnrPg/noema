import type { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';

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
  const authDisabled = process.env['AUTH_DISABLED'] === 'true';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isDevLikeEnvironment = nodeEnv === 'development' || nodeEnv === 'test';

  if (authDisabled && !isDevLikeEnvironment) {
    throw new Error('AUTH_DISABLED=true is only allowed in development or test environments');
  }

  const jwtSecret = process.env['ACCESS_TOKEN_SECRET'] ?? process.env['JWT_SECRET'] ?? '';
  const issuer = process.env['JWT_ISSUER'] ?? 'noema.app';
  const audience = process.env['JWT_AUDIENCE'] ?? 'noema.app';
  const secret = jwtSecret;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (authDisabled) {
      const userId =
        typeof request.headers['x-user-id'] === 'string'
          ? request.headers['x-user-id']
          : 'user_devuser00000000000000';
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

    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256AccessToken(header.slice(7), secret, issuer, audience);
    } catch {
      await reply.status(401).send({
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired bearer token' },
      });
      return;
    }

    if (payload['type'] !== 'access') {
      await reply.status(401).send({
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid token type' },
      });
      return;
    }

    const scopes = normalizeScopes(payload);
    if (!scopes.includes(requiredScope)) {
      await reply.status(403).send({
        error: { code: 'AUTHORIZATION_ERROR', message: `Missing scope ${requiredScope}` },
      });
      return;
    }
    request.user = {
      sub:
        typeof payload['userId'] === 'string'
          ? payload['userId']
          : typeof payload['sub'] === 'string'
            ? payload['sub']
            : 'unknown',
      scopes,
    };
  };
}

function normalizeScopes(payload: Record<string, unknown>): string[] {
  if (Array.isArray(payload['scopes'])) {
    return payload['scopes'].filter((scope): scope is string => typeof scope === 'string');
  }
  if (typeof payload['scope'] === 'string') {
    return payload['scope']
      .split(' ')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  }
  return [];
}

function verifyHs256AccessToken(
  token: string,
  secret: string,
  issuer: string,
  audience: string
): Record<string, unknown> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (
    encodedHeader === undefined ||
    encodedHeader.length === 0 ||
    encodedPayload === undefined ||
    encodedPayload.length === 0 ||
    encodedSignature === undefined ||
    encodedSignature.length === 0
  ) {
    throw new Error('Malformed token');
  }

  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  if (header['alg'] !== 'HS256') {
    throw new Error('Unsupported token algorithm');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = payload['exp'];
  if (expiresAt !== undefined && (typeof expiresAt !== 'number' || expiresAt < nowSeconds)) {
    throw new Error('Token expired');
  }
  if (payload['iss'] !== issuer) {
    throw new Error('Invalid issuer');
  }

  const tokenAudience = payload['aud'];
  const audienceMatches =
    tokenAudience === audience ||
    (Array.isArray(tokenAudience) && tokenAudience.includes(audience));
  if (!audienceMatches) {
    throw new Error('Invalid audience');
  }

  return payload;
}
