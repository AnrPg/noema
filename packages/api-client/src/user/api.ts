/**
 * @noema/api-client - User Service API
 *
 * API methods for User Service endpoints.
 */

import { http } from '../client.js';
import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  PublicUserResponse,
  RegisterInput,
  TokenRefreshResponse,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserFilters,
  UserResponse,
  UserSettingsResponse,
  UsersListResponse,
} from './types.js';

// ============================================================================
// Auth API
// ============================================================================

export const authApi = {
  /**
   * Register a new user account.
   */
  register: (data: RegisterInput): Promise<AuthResponse> =>
    http.post('/auth/register', data),

  /**
   * Login with username/email and password.
   */
  login: (data: LoginInput): Promise<AuthResponse> =>
    http.post('/auth/login', data),

  /**
   * Refresh access token using refresh token.
   */
  refresh: (refreshToken: string): Promise<TokenRefreshResponse> =>
    http.post('/auth/refresh', { refreshToken }),

  /**
   * Logout and invalidate tokens.
   */
  logout: (): Promise<void> =>
    http.post('/auth/logout'),
};

// ============================================================================
// Users API
// ============================================================================

export const usersApi = {
  /**
   * Get user by ID.
   */
  getById: (id: string): Promise<UserResponse> =>
    http.get(`/users/${id}`),

  /**
   * Get public profile by username.
   */
  getPublicProfile: (username: string): Promise<PublicUserResponse> =>
    http.get(`/users/username/${username}/public`),

  /**
   * List users with filters (admin only).
   */
  list: (
    filters?: UserFilters,
    pagination?: { offset?: number; limit?: number }
  ): Promise<UsersListResponse> =>
    http.get('/users', {
      params: {
        ...filters,
        offset: pagination?.offset,
        limit: pagination?.limit,
      },
    }),

  /**
   * Update user profile.
   */
  updateProfile: (
    id: string,
    data: UpdateProfileInput,
    version: number
  ): Promise<UserResponse> =>
    http.patch(`/users/${id}/profile`, { data, version }),

  /**
   * Delete user (soft delete by default).
   */
  delete: (id: string, soft = true): Promise<void> =>
    http.delete(`/users/${id}`, { params: { soft } }),
};

// ============================================================================
// Me API (Current User Shortcuts)
// ============================================================================

export const meApi = {
  /**
   * Get current user profile.
   */
  get: (): Promise<UserResponse> =>
    http.get('/me'),

  /**
   * Update current user profile.
   */
  updateProfile: (data: UpdateProfileInput, version: number): Promise<UserResponse> =>
    http.patch('/me/profile', { data, version }),

  /**
   * Get current user settings.
   */
  getSettings: (): Promise<UserSettingsResponse> =>
    http.get('/me/settings'),

  /**
   * Update current user settings.
   */
  updateSettings: (data: UpdateSettingsInput, version: number): Promise<UserSettingsResponse> =>
    http.patch('/me/settings', { data, version }),

  /**
   * Change password.
   */
  changePassword: (data: ChangePasswordInput, version: number): Promise<UserResponse> =>
    http.post('/me/password', { ...data, version }),

  /**
   * Delete current user account.
   */
  deleteAccount: (): Promise<void> =>
    http.delete('/me'),
};
