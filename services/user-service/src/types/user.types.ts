/**
 * @noema/user-service - User Domain Types
 *
 * Core domain interfaces for users, profiles, settings, and auth.
 * These types align with the Noema shared model pattern.
 */

import type { IAuditedEntity, UserId } from '@noema/types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of history entries to keep for tracking arrays */
export const MAX_HISTORY_ITEMS = 5;

// ============================================================================
// User Status Enum
// ============================================================================

/**
 * User account status.
 */
export const UserStatus = {
  /** Newly registered, awaiting email verification */
  PENDING: 'PENDING',
  /** Active and verified */
  ACTIVE: 'ACTIVE',
  /** Temporarily suspended */
  SUSPENDED: 'SUSPENDED',
  /** Permanently banned */
  BANNED: 'BANNED',
  /** Account deactivated by user */
  DEACTIVATED: 'DEACTIVATED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// ============================================================================
// User Role Enum
// ============================================================================

/**
 * User roles for authorization.
 */
export const UserRole = {
  /** Regular learner */
  LEARNER: 'learner',
  /** Premium subscriber */
  PREMIUM: 'premium',
  /** Content creator/educator */
  CREATOR: 'creator',
  /** Administrator */
  ADMIN: 'admin',
  /** Super administrator */
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ============================================================================
// Auth Provider Enum
// ============================================================================

/**
 * Authentication providers.
 */
export const AuthProvider = {
  /** Email + password */
  LOCAL: 'local',
  /** Google OAuth */
  GOOGLE: 'google',
  /** Apple Sign In */
  APPLE: 'apple',
  /** GitHub OAuth */
  GITHUB: 'github',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

// ============================================================================
// Theme Enum
// ============================================================================

/**
 * UI theme preferences.
 */
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

// ============================================================================
// Language Enum
// ============================================================================

/**
 * Supported UI languages.
 */
export const Language = {
  EN: 'en',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  ZH: 'zh',
  JA: 'ja',
  KO: 'ko',
  PT: 'pt',
  EL: 'el',
  AR: 'ar',
  HI: 'hi',
  RU: 'ru',
  CH: 'ch',
} as const;

export type Language = (typeof Language)[keyof typeof Language];

// ============================================================================
// History Entry Interfaces
// ============================================================================

/**
 * Entry in the login history array.
 */
export interface ILoginHistoryEntry {
  /** When the login occurred (ISO 8601) */
  timestamp: string;
  /** Client IP address */
  ipAddress?: string | undefined;
  /** Client user agent */
  userAgent?: string | undefined;
  /** Whether login was successful */
  success: boolean;
}

/**
 * Entry in the failed login history array.
 */
export interface IFailedLoginHistoryEntry {
  /** When the failed attempt occurred (ISO 8601) */
  timestamp: string;
  /** Reason for failure */
  reason?: 'invalid_password' | 'account_locked' | 'invalid_mfa' | 'account_inactive' | undefined;
  /** Client IP address */
  ipAddress?: string | undefined;
}

/**
 * Entry in the password change history array.
 */
export interface IPasswordChangeHistoryEntry {
  /** When the password was changed (ISO 8601) */
  timestamp: string;
  /** User who initiated the change (self or admin) */
  changedBy?: UserId | undefined;
}

// ============================================================================
// User Profile Interface
// ============================================================================

/**
 * User profile information (public-facing).
 */
export interface IUserProfile {
  /** Display name (not username) */
  displayName: string;

  /** Short bio */
  bio: string | null;

  /** Profile avatar URL */
  avatarUrl: string | null;

  /** Time zone (IANA format, e.g., "America/New_York") */
  timezone: string;

  /** Preferred UI language */
  language: Language;

  /** Country code (ISO 3166-1 alpha-2) */
  country: string | null;
}

// ============================================================================
// User Settings Interface
// ============================================================================

/**
 * User settings and preferences.
 */
export interface IUserSettings {
  /** UI theme preference */
  theme: Theme;

  /** Daily review reminder enabled */
  dailyReminderEnabled: boolean;

  /** Daily reminder time (HH:MM in user's timezone) */
  dailyReminderTime: string | null;

  /** Default new cards per day */
  defaultNewCardsPerDay: number;

  /** Default review cards per day */
  defaultReviewCardsPerDay: number;

  /** Sound effects enabled */
  soundEnabled: boolean;

  /** Haptic feedback enabled (mobile) */
  hapticEnabled: boolean;

  /** Auto-advance after correct answer */
  autoAdvanceEnabled: boolean;

  /** Show answer timer */
  showTimerEnabled: boolean;

  /** Email notifications for streaks */
  emailStreakReminders: boolean;

  /** Email notifications for achievements */
  emailAchievements: boolean;

  /** Push notifications enabled */
  pushNotificationsEnabled: boolean;

  /** Analytics and telemetry consent */
  analyticsEnabled: boolean;
}

// ============================================================================
// User Entity Interface
// ============================================================================

/**
 * Complete user entity with all fields.
 * This is the shared model used across services.
 */
export interface IUser extends IAuditedEntity {
  /** Unique user identifier */
  id: UserId;

  /** Unique username (lowercase, alphanumeric + underscore) */
  username: string;

  /** Email address (unique, lowercase) */
  email: string;

  /** Hashed password (null for OAuth-only users) */
  passwordHash: string | null;

  /** Email verified flag */
  emailVerified: boolean;

  /** Account status */
  status: UserStatus;

  /** User roles (can have multiple) */
  roles: UserRole[];

  /** Authentication providers linked to this account */
  authProviders: AuthProvider[];

  /** Profile information */
  profile: IUserProfile;

  /** User settings */
  settings: IUserSettings;

  /** Last login timestamp (ISO 8601) - for quick access */
  lastLoginAt: string | null;

  /** Login history (last MAX_HISTORY_ITEMS entries) */
  loginHistory: ILoginHistoryEntry[];

  /** Login count */
  loginCount: number;

  /** Failed login attempts (current count, resets on success) */
  failedLoginAttempts: number;

  /** Failed login history (last MAX_HISTORY_ITEMS entries) */
  failedLoginHistory: IFailedLoginHistoryEntry[];

  /** Account locked until (ISO 8601, null if not locked) */
  lockedUntil: string | null;

  /** Password changed at (ISO 8601) - for quick access */
  passwordChangedAt: string | null;

  /** Password change history (last MAX_HISTORY_ITEMS entries) */
  passwordChangeHistory: IPasswordChangeHistoryEntry[];

  /** MFA enabled */
  mfaEnabled: boolean;

  /** MFA secret (encrypted, null if not enabled) */
  mfaSecret: string | null;
}

// ============================================================================
// Create/Update DTOs
// ============================================================================

/**
 * Input for creating a new user (registration).
 */
export interface ICreateUserInput {
  username: string;
  email: string;
  password: string;
  country?: string;
  displayName?: string;
  language?: Language;
  timezone?: string;
  authProvider?: AuthProvider;
}

/**
 * Input for updating user profile.
 */
export interface IUpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  timezone?: string;
  language?: Language;
  country?: string | null;
}

/**
 * Input for updating user settings.
 */
export interface IUpdateSettingsInput {
  theme?: Theme;
  dailyReminderEnabled?: boolean;
  dailyReminderTime?: string | null;
  defaultNewCardsPerDay?: number;
  defaultReviewCardsPerDay?: number;
  soundEnabled?: boolean;
  hapticEnabled?: boolean;
  autoAdvanceEnabled?: boolean;
  showTimerEnabled?: boolean;
  emailStreakReminders?: boolean;
  emailAchievements?: boolean;
  pushNotificationsEnabled?: boolean;
  analyticsEnabled?: boolean;
}

/**
 * Input for changing password.
 */
export interface IChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// ============================================================================
// Authentication DTOs
// ============================================================================

/**
 * Login credentials input.
 */
export interface ILoginInput {
  /** Username or email */
  identifier: string;
  password: string;
  /** MFA code if enabled */
  mfaCode?: string;
}

/**
 * OAuth login input.
 */
export interface IOAuthLoginInput {
  provider: AuthProvider;
  accessToken: string;
  idToken?: string;
}

/**
 * Token pair response.
 */
export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

/**
 * Authenticated user session.
 */
export interface IAuthSession {
  user: IUser;
  tokens: ITokenPair;
}

// ============================================================================
// Filter/Query Types
// ============================================================================

/**
 * Filters for querying users.
 * Supports comprehensive filtering on almost all user fields.
 */
export interface IUserFilters {
  // Core filters
  status?: UserStatus;
  roles?: UserRole[];
  emailVerified?: boolean;
  authProvider?: AuthProvider;

  // Profile filters
  username?: string; // partial match
  displayName?: string; // partial match
  country?: string; // ISO 3166-1 alpha-2
  language?: Language;
  timezone?: string;

  // Date range filters
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  lastLoginAfter?: string;
  lastLoginBefore?: string;

  // Full-text search
  search?: string; // searches email, username, displayName
}

// ============================================================================
// CQRS Read Model
// ============================================================================

/**
 * CQRS Read Model - optimized for querying and display.
 * This is what API responses return.
 */
export interface IUserReadModel {
  id: UserId;
  email: string;
  username: string;
  status: UserStatus;
  roles: UserRole[];
  profile: IUserProfile;
  settings: IUserSettings;
  emailVerified: boolean;
  mfaEnabled: boolean;
  authProviders: AuthProvider[];
  loginHistory: ILoginHistoryEntry[];
  failedLoginHistory: IFailedLoginHistoryEntry[];
  passwordChangeHistory: IPasswordChangeHistoryEntry[];
  loginCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * CQRS Write Model - used for mutations.
 * Contains only the fields needed for create/update operations.
 */
export interface IUserWriteModel {
  id?: UserId; // optional for create
  email?: string;
  username?: string;
  passwordHash?: string;
  status?: UserStatus;
  roles?: UserRole[];
  profile?: Partial<IUserProfile>;
  settings?: Partial<IUserSettings>;
  authProviders?: AuthProvider[];
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
  version?: number;
}
