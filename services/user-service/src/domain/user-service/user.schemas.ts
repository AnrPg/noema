/**
 * @noema/user-service - Validation Schemas
 *
 * Zod schemas for validating user service inputs.
 */

import { z } from 'zod';
import {
  AuthProvider,
  Language,
  PomodoroSoundscape,
  StudyMode,
  Theme,
  UserRole,
  UserStatus,
} from '../../types/user.types.js';
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
  UserRole.USER,
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
export const PomodoroSoundscapeSchema = z.enum([
  PomodoroSoundscape.NONE,
  PomodoroSoundscape.RAIN,
  PomodoroSoundscape.DEEP_FOCUS,
  PomodoroSoundscape.CAFE,
  PomodoroSoundscape.NIGHT_OWLS,
]);

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
  languages: z.array(LanguageSchema).min(1, 'At least one language is required').default(['en']),
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
  activeStudyMode: z
    .enum(Object.values(StudyMode) as [string, ...string[]])
    .default(StudyMode.KNOWLEDGE_GAINING),
  pomodoro: z
    .object({
      focusMinutes: z.number().int().min(10).max(90).default(25),
      shortBreakMinutes: z.number().int().min(3).max(30).default(5),
      longBreakMinutes: z.number().int().min(10).max(60).default(15),
      cyclesBeforeLongBreak: z.number().int().min(2).max(6).default(4),
      dailyTargetCycles: z.number().int().min(1).max(12).default(6),
      autoStartBreaks: z.boolean().default(false),
      autoStartFocus: z.boolean().default(false),
      soundscape: PomodoroSoundscapeSchema.default(PomodoroSoundscape.NONE),
      soundscapeVolume: z.number().int().min(0).max(100).default(35),
    })
    .default({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      dailyTargetCycles: 6,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundscape: PomodoroSoundscape.NONE,
      soundscapeVolume: 35,
    }),
  cognitivePolicy: z
    .object({
      pacingPolicy: z.object({
        targetSecondsPerCard: z.number().int().min(5).max(300).default(45),
        hardCapSecondsPerCard: z.number().int().min(10).max(600).default(120),
        slowdownOnError: z.boolean().default(true),
      }),
      hintPolicy: z.object({
        maxHintsPerCard: z.number().int().min(0).max(5).default(2),
        progressiveHintsOnly: z.boolean().default(true),
        allowAnswerReveal: z.boolean().default(false),
      }),
      commitPolicy: z.object({
        requireConfidenceBeforeCommit: z.boolean().default(true),
        requireVerificationGate: z.boolean().default(false),
      }),
      reflectionPolicy: z.object({
        postAttemptReflection: z.boolean().default(false),
        postSessionReflection: z.boolean().default(true),
      }),
    })
    .default({
      pacingPolicy: {
        targetSecondsPerCard: 45,
        hardCapSecondsPerCard: 120,
        slowdownOnError: true,
      },
      hintPolicy: {
        maxHintsPerCard: 2,
        progressiveHintsOnly: true,
        allowAnswerReveal: false,
      },
      commitPolicy: {
        requireConfidenceBeforeCommit: true,
        requireVerificationGate: false,
      },
      reflectionPolicy: {
        postAttemptReflection: false,
        postSessionReflection: true,
      },
    }),
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
  languages: z.array(LanguageSchema).min(1, 'At least one language is required'),
  timezone: TimezoneSchema.optional(),
  country: z
    .string()
    .length(2, 'Country code must be ISO 3166-1 alpha-2 (2 characters)')
    .regex(/^[A-Z]{2}$/, 'Country code must be uppercase letters only'),
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
    languages: z.array(LanguageSchema).min(1, 'At least one language is required').optional(),
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
    activeStudyMode: z.enum(Object.values(StudyMode) as [string, ...string[]]).optional(),
    pomodoro: z
      .object({
        focusMinutes: z.number().int().min(10).max(90).optional(),
        shortBreakMinutes: z.number().int().min(3).max(30).optional(),
        longBreakMinutes: z.number().int().min(10).max(60).optional(),
        cyclesBeforeLongBreak: z.number().int().min(2).max(6).optional(),
        dailyTargetCycles: z.number().int().min(1).max(12).optional(),
        autoStartBreaks: z.boolean().optional(),
        autoStartFocus: z.boolean().optional(),
        soundscape: PomodoroSoundscapeSchema.optional(),
        soundscapeVolume: z.number().int().min(0).max(100).optional(),
      })
      .optional(),
    cognitivePolicy: z
      .object({
        pacingPolicy: z
          .object({
            targetSecondsPerCard: z.number().int().min(5).max(300).optional(),
            hardCapSecondsPerCard: z.number().int().min(10).max(600).optional(),
            slowdownOnError: z.boolean().optional(),
          })
          .optional(),
        hintPolicy: z
          .object({
            maxHintsPerCard: z.number().int().min(0).max(5).optional(),
            progressiveHintsOnly: z.boolean().optional(),
            allowAnswerReveal: z.boolean().optional(),
          })
          .optional(),
        commitPolicy: z
          .object({
            requireConfidenceBeforeCommit: z.boolean().optional(),
            requireVerificationGate: z.boolean().optional(),
          })
          .optional(),
        reflectionPolicy: z
          .object({
            postAttemptReflection: z.boolean().optional(),
            postSessionReflection: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
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
 * Schema for forgot password request.
 */
export const ForgotPasswordInputSchema = z.object({
  email: EmailSchema,
});

/**
 * Schema for password reset.
 */
export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: PasswordSchema,
});

/**
 * Schema for email verification.
 */
export const VerifyEmailInputSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/**
 * Schema for username change.
 */
export const ChangeUsernameInputSchema = z.object({
  username: UsernameSchema,
  version: z.number().int().min(1),
});

/**
 * Schema for email change.
 */
export const ChangeEmailInputSchema = z.object({
  newEmail: EmailSchema,
  password: z.string().min(1, 'Password is required for email changes'),
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
export type ForgotPasswordInputSchemaType = z.infer<typeof ForgotPasswordInputSchema>;
export type ResetPasswordInputSchemaType = z.infer<typeof ResetPasswordInputSchema>;
export type VerifyEmailInputSchemaType = z.infer<typeof VerifyEmailInputSchema>;
export type ChangeUsernameInputSchemaType = z.infer<typeof ChangeUsernameInputSchema>;
export type ChangeEmailInputSchemaType = z.infer<typeof ChangeEmailInputSchema>;
export type LoginInputSchemaType = z.infer<typeof LoginInputSchema>;
export type OAuthLoginInputSchemaType = z.infer<typeof OAuthLoginInputSchema>;
export type UserFiltersSchemaType = z.infer<typeof UserFiltersSchema>;
