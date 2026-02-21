/**
 * @noema/user-service - Validation Schemas
 *
 * Zod schemas for validating user service inputs.
 */

import { z } from 'zod';
import { AuthProvider, Language, Theme, UserRole, UserStatus } from '../../types/user.types.js';
import {
    DisplayNameSchema,
    EmailSchema,
    PasswordSchema,
    TimezoneSchema,
    UsernameSchema,
} from './value-objects/user.value-objects.js';

// ============================================================================
// Enum Schemas
// ============================================================================

export const UserStatusSchema = z.enum([
  UserStatus.PENDING,
  UserStatus.ACTIVE,
  UserStatus.SUSPENDED,
  UserStatus.BANNED,
  UserStatus.DEACTIVATED,
]);

export const UserRoleSchema = z.enum([
  UserRole.LEARNER,
  UserRole.PREMIUM,
  UserRole.CREATOR,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

export const AuthProviderSchema = z.enum([
  AuthProvider.LOCAL,
  AuthProvider.GOOGLE,
  AuthProvider.APPLE,
  AuthProvider.GITHUB,
]);

export const ThemeSchema = z.enum([Theme.LIGHT, Theme.DARK, Theme.SYSTEM]);

export const LanguageSchema = z.enum([
  Language.EN,
  Language.ES,
  Language.FR,
  Language.DE,
  Language.ZH,
  Language.JA,
  Language.KO,
  Language.PT,
  Language.EL,
  Language.AR,
  Language.HI,
  Language.RU,
  Language.CH,
]);

// ============================================================================
// Profile Schema
// ============================================================================

export const UserProfileSchema = z.object({
  displayName: DisplayNameSchema,
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  timezone: TimezoneSchema.default('UTC'),
  language: LanguageSchema.default('en'),
  country: z.string().length(2, 'Country code must be ISO 3166-1 alpha-2').nullable().optional(),
});

// ============================================================================
// Settings Schema
// ============================================================================

export const UserSettingsSchema = z.object({
  theme: ThemeSchema.default('system'),
  dailyReminderEnabled: z.boolean().default(true),
  dailyReminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format')
    .nullable()
    .optional()
    .default('09:00'),
  defaultNewCardsPerDay: z.number().int().min(1).max(200).default(20),
  defaultReviewCardsPerDay: z.number().int().min(1).max(500).default(100),
  soundEnabled: z.boolean().default(true),
  hapticEnabled: z.boolean().default(true),
  autoAdvanceEnabled: z.boolean().default(false),
  showTimerEnabled: z.boolean().default(true),
  emailStreakReminders: z.boolean().default(true),
  emailAchievements: z.boolean().default(true),
  pushNotificationsEnabled: z.boolean().default(true),
  analyticsEnabled: z.boolean().default(true),
});

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for creating a new user.
 * Country is required for compliance purposes.
 */
export const CreateUserInputSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema.optional(),
  language: LanguageSchema.optional(),
  timezone: TimezoneSchema.optional(),
  country: z
    .string()
    .length(2, 'Country code must be ISO 3166-1 alpha-2 (2 characters)')
    .regex(/^[A-Z]{2}$/, 'Country code must be uppercase letters only')
    .optional(),
  authProvider: AuthProviderSchema.optional(),
});

/**
 * Schema for updating user profile.
 */
export const UpdateProfileInputSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    bio: z.string().max(500).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    timezone: TimezoneSchema.optional(),
    language: LanguageSchema.optional(),
    country: z.string().length(2).nullable().optional(),
  })
  .strict();

/**
 * Schema for updating user settings.
 */
export const UpdateSettingsInputSchema = z
  .object({
    theme: ThemeSchema.optional(),
    dailyReminderEnabled: z.boolean().optional(),
    dailyReminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .nullable()
      .optional(),
    defaultNewCardsPerDay: z.number().int().min(1).max(200).optional(),
    defaultReviewCardsPerDay: z.number().int().min(1).max(500).optional(),
    soundEnabled: z.boolean().optional(),
    hapticEnabled: z.boolean().optional(),
    autoAdvanceEnabled: z.boolean().optional(),
    showTimerEnabled: z.boolean().optional(),
    emailStreakReminders: z.boolean().optional(),
    emailAchievements: z.boolean().optional(),
    pushNotificationsEnabled: z.boolean().optional(),
    analyticsEnabled: z.boolean().optional(),
  })
  .strict();

/**
 * Schema for password change.
 */
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
});

/**
 * Schema for login.
 */
export const LoginInputSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6).optional(),
});

/**
 * Schema for OAuth login.
 */
export const OAuthLoginInputSchema = z.object({
  provider: AuthProviderSchema,
  accessToken: z.string().min(1, 'Access token is required'),
  idToken: z.string().optional(),
});

/**
 * Schema for user filters.
 */
export const UserFiltersSchema = z.object({
  status: UserStatusSchema.optional(),
  roles: z.array(UserRoleSchema).optional(),
  emailVerified: z.boolean().optional(),
  authProvider: AuthProviderSchema.optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

export type CreateUserInputSchemaType = z.infer<typeof CreateUserInputSchema>;
export type UpdateProfileInputSchemaType = z.infer<typeof UpdateProfileInputSchema>;
export type UpdateSettingsInputSchemaType = z.infer<typeof UpdateSettingsInputSchema>;
export type ChangePasswordInputSchemaType = z.infer<typeof ChangePasswordInputSchema>;
export type LoginInputSchemaType = z.infer<typeof LoginInputSchema>;
export type OAuthLoginInputSchemaType = z.infer<typeof OAuthLoginInputSchema>;
export type UserFiltersSchemaType = z.infer<typeof UserFiltersSchema>;
