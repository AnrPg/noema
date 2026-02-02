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

export interface BulkCreateCardsInput {
  deckId: string;
  cards: Array<{
    cardType: string;
    content: Record<string, unknown>;
    tags?: string[];
    notes?: string;
    source?: string;
  }>;
  duplicateStrategy?: "skip" | "update" | "create_anyway";
}

export interface BulkCreateCardsResult {
  created: number;
  skipped: number;
  updated: number;
}

export function useBulkCreateCards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: BulkCreateCardsInput,
    ): Promise<BulkCreateCardsResult> => {
      const response = await apiClient.post<{
        created: number;
        skipped: number;
        updated: number;
      }>("/cards/bulk", data);
      return {
        created: response.data.created,
        skipped: response.data.skipped || 0,
        updated: response.data.updated || 0,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cards", variables.deckId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["deck", variables.deckId] });
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

// =============================================================================
// ECOSYSTEM / CATEGORY HOOKS
// =============================================================================

import type {
  Category,
  CategorySummary,
  CategoryRelation,
  CardCategoryParticipation,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateCategoryRelationInput,
  AddCardToCategoryInput,
  BulkAddCardsToCategoryInput,
  SplitCategoryInput,
  MergeCategoriesInput,
  MoveCategoryInput,
  LearningMode,
  ViewLens,
  CategoryId,
} from "@manthanein/shared";

// Category queries
export function useCategories(params?: {
  parentId?: string;
  includeChildren?: boolean;
}) {
  const isAuthenticated = useIsAuthenticated();
  const queryParams = new URLSearchParams();
  if (params?.parentId) queryParams.set("parentId", params.parentId);
  if (params?.includeChildren) queryParams.set("includeChildren", "true");

  return useQuery<Category[]>({
    queryKey: ["categories", params],
    queryFn: () => fetcher(`/categories?${queryParams.toString()}`),
    enabled: isAuthenticated,
  });
}

export function useCategory(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<Category>({
    queryKey: ["category", categoryId],
    queryFn: () => fetcher(`/categories/${categoryId}`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export function useCategoryTree() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<Category[]>({
    queryKey: ["categories", "tree"],
    queryFn: () => fetcher("/categories/tree"),
    enabled: isAuthenticated,
  });
}

export function useCategoryAncestors(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<CategorySummary[]>({
    queryKey: ["category", categoryId, "ancestors"],
    queryFn: () => fetcher(`/categories/${categoryId}/ancestors`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export function useCategoryDescendants(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<Category[]>({
    queryKey: ["category", categoryId, "descendants"],
    queryFn: () => fetcher(`/categories/${categoryId}/descendants`),
    enabled: isAuthenticated && !!categoryId,
  });
}

// Category mutations
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryInput) =>
      apiClient.post<Category>("/categories", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["category", variables.parentId],
        });
      }
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryInput }) =>
      apiClient.patch<Category>(`/categories/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["category", variables.id] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useSplitCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SplitCategoryInput }) =>
      apiClient.post<Category[]>(`/categories/${id}/split`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useMergeCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MergeCategoriesInput) =>
      apiClient.post<Category>("/categories/merge", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useMoveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MoveCategoryInput }) =>
      apiClient.post<Category>(`/categories/${id}/reparent`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["category", variables.id] });
    },
  });
}

// Category relations
export function useCategoryRelations(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<{
    outgoing: CategoryRelation[];
    incoming: CategoryRelation[];
  }>({
    queryKey: ["category", categoryId, "relations"],
    queryFn: () => fetcher(`/categories/${categoryId}/relationships`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export function useCreateCategoryRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryRelationInput) =>
      apiClient.post<CategoryRelation>(
        `/categories/${data.sourceCategoryId}/relationships`,
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["category", variables.sourceCategoryId, "relations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["category", variables.targetCategoryId, "relations"],
      });
    },
  });
}

export function useDeleteCategoryRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      relationId,
    }: {
      categoryId: string;
      relationId: string;
    }) =>
      apiClient.delete(`/categories/${categoryId}/relationships/${relationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category"] });
    },
  });
}

// Card-category participations
export function useCategoryCards(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<CardCategoryParticipation[]>({
    queryKey: ["category", categoryId, "cards"],
    queryFn: () => fetcher(`/categories/${categoryId}/cards`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export function useCardParticipations(cardId: string) {
  const isAuthenticated = useIsAuthenticated();
  return useQuery<CardCategoryParticipation[]>({
    queryKey: ["card", cardId, "participations"],
    queryFn: () => fetcher(`/cards/${cardId}/categories`),
    enabled: isAuthenticated && !!cardId,
  });
}

export function useAddCardToCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddCardToCategoryInput) =>
      apiClient.post<CardCategoryParticipation>(
        `/categories/${data.categoryId}/cards`,
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["category", variables.categoryId, "cards"],
      });
      queryClient.invalidateQueries({
        queryKey: ["card", variables.cardId, "participations"],
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useBulkAddCardsToCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkAddCardsToCategoryInput) =>
      apiClient.post<{ added: number }>(
        `/categories/${data.categoryId}/cards/bulk`,
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["category", variables.categoryId, "cards"],
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useRemoveCardFromCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      cardId,
    }: {
      categoryId: string;
      cardId: string;
    }) => apiClient.delete(`/categories/${categoryId}/cards/${cardId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["category", variables.categoryId, "cards"],
      });
      queryClient.invalidateQueries({
        queryKey: ["card", variables.cardId, "participations"],
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// =============================================================================
// LEARNING FLOW HOOKS
// =============================================================================

export interface LearningModeConfig {
  id: string;
  categoryId: string;
  modeName: string;
  isActive: boolean;
  questionStyle: string;
  difficultyBias: number;
}

export function useLearningModes(categoryId?: string) {
  const isAuthenticated = useIsAuthenticated();
  const queryParams = categoryId ? `?categoryId=${categoryId}` : "";

  return useQuery<LearningModeConfig[]>({
    queryKey: ["learning-flow", "modes", categoryId],
    queryFn: () => fetcher(`/learning-flow/modes${queryParams}`),
    enabled: isAuthenticated,
  });
}

export function useCreateLearningMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      categoryId: string;
      modeName: string;
      questionStyle?: string;
      difficultyBias?: number;
    }) => apiClient.post<LearningModeConfig>("/learning-flow/modes", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["learning-flow", "modes", variables.categoryId],
      });
    },
  });
}

export function useActivateLearningMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ modeId, isActive }: { modeId: string; isActive: boolean }) =>
      apiClient.post(`/learning-flow/modes/${modeId}/activate`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-flow", "modes"] });
    },
  });
}

export interface NavigationData {
  prerequisitePath: CategorySummary[];
  dependentPath: CategorySummary[];
  relatedCategories: CategorySummary[];
  suggestedNext: CategorySummary[];
}

export function useLearningNavigation(categoryId: string, mode?: LearningMode) {
  const isAuthenticated = useIsAuthenticated();
  const queryParams = new URLSearchParams({ categoryId });
  if (mode) queryParams.set("mode", mode);

  return useQuery<NavigationData>({
    queryKey: ["learning-flow", "navigation", categoryId, mode],
    queryFn: () =>
      fetcher(`/learning-flow/navigation?${queryParams.toString()}`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export interface NeighborhoodData {
  center: CategorySummary;
  neighbors: Array<{
    category: CategorySummary;
    relation: CategoryRelation;
    distance: number;
  }>;
}

export function useCategoryNeighborhood(categoryId: string, depth: number = 2) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<NeighborhoodData>({
    queryKey: ["learning-flow", "neighborhood", categoryId, depth],
    queryFn: () =>
      fetcher(`/learning-flow/neighborhood/${categoryId}?depth=${depth}`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export interface EcosystemStudySession {
  id: string;
  categoryId: string;
  mode: LearningMode;
  cards: Array<{
    cardId: string;
    participationId: string;
    semanticRole: string;
  }>;
  startedAt: string;
}

export function useStartEcosystemStudySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      categoryId: string;
      mode?: LearningMode;
      lens?: ViewLens;
      maxCards?: number;
    }) =>
      apiClient.post<EcosystemStudySession>(
        "/learning-flow/study-session",
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["category", variables.categoryId],
      });
    },
  });
}

// =============================================================================
// CONTEXTUAL ANNOTATIONS (MARGINALIA) HOOKS
// =============================================================================

export interface ContextualAnnotation {
  id: string;
  cardId: string;
  categoryId: string;
  userId: string;
  type:
    | "note"
    | "question"
    | "connection"
    | "mnemonic"
    | "clarification"
    | "disagreement"
    | "extension"
    | "application";
  content: string;
  targetSelector: string | null;
  isPrivate: boolean;
  versionNumber: number;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useAnnotations(cardId: string, categoryId?: string) {
  const isAuthenticated = useIsAuthenticated();
  const queryParams = new URLSearchParams({ cardId });
  if (categoryId) queryParams.set("categoryId", categoryId);

  return useQuery<ContextualAnnotation[]>({
    queryKey: ["annotations", cardId, categoryId],
    queryFn: () => fetcher(`/annotations?${queryParams.toString()}`),
    enabled: isAuthenticated && !!cardId,
  });
}

export function useAnnotation(annotationId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<ContextualAnnotation>({
    queryKey: ["annotation", annotationId],
    queryFn: () => fetcher(`/annotations/${annotationId}`),
    enabled: isAuthenticated && !!annotationId,
  });
}

export interface CreateAnnotationInput {
  cardId: string;
  categoryId: string;
  type: ContextualAnnotation["type"];
  content: string;
  targetSelector?: string;
  isPrivate?: boolean;
  relatedConceptIds?: string[];
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAnnotationInput) =>
      apiClient.post<ContextualAnnotation>("/annotations", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["annotations", variables.cardId, variables.categoryId],
      });
    },
  });
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateAnnotationInput>;
    }) => apiClient.patch<ContextualAnnotation>(`/annotations/${id}`, data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["annotations"] });
      queryClient.invalidateQueries({ queryKey: ["annotation", variables.id] });
    },
  });
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/annotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations"] });
    },
  });
}

export function useAnnotationHistory(annotationId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<
    Array<{ versionNumber: number; content: string; updatedAt: string }>
  >({
    queryKey: ["annotation", annotationId, "history"],
    queryFn: () => fetcher(`/annotations/${annotationId}/history`),
    enabled: isAuthenticated && !!annotationId,
  });
}

// Additional annotation hooks for Lens paradigm
export interface AnnotationStats {
  totalAnnotations: number;
  activeCategories: number;
  recentActivity: number;
  byType: Record<string, number>;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
}

export function useAnnotationStats() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<AnnotationStats>({
    queryKey: ["annotations", "stats"],
    queryFn: () => fetcher("/annotations/stats"),
    enabled: isAuthenticated,
  });
}

export function useAnnotationsByCategory(categoryId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<{ data: ContextualAnnotation[]; total: number }>({
    queryKey: ["annotations", "category", categoryId],
    queryFn: () => fetcher(`/annotations/category/${categoryId}`),
    enabled: isAuthenticated && !!categoryId,
  });
}

export function useAnnotationsByCard(cardId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<{ data: ContextualAnnotation[]; total: number }>({
    queryKey: ["annotations", "card", cardId],
    queryFn: () => fetcher(`/annotations/card/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}

// =============================================================================
// DIFFERENTIAL EMPHASIS HOOKS
// =============================================================================

export type EmphasisOperation =
  | "highlight"
  | "bold"
  | "underline"
  | "color"
  | "size_increase"
  | "size_decrease"
  | "hide_initially"
  | "reveal_on_hover"
  | "progressive_reveal"
  | "annotate"
  | "link_related"
  | "simplify"
  | "expand"
  | "add_example"
  | "add_mnemonic"
  | "add_visual"
  | "custom";

export interface EmphasisRule {
  id: string;
  categoryId: string;
  userId: string;
  name: string;
  isActive: boolean;
  priority: number;
  targetType:
    | "keyword"
    | "pattern"
    | "semantic"
    | "position"
    | "difficulty"
    | "error_prone";
  targetValue: string;
  operation: EmphasisOperation;
  operationConfig: Record<string, unknown>;
  conditions: EmphasisCondition[];
  createdAt: string;
  updatedAt: string;
}

export interface EmphasisCondition {
  field: string;
  operator: "equals" | "contains" | "greater_than" | "less_than" | "matches";
  value: unknown;
}

export function useEmphasisRules(categoryId?: string) {
  const isAuthenticated = useIsAuthenticated();
  const queryParams = categoryId ? `?categoryId=${categoryId}` : "";

  return useQuery<EmphasisRule[]>({
    queryKey: ["emphasis-rules", categoryId],
    queryFn: () => fetcher(`/emphasis/rules${queryParams}`),
    enabled: isAuthenticated,
  });
}

export function useEmphasisRule(ruleId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<EmphasisRule>({
    queryKey: ["emphasis-rule", ruleId],
    queryFn: () => fetcher(`/emphasis/rules/${ruleId}`),
    enabled: isAuthenticated && !!ruleId,
  });
}

export interface CreateEmphasisRuleInput {
  categoryId: string;
  name: string;
  targetType: EmphasisRule["targetType"];
  targetValue: string;
  operation: EmphasisOperation;
  operationConfig?: Record<string, unknown>;
  conditions?: EmphasisCondition[];
  priority?: number;
}

export function useCreateEmphasisRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmphasisRuleInput) =>
      apiClient.post<EmphasisRule>("/emphasis/rules", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["emphasis-rules", variables.categoryId],
      });
    },
  });
}

