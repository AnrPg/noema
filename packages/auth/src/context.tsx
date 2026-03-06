/**
 * @noema/auth - Auth Context
 *
 * React context for auth operations with API integration.
 */

'use client';

import { ApiRequestError } from '@noema/api-client';
import {
  authApi,
  meApi,
  type LoginInput,
  type RegisterInput,
  type UserDto,
  type UserSettingsDto,
} from '@noema/api-client/user';
import { createContext, useCallback, useContext, useEffect, type JSX, type ReactNode } from 'react';
import { useAuthStore } from './store.js';

// ============================================================================
// Types
// ============================================================================

export interface IAuthContextValue {
  /** Current user */
  user: UserDto | null;

  /** User settings */
  settings: UserSettingsDto | null;

  /** Whether authenticated */
  isAuthenticated: boolean;

  /** Loading state */
  isLoading: boolean;

  /** Whether initialized */
  isInitialized: boolean;

  /** Last error */
  error: string | null;

  /** Login */
  login: (input: LoginInput) => Promise<void>;

  /** Register */
  register: (input: RegisterInput) => Promise<void>;

  /** Logout */
  logout: () => Promise<void>;

  /** Refresh user data */
  refreshUser: () => Promise<void>;

  /** Check if user has role */
  hasRole: (role: string) => boolean;

  /** Check if user is admin */
  isAdmin: boolean;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<IAuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface IAuthProviderProps {
  children: ReactNode;
  /** Called after successful login */
  onLogin?: (user: UserDto) => void;
  /** Called after logout */
  onLogout?: () => void;
}

export function AuthProvider({ children, onLogin, onLogout }: IAuthProviderProps): JSX.Element {
  // Individual selectors — each subscribes only to its own slice of state,
  // preventing the entire component from re-rendering on every store update.
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const settings = useAuthStore((s) => s.settings);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  // Actions are stable references in Zustand (never recreated), so selecting
  // them individually is safe and avoids closing over a stale store object.
  const setUser = useAuthStore((s) => s.setUser);
  const setSettings = useAuthStore((s) => s.setSettings);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setError = useAuthStore((s) => s.setError);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const reset = useAuthStore((s) => s.reset);
  const setTokens = useAuthStore((s) => s.setTokens);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async (): Promise<void> => {
      if (isInitialized) return;

      try {
        // Try to get current user
        const response = await meApi.get();
        setUser(response.data);

        // Also fetch settings
        try {
          const settingsResponse = await meApi.getSettings();
          setSettings(settingsResponse.data);
        } catch {
          // Settings fetch failure is non-critical
        }
      } catch (err) {
        // Not authenticated or error
        if (err instanceof ApiRequestError && err.status === 401) {
          // Normal - not authenticated
        } else {
          console.error('Auth init error:', err);
        }
        reset();
      } finally {
        setInitialized();
      }
    };

    void initAuth();
  }, [isInitialized, setUser, setSettings, reset, setInitialized]);

  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true);
      setError(null);

      try {
        const response = await authApi.login(input);
        setUser(response.data.user);
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);

        // Fetch settings after login
        try {
          const settingsResponse = await meApi.getSettings();
          setSettings(settingsResponse.data);
        } catch {
          // Non-critical
        }

        onLogin?.(response.data.user);
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : 'Login failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setUser, setTokens, setSettings, onLogin]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      setLoading(true);
      setError(null);

      try {
        const response = await authApi.register(input);
        setUser(response.data.user);
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        onLogin?.(response.data.user);
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setUser, setTokens, onLogin]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      reset();
      onLogout?.();
    }
  }, [reset, onLogout]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await meApi.get();
      setUser(response.data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        reset();
      }
      throw err;
    }
  }, [setUser, reset]);

  const hasRole = useCallback(
    (role: string) => {
      return user?.roles.includes(role as never) ?? false;
    },
    [user]
  );

  const value: IAuthContextValue = {
    user,
    settings,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    login,
    register,
    logout,
    refreshUser,
    hasRole,
    isAdmin: user?.roles.includes('admin') ?? false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): IAuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
