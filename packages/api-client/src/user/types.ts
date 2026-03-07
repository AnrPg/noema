/**
 * @noema/api-client - User Service Types
 *
 * Types for User Service API requests and responses.
 */

import type { IApiResponse } from '@noema/contracts';
import type { UserId } from '@noema/types';

// ============================================================================
// Auth Types
// ============================================================================

export interface ILoginInput {
  identifier: string;
  password: string;
  mfaCode?: string;
}

export interface IRegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  language?: string;
  timezone?: string;
  country: string;
}

export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface IAuthResult {
  user: IUserDto;
  tokens: ITokenPair;
}

// ============================================================================
// User Types
// ============================================================================

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED';
export type UserRole = 'user' | 'admin' | 'moderator';

export interface IUserDto {
  id: UserId;
  username: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  status: UserStatus;
  roles: UserRole[];
  language: string;
  timezone: string;
  country: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IPublicUserDto {
  id: UserId;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface IUserSettingsDto {
  userId: UserId;
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
  pushNotifications: boolean;
  dailyGoal: number;
  studyReminders: boolean;
  reminderTime: string | null;
  soundEnabled: boolean;
  hapticEnabled: boolean;
  version: number;
}

// ============================================================================
// Update Types
// ============================================================================

export interface IUpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  timezone?: string;
  language?: string;
  country?: string | null;
}

export interface IUpdateSettingsInput {
  theme?: 'light' | 'dark' | 'system';
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  dailyGoal?: number;
  studyReminders?: boolean;
  reminderTime?: string | null;
  soundEnabled?: boolean;
  hapticEnabled?: boolean;
}

export interface IChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface IRequestPasswordResetInput {
  email: string;
}

// ============================================================================
// List Types
// ============================================================================

export interface IUserFilters {
  status?: UserStatus;
  role?: UserRole;
  emailVerified?: boolean;
  search?: string;
}

export interface IUpdateUserStatusInput {
  status: UserStatus;
}

export interface IUpdateUserRolesInput {
  roles: UserRole[];
}

// Response type aliases
export type UpdateUserStatusResponse = IApiResponse<IUserDto>;
export type UpdateUserRolesResponse = IApiResponse<IUserDto>;
export type TriggerPasswordResetResponse = IApiResponse<{ message: string }>;
export type RequestPasswordResetResponse = IApiResponse<{ message: string }>;

export interface IPaginatedUsersResult {
  items: IUserDto[];
  total?: number;
  hasMore: boolean;
}

// ============================================================================
// Response Types (with API wrapper)
// ============================================================================

export type AuthResponse = IApiResponse<IAuthResult>;
export type UserResponse = IApiResponse<IUserDto>;
export type PublicUserResponse = IApiResponse<IPublicUserDto>;
export type UserSettingsResponse = IApiResponse<IUserSettingsDto>;
export type UsersListResponse = IApiResponse<IPaginatedUsersResult>;
export type TokenRefreshResponse = IApiResponse<ITokenPair>;

// ============================================================================
// Backward-compat aliases (for consumers using the un-prefixed names)
// ============================================================================

export type LoginInput = ILoginInput;
export type RegisterInput = IRegisterInput;
export type TokenPair = ITokenPair;
export type AuthResult = IAuthResult;
export type UserDto = IUserDto;
export type PublicUserDto = IPublicUserDto;
export type UserSettingsDto = IUserSettingsDto;
export type UpdateProfileInput = IUpdateProfileInput;
export type UpdateSettingsInput = IUpdateSettingsInput;
export type ChangePasswordInput = IChangePasswordInput;
export type RequestPasswordResetInput = IRequestPasswordResetInput;
export type UserFilters = IUserFilters;
export type PaginatedUsersResult = IPaginatedUsersResult;
