/**
 * @noema/api-client - TanStack Query Hooks
 *
 * React Query hooks for Noema service APIs.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { authApi, meApi, usersApi } from '../user/api.js';
import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  PublicUserResponse,
  RegisterInput,
  TokenRefreshResponse,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserDto,
  UserFilters,
  UserResponse,
  UserSettingsDto,
  UserSettingsResponse,
  UsersListResponse
} from '../user/types.js';

// ============================================================================
// Query Keys
// ============================================================================

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters?: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  publicProfile: (username: string) => [...userKeys.all, 'public', username] as const,
  me: () => ['me'] as const,
  meSettings: () => ['me', 'settings'] as const,
};

// ============================================================================
// Auth Hooks
// ============================================================================

export function useLogin(
  options?: UseMutationOptions<AuthResponse, Error, LoginInput>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      // Update the 'me' cache with the logged-in user
      queryClient.setQueryData(userKeys.me(), data);
    },
    ...options,
  });
}

export function useRegister(
  options?: UseMutationOptions<AuthResponse, Error, RegisterInput>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      queryClient.setQueryData(userKeys.me(), data);
    },
    ...options,
  });
}

export function useLogout(options?: UseMutationOptions<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Clear all user-related cache
      queryClient.removeQueries({ queryKey: userKeys.me() });
      queryClient.removeQueries({ queryKey: userKeys.meSettings() });
    },
    ...options,
  });
}

export function useRefreshToken(
  options?: UseMutationOptions<TokenRefreshResponse, Error, string>
) {
  return useMutation({
    mutationFn: authApi.refresh,
    ...options,
  });
}

// ============================================================================
// Me Hooks (Current User)
// ============================================================================

export function useMe(
  options?: Omit<UseQueryOptions<UserResponse, Error, UserDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: meApi.get,
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

export function useMySettings(
  options?: Omit<UseQueryOptions<UserSettingsResponse, Error, UserSettingsDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: userKeys.meSettings(),
    queryFn: meApi.getSettings,
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useUpdateProfile(
  options?: UseMutationOptions<UserResponse, Error, { data: UpdateProfileInput; version: number }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, version }) => meApi.updateProfile(data, version),
    onSuccess: (response) => {
      queryClient.setQueryData(userKeys.me(), response);
    },
    ...options,
  });
}

export function useUpdateSettings(
  options?: UseMutationOptions<UserSettingsResponse, Error, { data: UpdateSettingsInput; version: number }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, version }) => meApi.updateSettings(data, version),
    onSuccess: (response) => {
      queryClient.setQueryData(userKeys.meSettings(), response);
    },
    ...options,
  });
}

export function useChangePassword(
  options?: UseMutationOptions<UserResponse, Error, { data: ChangePasswordInput; version: number }>
) {
  return useMutation({
    mutationFn: ({ data, version }) => meApi.changePassword(data, version),
    ...options,
  });
}

export function useDeleteAccount(options?: UseMutationOptions<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meApi.deleteAccount,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: userKeys.me() });
      queryClient.removeQueries({ queryKey: userKeys.meSettings() });
    },
    ...options,
  });
}

export function useMyProgress(
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>
) {
  // Placeholder for future learning progress API
  return useQuery({
    queryKey: ['me', 'progress'],
    queryFn: () => Promise.resolve({ data: null }),
    ...options,
  });
}

// ============================================================================
// User Hooks (Admin)
// ============================================================================

export function useUsers(
  filters?: UserFilters,
  pagination?: { offset?: number; limit?: number },
  options?: Omit<UseQueryOptions<UsersListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => usersApi.list(filters, pagination),
    ...options,
  });
}

export function useUser(
  id: string,
  options?: Omit<UseQueryOptions<UserResponse, Error, UserDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => usersApi.getById(id),
    select: (response) => response.data,
    enabled: !!id,
    ...options,
  });
}

/**
 * @deprecated Backend route `/users/username/:username/public` does not exist.
 * Calls will return 404. Remove once a public profile endpoint is implemented.
 */
export function usePublicProfile(
  username: string,
  options?: Omit<UseQueryOptions<PublicUserResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: userKeys.publicProfile(username),
    queryFn: () => usersApi.getPublicProfile(username),
    enabled: !!username,
    ...options,
  });
}

export function useDeleteUser(
  options?: UseMutationOptions<void, Error, { id: string; soft?: boolean }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, soft }) => usersApi.delete(id, soft),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.removeQueries({ queryKey: userKeys.detail(id) });
    },
    ...options,
  });
}

// Scheduler Service Hooks
export {
  schedulerKeys, usePredictRetention, useReviewQueue, useSchedulerCard,
  useSchedulerCards
} from './scheduler.js';

