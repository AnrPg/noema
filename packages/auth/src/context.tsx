/**
 * @noema/auth - Auth Context
 *
 * React context for auth operations with API integration.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import {
  authApi,
  meApi,
  type LoginInput,
  type RegisterInput,
  type UserDto,
  type UserSettingsDto,
} from '@noema/api-client/user';
import { ApiRequestError } from '@noema/api-client';
import { useAuthStore } from './store.js';

// ============================================================================
// Types
// ============================================================================

export interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface AuthProviderProps {
  children: ReactNode;
  /** Called after successful login */
  onLogin?: (user: UserDto) => void;
  /** Called after logout */
  onLogout?: () => void;
}

export function AuthProvider({ children, onLogin, onLogout }: AuthProviderProps) {
  const store = useAuthStore();

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      if (store.isInitialized) return;

      try {
        // Try to get current user
        const response = await meApi.get();
        store.setUser(response.data);

        // Also fetch settings
        try {
          const settingsResponse = await meApi.getSettings();
          store.setSettings(settingsResponse.data);
        } catch {
          // Settings fetch failure is non-critical
        }
      } catch (error) {
        // Not authenticated or error
        if (error instanceof ApiRequestError && error.status === 401) {
          // Normal - not authenticated
        } else {
          console.error('Auth init error:', error);
        }
        store.reset();
      } finally {
        store.setInitialized();
      }
    };

    initAuth();
  }, [store.isInitialized]);

  const login = useCallback(async (input: LoginInput) => {
    store.setLoading(true);
    store.setError(null);

    try {
      const response = await authApi.login(input);
      store.setUser(response.data.user);

      // Fetch settings after login
      try {
        const settingsResponse = await meApi.getSettings();
        store.setSettings(settingsResponse.data);
      } catch {
        // Non-critical
      }

      store.setLoading(false);
      onLogin?.(response.data.user);
    } catch (error) {
      const message = error instanceof ApiRequestError
        ? error.message
        : 'Login failed';
      store.setError(message);
      throw error;
    }
  }, [onLogin]);

  const register = useCallback(async (input: RegisterInput) => {
    store.setLoading(true);
    store.setError(null);

    try {
      const response = await authApi.register(input);
      store.setUser(response.data.user);
      store.setLoading(false);
      onLogin?.(response.data.user);
    } catch (error) {
      const message = error instanceof ApiRequestError
        ? error.message
        : 'Registration failed';
      store.setError(message);
      throw error;
    }
  }, [onLogin]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      store.reset();
      onLogout?.();
    }
  }, [onLogout]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await meApi.get();
      store.setUser(response.data);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        store.reset();
      }
      throw error;
    }
  }, []);

  const hasRole = useCallback((role: string) => {
    return store.user?.roles.includes(role as never) ?? false;
  }, [store.user]);

  const value: AuthContextValue = {
    user: store.user,
    settings: store.settings,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,
    error: store.error,
    login,
    register,
    logout,
    refreshUser,
    hasRole,
    isAdmin: store.user?.roles.includes('admin') ?? false,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
