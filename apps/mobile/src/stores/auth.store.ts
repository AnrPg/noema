// =============================================================================
// AUTH STORE
// =============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/services/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

// Secure storage adapter for tokens
const secureStorage = {
  getItem: async (name: string) => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.error('Error saving to secure store:', error);
    }
  },
  removeItem: async (name: string) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.error('Error removing from secure store:', error);
    }
  },
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      tokens: null,
      isAuthenticated: false,
      isHydrated: false,
      isLoading: false,
      error: null,

      // Actions
      hydrate: async () => {
        try {
          const storedTokens = await SecureStore.getItemAsync('auth-tokens');
          if (storedTokens) {
            const tokens = JSON.parse(storedTokens) as AuthTokens;
            set({ tokens, isAuthenticated: true });
            
            // Fetch user profile
            apiClient.setAuthToken(tokens.accessToken);
            const response = await apiClient.get<{ data: User }>('/users/me');
            set({ user: response.data.data });
          }
        } catch (error) {
          console.error('Failed to hydrate auth state:', error);
          // Clear invalid tokens
          await SecureStore.deleteItemAsync('auth-tokens');
          set({ tokens: null, user: null, isAuthenticated: false });
        } finally {
          set({ isHydrated: true });
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiClient.post<{
            data: { user: User; tokens: AuthTokens };
          }>('/auth/login', { email, password });

          const { user, tokens } = response.data.data;
          
          // Store tokens securely
          await SecureStore.setItemAsync('auth-tokens', JSON.stringify(tokens));
          
          // Update API client
          apiClient.setAuthToken(tokens.accessToken);
          
          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          const message = error.response?.data?.message || 'Login failed';
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      register: async (email, password, displayName) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiClient.post<{
            data: { user: User; tokens: AuthTokens };
          }>('/auth/register', { email, password, displayName });

          const { user, tokens } = response.data.data;
          
          await SecureStore.setItemAsync('auth-tokens', JSON.stringify(tokens));
          apiClient.setAuthToken(tokens.accessToken);
          
          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          const message = error.response?.data?.message || 'Registration failed';
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      logout: async () => {
        try {
          const { tokens } = get();
          if (tokens?.refreshToken) {
            await apiClient.post('/auth/logout', {
              refreshToken: tokens.refreshToken,
            });
          }
        } catch (error) {
          console.error('Error during logout:', error);
        } finally {
          await SecureStore.deleteItemAsync('auth-tokens');
          apiClient.clearAuthToken();
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            error: null,
          });
        }
      },

      refreshTokens: async () => {
        const { tokens } = get();
        if (!tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await apiClient.post<{
            data: { tokens: AuthTokens };
          }>('/auth/refresh', { refreshToken: tokens.refreshToken });

          const newTokens = response.data.data.tokens;
          
          await SecureStore.setItemAsync('auth-tokens', JSON.stringify(newTokens));
          apiClient.setAuthToken(newTokens.accessToken);
          
          set({ tokens: newTokens });
        } catch (error) {
          // Token refresh failed, logout user
          await get().logout();
          throw error;
        }
      },

      updateUser: (userData) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...userData } });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        // Only persist tokens, hydration will fetch user
        tokens: state.tokens,
      }),
    }
  )
);
