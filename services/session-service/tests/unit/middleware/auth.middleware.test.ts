import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthMiddleware } from '../../../src/middleware/auth.middleware.js';

describe('createAuthMiddleware', () => {
  const previousAuthDisabled = process.env['AUTH_DISABLED'];
  const previousNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (previousAuthDisabled === undefined) {
      delete process.env['AUTH_DISABLED'];
    } else {
      process.env['AUTH_DISABLED'] = previousAuthDisabled;
    }

    if (previousNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = previousNodeEnv;
    }
  });

  it('throws when AUTH_DISABLED is true in production environment', () => {
    process.env['AUTH_DISABLED'] = 'true';
    process.env['NODE_ENV'] = 'production';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: '',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).toThrow('AUTH_DISABLED=true is only allowed in development or test environments');
  });

  it('allows AUTH_DISABLED in test environment', () => {
    process.env['AUTH_DISABLED'] = 'true';
    process.env['NODE_ENV'] = 'test';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: '',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).not.toThrow();
  });

  it('throws when auth is enabled and jwtSecret is empty', () => {
    process.env['AUTH_DISABLED'] = 'false';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: '   ',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).toThrow('JWT secret is required when authentication is enabled');
  });

  it('allows empty jwtSecret when auth is explicitly disabled', () => {
    process.env['AUTH_DISABLED'] = 'true';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: '',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).not.toThrow();
  });

  it('throws when jwtSecret is shorter than 32 characters', () => {
    process.env['AUTH_DISABLED'] = 'false';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: 'short-but-not-empty-secret',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).toThrow('JWT secret must be at least 32 characters');
  });

  it('allows jwtSecret of 32+ characters when auth is enabled', () => {
    process.env['AUTH_DISABLED'] = 'false';

    expect(() =>
      createAuthMiddleware({
        jwtSecret: 'this-is-a-secure-32-char-secret!',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).not.toThrow();
  });

  it('defaults to auth enabled when AUTH_DISABLED is unset', () => {
    delete process.env['AUTH_DISABLED'];

    expect(() =>
      createAuthMiddleware({
        jwtSecret: '',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).toThrow('JWT secret is required when authentication is enabled');
  });

  it('accepts valid secret when AUTH_DISABLED is unset', () => {
    delete process.env['AUTH_DISABLED'];

    expect(() =>
      createAuthMiddleware({
        jwtSecret: 'this-is-a-secure-32-char-secret!',
        issuer: 'noema.app',
        audience: 'noema.app',
      })
    ).not.toThrow();
  });

  it('ignores bearer validation path setup for factory creation', async () => {
    process.env['AUTH_DISABLED'] = 'false';
    const middleware = createAuthMiddleware({
      jwtSecret: 'this-is-a-secure-32-char-secret!',
      issuer: 'noema.app',
      audience: 'noema.app',
    });

    const request = {
      headers: {},
      user: undefined,
    } as never;

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as never;

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalled();
  });
});
