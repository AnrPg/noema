import type { FastifyReply, FastifyRequest } from 'fastify';
import * as jose from 'jose';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyRequest {
    user?: IPrincipalContext;
  }
}

export type ErrorCategory = 'auth' | 'validation' | 'conflict' | 'dependency' | 'internal';

export interface IPrincipalContext {
  sub: string;
  roles?: string[];
  principalType: 'user' | 'agent' | 'service';
  principalId: string;
  scopes: string[];
  audienceClass: 'user-client' | 'agent-runtime' | 'service-internal';
}

export interface IAuthConfig {
  jwtSecret: string | undefined;
  jwksUrl: string | undefined;
  issuer?: string;
  expectedAudiences?: Partial<{
    user: string;
    agent: string;
    service: string;
  }>;
  authDisabled: boolean;
}

function getStartTime(request: FastifyRequest): number {
  return (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
}

export function buildErrorMetadata(request: FastifyRequest): {
  requestId: string;
  correlationId: string;
  timestamp: string;
  serviceName: string;
  serviceVersion: string;
  executionTime: number;
} {
  return {
    requestId: request.id,
    correlationId: request.id,
    timestamp: new Date().toISOString(),
    serviceName: 'scheduler-service',
    serviceVersion: process.env['SERVICE_VERSION'] ?? '0.1.0',
    executionTime: Date.now() - getStartTime(request),
  };
}

export async function sendErrorEnvelope(
  reply: FastifyReply,
  request: FastifyRequest,
  options: {
    statusCode: 400 | 401 | 403 | 409 | 413 | 429 | 500;
    code: string;
    message: string;
    category: ErrorCategory;
    retryable: boolean;
  }
): Promise<void> {
  schedulerObservability.recordError(options.category, options.code);
  await reply.status(options.statusCode).send({
    error: {
      code: options.code,
      message: options.message,
      retryable: options.retryable,
      category: options.category,
    },
    metadata: buildErrorMetadata(request),
  });
}

function normalizeScopes(payload: jose.JWTPayload): string[] {
  const scopesClaim = payload['scopes'];
  if (Array.isArray(scopesClaim)) {
    return scopesClaim.filter((scope): scope is string => typeof scope === 'string');
  }

  const scopeClaim = payload['scope'];
  if (typeof scopeClaim === 'string') {
    return scopeClaim
      .split(' ')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  }

  return [];
}

function normalizePrincipalType(payload: jose.JWTPayload): 'user' | 'agent' | 'service' {
  const principalTypeClaim = payload['principalType'];
  if (
    principalTypeClaim === 'user' ||
    principalTypeClaim === 'agent' ||
    principalTypeClaim === 'service'
  ) {
    return principalTypeClaim;
  }
  return 'user';
}

function normalizeAudienceClass(
  payload: jose.JWTPayload,
  principalType: 'user' | 'agent' | 'service'
): 'user-client' | 'agent-runtime' | 'service-internal' {
  const audienceClassClaim = payload['audienceClass'];
  if (
    audienceClassClaim === 'user-client' ||
    audienceClassClaim === 'agent-runtime' ||
    audienceClassClaim === 'service-internal'
  ) {
    return audienceClassClaim;
  }

  if (principalType === 'agent') return 'agent-runtime';
  if (principalType === 'service') return 'service-internal';
  return 'user-client';
}

function audClaimToList(aud: unknown): string[] {
  if (typeof aud === 'string') return [aud];
  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === 'string');
  }
  return [];
}

