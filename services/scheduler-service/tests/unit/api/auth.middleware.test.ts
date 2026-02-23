import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import {
  createAuthMiddleware,
  requireScopes,
  type IPrincipalContext,
} from '../../../src/api/middleware/auth.middleware.js';

type MockRequest = {
  id: string;
  headers: Record<string, string | undefined>;
  startTime: number;
  user?: IPrincipalContext;
};

type MockReply = {
  statusCode?: number;
  payload?: unknown;
  status: (code: number) => MockReply;
  send: (payload: unknown) => Promise<void>;
};

function createReply(): MockReply {
  return {
    status(code: number): MockReply {
      this.statusCode = code;
      return this;
    },
    async send(payload: unknown): Promise<void> {
      this.payload = payload;
    },
  };
}

function createRequest(authHeader?: string): MockRequest {
  return {
    id: 'cor_test_123',
    headers: {
      authorization: authHeader,
    },
    startTime: Date.now(),
  };
}

async function signToken(secret: string, claims: Record<string, unknown>): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('noema.app')
    .setAudience(typeof claims['aud'] === 'string' ? claims['aud'] : 'noema.user')
    .setSubject(typeof claims['sub'] === 'string' ? claims['sub'] : 'usr_test')
    .sign(key);
}

describe('auth middleware phase 1', () => {
  const secret = 'test-secret';

  it('parses user principal and scopes from JWT', async () => {
    const token = await signToken(secret, {
      sub: 'usr_test',
      principalType: 'user',
      principalId: 'usr_test',
      audienceClass: 'user-client',
      scope: 'scheduler:plan scheduler:tools:execute',
      roles: ['user'],
      aud: 'noema.user',
    });

    const middleware = createAuthMiddleware({
      authDisabled: false,
      jwtSecret: secret,
      issuer: 'noema.app',
      expectedAudiences: { user: 'noema.user' },
    });

    const request = createRequest(`Bearer ${token}`);
    const reply = createReply();

    await middleware(request as never, reply as never);

    expect(reply.statusCode).toBeUndefined();
    expect(request.user).toMatchObject({
      principalType: 'user',
      principalId: 'usr_test',
      audienceClass: 'user-client',
      scopes: ['scheduler:plan', 'scheduler:tools:execute'],
      sub: 'usr_test',
    });
  });

  it('supports user/agent/service principal type matrix', async () => {
    const types: Array<{
      principalType: 'user' | 'agent' | 'service';
      audienceClass: 'user-client' | 'agent-runtime' | 'service-internal';
      aud: string;
    }> = [
      { principalType: 'user', audienceClass: 'user-client', aud: 'noema.user' },
      { principalType: 'agent', audienceClass: 'agent-runtime', aud: 'noema.agent' },
      { principalType: 'service', audienceClass: 'service-internal', aud: 'noema.service' },
    ];

    const middleware = createAuthMiddleware({
      authDisabled: false,
      jwtSecret: secret,
      issuer: 'noema.app',
      expectedAudiences: {
        user: 'noema.user',
        agent: 'noema.agent',
        service: 'noema.service',
      },
    });

    for (const typeConfig of types) {
      const token = await signToken(secret, {
        sub: `${typeConfig.principalType}_sub`,
        principalType: typeConfig.principalType,
        principalId: `${typeConfig.principalType}_id`,
        audienceClass: typeConfig.audienceClass,
        scopes: ['scheduler:plan'],
        aud: typeConfig.aud,
      });

      const request = createRequest(`Bearer ${token}`);
      const reply = createReply();

      await middleware(request as never, reply as never);

      expect(reply.statusCode).toBeUndefined();
      expect(request.user?.principalType).toBe(typeConfig.principalType);
      expect(request.user?.audienceClass).toBe(typeConfig.audienceClass);
    }
  });

  it('returns canonical unauthorized envelope for missing auth header', async () => {
    const middleware = createAuthMiddleware({
      authDisabled: false,
      jwtSecret: secret,
      issuer: 'noema.app',
    });

    const request = createRequest(undefined);
    const reply = createReply();

    await middleware(request as never, reply as never);

    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        retryable: false,
        category: 'auth',
      },
      metadata: {
        requestId: 'cor_test_123',
        correlationId: 'cor_test_123',
      },
    });
  });

  it('returns canonical unauthorized envelope for audience mismatch', async () => {
    const token = await signToken(secret, {
      sub: 'agent_sub',
      principalType: 'agent',
      principalId: 'agent_1',
      audienceClass: 'agent-runtime',
      scopes: ['scheduler:tools:execute'],
      aud: 'wrong.audience',
    });

    const middleware = createAuthMiddleware({
      authDisabled: false,
      jwtSecret: secret,
      issuer: 'noema.app',
      expectedAudiences: { agent: 'noema.agent' },
    });

    const request = createRequest(`Bearer ${token}`);
    const reply = createReply();

    await middleware(request as never, reply as never);

    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({
      error: {
        code: 'AUTH_AUDIENCE_MISMATCH',
        category: 'auth',
      },
    });
  });

  it('enforces scope checks with canonical forbidden envelope', async () => {
    const request = createRequest();
    request.user = {
      sub: 'usr_test',
      principalType: 'user',
      principalId: 'usr_test',
      scopes: ['scheduler:plan'],
      audienceClass: 'user-client',
    };
    const reply = createReply();

    const allowed = await requireScopes(request as never, reply as never, {
      requiredScopes: ['scheduler:tools:execute'],
      match: 'all',
    });

    expect(allowed).toBe(false);
    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toMatchObject({
      error: {
        code: 'AUTH_FORBIDDEN_SCOPE',
        category: 'auth',
        retryable: false,
      },
    });
  });

  it('allows scope check when any required scope is present', async () => {
    const request = createRequest();
    request.user = {
      sub: 'svc_test',
      principalType: 'service',
      principalId: 'svc_test',
      scopes: ['scheduler:tools:execute'],
      audienceClass: 'service-internal',
    };
    const reply = createReply();
    reply.status = vi.fn(reply.status.bind(reply));

    const allowed = await requireScopes(request as never, reply as never, {
      requiredScopes: ['scheduler:read', 'scheduler:tools:execute'],
      match: 'any',
    });

    expect(allowed).toBe(true);
    expect(reply.status).not.toHaveBeenCalled();
  });
});
