/**
 * @noema/auth - Auth Store
 *
 * Zustand store for authentication state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserDto, UserSettingsDto } from '@noema/api-client/user';
import type { AuthStore, AuthState } from './types.js';

// ============================================================================
// Initial State
// ============================================================================

const initialState: AuthState = {
  user: null,
  settings: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<AuthStore>()(
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

      hasRole: (role) => {
        const { user } = get();
        return user?.roles.includes(role) ?? false;
      },

      hasAnyRole: (roles) => {
        const { user } = get();
        return roles.some((role) => user?.roles.includes(role)) ?? false;
      },
    }),
    {
      name: 'noema-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        settings: state.settings,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectUser = (state: AuthStore) => state.user;
export const selectSettings = (state: AuthStore) => state.settings;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectIsLoading = (state: AuthStore) => state.isLoading;
export const selectIsInitialized = (state: AuthStore) => state.isInitialized;
export const selectAuthError = (state: AuthStore) => state.error;
export const selectUserRoles = (state: AuthStore) => state.user?.roles ?? [];
