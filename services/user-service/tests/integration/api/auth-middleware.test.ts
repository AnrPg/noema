/**
 * @noema/user-service — Auth Middleware Integration Tests (C9)
 *
 * Verifies that ALL protected routes return 401 when no Bearer token
 * is provided.  This is the safety-net test added as part of C9
 * (making authMiddleware parameter required).
 *
 * Routes tested:
 *   POST /auth/logout
 *   POST /auth/logout-all
 *   POST /auth/resend-verification
 *   GET  /users/:id
 *   GET  /users
 *   PATCH /users/:id/profile
 *   PATCH /users/:id/settings
 *   POST /users/:id/password
 *   DELETE /users/:id
 *   PATCH /users/:id/username
 *   PATCH /users/:id/email
 *   GET  /me
 *   PATCH /me/profile
 *   GET  /me/settings
 *   PATCH /me/settings
 *
 * Unprotected public routes (register, login, refresh, forgot-password,
 * reset-password, verify-email) are NOT expected to return 401.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUserRoutes } from '../../../src/api/rest/user.routes.js';
import { buildUnauthenticatedTestApp, TEST_USER_ID } from './test-app.js';

// ============================================================================
// Setup
// ============================================================================

let app: FastifyInstance;

beforeAll(async () => {
  app = buildUnauthenticatedTestApp({
    registerRoutes: registerUserRoutes,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ============================================================================
// Protected Route Definitions
// ============================================================================

interface IProtectedRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
  description: string;
}

const PROTECTED_ROUTES: IProtectedRoute[] = [
  {
    method: 'POST',
    url: '/auth/logout',
    payload: { refreshToken: 'fake-token' },
    description: 'logout',
  },
  {
    method: 'POST',
    url: '/auth/logout-all',
    description: 'logout all sessions',
  },
  {
    method: 'POST',
    url: '/auth/resend-verification',
    description: 'resend verification email',
  },
  {
    method: 'GET',
    url: `/users/${TEST_USER_ID}`,
    description: 'get user by id',
  },
  {
    method: 'GET',
    url: '/users',
    description: 'list users',
  },
  {
    method: 'PATCH',
    url: `/users/${TEST_USER_ID}/profile`,
    payload: { data: { displayName: 'Test' }, version: 1 },
    description: 'update user profile',
  },
  {
    method: 'PATCH',
    url: `/users/${TEST_USER_ID}/settings`,
    payload: { data: { theme: 'system' }, version: 1 },
    description: 'update user settings',
  },
  {
    method: 'POST',
    url: `/users/${TEST_USER_ID}/password`,
    payload: { currentPassword: 'OldPass123!', newPassword: 'NewPass123!', version: 1 },
    description: 'change password',
  },
  {
    method: 'DELETE',
    url: `/users/${TEST_USER_ID}`,
    description: 'delete user',
  },
  {
    method: 'PATCH',
    url: `/users/${TEST_USER_ID}/username`,
    payload: { username: 'newname', version: 1 },
    description: 'change username',
  },
  {
    method: 'PATCH',
    url: `/users/${TEST_USER_ID}/email`,
    payload: { newEmail: 'new@example.com', password: 'secret' },
    description: 'change email',
  },
  {
    method: 'GET',
    url: '/me',
    description: 'get current user (me)',
  },
  {
    method: 'PATCH',
    url: '/me/profile',
    payload: { data: { displayName: 'Test' }, version: 1 },
    description: 'update my profile',
  },
  {
    method: 'GET',
    url: '/me/settings',
    description: 'get my settings',
  },
  {
    method: 'PATCH',
    url: '/me/settings',
    payload: { data: { theme: 'system' }, version: 1 },
    description: 'update my settings',
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('Auth Middleware — 401 on all protected routes (C9)', () => {
  it.each(PROTECTED_ROUTES)(
    'returns 401 for $method $url ($description)',
    async ({ method, url, payload }) => {
      const res = await app.inject({
        method,
        url,
        ...(payload ? { payload } : {}),
      });

      expect(res.statusCode).toBe(401);

      const body = res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    }
  );

  it('covers all 15 protected routes', () => {
    expect(PROTECTED_ROUTES).toHaveLength(15);
  });
});

// ============================================================================
// Public Routes — should NOT return 401
// ============================================================================

describe('Public routes — should be accessible without auth', () => {
  /**
   * These routes should return something OTHER than 401 even without auth.
   * They may return 400 (validation), 422, or 200 — but NOT 401.
   */
  const PUBLIC_ROUTES: Pick<IProtectedRoute, 'method' | 'url' | 'payload' | 'description'>[] = [
    {
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'Pass1234!',
        username: 'testuser',
        country: 'US',
        languages: ['en'],
      },
      description: 'register',
    },
    {
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'secret' },
      description: 'login',
    },
    {
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'fake-token' },
      description: 'refresh token',
    },
    {
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'test@example.com' },
      description: 'forgot password',
    },
    {
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'fake-token', newPassword: 'NewPass123!' },
      description: 'reset password',
    },
    {
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: 'fake-token' },
      description: 'verify email',
    },
  ];

  it.each(PUBLIC_ROUTES)(
    '$method $url ($description) does NOT return 401',
    async ({ method, url, payload }) => {
      const res = await app.inject({
        method,
        url,
        ...(payload ? { payload } : {}),
      });

      // Public routes should NOT be blocked by auth middleware
      expect(res.statusCode).not.toBe(401);
    }
  );
});
