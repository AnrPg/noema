/**
 * @noema/api-client - TanStack Query Hooks
 *
 * React Query hooks for User Service API.
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

export function useLogout(options?: UseMutationOptions<void, Error, void>) {
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
  options?: UseMutationOptions<UserResponse, Error, UpdateProfileInput>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => meApi.updateProfile(data, 0), // Version handled server-side
    onSuccess: (response) => {
      queryClient.setQueryData(userKeys.me(), response);
    },
    ...options,
  });
}

export function useUpdateSettings(
  options?: UseMutationOptions<UserSettingsResponse, Error, UpdateSettingsInput>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => meApi.updateSettings(data, 0),
    onSuccess: (response) => {
      queryClient.setQueryData(userKeys.meSettings(), response);
    },
    ...options,
  });
}

export function useChangePassword(
  options?: UseMutationOptions<UserResponse, Error, ChangePasswordInput>
) {
  return useMutation({
    mutationFn: (data) => meApi.changePassword(data, 0),
    ...options,
  });
}

export function useDeleteAccount(options?: UseMutationOptions<void, Error, void>) {
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
  options?: Omit<UseQueryOptions<unknown, Error>, 'queryKey' | 'queryFn'>
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
  options?: Omit<UseQueryOptions<UsersListResponse, Error>, 'queryKey' | 'queryFn'>
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

export function usePublicProfile(
  username: string,
  options?: Omit<UseQueryOptions<PublicUserResponse, Error>, 'queryKey' | 'queryFn'>
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
