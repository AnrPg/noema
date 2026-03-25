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

function getTokenExpiryTimestamp(token: string): number | null {
  try {
    const [, payload = ''] = token.split('.');
    if (payload === '') return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decodedPayload = JSON.parse(globalThis.atob(paddedPayload)) as { exp?: unknown };

    return typeof decodedPayload.exp === 'number' ? decodedPayload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function shouldResetPersistedSession(accessToken: string | null): boolean {
  if (accessToken === null) return true;

  const expiryTimestamp = getTokenExpiryTimestamp(accessToken);
  return expiryTimestamp !== null && expiryTimestamp <= Date.now();
}

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
  // Individual selectors - each subscribes only to its own slice of state,
  // preventing the entire component from re-rendering on every store update.
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
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

  const shouldPreserveNewerAuthState = useCallback(
    (initialAccessToken: string | null, initialRefreshToken: string | null): boolean => {
      const currentState = useAuthStore.getState();

      return (
        currentState.accessToken !== initialAccessToken ||
        currentState.refreshToken !== initialRefreshToken
      );
    },
    []
  );

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async (): Promise<void> => {
      const authState = useAuthStore.getState();
      const initialAccessToken = authState.accessToken;
      const initialRefreshToken = authState.refreshToken;

      if (
        authState.accessToken === null &&
        authState.refreshToken === null &&
        !authState.isAuthenticated &&
        authState.user === null
      ) {
        setInitialized();
        return;
      }

      if (shouldResetPersistedSession(initialAccessToken)) {
        if (!shouldPreserveNewerAuthState(initialAccessToken, initialRefreshToken)) {
          reset();
        }
        setInitialized();
        return;
      }

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
        if (!shouldPreserveNewerAuthState(initialAccessToken, initialRefreshToken)) {
          reset();
        }
      } finally {
        setInitialized();
      }
    };

    void initAuth();
  }, [setUser, setSettings, reset, setInitialized, shouldPreserveNewerAuthState]);

  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true);
      setError(null);

      try {
        const response = await authApi.login(input);
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        setUser(response.data.user);

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
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        setUser(response.data.user);
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

  const hasValidSession = isAuthenticated && accessToken !== null && user !== null;

  const value: IAuthContextValue = {
    user,
    settings,
    isAuthenticated: hasValidSession,
    isLoading,
    isInitialized,
    error,
    login,
    register,
    logout,
    refreshUser,
    hasRole,
    isAdmin: hasValidSession && user.roles.includes('admin'),
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
