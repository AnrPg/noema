// =============================================================================
// API CLIENT SERVICE
// =============================================================================

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

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

// Generic fetcher
async function fetcher<T>(url: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(url);
  return response.data.data;
}

// User hooks
export function useUser() {
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: () => fetcher("/users/me"),
  });
}

export function useUserStats() {
  return useQuery({
    queryKey: ["user", "stats"],
    queryFn: () => fetcher("/users/me/stats"),
  });
}

// Deck hooks
export function useDecks(params?: { parentDeckId?: string }) {
  return useQuery({
    queryKey: ["decks", params],
    queryFn: () =>
      fetcher(
        `/decks${params?.parentDeckId ? `?parentDeckId=${params.parentDeckId}` : ""}`,
      ),
  });
}

export function useDeck(deckId: string) {
  return useQuery({
    queryKey: ["deck", deckId],
    queryFn: () => fetcher(`/decks/${deckId}`),
    enabled: !!deckId,
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
  return useQuery({
    queryKey: ["cards", deckId],
    queryFn: () => fetcher(`/cards?deckId=${deckId}`),
    enabled: !!deckId,
  });
}

export function useCard(cardId: string) {
  return useQuery({
    queryKey: ["card", cardId],
    queryFn: () => fetcher(`/cards/${cardId}`),
    enabled: !!cardId,
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
  return useQuery({
    queryKey: ["study", "queue", deckId],
    queryFn: () => fetcher(`/study/queue${deckId ? `?deckId=${deckId}` : ""}`),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useTodayProgress() {
  return useQuery({
    queryKey: ["study", "today"],
    queryFn: () => fetcher("/study/today"),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useStartStudySession() {
  return useMutation({
    mutationFn: (data: { deckId?: string; sessionType?: string }) =>
      apiClient.post<{ data: { id: string } }>("/study/sessions", data),
  });
}

export function useEndStudySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.post(`/study/sessions/${sessionId}/end`),
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
  return useQuery({
    queryKey: ["gamification", "xp"],
    queryFn: () => fetcher("/gamification/xp"),
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ["gamification", "achievements"],
    queryFn: () => fetcher("/gamification/achievements"),
  });
}

export function useStreak() {
  return useQuery({
    queryKey: ["gamification", "streak"],
    queryFn: () => fetcher("/gamification/streak"),
  });
}

export function useLeaderboard(type: string = "xp") {
  return useQuery({
    queryKey: ["gamification", "leaderboard", type],
    queryFn: () => fetcher(`/gamification/leaderboard?type=${type}`),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