export function useUpdateEmphasisRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateEmphasisRuleInput>;
    }) => apiClient.patch<EmphasisRule>(`/emphasis/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emphasis-rules"] });
    },
  });
}

export function useDeleteEmphasisRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/emphasis/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emphasis-rules"] });
    },
  });
}

export interface EmphasisPreview {
  cardId: string;
  originalContent: Record<string, unknown>;
  emphasisedContent: Record<string, unknown>;
  appliedRules: string[];
}

export function usePreviewEmphasis() {
  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId: string;
      ruleIds?: string[];
    }) => apiClient.post<EmphasisPreview>("/emphasis/preview", data),
  });
}

export function useApplyEmphasis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId: string;
      ruleIds?: string[];
    }) => apiClient.post<EmphasisPreview>("/emphasis/apply", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["card", variables.cardId] });
    },
  });
}

// =============================================================================
// MULTI-CONTEXT AWARENESS HOOKS
// =============================================================================

export interface MultiContextPerformance {
  id: string;
  cardId: string;
  categoryId: string;
  reviewedAt: string;
  wasCorrect: boolean;
  responseTime: number;
  confidenceLevel: number | null;
  contextFactors: Record<string, unknown>;
}

export function useMultiContextPerformance(cardId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<MultiContextPerformance[]>({
    queryKey: ["multi-context", "performance", cardId],
    queryFn: () => fetcher(`/multi-context/performance/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}

