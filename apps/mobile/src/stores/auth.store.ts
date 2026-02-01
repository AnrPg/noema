// =============================================================================
// AUTH STORE
// =============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiClient, setAuthHandlers } from "@/services/api";
import { authState } from "./auth-state";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
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
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

// REST API helper function
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}/api/v1${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `Request failed with status ${response.status}`,
    );
  }

  return data;
}

// Platform-aware secure storage helpers
const secureStorageGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
};

const secureStorageSet = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const secureStorageRemove = async (key: string): Promise<void> => {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

// Secure storage adapter for tokens
const secureStorage = {
  getItem: async (name: string) => {
    try {
      return await secureStorageGet(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await secureStorageSet(name, value);
    } catch (error) {
      console.error("Error saving to secure store:", error);
    }
  },
  removeItem: async (name: string) => {
    try {
      await secureStorageRemove(name);
    } catch (error) {
      console.error("Error removing from secure store:", error);
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
        console.log("Auth hydrate started");
        try {
          const storedTokens = await secureStorageGet("auth-tokens");
          console.log("Stored tokens:", storedTokens ? "found" : "none");
          if (storedTokens) {
            const tokens = JSON.parse(storedTokens) as AuthTokens;
            set({ tokens, isAuthenticated: true });

            // Try to fetch user profile via REST API
            try {
              apiClient.setAuthToken(tokens.accessToken);

              const data = await apiRequest<User>("/users/me", {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });
              set({ user: data });
            } catch (apiError) {
              console.warn("Could not fetch user profile:", apiError);
              // Still keep authenticated state, will retry later
            }
          }
        } catch (error) {
          console.error("Failed to hydrate auth state:", error);
          // Clear invalid tokens
          await secureStorageRemove("auth-tokens");
          set({ tokens: null, user: null, isAuthenticated: false });
        } finally {
          console.log("Auth hydrate complete");
          set({ isHydrated: true });
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });

        try {
          const data = await apiRequest<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });

          const { user, accessToken, refreshToken } = data;
          const tokens = { accessToken, refreshToken };

          // Store tokens securely
          await secureStorageSet("auth-tokens", JSON.stringify(tokens));

          // Update API client
          apiClient.setAuthToken(tokens.accessToken);

          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          const message = error.message || "Login failed";
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      register: async (email, password, displayName) => {
        set({ isLoading: true, error: null });

        try {
          const data = await apiRequest<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>("/auth/register", {
            method: "POST",
            body: JSON.stringify({ email, password, displayName }),
          });

          const { user, accessToken, refreshToken } = data;
          const tokens = { accessToken, refreshToken };

          await secureStorageSet("auth-tokens", JSON.stringify(tokens));
          apiClient.setAuthToken(tokens.accessToken);

          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          const message = error.message || "Registration failed";
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      logout: async () => {
        // Clear local state (no server-side logout needed for JWT)
        await secureStorageRemove("auth-tokens");
        apiClient.clearAuthToken();
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshTokens: async () => {
        const { tokens } = get();
        if (!tokens?.refreshToken) {
          throw new Error("No refresh token available");
        }

        try {
          const data = await apiRequest<{
            accessToken: string;
            refreshToken: string;
          }>("/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refreshToken: tokens.refreshToken }),
          });

          const newTokens = {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          };

          await secureStorageSet("auth-tokens", JSON.stringify(newTokens));
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
      name: "auth-storage",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        // Only persist tokens, hydration will fetch user
        tokens: state.tokens,
      }),
    },
  ),
);

// Register auth handlers with API client to break circular dependency
setAuthHandlers({
  refreshTokens: () => useAuthStore.getState().refreshTokens(),
  getTokens: () => useAuthStore.getState().tokens,
  logout: () => useAuthStore.getState().logout(),
});

// Sync authState with store changes for API hooks
// Set initial state immediately
authState.setAuthenticated(useAuthStore.getState().isAuthenticated);
// Subscribe to future changes
useAuthStore.subscribe((state) => {
  authState.setAuthenticated(state.isAuthenticated);
});
