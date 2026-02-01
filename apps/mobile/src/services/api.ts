// =============================================================================
// API CLIENT SERVICE
// =============================================================================

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api/v1";

// Auth handlers set by auth store to avoid circular dependency
type RefreshTokensHandler = () => Promise<void>;
type GetTokensHandler = () => {
  accessToken: string;
  refreshToken: string;
} | null;
type LogoutHandler = () => Promise<void>;

let refreshTokensHandler: RefreshTokensHandler | null = null;
let getTokensHandler: GetTokensHandler | null = null;
let logoutHandler: LogoutHandler | null = null;

// Called by auth store to register handlers
export function setAuthHandlers(handlers: {
  refreshTokens: RefreshTokensHandler;
  getTokens: GetTokensHandler;
  logout: LogoutHandler;
}) {
  refreshTokensHandler = handlers.refreshTokens;
  getTokensHandler = handlers.getTokens;
  logoutHandler = handlers.logout;
}

class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 errors (token expired)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh tokens using registered handler
            if (refreshTokensHandler) {
              await refreshTokensHandler();

              // Retry the original request with new token
              const tokens = getTokensHandler?.();
              if (tokens?.accessToken) {
                originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
                return this.client(originalRequest);
              }
            }
          } catch (refreshError) {
            // Refresh failed, logout
            if (logoutHandler) {
              await logoutHandler();
            }
          }
        }

        return Promise.reject(error);
      },
    );
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  // Upload file with progress tracking
  async uploadFile(
    url: string,
    file: { uri: string; name: string; type: string },
    onProgress?: (progress: number) => void,
  ): Promise<AxiosResponse> {
    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    return this.client.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });
  }
}

export const apiClient = new ApiClient();

// =============================================================================
// API HOOKS
// =============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useIsAuthenticated } from "@/stores/auth-state";

// Generic fetcher with proper error handling
async function fetcher<T>(url: string): Promise<T> {
  try {
    const response = await apiClient.get<{ data: T } | T>(url);
    // Handle different response structures
    const data = response.data;
    if (data && typeof data === "object" && "data" in data) {
      return (data as { data: T }).data;
    }
    return data as T;
  } catch (error: any) {
    // Extract error message from response or error object
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Request failed";
    throw new Error(message);
  }
}

// User hooks
export function useUser() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: () => fetcher("/users/me"),
    enabled: isAuthenticated,
  });
}

export function useUserStats() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["user", "stats"],
    queryFn: () => fetcher("/users/me/stats"),
    enabled: isAuthenticated,
  });
}

// Deck hooks
export function useDecks(params?: { parentDeckId?: string }) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["decks", params],
    queryFn: () =>
      fetcher(
        `/decks${params?.parentDeckId ? `?parentDeckId=${params.parentDeckId}` : ""}`,
      ),
    enabled: isAuthenticated,
  });
}

export function useDeck(deckId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["deck", deckId],
    queryFn: () => fetcher(`/decks/${deckId}`),
    enabled: isAuthenticated && !!deckId,
  });
}

export function useCreateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      parentDeckId?: string;
    }) => apiClient.post("/decks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useUpdateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/decks/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["deck", variables.id] });
    },
  });
}

export function useDeleteDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/decks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

// Card hooks
export function useCards(deckId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["cards", deckId],
    queryFn: () => fetcher(`/cards?deckId=${deckId}`),
    enabled: isAuthenticated && !!deckId,
  });
}

export function useCard(cardId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["card", cardId],
    queryFn: () => fetcher(`/cards/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}

export function useCreateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.post("/cards", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cards", variables.deckId] });
    },
  });
}

// Study hooks
export function useStudyQueue(deckId?: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["study", "queue", deckId],
    queryFn: () => fetcher(`/study/queue${deckId ? `?deckId=${deckId}` : ""}`),
    staleTime: 1000 * 60, // 1 minute
    enabled: isAuthenticated,
  });
}

export function useTodayProgress() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["study", "today"],
    queryFn: () => fetcher("/study/today"),
    staleTime: 1000 * 30, // 30 seconds
    enabled: isAuthenticated,
  });
}

export function useStartStudySession() {
  return useMutation({
    mutationFn: (data: { deckId?: string; sessionType?: string }) =>
      // API returns session object directly: { id, userId, deckId, sessionType, ... }
      apiClient.post<{ id: string; userId: string; deckId?: string }>(
        "/study/sessions",
        data,
      ),
  });
}

export function useEndStudySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.patch(`/study/sessions/${sessionId}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study"] });
      queryClient.invalidateQueries({ queryKey: ["gamification"] });
    },
  });
}

// Review hooks
export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      cardId: string;
      rating: number;
      responseTimeMs: number;
      studySessionId?: string;
      confidenceBefore?: number;
    }) => apiClient.post("/reviews", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", "queue"] });
      queryClient.invalidateQueries({ queryKey: ["study", "today"] });
    },
  });
}

// Gamification hooks
export function useXPInfo() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["gamification", "xp"],
    queryFn: () => fetcher("/gamification/xp"),
    enabled: isAuthenticated,
  });
}

export function useAchievements() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["gamification", "achievements"],
    queryFn: () => fetcher("/gamification/achievements"),
    enabled: isAuthenticated,
  });
}

export function useStreak() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["gamification", "streak"],
    queryFn: () => fetcher("/gamification/streak"),
    enabled: isAuthenticated,
  });
}

export function useLeaderboard(type: string = "xp") {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["gamification", "leaderboard", type],
    queryFn: () => fetcher(`/gamification/leaderboard?type=${type}`),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: isAuthenticated,
  });
}