export function useRecordMultiContextPerformance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId: string;
      wasCorrect: boolean;
      responseTime: number;
      confidenceLevel?: number;
      contextFactors?: Record<string, unknown>;
    }) =>
      apiClient.post<MultiContextPerformance>(
        "/multi-context/performance",
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["multi-context", "performance", variables.cardId],
      });
    },
  });
}

export interface ContextComparison {
  cardId: string;
  comparisons: Array<{
    categoryId: string;
    categoryName: string;
    reviewCount: number;
    successRate: number;
    averageResponseTime: number;
    lastReviewedAt: string | null;
  }>;
  insights: string[];
}

export function useContextComparison(cardId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<ContextComparison>({
    queryKey: ["multi-context", "comparison", cardId],
    queryFn: () => fetcher(`/multi-context/comparison/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}

export interface ContextDrift {
  cardId: string;
  driftDetected: boolean;
  driftLevel: "none" | "minor" | "moderate" | "significant";
  driftingContexts: Array<{
    categoryId: string;
    categoryName: string;
    direction: "improving" | "declining";
    magnitude: number;
  }>;
  recommendation: string | null;
}

export function useContextDrift(cardId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<ContextDrift>({
    queryKey: ["multi-context", "drift", cardId],
    queryFn: () => fetcher(`/multi-context/drift/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}

export interface MetacognitiveInsight {
  id: string;
  type:
    | "context_strength"
    | "context_weakness"
    | "transfer_opportunity"
    | "consolidation_needed"
    | "overconfidence"
    | "underconfidence";
  title: string;
  description: string;
  affectedCards: string[];
  affectedCategories: string[];
  actionItems: string[];
  priority: "high" | "medium" | "low";
  generatedAt: string;
}

export function useMetacognitiveInsights() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<MetacognitiveInsight[]>({
    queryKey: ["multi-context", "insights"],
    queryFn: () => fetcher("/multi-context/insights"),
    enabled: isAuthenticated,
  });
}

export interface MultiContextReviewMoment {
  cardId: string;
  card: { id: string; content: Record<string, unknown> };
  presentationContext: {
    categoryId: string;
    categoryName: string;
    emphasisApplied: boolean;
    annotations: ContextualAnnotation[];
  };
  otherContexts: Array<{
    categoryId: string;
    categoryName: string;
    lastPerformance: number;
  }>;
  metacognitivePrompt: string | null;
}

export function useMultiContextReviewMoment(sessionId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<MultiContextReviewMoment>({
    queryKey: ["multi-context", "review-moment", sessionId],
    queryFn: () => fetcher(`/multi-context/review-moment/${sessionId}`),
    enabled: isAuthenticated && !!sessionId,
  });
}

// =============================================================================
// OFFLINE SYNC HOOKS
// =============================================================================

export interface SyncState {
  clientId: string;
  lastSyncVersion: number;
  lastSyncAt: string | null;
  pendingChangesCount: number;
  unresolvedConflictsCount: number;
  syncStatus:
    | "synced"
    | "pending_push"
    | "pending_pull"
    | "syncing"
    | "conflict"
    | "error"
    | "offline";
}

export function useSyncState(clientId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<SyncState>({
    queryKey: ["sync", "state", clientId],
    queryFn: () => fetcher(`/sync/state?clientId=${clientId}`),
    enabled: isAuthenticated && !!clientId,
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

export interface SyncConflict {
  id: string;
  entityType: string;
  entityId: string;
  conflictType:
    | "concurrent_update"
    | "update_delete"
    | "delete_update"
    | "create_create";
  severity: "critical" | "high" | "medium" | "low";
  autoResolvable: boolean;
  suggestedResolution: string;
  detectedAt: string;
}

export function useSyncConflicts() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<{ conflicts: SyncConflict[]; total: number }>({
    queryKey: ["sync", "conflicts"],
    queryFn: () => fetcher("/sync/conflicts"),
    enabled: isAuthenticated,
  });
}

export function usePushChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      clientId: string;
      lastSyncVersion: number;
      vectorClock: Record<string, number>;
      changes: unknown[];
      deviceInfo: {
        deviceId: string;
        deviceName: string;
        platform: "ios" | "android" | "web" | "desktop";
        appVersion: string;
        lastSyncAt: string | null;
      };
    }) => apiClient.post("/sync/push", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["sync", "state", variables.clientId],
      });
    },
  });
}

