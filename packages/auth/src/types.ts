/**
 * @noema/auth - Auth Store Types
 *
 * Type definitions for authentication state.
 */

import type { UserDto, UserRole, UserSettingsDto } from '@noema/api-client/user';

export interface AuthState {
  /** Current user (null if not authenticated) */
  user: UserDto | null;

  /** User settings */
  settings: UserSettingsDto | null;

  /** JWT access token */
  accessToken: string | null;

  /** JWT refresh token */
  refreshToken: string | null;

  /** Whether user is authenticated */
  isAuthenticated: boolean;

  /** Whether auth is being initialized/checked */
  isLoading: boolean;

  /** Whether auth has been initialized */
  isInitialized: boolean;

  /** Last auth error */
  error: string | null;
}

export interface AuthActions {
  /** Set user data */
  setUser: (user: UserDto | null) => void;

  /** Set tokens from login/refresh */
  setTokens: (accessToken: string | null, refreshToken: string | null) => void;

  /** Set user settings */
  setSettings: (settings: UserSettingsDto | null) => void;

  /** Set loading state */
  setLoading: (loading: boolean) => void;

  /** Set error */
  setError: (error: string | null) => void;

  /** Mark auth as initialized */
  setInitialized: () => void;

  /** Reset auth state (logout) */
  reset: () => void;

  /** Check if user has role */
  hasRole: (role: UserRole) => boolean;

  /** Check if user has any of the roles */
  hasAnyRole: (roles: UserRole[]) => boolean;
}

export type AuthStore = AuthState & AuthActions;