export async function requireScopes(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    requiredScopes: string[];
    match: 'all' | 'any';
  }
): Promise<boolean> {
  const principal = request.user;
  if (!principal) {
    await sendErrorEnvelope(reply, request, {
      statusCode: 401,
      code: 'AUTH_UNAUTHORIZED',
      message: 'Missing authenticated principal context',
      category: 'auth',
      retryable: false,
    });
    return false;
  }

  if (options.requiredScopes.length === 0) return true;

  const hasScope =
    options.match === 'all'
      ? options.requiredScopes.every((scope) => principal.scopes.includes(scope))
      : options.requiredScopes.some((scope) => principal.scopes.includes(scope));

  if (!hasScope) {
    await sendErrorEnvelope(reply, request, {
      statusCode: 403,
      code: 'AUTH_FORBIDDEN_SCOPE',
      message: `Missing required scope (${options.match}): ${options.requiredScopes.join(', ')}`,
      category: 'auth',
      retryable: false,
    });
    return false;
  }

  return true;
}

export function createAuthMiddleware(config: IAuthConfig) {
  const hasJwtSecret = config.jwtSecret !== undefined && config.jwtSecret.length > 0;
  const hasJwksUrl = config.jwksUrl !== undefined && config.jwksUrl.length > 0;
  const jwksUrl = hasJwksUrl ? config.jwksUrl : undefined;
  const secret = hasJwtSecret ? new TextEncoder().encode(config.jwtSecret) : undefined;
  const jwks = jwksUrl !== undefined ? jose.createRemoteJWKSet(new URL(jwksUrl)) : undefined;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (config.authDisabled) {
      const userHeader = request.headers['x-user-id'];
      const headerUserId = typeof userHeader === 'string' ? userHeader : undefined;
      request.user = {
        principalType: 'user',
        principalId: headerUserId ?? 'dev-user',
        scopes: ['scheduler:plan', 'scheduler:tools:read', 'scheduler:tools:execute'],
        audienceClass: 'user-client',
        sub: headerUserId ?? 'dev-user',
        roles: ['user'],
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ') !== true) {
      await sendErrorEnvelope(reply, request, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        category: 'auth',
        retryable: false,
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const verifyOptions: jose.JWTVerifyOptions = {};
      if (config.issuer !== undefined) verifyOptions.issuer = config.issuer;

      if (jwks === undefined && secret === undefined) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 500,
          code: 'AUTH_CONFIG_ERROR',
          message: 'Auth is enabled but no JWKS or JWT secret is configured',
          category: 'internal',
          retryable: false,
        });
        return;
      }

      const verificationResult =
        jwks !== undefined
          ? await jose.jwtVerify(token, jwks, verifyOptions)
          : await jose.jwtVerify(token, secret as Uint8Array, verifyOptions);
      const { payload } = verificationResult;
      const rolesClaim = payload['roles'];
      const roles =
        Array.isArray(rolesClaim) && rolesClaim.every((role) => typeof role === 'string')
          ? rolesClaim
          : ['user'];

      const principalType = normalizePrincipalType(payload);
      const principalIdClaim = payload['principalId'];
      const principalId =
        typeof principalIdClaim === 'string' && principalIdClaim.length > 0
          ? principalIdClaim
          : typeof payload.sub === 'string' && payload.sub.length > 0
            ? payload.sub
            : '';

      if (principalId === '') {
        await sendErrorEnvelope(reply, request, {
          statusCode: 401,
          code: 'AUTH_INVALID_PRINCIPAL',
          message: 'Token is missing required principal identifier',
          category: 'auth',
          retryable: false,
        });
        return;
      }

      const expectedAudience = config.expectedAudiences?.[principalType];
      if (expectedAudience !== undefined) {
        const audiences = audClaimToList(payload.aud);
        if (!audiences.includes(expectedAudience)) {
          await sendErrorEnvelope(reply, request, {
            statusCode: 401,
            code: 'AUTH_AUDIENCE_MISMATCH',
            message: `Token audience does not match expected audience for principal type ${principalType}`,
            category: 'auth',
            retryable: false,
          });
          return;
        }
      }

      request.user = {
        sub: typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : principalId,
        roles,
        principalType,
        principalId,
        scopes: normalizeScopes(payload),
        audienceClass: normalizeAudienceClass(payload, principalType),
      };
    } catch {
      await sendErrorEnvelope(reply, request, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Invalid or expired token',
        category: 'auth',
        retryable: false,
      });
    }
  };
}