export function usePullChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      clientId: string;
      lastSyncVersion: number;
      vectorClock: Record<string, number>;
      entityTypes?: string[];
      since?: string;
      limit?: number;
    }) => apiClient.post("/sync/pull", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["sync", "state", variables.clientId],
      });
      // Invalidate affected queries based on pulled changes
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      conflictId: string;
      resolution:
        | "local_wins"
        | "remote_wins"
        | "latest_wins"
        | "merge"
        | "manual";
      manualData?: unknown;
    }) => apiClient.post("/sync/conflicts/resolve", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "conflicts"] });
    },
  });
}

export function useForceSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      clientId: string;
      direction: "push" | "pull" | "bidirectional";
    }) => apiClient.post("/sync/force", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sync"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// =============================================================================
// AI AUGMENTATION HOOKS
// =============================================================================

export interface AIEnhancedCard {
  originalCardId: string;
  enhancements: Array<{
    field: string;
    originalValue: string;
    enhancedValue: string;
    enhancementType:
      | "clarify"
      | "expand"
      | "simplify"
      | "format"
      | "add_context";
    rationale: string;
  }>;
  suggestedTags: string[];
  estimatedDifficulty: number;
  connections: Array<{
    targetType: "card" | "category";
    targetId: string;
    connectionType:
      | "prerequisite"
      | "related"
      | "contrasts"
      | "extends"
      | "example";
    strength: number;
    rationale: string;
    bidirectional: boolean;
  }>;
  confidence: number;
  processingTime: number;
  modelUsed: string;
}

export function useEnhanceCard() {
  return useMutation({
    mutationFn: (data: {
      cardId: string;
      options?: {
        enhanceContent?: boolean;
        generateHints?: boolean;
        suggestTags?: boolean;
        estimateDifficulty?: boolean;
        findConnections?: boolean;
        language?: string;
      };
    }) => apiClient.post<AIEnhancedCard>("/ai/enhance-card", data),
  });
}

export interface AIGeneratedAnnotation {
  id: string;
  type: "explanation" | "mnemonic" | "connection" | "question" | "example";
  content: string;
  targetContent: string | null;
  confidence: number;
  personalizationFactors: string[];
}

export function useGenerateAIAnnotations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId: string;
      maxAnnotations?: number;
      annotationTypes?: Array<
        "explanation" | "mnemonic" | "connection" | "question" | "example"
      >;
    }) =>
      apiClient.post<{
        annotations: AIGeneratedAnnotation[];
        cardId: string;
        categoryId: string;
        generatedAt: string;
      }>("/ai/generate-annotations", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["annotations", variables.cardId, variables.categoryId],
      });
    },
  });
}

