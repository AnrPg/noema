/**
 * @noema/auth - Auth Store
 *
 * Zustand store for authentication state.
 */

import type { UserDto, UserRole, UserSettingsDto } from '@noema/api-client/user';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IAuthState, IAuthStore } from './types.js';

// ============================================================================
// Initial State
// ============================================================================

const initialState: IAuthState = {
  user: null,
  settings: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  isSessionExpired: false,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<IAuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user: UserDto | null) => {
        set({
          user,
          isAuthenticated: user !== null,
          error: null,
        });
      },

      setTokens: (accessToken: string | null, refreshToken: string | null) => {
        set({ accessToken, refreshToken });
      },

      setSettings: (settings: UserSettingsDto | null) => {
        set({ settings });
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false });
      },

      setInitialized: () => {
        set({ isInitialized: true, isLoading: false });
      },

      reset: () => {
        set({
          ...initialState,
          isInitialized: true,
          isLoading: false,
        });
      },

      setSessionExpired: (expired: boolean) => {
        set({ isSessionExpired: expired });
      },

      hasRole: (role: UserRole) => {
        const { user } = get();
        return user?.roles.includes(role) ?? false;
      },

      hasAnyRole: (roles: UserRole[]) => {
        const { user } = get();
        return roles.some((role) => user?.roles.includes(role) === true);
      },
    }),
    {
      name: 'noema-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        settings: state.settings,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectUser = (state: IAuthStore): UserDto | null => state.user;
export const selectSettings = (state: IAuthStore): UserSettingsDto | null => state.settings;
export const selectIsAuthenticated = (state: IAuthStore): boolean => state.isAuthenticated;
export const selectIsLoading = (state: IAuthStore): boolean => state.isLoading;
export const selectIsInitialized = (state: IAuthStore): boolean => state.isInitialized;
export const selectIsSessionExpired = (state: IAuthStore): boolean => state.isSessionExpired;
export const selectAuthError = (state: IAuthStore): string | null => state.error;
export const selectUserRoles = (state: IAuthStore): UserRole[] => state.user?.roles ?? [];
