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

export interface LoginInput {
  identifier: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  language?: string;
  timezone?: string;
  country: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: UserDto;
  tokens: TokenPair;
}

// ============================================================================
// User Types
// ============================================================================

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED';
export type UserRole = 'user' | 'admin' | 'moderator';

export interface UserDto {
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

export interface PublicUserDto {
  id: UserId;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserSettingsDto {
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

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  timezone?: string;
  language?: string;
  country?: string | null;
}

export interface UpdateSettingsInput {
  theme?: 'light' | 'dark' | 'system';
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  dailyGoal?: number;
  studyReminders?: boolean;
  reminderTime?: string | null;
  soundEnabled?: boolean;
  hapticEnabled?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// ============================================================================
// List Types
// ============================================================================

export interface UserFilters {
  status?: UserStatus;
  emailVerified?: boolean;
  search?: string;
}

export interface PaginatedUsersResult {
  items: UserDto[];
  total?: number;
  hasMore: boolean;
}

// ============================================================================
// Response Types (with API wrapper)
// ============================================================================

export type AuthResponse = IApiResponse<AuthResult>;
export type UserResponse = IApiResponse<UserDto>;
export type PublicUserResponse = IApiResponse<PublicUserDto>;
export type UserSettingsResponse = IApiResponse<UserSettingsDto>;
export type UsersListResponse = IApiResponse<PaginatedUsersResult>;
export type TokenRefreshResponse = IApiResponse<TokenPair>;