export interface AIEmphasisSuggestion {
  id: string;
  targetPattern: string;
  emphasisType: string;
  operation: EmphasisOperation;
  rationale: string;
  expectedImpact: string;
  confidence: number;
}

export function useSuggestEmphasis() {
  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId?: string;
      maxSuggestions?: number;
    }) =>
      apiClient.post<{
        suggestions: AIEmphasisSuggestion[];
        cardId: string;
        analysisFactors: string[];
      }>("/ai/suggest-emphasis", data),
  });
}

export interface AIContextAnalysis {
  patterns: Array<{
    patternId: string;
    description: string;
    affectedCategories: string[];
    impactScore: number;
    actionable: boolean;
  }>;
  insights: string[];
  recommendations: Array<{
    recommendationId: string;
    type:
      | "study_order"
      | "context_switch"
      | "review_focus"
      | "connection_build";
    description: string;
    expectedBenefit: string;
    implementationSteps: string[];
  }>;
  confidence: number;
  analysisTime: number;
}

export function useAnalyzeContext() {
  return useMutation({
    mutationFn: (data: {
      categoryIds: string[];
      timeRange?: { start: string; end: string };
      includePerformanceData?: boolean;
    }) => apiClient.post<AIContextAnalysis>("/ai/analyze-context", data),
  });
}

export interface AIMetacognitiveInsight {
  insightId: string;
  category: "strength" | "weakness" | "pattern" | "opportunity";
  title: string;
  description: string;
  evidence: string[];
  actionableAdvice: string[];
  priority: "high" | "medium" | "low";
}

export function useGenerateMetacognitiveInsights() {
  return useMutation({
    mutationFn: (data: {
      recentDays?: number;
      focusAreas?: Array<"strength" | "weakness" | "pattern" | "opportunity">;
      maxInsights?: number;
    }) =>
      apiClient.post<{
        insights: AIMetacognitiveInsight[];
        profileSummary: {
          userId: string;
          learningLevel: string;
          preferredExplanationStyle: string;
          knownConcepts: string[];
          strugglingAreas: string[];
          learningGoals: string[];
          languagePreference: string;
        };
        generatedAt: string;
      }>("/ai/metacognitive-insights", data),
  });
}

export interface AIProvider {
  id: string;
  name: string;
  capabilities: string[];
  isConfigured: boolean;
  requiresApiKey: boolean;
}

export function useAIProviders() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<{ providers: AIProvider[] }>({
    queryKey: ["ai", "providers"],
    queryFn: () => fetcher("/ai/providers"),
    enabled: isAuthenticated,
  });
}

export function useConfigureAIProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      providerId: string;
      apiEndpoint?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      customHeaders?: Record<string, string>;
    }) => apiClient.post("/ai/providers/configure", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "providers"] });
    },
  });
}

// =============================================================================
// LENS-SPECIFIC AI HOOKS
// =============================================================================

export interface AICategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number;
  rationale: string;
  semanticIntent: string;
  suggestedRole: string;
}

export function useAISuggestCategory() {
  return useMutation({
    mutationFn: (data: {
      cardId: string;
      currentCategories?: string[];
      maxSuggestions?: number;
    }) =>
      apiClient.post<{
        suggestions: AICategorySuggestion[];
        cardId: string;
        analysisFactors: string[];
      }>("/ai/suggest-category", data),
  });
}

export function useAIGenerateAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryId: string;
      type?: "note" | "question" | "insight" | "connection" | "example";
      context?: string;
    }) =>
      apiClient.post<AIGeneratedAnnotation>("/ai/generate-annotation", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["annotations", variables.cardId, variables.categoryId],
      });
      queryClient.invalidateQueries({
        queryKey: ["annotations", "card", variables.cardId],
      });
    },
  });
}

export function useAIDetectContextDrift() {
  return useMutation({
    mutationFn: (data: {
      cardId: string;
      categoryIds?: string[];
      timeRange?: { start: string; end: string };
    }) =>
      apiClient.post<{
        cardId: string;
        driftDetected: boolean;
        driftLevel: "none" | "minor" | "moderate" | "significant";
        driftingContexts: Array<{
          categoryId: string;
          categoryName: string;
          direction: "improving" | "declining";
          magnitude: number;
          reasons: string[];
        }>;
        recommendation: string | null;
      }>("/ai/detect-context-drift", data),
  });
}

export function useAIOptimizeEmphasis() {
  return useMutation({
    mutationFn: (data: {
      categoryId: string;
      cardIds?: string[];
      optimizationGoal?: "retention" | "speed" | "understanding" | "balanced";
    }) =>
      apiClient.post<{
        categoryId: string;
        optimizations: Array<{
          cardId: string;
          currentEmphasis: number;
          suggestedEmphasis: number;
          rationale: string;
          expectedImpact: string;
        }>;
        overallStrategy: string;
      }>("/ai/optimize-emphasis", data),
  });
}

export function useEmphasisRulesForCard(cardId: string) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery<
    Array<{
      ruleId: string;
      categoryId: string;
      categoryName: string;
      operation: EmphasisOperation;
      multiplier: number;
      appliedAt: string;
    }>
  >({
    queryKey: ["emphasis-rules", "card", cardId],
    queryFn: () => fetcher(`/emphasis/rules/card/${cardId}`),
    enabled: isAuthenticated && !!cardId,
  });
}
